const jwt = require('jsonwebtoken');
const User = require('../models/user');
const pool = require('../config/database');
const coordinator = require('../services/coordinator');
const { isTokenRevoked, getRevokedTTL } = require('../services/tokenRevocation');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Auth');

/**
 * 401 诊断日志：记录拒绝原因、路径、实例端口与客户端特征。
 * 登出类问题（用户被莫名踢下线）只能靠这条日志定位原因，热路径不触发（仅 401 时打印）。
 * 注意：只记录 token 前 12 位用于关联，不落完整凭证。
 */
function log401(req, reason, extra = {}) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);
  // 取头部 + 尾部片段：JWT 头部（alg/typ）几乎相同，只看前 12 位无法区分不同 token，
  // 尾部来自签名，可用于关联同一 token
  const tokenPrefix = extra.token
    ? `${String(extra.token).slice(0, 12)}…${String(extra.token).slice(-8)}`
    : '-';
  const hadHeader = Boolean(req.headers.authorization);
  logger.warn(
    `[AUTH-401] reason=${reason} method=${req.method} path=${req.originalUrl || req.url}` +
    ` ip=${req.ip} port=${process.env.PORT || '-'} hasHeader=${hadHeader} tokenPrefix=${tokenPrefix}` +
    (extra.detail ? ` detail=${extra.detail}` : '') +
    ` ua="${ua}"`
  );
}

/**
 * 从 token 中提取签发/过期时间（不校验签名），用于判断过期 token 是何时签发的。
 * 若 iat 是今天 → 登录签发的 token 立即失效（配置问题）；
 * 若 iat 是若干天前 → 客户端仍在用旧 token（保存/覆盖问题）。
 */
function describeTokenTimes(token) {
  try {
    const raw = jwt.decode(token) || {};
    const parts = [];
    if (raw.iat) parts.push(`iat=${new Date(raw.iat * 1000).toISOString()}`);
    if (raw.exp) parts.push(`exp=${new Date(raw.exp * 1000).toISOString()}`);
    return parts.length ? ` ${parts.join(' ')}` : '';
  } catch {
    return '';
  }
}

// JWT 密钥校验：未配置时给出清晰报错，避免用 undefined 静默验签
if (!process.env.JWT_SECRET) {
  throw new Error('[认证中间件] 缺少环境变量 JWT_SECRET，请在 .env 中配置密钥');
}

// 活跃度采集节流：同一实例内每用户每小时最多写库一次，避免高并发下每个请求都产生 UPDATE
const ACTIVITY_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const MAX_TOUCH_CACHE_SIZE = 100000;
const touchCache = new Map();

// DAU 记录去重：同一用户同一天只写一条 user_logins
// key 为 `${userId}_${YYYY-MM-DD}`，存在即表示今日已记录
const dailyRecorded = new Map();
const MAX_DAILY_CACHE_SIZE = 100000;

function todayStr() {
  // 使用本地日期，与 MySQL DATE_FORMAT(login_time) 的时区一致
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 距今日午夜的剩余毫秒数（本地时区），作为 Redis 去重键的 TTL。
 * 下限 1 分钟，避免午夜边界出现极短/负值 TTL。
 */
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(60 * 1000, midnight - now);
}

/**
 * Map 满时淘汰最早插入的 10%（Map 保序，keys() 迭代器按插入序输出）。
 * 替代原先的整体 clear()：避免缓存瞬间清空后所有用户同时重复写库造成写放大
 */
function evictOldest(map) {
  const evictCount = Math.ceil(map.size * 0.1);
  let removed = 0;
  for (const key of map.keys()) {
    map.delete(key);
    removed++;
    if (removed >= evictCount) break;
  }
}

/**
 * 记录用户每日活跃（DAU）：同一用户同一天只写一条 user_logins，并保存客户端 IP。
 * 多副本两级去重：
 *   1) 实例内内存 Map（热点路径零 Redis RTT）；
 *   2) 跨实例 Redis SET NX（多副本下只有一个实例获得写入权，TTL 到当日午夜自动过期）。
 * Redis 未配置/不可用时降级为仅内存去重（单实例行为与之前一致）。
 * DB 层另有 uk_user_date 唯一键 + INSERT IGNORE 兜底，Redis 闪断窗口也不会重复落库。
 * 在 touchActive 节流通过后调用，避免高频请求重复写入。
 * 写库失败静默降级，不影响请求。
 * @param {number} userId
 * @param {string|null} ip 客户端 IP（trust proxy=1 时经 nginx 反代为真实公网 IP）
 */
