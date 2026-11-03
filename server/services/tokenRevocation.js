/**
 * Token 撤销服务（登出后立即失效）
 *
 * JWT 本身无状态，签发后在有效期内始终可用。为了让「登出」真正生效，这里维护一份
 * 已撤销 token 的名单，认证中间件每次校验时查一次。
 *
 * 存储策略：
 *   1) Redis 可用：key 为 token 的 SHA-256，TTL 恰为 token 剩余有效期（过期自动清理，不膨胀）；
 *   2) Redis 不可用：退化为实例内 Map（多副本下仅本实例生效，属有界降级，不影响主流程）。
 *
 * 采用 token 哈希而非 jti，可兼容存量已签发 token（无需强制所有人重新登录）。
 */
const crypto = require('crypto');
const coordinator = require('./coordinator');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TokenRevocation');

const REDIS_PREFIX = 'auth:revoked:';
const LOCAL_MAX_SIZE = 10000;

// 无 Redis 时的实例内兜底：hash -> 撤销到期时间戳(ms)
const localRevoked = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** 清理本地 Map 中已过期的条目，并在超上限时淘汰最早插入的 10% */
function evictLocalIfNeeded() {
  const now = Date.now();
  for (const [key, expiresAt] of localRevoked) {
    if (expiresAt > now) break; // Map 按插入序，遇到未过期的即可停止
    localRevoked.delete(key);
  }
  if (localRevoked.size >= LOCAL_MAX_SIZE) {
    const evictCount = Math.ceil(localRevoked.size * 0.1);
    let removed = 0;
    for (const key of localRevoked.keys()) {
      localRevoked.delete(key);
      if (++removed >= evictCount) break;
    }
  }
}

/**
 * 撤销一个 token
 * @param {string} token 原始 JWT
 * @param {number} expMs token 过期时间（毫秒时间戳，来自 JWT 的 exp）
 */
async function revokeToken(token, expMs) {
  if (!token) return;
  const ttlMs = Math.max(0, expMs - Date.now());
  if (ttlMs <= 0) return; // 已过期，无需记录

  const key = REDIS_PREFIX + hashToken(token);

  if (coordinator.isEnabled()) {
    try {
      await coordinator.getClient().set(key, '1', 'PX', ttlMs);
      return;
    } catch (err) {
      logger.warn(`Redis 写入撤销名单失败，降级为实例内记录: ${err.message}`);
    }
  }

  evictLocalIfNeeded();
  localRevoked.set(key, Date.now() + ttlMs);
}

/**
 * 判断 token 是否已被撤销
 * 失败时一律按「未撤销」放行（宁可有界放行，也不因缓存故障阻断认证）
 * @param {string} token 原始 JWT
 * @returns {Promise<boolean>}
 */
async function isTokenRevoked(token) {
  if (!token) return false;
  const key = REDIS_PREFIX + hashToken(token);

  const localExpiresAt = localRevoked.get(key);
  if (localExpiresAt) {
    if (localExpiresAt > Date.now()) return true;
    localRevoked.delete(key);
  }

  if (coordinator.isEnabled()) {
    try {
      const res = await coordinator.getClient().exists(key);
      return res === 1;
    } catch (err) {
      logger.warn(`Redis 查询撤销名单失败，按未撤销放行: ${err.message}`);
    }
  }
  return false;
}

module.exports = { revokeToken, isTokenRevoked };
