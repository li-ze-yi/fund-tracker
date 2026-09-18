/**
 * BullMQ 队列封装
 *
 * 负责为以下三类定时任务建立 BullMQ 队列，供多实例(Redis) 模式下由 node-cron 入队、由 worker 消费：
 * - invest（定投计划，10:00 / 20:00）
 * - dailyProfit（日收益兜底，23:55）
 * - pendingSettle（pending 订单独立结算兜底，23:50）
 *
 * 行为约定：
 * - 未配置 REDIS_URL 时不初始化任何队列/连接，isRedisEnabled() 返回 false，
 *   调度器走"进程内直连执行"路径，行为与旧的单进程实现完全一致。
 * - 入队时使用确定性 jobId（`<name>:<occurrenceKey>`），使多个实例并发入队的同一
 *   occurrence 在 BullMQ 中天然去重（jobId 相同则复用同一个 job，不会重复入队）。
 * - 使用独立的 BullMQ 兼容连接（maxRetriesPerRequest:null），不复用 coordinator
 *   /globalCache 的缓存连接，避免阻塞式命令与普通命令相互干扰。
 */

const { Queue } = require('bullmq');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('BullQueue');

const REDIS_URL = process.env.REDIS_URL;
const redisEnabled = Boolean(REDIS_URL);

// 涉及的队列名（与 BullMQ 队列名、worker 处理器 key 同名）
const QUEUE_NAMES = ['invest', 'dailyProfit', 'pendingSettle'];

// 幂等 / 完成的红黑标记 TTL
const JOB_DONE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 天

let producerConnection = null; // 共享生产者连接（所有 Queue 复用）
const queues = {};             // name -> Queue 实例

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,                                    // 失败自动重试
  backoff: { type: 'exponential', delay: 1000 }, // 指数退避
  removeOnComplete: true,                         // 成功后移除，防止堆积
  removeOnFail: { count: 1000 },                  // 失败最多保留 1000 条
};

/**
 * Redis 模式是否启用（由环境变量决定，不抛错）。
 * 调度器据此决定走 BullMQ 入队路径还是进程内直连路径。
 */
function isRedisEnabled() {
  return redisEnabled;
}

/**
 * 创建 BullMQ 兼容的 ioredis 连接。
 * BullMQ 需要 maxRetriesPerRequest:null（阻塞式命令不应命中重试上限）。
 * @returns {import('ioredis').Redis}
 */
function createConnection() {
  // 仅在启用 Redis 时才加载 ioredis
  const Redis = require('ioredis');
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 1000, 30000),
  });
}

/** 惰性初始化共享生产者连接与各队列实例 */
function ensureQueues() {
  if (producerConnection) return;
  producerConnection = createConnection();
  for (const name of QUEUE_NAMES) {
    queues[name] = new Queue(name, {
      connection: producerConnection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
}

/**
 * 入队一个定时任务 occurrence。
 * @param {string} name 队列名（invest | dailyProfit | pendingSettle）
 * @param {string} occurrenceKey 该次发生唯一的键（如日期 YYYYMMDD，或 slot 后缀）
 * @param {object} [data] 附加的 job data（默认空对象）
 * @returns {Promise<boolean>} Redis 禁用时返回 false，否则返回 true
 */
async function enqueue(name, occurrenceKey, data = {}) {
  if (!redisEnabled) return false;
  ensureQueues();
  if (!queues[name]) {
    throw new Error(`未知队列: ${name}`);
  }
  // BullMQ 禁止 jobId 包含 ':'，这里把 name 与 occurrenceKey 合并成一个无冒号的确定性 jobId 作为去重键。
  // 原始 occurrenceKey 会原样放入 job.data.occurrenceKey，供 worker 恢复幂等/水位键使用。
  const jobId = `${name}-${String(occurrenceKey).replace(/:/g, '-')}`;
  await queues[name].add(name, { ...data, occurrenceKey }, {
    jobId,
    removeOnComplete: true,
    removeOnFail: { count: 1000 },
  });
  logger.info(`已入队 | ${jobId}`);
  return true;
}

/** 幂等红黑标记 TTL（供 watermark 复用） */
function getDoneTtlMs() {
  return JOB_DONE_TTL_MS;
}

/**
 * 关闭所有队列实例与连接（优雅关机用）。
 * Redis 禁用时为空操作。不抛错。
 */
async function close() {
  for (const name of Object.keys(queues)) {
    try {
      await queues[name].close();
    } catch (e) {
      logger.error(`关闭队列 ${name} 失败: ${e.message}`);
    }
    delete queues[name];
  }
  const conns = [producerConnection];
  producerConnection = null;
  for (const c of conns) {
    if (c) {
      try {
        await c.quit();
      } catch { /* ignore */ }
    }
  }
  logger.info('BullMQ 队列连接已关闭');
}

module.exports = {
  QUEUE_NAMES,
  isRedisEnabled,
  createConnection,
  enqueue,
  getDoneTtlMs,
  close,
};