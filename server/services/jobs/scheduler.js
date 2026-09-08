/**
 * 定时调度器（node-cron）
 *
 * 每个实例都运行同一份注册表（全部实例完全同构，无 SCHEDULER_ENABLED）：
 * - Redis 模式：node-cron 到点时把 occurrence 入队（确定性 jobId 去重），
 *   由 BullMQ worker 消费执行。
 * - 无 Redis（单进程）：node-cron 到点时直接 await 处理器（幂等包装后），
 *   行为与旧的单进程实现完全一致，HTTP 照常运行。
 *
 * 提供：
 * - startScheduler() / stopScheduler()：cron 注册与销毁（guard 防重复注册）。
 * - initScheduledJobs()：根据 Redis 是否启用，组合 workers + scheduler + backfill 的启动入口。
 * - shutdownScheduledJobs()：优雅关闭（停 worker ＋ 停 scheduler ＋ 关连接）。
 */

const cron = require('node-cron');
const processors = require('./processors');
const watermark = require('./watermark');
const queue = require('./queue');
const worker = require('./worker');
const backfill = require('./backfill');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('Scheduler');

// 队列名 -> processor
const PROCESSORS = {
  invest: processors.processProfits,
  dailyProfit: processors.processDailyProfit,
  pendingSettle: processors.processPendingSettle,
};

/**
 * 调度注册表。
 * - cron: node-cron 表达式（5 段）。
 * - keyFor: 返回该次 occurrence 的确定性键。invest 一天两次，需区分上/下午 slot，
 *   否则同一天 10:00 与 20:00 的 jobId 相同，幂等标记会误拦晚间那次。
 */
const SCHEDULES = [
  { name: 'invest', cron: '0 10 * * *', label: '10:00 上午执行（创建 pending 订单）', keyFor: () => `${ymd()}-10` },
  { name: 'invest', cron: '0 20 * * *', label: '20:00 晚间执行（结算 pending + 处理到期计划）', keyFor: () => `${ymd()}-20` },
  { name: 'dailyProfit', cron: '55 23 * * *', label: '日收益兜底任务', keyFor: () => ymd() },
  { name: 'pendingSettle', cron: '50 23 * * *', label: 'pending 订单独立结算兜底任务', keyFor: () => ymd() },
];

/** 本地日期（Asia/Shanghai）格式为 YYYYMMDD */
function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

let tasks = [];   // 已注册的 cron task 列表
let started = false;

/**
 * 触发一次调度：Redis 入队 / 无 Redis 直连执行。
 * @param {{name:string,label:string,keyFor:Function}} s
 */
async function trigger(s) {
  const occurrenceKey = s.keyFor();
  logger.info(`调度触发 | ${s.name} (${s.label}) | 时间: ${new Date().toLocaleString('zh-CN')}`);
  if (queue.isRedisEnabled()) {
    try {
      await queue.enqueue(s.name, occurrenceKey);
    } catch (e) {
      logger.error(`入队失败 | ${s.name}:${occurrenceKey}: ${e.message}`);
    }
  } else {
    try {
      await watermark.runJob(s.name, occurrenceKey, PROCESSORS[s.name]);
    } catch (e) {
      logger.error(`调度执行异常 | ${s.name}:${occurrenceKey}: ${e.message}`, e.stack);
    }
  }
}

/**
 * 注册 node-cron 调度（每个实例都会调用；guard 防本进程重复注册）。
 */
function startScheduler() {
  if (started) {
    logger.info('调度器已启动，跳过重复注册');
    return;
  }
  started = true;
  tasks = SCHEDULES.map((s) => cron.schedule(s.cron, () => {
    // cron 回调内 catch 兜底，避免未处理 rejection
    trigger(s).catch((e) => logger.error(`调度任务异常 | ${s.name}: ${e.message}`));
  }));
  logger.info('定时调度器已启动 (定投 10:00/20:00, 日收益兜底 23:55, pending 结算兜底 23:50)');
}

/**
 * 销毁所有已注册的 cron task。
 */
function stopScheduler() {
  for (const t of tasks) {
    try {
      t.destroy();
    } catch { /* ignore */ }
  }
  tasks = [];
  started = false;
  logger.info('定时调度器已停止');
}

/**
 * 统一的作业启动入口（在 app.listen 回调中调用）。
 * - Redis 启用：startWorkers() + startScheduler() + 启动时 backfillMissed()。
 * - 无 Redis：仅 startScheduler()（进程内直连）。
 */
async function initScheduledJobs() {
  if (queue.isRedisEnabled()) {
    worker.startWorkers();
    startScheduler();
    try {
      const n = await backfill.backfillMissed();
      logger.info(`启动回填完成 | ${n} 个遗漏 occurrence 已重新入队`);
    } catch (e) {
      logger.error(`启动回填异常: ${e.message}`);
    }
  } else {
    startScheduler();
  }
}

/**
 * 统一的停机入口：停 worker → 停 scheduler → 关闭队列连接。
 */
async function shutdownScheduledJobs() {
  await worker.stopWorkers();
  stopScheduler();
  await queue.close();
}

module.exports = {
  initScheduledJobs,
  shutdownScheduledJobs,
  startScheduler,
  stopScheduler,
  ymd,
};