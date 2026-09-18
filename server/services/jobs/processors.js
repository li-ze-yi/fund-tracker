/**
 * 定时任务处理器合集
 *
 * 将原内联在 app.js 的调度逻辑抽离为可复用的 job processor 函数，
 * 供两种驱动方式共用：
 * - 进程内 node-cron（无 Redis 模式）：直接 await 这些函数
 * - BullMQ 队列（Redis 模式）：由 worker 调用这些函数
 *
 * 每个函数为 plain async 函数，返回对应服务的处理结果，方便 await；
 * 保持副作用精简（无 process.exit），不做幂等 / 加锁处理。
 */

const { executeDuePlans } = require('../planService');
const dailyProfitService = require('../dailyProfitService');
const pendingSettleService = require('../pendingSettleService');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('Job');

/**
 * 定投计划处理（定投 daily/invest）
 * 对应 app.js 中 10:00 / 20:00 的调度 handler
 * @returns {Promise<{success: number, skipped: number, failed: number, pending: number}>}
 */
async function processProfits() {
  try {
    const result = await executeDuePlans();
    if (result.pending > 0) {
      logger.info(`${result.pending}个计划因净值未确认而跳过，将在下次调度时重试`);
    }
    logger.info(`定投调度完成 | 成功=${result.success} 待确认=${result.pending}`);
    return result;
  } catch (err) {
    logger.error(`定投计划调度异常: ${err.message}`, err.stack);
    throw err;
  }
}

/**
 * 日收益兜底处理
 * 对应 app.js 中 23:55 的日收益兜底任务 handler
 * @returns {Promise<object>}
 */
async function processDailyProfit() {
  try {
    const result = await dailyProfitService.backfillDailyProfit();
    logger.info(`日收益兜底完成 | 持仓用户=${result.total} 已记录=${result.skipped} 补算成功=${result.success} 失败=${result.failed}`);
    return result;
  } catch (err) {
    logger.error(`日收益兜底任务异常: ${err.message}`, err.stack);
    throw err;
  }
}

/**
 * pending 订单独立结算兜底处理
 * 对应 app.js 中 23:50 的 pending 订单独立结算兜底任务 handler
 * @returns {Promise<object>}
 */
async function processPendingSettle() {
  try {
    const result = await pendingSettleService.cleanupStalePendingOrders(30);
    const s = result.settle;
    logger.info(`pending 订单结算兜底完成 | 扫描用户数=${s.scannedUsers} pending订单数=${s.totalPending} 成功结算=${s.settled} 跳过=${s.skipped} 清除数=${result.cleanedCount}`);
    return result;
  } catch (err) {
    logger.error(`pending 订单独立结算兜底任务异常: ${err.message}`, err.stack);
    throw err;
  }
}

/**
 * 启动时检查到期定投计划（防止服务器重启期间遗漏）
 * 对应 app.js 中 listen 回调里的启动检查
 * @returns {Promise<{success: number, skipped: number, failed: number, pending: number}>}
 */
async function startupCheck() {
  logger.info('启动时检查一次到期定投计划...');
  try {
    const result = await executeDuePlans();
    logger.info(`启动时定投检查完成 | 成功=${result.success} 待确认=${result.pending}`);
    return result;
  } catch (err) {
    logger.error(`启动时执行定投计划异常: ${err.message}`, err.stack);
    throw err;
  }
}

module.exports = {
  processProfits,
  processDailyProfit,
  processPendingSettle,
  startupCheck,
};