async function recordDailyActive(userId, ip) {
  const key = `${userId}_${todayStr()}`;

  // 一级：实例内内存去重
  if (dailyRecorded.has(key)) return;
  if (dailyRecorded.size >= MAX_DAILY_CACHE_SIZE) evictOldest(dailyRecorded);
  dailyRecorded.set(key, true);

  // 二级：跨实例 Redis NX 去重（拿到写入权的副本才继续 INSERT）
  const client = coordinator.getClient();
  const redisOn = coordinator.isEnabled();
  if (redisOn) {
    try {
      const res = await client.set(`dau:${key}`, '1', 'PX', msUntilMidnight(), 'NX');
      if (res !== 'OK') return; // 其他副本今日已记录
    } catch {
      // Redis 异常：降级为放行（宁可有界重复，也不阻塞认证链路），由 DB 唯一键兜底
    }
  }

  try {
    await pool.query('INSERT IGNORE INTO user_logins (user_id, ip) VALUES (?, ?)', [userId, ip || null]);
  } catch {
    // 失败不影响主流程，移除两级标记以便下次重试
    dailyRecorded.delete(key);
    if (redisOn) client.del(`dau:${key}`).catch(() => {});
  }
}

/**
 * 记录用户最后活跃时间（用于后台"7天活跃用户"统计）。
 * 内存节流 + 后台执行：写库失败不重试也不影响请求，不阻塞响应。
 * 同时记录每日活跃（DAU），用于后台每日活跃用户统计。
 * @param {number} userId
 * @param {string|null} ip 客户端 IP，随 DAU 记录一并写入
 */
function touchActive(userId, ip) {
  if (!userId) return;
  const now = Date.now();
  const last = touchCache.get(userId) || 0;
  if (now - last < ACTIVITY_TOUCH_INTERVAL_MS) return;
  if (touchCache.size >= MAX_TOUCH_CACHE_SIZE) evictOldest(touchCache);
  touchCache.set(userId, now);
  User.touchActive(userId).catch(() => {});
  recordDailyActive(userId, ip); // 记录 DAU（每日去重，含 IP）
}

// 滑动续期：JWT 剩余有效期低于该阈值时签发新 token，并通过响应头下发
const RENEW_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 7 天有效期内剩不足 3 天即续期
const RENEW_HEADER = 'X-Auth-Token';

/**
 * 若当前 token 剩余有效期低于阈值，签发一个新鲜的 token 并通过响应头下发，
 * 供前端替换本地 token（实现"活跃即顺延"的滑动续期）。
 * 续期失败不阻断请求；只在剩余 > 0 且 < 阈值时才续期，避免每次请求都重新签发造成抖动。
 * @param {object} decoded jwt.verify 的解码结果（含 exp）
 * @param {import('express').Response} res
 */
function maybeRenew(decoded, res) {
  try {
    if (typeof decoded?.exp !== 'number') return;
    const remaining = decoded.exp * 1000 - Date.now();
    if (remaining > 0 && remaining < RENEW_THRESHOLD_MS) {
      const fresh = jwt.sign(
        { id: decoded.id, username: decoded.username, role: decoded.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      res.setHeader(RENEW_HEADER, fresh);
    }
  } catch {
    // 续期失败不影响当前请求
  }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    log401(req, 'no_token');
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 已撤销（已登出）的 token 立即失效，避免登出后旧 token 继续可用
    if (await isTokenRevoked(token)) {
      const ttl = await getRevokedTTL(token);
      log401(req, 'revoked', { token, detail: `uid=${decoded.id} revokedRemainMs=${ttl ?? 'unknown'}` });
      return res.status(401).json({ message: '令牌已失效，请重新登录' });
    }
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    req.token = token; // 供登出接口撤销原始 token
    req.tokenExp = decoded.exp;
    touchActive(decoded.id, req.ip); // 记录活跃（节流，含客户端 IP）
    maybeRenew(decoded, res); // 滑动续期
    next();
  } catch (err) {
    log401(req, 'invalid', {
      token,
      detail: `${err.name}:${err.message}${describeTokenTimes(token)}`
    });
    return res.status(401).json({ message: '令牌无效或已过期' });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // 已撤销的 token 按匿名处理（公开接口不应因登出态报错）
      if (await isTokenRevoked(token)) {
        log401(req, 'revoked', { token, detail: `uid=${decoded.id} scope=optional` });
        return next();
      }
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
      req.token = token;
      req.tokenExp = decoded.exp;
      touchActive(decoded.id, req.ip); // 记录活跃（节流，含客户端 IP）
      maybeRenew(decoded, res); // 滑动续期
    } catch (err) {
      // 匿名接口携带无效 token 不阻断请求，但记录以便排查
      const bad = header.split(' ')[1];
      log401(req, 'invalid', {
        token: bad,
        detail: `${err.name}:${err.message}${describeTokenTimes(bad)} scope=optional`
      });
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
}

module.exports = { authenticate, optionalAuth, requireAdmin, touchActive };
