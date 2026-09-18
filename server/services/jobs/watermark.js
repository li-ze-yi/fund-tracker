/**
 * 幂等标记 + 运行水位线（watermark）
 *
 * 解决多实例 / 崩溃重投场景下的"重复执行/重复结算"问题：
 * - 每个 occurrence（<name>:<occurrenceKey>）在执行前检查 `job:done:<name>:<occurrenceKey>`，
 *   已存在则直接跳过（幂等）。
 * - 执行成功后写入该 done 标记，并更新 run watermark `job:lastrun:<name>`（供启动回填参考）。
 *
 * 后端选择：
 * - Redis 模式：读写协调器的共享 ioredis client（job:lastrun / job:done 均带 TTL）。
 * - 无 Redis（单进程）模式：用进程内 Map 做幂等（简单覆盖，进程存活期间去重）。
 *
 * 对外提供 runJob()：组合"幂等检查 → 执行处理器 → 标记完成"的通用包装，
 * 供 worker（Redis）与 scheduler 直连（无 Redis）两处复用。
 */

const coordinator = require('../coordinator');
const queue = require('./queue');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('Watermark');

const LAST_RUN_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 天

// 无 Redis 模式下的进程内幂等 Map（key -> 写入时间戳）
const doneMemory = new Map();

/** 当前是否处于 Redis 模式（连接就绪） */
function isRedis() {
  return Boolean(coordinator.getClient()) && coordinator.isEnabled();
}

/** 读取键值（Redis or 内存），出错时返回 null，绝不抛出 */
async function getValue(key) {
  if (isRedis()) {
    try {
      return await coordinator.getClient().get(key);
    } catch (e) {
      logger.error(`读取幂等标记失败: ${key}, error=${e.message}`);
      return null;
    }
  }
  return doneMemory.has(key) ? '1' : null;
}

/** 写入键值（Redis PX TTL or 内存），出错静默，绝不抛出 */
async function setValue(key, ttlMs) {
  if (isRedis()) {
    try {
      await coordinator.getClient().set(key, '1', 'PX', ttlMs);
    } catch (e) {
      logger.error(`写入幂等标记失败: ${key}, error=${e.message}`);
    }
    return;
  }
  doneMemory.set(key, Date.now());
}

function doneKey(name, occurrenceKey) {
  return `job:done:${name}:${occurrenceKey}`;
}

/**
 * 记录最新一次运行水位线（Redis 模式 fire-and-forget；无 Redis 时空操作）。
 * @param {string} name
 */
async function noteRun(name, _occurrenceKey) {
  if (!isRedis()) return;
  const key = `job:lastrun:${name}`;
  try {
    await coordinator.getClient().set(key, String(Date.now()), 'PX', LAST_RUN_TTL_MS);
  } catch (e) {
    logger.error(`记录运行水位线失败: ${key}, error=${e.message}`);
  }
}

/**
 * 该 occurrence 是否已执行过。
 * @param {string} name
 * @param {string} occurrenceKey
 * @returns {Promise<boolean>}
 */
async function wasRun(name, occurrenceKey) {
  const v = await getValue(doneKey(name, occurrenceKey));
  return Boolean(v);
}

/**
 * 标记该 occurrence 已成功执行。
 * @param {string} name
 * @param {string} occurrenceKey
 */
async function markRun(name, occurrenceKey) {
  await setValue(doneKey(name, occurrenceKey), queue.getDoneTtlMs());
}

/**
 * 通用幂等包装：检查 → 执行处理器 → 标记完成 + 记录水位线。
 * 已执行过则跳过并返回 { skippedByDedupe: true }。
 * @param {string} name
 * @param {string} occurrenceKey
 * @param {Function} processor 处理器函数（async）
 */
async function runJob(name, occurrenceKey, processor) {
  const done = await wasRun(name, occurrenceKey);
  if (done) {
    logger.info(`幂等跳过 | ${name}:${occurrenceKey} 已执行过`);
    return { skippedByDedupe: true };
  }
  const result = await processor();
  await markRun(name, occurrenceKey);
  await noteRun(name, occurrenceKey);
  return result;
}

module.exports = {
  noteRun,
  wasRun,
  markRun,
  runJob,
  doneKey,
};