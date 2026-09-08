/**
 * 启动回填（backfillMissed）
 *
 * 仅在 Redis 模式下生效：服务器重启/部署期间若错过了当天的调度窗口（如 23:50、23:55），
 * 启动时补齐——对当日已到调度时间且尚未执行的 occurrence，用其确定性 jobId 重新入队，
 * 由 worker 幂等消费。
 *
 * 保守策略：
 * - 只处理"当天"的既定调度（dailyProfit 23:55 / pendingSettle 23:50），不补历史陈旧 occurrence。
 * - 已执行（job:done 存在）或尚未到点（now < 当日调度时间）的均跳过。
 * - 复用确定性 jobId，若队中已存在同名 job 则 BullMQ 自动去重，不会重复。
 *
 * 无 Redis（单进程）模式下空操作。
 */

const queue = require('./queue');
const watermark = require('./watermark');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('Backfill');

// 需要进行启动回填的当日调度（只取与"日"绑定的兜底任务；定投 slot 由 scheduler 正常触发）
const BACKFILL_SCHEDULES = [
  { name: 'dailyProfit', hour: 23, minute: 55 },
  { name: 'pendingSettle', hour: 23, minute: 50 },
];

/**
 * 检查并回填当天已到调度时间但未被执行的 occurrence。
 * @returns {Promise<number>} 重新入队的 occurrence 数量
 */
async function backfillMissed() {
  if (!queue.isRedisEnabled()) return 0;

  const now = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  let reenqueued = 0;

  for (const s of BACKFILL_SCHEDULES) {
    try {
      const done = await watermark.wasRun(s.name, today);
      if (done) continue; // 今天已执行过，无需回填

      const scheduled = new Date(now);
      scheduled.setHours(s.hour, s.minute, 0, 0);
      if (now < scheduled) continue; // 尚未到调度时间，不提前触发

      // 已到点且未执行 → 用确定性 jobId 重新入队（同名 job 自动去重）
      await queue.enqueue(s.name, today);
      reenqueued++;
      logger.info(`启动回填 | ${s.name}:${today} 到点未执行，重新入队`);
    } catch (e) {
      logger.error(`回填检查失败 | ${s.name}: ${e.message}`);
    }
  }

  return reenqueued;
}

module.exports = { backfillMissed };