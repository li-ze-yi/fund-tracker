/**
 * Coordinator - 分布式协调器（基于 Redis）
 *
 * 负责跨实例协调：
 * 1. 分布式锁（SET key token PX ttl NX + Lua 比较删除释放）
 * 2. 缓存击穿防护（跨实例 singleflight，供 GlobalCache 使用）
 *
 * 行为约定：
 * - 未配置 REDIS_URL 时，所有方法退化为"直接放行/空操作"，保证单进程行为与之前完全一致。
 * - Redis 连接异常时降级为放行，绝不抛错，绝不导致 HTTP 进程崩溃（回退 Redis 内存 Map）。
 *
 * 复用一个共享的 ioredis client（同一连接实例被 GlobalCache 复用做缓存读写）。
 */

const crypto = require('crypto');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Coordinator');

const REDIS_URL = process.env.REDIS_URL;

let client = null;
let enabled = false; // 是否处于 Redis 模式（随连接状态动态变化）

if (REDIS_URL) {
  // 仅在使用 Redis 时才加载 ioredis，避免无 Redis 环境引入依赖加载
  const Redis = require('ioredis');
  client = new Redis(REDIS_URL, {
    // 实例化即自动连接（默认），保证正常场景可用
    enableOfflineQueue: false, // 断线时命令快速失败，不排队积压，避免请求被挂起
    maxRetriesPerRequest: 1,   // 单命令最多重试 1 次，避免长时间阻塞请求
    retryStrategy: (times) => {
      // 有节制的重连退避：1s → 5s → 10s → ... 封顶 30s
      const delay = Math.min(times * 1000, 30000);
      return delay;
    },
  });

  client.on('ready', () => {
    enabled = true;
    logger.info('Redis 已连接');
  });

  client.on('error', (err) => {
    enabled = false;
    logger.error(`Redis 连接错误，协调器降级为放行: ${err.message}`);
  });

  client.on('close', () => {
    enabled = false;
  });

  client.on('end', () => {
    enabled = false;
  });
}

/**
 * Redis 模式是否激活（仅返回布尔，不抛错）。
 * 未配置 REDIS_URL 或连接未就绪/已断开时均为 false。
 */
function isEnabled() {
  return Boolean(client) && enabled;
}

/**
 * 获取共享的 ioredis client（未启用时返回 null）。
 * GlobalCache 复用同一连接做缓存读写。
 */
function getClient() {
  return client;
}

/**
 * 原子地获取分布式锁。
 * @param {string} key 锁键
 * @param {number} ttlMs 锁自动过期时间（毫秒）
 * @returns {Promise<boolean|string>} 未启用/未就绪/出错 → true（视为直接放行，保持单进程行为）；
 *   获取成功 → 返回 token（非空字符串，truthy）；
 *   被其他实例持有 → 返回 false。
 */
function acquire(key, ttlMs) {
  if (!isEnabled()) return true; // 禁用态：直接放行

  const token = crypto.randomUUID();
  return client
    .set(key, token, 'PX', ttlMs, 'NX')
    .then((res) => {
      if (res === 'OK') return token;
      return false; // 已被其他实例持有
    })
    .catch((err) => {
      // Redis 出错：降级为放行，避免请求被卡死（宁可有界重复，也不阻塞）
      logger.error(`获取分布式锁失败，降级放行: ${key}, error=${err.message}`);
      return true;
    });
}

// 仅当 token 匹配时才删除锁，防止误删他人锁
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

/**
 * 释放分布式锁（仅在 token 匹配时删除）。
 * @param {string} key 锁键
 * @param {string|true} token acquire 返回的 token（禁用态为 true，此时空操作）
 * @returns {Promise<void>}
 */
async function release(key, token) {
  if (!isEnabled() || typeof token !== 'string') return; // 禁用/降级态：空操作
  try {
    await client.eval(RELEASE_SCRIPT, 1, key, token);
  } catch (err) {
    // 释放失败最坏情况是锁自然过期，不致命，仅记录
    logger.error(`释放分布式锁失败: ${key}, error=${err.message}`);
  }
}

module.exports = { isEnabled, getClient, acquire, release };