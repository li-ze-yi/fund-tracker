const jwt = require('jsonwebtoken');
const User = require('../models/user');

// JWT 密钥校验：未配置时给出清晰报错，避免用 undefined 静默验签
if (!process.env.JWT_SECRET) {
  throw new Error('[认证中间件] 缺少环境变量 JWT_SECRET，请在 .env 中配置密钥');
}

// 活跃度采集节流：同一实例内每用户每小时最多写库一次，避免高并发下每个请求都产生 UPDATE
const ACTIVITY_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const MAX_TOUCH_CACHE_SIZE = 100000;
const touchCache = new Map();

/**
 * 记录用户最后活跃时间（用于后台"7天活跃用户"统计）。
 * 内存节流 + 后台执行：写库失败不重试也不影响请求，不阻塞响应。
 * @param {number} userId
 */
function touchActive(userId) {
  if (!userId) return;
  const now = Date.now();
  const last = touchCache.get(userId) || 0;
  if (now - last < ACTIVITY_TOUCH_INTERVAL_MS) return;
  if (touchCache.size >= MAX_TOUCH_CACHE_SIZE) touchCache.clear();
  touchCache.set(userId, now);
  User.touchActive(userId).catch(() => {});
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

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    touchActive(decoded.id); // 记录活跃（节流）
    maybeRenew(decoded, res); // 滑动续期
    next();
  } catch (err) {
    return res.status(401).json({ message: '令牌无效或已过期' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
      touchActive(decoded.id); // 记录活跃（节流）
      maybeRenew(decoded, res); // 滑动续期
    } catch {}
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
