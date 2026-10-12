/**
 * BullMQ Worker - 消费定时任务队列
 *
 * 每个队列（invest / dailyProfit / pendingSettle）对应一个 Worker，
 * processor 直接复用 processors.js 中导出的纯处理器函数；
 * 每个 processor 之外再套一层 watermark.runJob 幂等包装，确保重复/重投的
 * occurrence 不会二次结算。
 *
 * 关键配置：
 * - concurrency: 1，串行处理，避免同一队列并发重复落账。
 * - lockDuration: 60000ms，覆盖最长任务耗时，防止任务未结束时锁被误续而并发双跑。
 * - stalledInterval: 30000ms + maxStalledCount: 3，worker 崩溃/挂起时由 BullMQ
 *   自动重投到其他实例（Automatic Retry），配合幂等标记保证只结算一次。
 *
 * startWorkers() 在未启用 Redis 时为空操作（单进程模式永不启动 worker）。
 */

const { Worker } = require('bullmq');
const processors = require('./processors');
const watermark = require('./watermark');
const queue = require('./queue');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('BullWorker');

// 错误日志节流：同一错误消息（如 NOAUTH，因缺 Redis 密码以 ~100ms 级轮询反复触发）在窗口内
// 只打印首次 + 每个窗口一次"仍存在"提醒，其余重复静默，避免日志刷屏；不同错误仍即时打印。
const ERR_LOG_WINDOW_MS = 30 * 1000;
let _lastErrMsg = '';
let _lastErrAt = 0;
let _errCountInWindow = 0;
function logWorkerError(err) {
  const msg = (err && err.message) || String(err || 'unknown');
  const now = Date.now();
  if (msg !== _lastErrMsg) {
    // 新错误：立即打印并开启新窗口
    _lastErrMsg = msg;
    _lastErrAt = now;
    _errCountInWindow = 0;
    logger.error(`worker 错误: ${msg}`);
    return;
  }
  // 同一错误：累计次数，仅每窗口提醒一次
  _errCountInWindow++;
  if (now - _lastErrAt >= ERR_LOG_WINDOW_MS) {
    _lastErrAt = now;
    logger.error(`worker 错误持续发生(${_errCountInWindow}次/窗口): ${msg}`);
    _errCountInWindow = 0;
  }
}

// 队列名 -> processor 处理器
const PROCESSORS = {
  invest: processors.processProfits,
  dailyProfit: processors.processDailyProfit,
  pendingSettle: processors.processPendingSettle,
};

let workers = [];   // [{ worker, connection }]
let started = false;

/** 从 job.data 读取 occurrenceKey（入队时已原样放入） */
function occurrenceFromJob(job) {
  return job && job.data && (job.data.occurrenceKey || '');
}

/**
 * 启动所有 worker（仅 Redis 模式）。
 */
function startWorkers() {
  if (!queue.isRedisEnabled()) {
    logger.info('未启用 Redis，跳过 BullMQ worker 启动（单进程直连模式）');
    return;
  }
  if (started) {
    logger.info('BullMQ workers 已启动，跳过重复启动');
    return;
  }
  started = true;

  for (const name of Object.keys(PROCESSORS)) {
    const connection = queue.createConnection();
    const worker = new Worker(name, async (job) => {
      const occurrenceKey = occurrenceFromJob(job);
      const processor = PROCESSORS[job.name] || PROCESSORS[name];
      if (!processor) {
        logger.warn(`未知任务类型，跳过 | ${job.id}`);
        return;
      }
      logger.info(`worker 消费 | ${job.id} (occurrence=${occurrenceKey})`);
      return watermark.runJob(job.name, occurrenceKey, processor);
    }, {
      connection,
      concurrency: 1,
      lockDuration: 60000,
      stalledInterval: 30000,
      maxStalledCount: 3,
    });

    worker.on('failed', (job, err) => {
      logger.error(`worker 任务失败 | ${job ? job.id : '(未知)'}: ${err.message}`, err && err.stack);
    });
    worker.on('error', logWorkerError);

    workers.push({ worker, connection });
  }
  logger.info(`BullMQ workers 已启动 (${Object.keys(PROCESSORS).join(', ')})`);
}

/**
 * 优雅停止所有 worker（等待进行中的任务完成，再关闭各自连接）。
 */
async function stopWorkers() {
  if (workers.length === 0) return;
  const list = workers;
  workers = [];
  started = false;
  await Promise.all(list.map(async ({ worker, connection }) => {
    try {
      await worker.close();
    } catch (e) {
      logger.error(`关闭 worker 失败: ${e.message}`);
    }
    try {
      await connection.quit();
    } catch { /* ignore */ }
  }));
  logger.info('BullMQ workers 已停止');
}

module.exports = { startWorkers, stopWorkers };