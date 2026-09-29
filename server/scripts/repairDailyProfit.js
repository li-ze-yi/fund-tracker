/**
 * 一次性修复脚本：重算指定日期的日收益记录（daily_profits）
 *
 * 背景
 *   2026-09-28（中秋假期后首个交易日）23:55 的日收益兜底任务使用固定 3 天历史窗口，
 *   窗口起点 2026-09-25 恰为中秋休市日（09-26/27 为周末），前一个交易日 09-24 落在窗口之外，
 *   于是历史净值只拉到 09-28 一条 → 昨日净值缺失被当作 0，
 *   当日盈亏 = 昨日份额 × (今日净值 − 0) = 持仓市值，daily_profits 中 09-28 的 profit 全部虚高。
 *
 * 前置：holdingService / dailyProfitService 已改为锚点感知窗口（min(最近交易日−1, 今天−15)），
 *       并新增"昨日净值 DB 兜底 + 取不到则跳过该基金"守卫。
 *
 * 用法（在 server 目录下执行）
 *   node scripts/repairDailyProfit.js 2026-09-28 --dry-run   # 只打印将要写入的结果，不落库
 *   node scripts/repairDailyProfit.js 2026-09-28             # 实际覆盖写入
 */
process.env.TZ = 'Asia/Shanghai';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../config/database');
const globalCache = require('../services/globalCache');
const Holding = require('../models/holding');
const DailyProfit = require('../models/dailyProfit');
const dailyProfitService = require('../services/dailyProfitService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RepairDailyProfit');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (process.argv[2] || '').trim();
const dryRun = process.argv.includes('--dry-run');

/**
 * 清理该日期被污染的 history_*_3d_<date> 缓存（曾写入"仅 1 条净值"的窄窗口数据）。
 * 清理后服务会按锚点感知窗口重新拉取并回写完整数组，多用户间仍可复用同一条缓存。
 */
async function clearPoisonedHistoryCache(fundCodes) {
  for (const code of fundCodes) {
    await globalCache.delete(`history_${code}_3d_${date}`);
  }
  logger.info(`已清理 ${fundCodes.length} 个历史净值缓存键 (history_*_3d_${date})`);
}

async function main() {
  if (!DATE_RE.test(date)) {
    logger.error('用法: node scripts/repairDailyProfit.js YYYY-MM-DD [--dry-run]');
    process.exit(1);
  }

  // 1. 找出该日期已有记录的用户
  const [recordRows] = await pool.query(
    'SELECT user_id, profit, market_value, return_rate FROM daily_profits WHERE date = ? ORDER BY user_id',
    [date]
  );
  if (!recordRows.length) {
    logger.info(`${date} 无日收益记录，无需修复`);
    process.exit(0);
  }

  const oldMap = new Map(recordRows.map(r => [r.user_id, r]));
  const userIds = recordRows.map(r => r.user_id);
  logger.info(`${date} 待修复用户: ${userIds.length} 位${dryRun ? '（dry-run，不落库）' : ''}`);

  // 2. 清理被污染的窄窗口历史缓存
  const [fundRows] = await pool.query(
    'SELECT DISTINCT fund_code FROM holdings WHERE user_id IN (?)',
    [userIds]
  );
  await clearPoisonedHistoryCache(fundRows.map(r => r.fund_code));

  // 3. dry-run 拦截落库（仅本脚本内替换，生产代码不含 dry-run 分支）
  if (dryRun) {
    DailyProfit.upsert = async (data) => {
      logger.info(`[DRY] 将写入 user=${data.userId} date=${data.date} profit=${data.profit} return_rate=${data.returnRate} market_value=${data.marketValue}`);
      return { dryRun: true };
    };
  }

  // 4. 逐用户重算（串行，避免并发请求外部 API 过多）
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const old = oldMap.get(userId);
    try {
      const holdings = await Holding.findByUserId(userId);
      if (!holdings || holdings.length === 0) {
        skipped++;
        logger.info(`用户 ${userId} 无持仓，跳过`);
        continue;
      }

      const result = await dailyProfitService.calculateAndSaveDailyProfitFromConfirmedNav(
        userId,
        holdings,
        { date }
      );

      if (!result) {
        skipped++;
        logger.warn(`用户 ${userId} 重算未产生记录（无确认基金或收益全 0），保留原记录 profit=${old.profit}`);
        continue;
      }

      success++;
      logger.info(
        `用户 ${userId} 修复: profit ${old.profit} → ${result.profit.toFixed(2)} | ` +
        `市值 ${old.market_value} → ${result.marketValue} | 收益率 ${old.return_rate}% → ${result.returnRate.toFixed(4)}% | ` +
        `确认 ${result.confirmedCount}/${result.totalCount}（待确认 ${result.pendingCount}）`
      );
    } catch (err) {
      failed++;
      logger.error(`用户 ${userId} 重算失败: ${err.message}`);
    }
  }

  logger.info(`===== 修复完成 ===== 成功=${success} 跳过=${skipped} 失败=${failed}${dryRun ? '（dry-run，未落库）' : ''}`);
  process.exit(0);
}

main().catch(err => {
  logger.error(`修复脚本异常: ${err.message}`, err.stack);
  process.exit(1);
});