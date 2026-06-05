const DailyProfit = require('../models/dailyProfit');
const Holding = require('../models/holding');
const pool = require('../config/database');
const fundService = require('./fundService');
const holdingService = require('./holdingService');

/**
 * 日收益计算服务 v3.0
 * ★ 核心原则：只计算已确认净值的基金，未确认的不参与
 *
 * 设计理念：
 * - 日收益记录 = 只基于基金公司公布的确认净值
 * - 未确认的基金 → 完全不参与计算（等待确认后再加入）
 * - 每有新基金确认 → 立即更新日收益记录（累加模式）
 * - 假期/非交易日 → 不生成记录，不进行计算
 */
class DailyProfitService {
  constructor() {
    this.lastUpdateCache = new Map();
    this.MIN_UPDATE_INTERVAL_MINUTES = 5; // 最小更新间隔5分钟
  }

  /**
   * ★ 检查今天是否为交易日（统一使用checkMarketStatus，支持节假日检测）
   * @param {Array} holdings - 持仓列表（用于采样判断）
   * @returns {boolean} 是否为交易日
   */
  async isTradingDay(holdings) {
    try {
      const marketStatus = await holdingService.checkMarketStatus(holdings);
      return marketStatus.isMarketOpen;
    } catch (error) {
      console.error('[DailyProfit] checkMarketStatus 失败，降级为周末检查:', error.message);
      const dayOfWeek = new Date().getDay();
      return !(dayOfWeek === 0 || dayOfWeek === 6);
    }
  }

  /**
   * ★ 核心方法：检查并更新日收益（仅基于已确认基金）
   */
  async calculateAndSaveDailyProfit(userId, holdingsWithRealTimeData) {
    try {
      if (!holdingsWithRealTimeData || holdingsWithRealTimeData.length === 0) {
        console.log(`[DailyProfit] 用户 ${userId} 无持仓，跳过`);
        return null;
      }

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const cacheKey = `${userId}_${today}`;

      const lastUpdate = this.lastUpdateCache.get(cacheKey);
      if (lastUpdate) {
        const minutesSinceLastUpdate = (now - lastUpdate) / (1000 * 60);
        if (minutesSinceLastUpdate < this.MIN_UPDATE_INTERVAL_MINUTES) {
          return null;
        }
      }

      console.log(`\n[DailyProfit] ===== 开始处理用户 ${userId} (${today}) =====`);

      // ★ 第零步：检查是否为交易日（统一使用checkMarketStatus）
      if (!await this.isTradingDay(holdingsWithRealTimeData)) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        console.log(`[DailyProfit] ⏸️ 今天是${dayNames[now.getDay()]}或节假日，非交易日，跳过计算`);
        return null;
      }

      // ★ 第一步：逐只检查哪些基金今天已确认
      const confirmationResult = await this.checkConfirmedFunds(holdingsWithRealTimeData, today);
      const { confirmedFunds, unconfirmedFunds } = confirmationResult;

      console.log(`[DailyProfit] 已确认: ${confirmedFunds.length}/${holdingsWithRealTimeData.length}`);
      if (confirmedFunds.length > 0) {
        console.log(`[DailyProfit] 确认列表: ${confirmedFunds.map(f => f.fund_code).join(', ')}`);
      }
      if (unconfirmedFunds.length > 0) {
        const pendingCodes = unconfirmedFunds.map(f => f.fund_code).join(', ');
        console.log(`[DailyProfit] 待确认: ${pendingCodes} (不参与计算)`);
      }

      // ★ 第二步：如果没有任何基金确认，直接返回
      if (confirmedFunds.length === 0) {
        console.log('[DailyProfit] ⏳ 今天暂无任何基金确认，跳过计算');
        return null;
      }

      // ★ 2.5步：检查确认基金的收益数据是否有效（防止假期旧数据）
      const validProfits = confirmedFunds
        .map(f => f.daily_profit)
        .filter(p => p !== undefined && p !== null && !isNaN(p));

      if (validProfits.length === 0 || validProfits.every(p => p === 0)) {
        console.log('[DailyProfit] ⏸️ 所有确认基金的收益为0或无效，可能为非交易日，跳过');
        return null;
      }

      // ★ 第三步：仅基于已确认基金获取确认净值并计算
      const calculationResult = await this.calculateFromConfirmedFundsOnly(confirmedFunds, today);

      // ★ 第四步：获取基准值并计算收益率
      const yesterdayRecord = await DailyProfit.findYesterdayByUserId(userId);
      let baselineValue = calculationResult.totalCost;
      if (baselineValue <= 0) {
        baselineValue = yesterdayRecord?.market_value || calculationResult.totalMarketValue;
      }

      const returnRate = baselineValue > 0 ? (calculationResult.totalDailyProfit / baselineValue) * 100 : 0;

      // ★ 第五步：构建详细信息（仅包含已确认基金）
      const details = this.buildDetails(calculationResult, confirmedFunds.length, holdingsWithRealTimeData.length);

      // ★ 第六步：保存到数据库
      await DailyProfit.upsert({
        userId,
        date: today,
        profit: Math.round(calculationResult.totalDailyProfit * 100) / 100,
        returnRate: Math.round(returnRate * 10000) / 10000,
        totalInvestment: calculationResult.totalCost,
        marketValue: calculationResult.totalMarketValue,
        details
      });

      this.lastUpdateCache.set(cacheKey, now);

      const result = {
        date: today,
        profit: calculationResult.totalDailyProfit,
        returnRate,
        marketValue: calculationResult.totalMarketValue,
        confirmedCount: confirmedFunds.length,
        totalCount: holdingsWithRealTimeData.length,
        pendingCount: unconfirmedFunds.length,
        details
      };

      console.log(`[DailyProfit] ✅ 日收益已更新 (仅基于${confirmedFunds.length}只确认基金):`);
      console.log(`   收益: ¥${calculationResult.totalDailyProfit.toFixed(2)} (${returnRate.toFixed(2)}%)`);
      console.log(`   待确认: ${unconfirmedFunds.length}只 (确认后将自动加入)\n`);

      return result;

    } catch (error) {
      console.error('[DailyProfit] 失败:', error);
      throw error;
    }
  }

  /**
   * 检查哪些基金今天已确认（有历史净值记录）
   */
  async checkConfirmedFunds(holdings, today) {
    const results = await Promise.all(
      holdings.map(async (holding) => {
        try {
          const history = await fundService.getHistoryNetValues(holding.fund_code, today, today);
          const isConfirmed = history && history.length > 0;
          return {
            ...holding,
            confirmed: isConfirmed,
            historyData: isConfirmed ? history[0] : null
          };
        } catch (error) {
          return { ...holding, confirmed: false, error: error.message };
        }
      })
    );

    const confirmedFunds = results.filter(f => f.confirmed);
    const unconfirmedFunds = results.filter(f => !f.confirmed);

    return { confirmedFunds, unconfirmedFunds };
  }

  /**
   * ★ 核心计算：仅基于已确认基金的当日收益
   *
   * 直接使用 holdingService 计算的 daily_profit 值（与持仓界面一致）
   * 确认状态仅用于判断是否参与统计
   */
  async calculateFromConfirmedFundsOnly(confirmedFunds, today) {
    let totalMarketValue = 0;
    let totalCost = 0;
    let totalDailyProfit = 0;

    const fundsDetails = confirmedFunds.map((fund) => {
      const shares = parseFloat(fund.shares) || 0;
      const costPrice = parseFloat(fund.cost_price) || 0;
      const totalCostForFund = shares * costPrice;

      // ★ 直接使用 holdingService 已计算的 daily_profit（与持仓界面一致）
      const dailyProfit = fund.daily_profit || 0;
      const marketValue = fund.market_value || 0;
      const netValue = fund.net_value || 0;

      totalMarketValue += marketValue;
      totalCost += totalCostForFund;
      totalDailyProfit += dailyProfit;

      console.log(`[DailyProfit]   ✓ ${fund.fund_code}: 净值=${netValue}, 涨跌幅=${fund.estimated_change}%, 当日盈亏=¥${dailyProfit.toFixed(2)}`);

      return {
        fund_code: fund.fund_code,
        fund_name: fund.fund_name || '',
        shares: shares,
        net_value: netValue,
        market_value: Math.round(marketValue * 100) / 100,
        cost_price: costPrice,
        total_cost: Math.round(totalCostForFund * 100) / 100,
        daily_profit: Math.round(dailyProfit * 100) / 100, // ★ 直接使用holdingService的值
        gain_percent: fund.estimated_change || 0,
        data_source: 'actual',
        update_status: 'confirmed'
      };
    });

    return {
      fundsDetails,
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalDailyProfit: Math.round(totalDailyProfit * 100) / 100,
      fundCount: confirmedFunds.length
    };
  }

  buildDetails(calculationResult, confirmedCount, totalCount) {
    const now = new Date();

    return {
      funds: calculationResult.fundsDetails,
      summary: {
        fund_count: calculationResult.fundCount,
        confirmed_funds: confirmedCount,
        pending_funds: totalCount - confirmedCount,
        total_funds: totalCount,
        total_market_value: calculationResult.totalMarketValue,
        total_cost: calculationResult.totalCost,
        total_daily_profit: calculationResult.totalDailyProfit,
        total_daily_return_rate: calculationResult.totalCost > 0
          ? Math.round((calculationResult.totalDailyProfit / calculationResult.totalCost) * 10000) / 10000
          : 0,
        note: `仅基于${confirmedCount}只已确认基金计算，${totalCount - confirmedCount}只待确认`
      },
      update_time: now.toISOString().slice(0, 19).replace('T', ' '),
      data_source: 'actual',
      note: '仅包含已确认净值的基金'
    };
  }

  /**
   * ★ 定时兜底任务：为今天未记录日收益的用户补算
   * 在每天 23:55 由 cron 触发，确保即使用户当天未打开 App 也能记录日收益
   */
  async backfillDailyProfit() {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`\n[DailyProfit] ===== 定时兜底任务启动 (${today} 23:55) =====`);

    try {
      // ★ 周末直接跳过，避免无意义的API请求
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log('[DailyProfit] 周末非交易日，跳过补算');
        return { total: 0, skipped: 0, success: 0, failed: 0 };
      }

      // 查询所有有持仓的用户
      const [userRows] = await pool.query(
        `SELECT DISTINCT user_id FROM holdings`
      );

      if (!userRows.length) {
        console.log('[DailyProfit] 无持仓用户，跳过');
        return { total: 0, skipped: 0, success: 0, failed: 0 };
      }

      // 查询今天已有日收益记录的用户
      const [recordedRows] = await pool.query(
        `SELECT DISTINCT user_id FROM daily_profits WHERE date = ?`,
        [today]
      );
      const recordedUserIds = new Set(recordedRows.map(r => r.user_id));

      // 筛选出今天未记录的用户
      const pendingUsers = userRows.filter(r => !recordedUserIds.has(r.user_id));

      console.log(`[DailyProfit] 持仓用户: ${userRows.length}, 已记录: ${recordedUserIds.size}, 待补算: ${pendingUsers.length}`);

      if (!pendingUsers.length) {
        console.log('[DailyProfit] 所有用户今日收益已记录，无需补算');
        return { total: userRows.length, skipped: recordedUserIds.size, success: 0, failed: 0 };
      }

      // ★ 用第一个待补算用户的持仓判断是否为交易日（含节假日检测），非交易日直接跳过
      const firstUserHoldings = await Holding.findByUserId(pendingUsers[0].user_id);
      if (firstUserHoldings && firstUserHoldings.length > 0) {
        if (!await this.isTradingDay(firstUserHoldings)) {
          console.log('[DailyProfit] 非交易日（节假日），跳过补算');
          return { total: userRows.length, skipped: recordedUserIds.size, success: 0, failed: 0 };
        }
      }

      // 逐用户补算（串行，避免并发请求外部API过多）
      let success = 0;
      let failed = 0;

      for (const row of pendingUsers) {
        const userId = row.user_id;
        try {
          // 清除该用户的更新缓存，允许重新计算
          this.lastUpdateCache.delete(`${userId}_${today}`);

          const holdings = await Holding.findByUserId(userId);
          if (!holdings || holdings.length === 0) continue;

          const enriched = await holdingService.enrichHoldingsWithRealTimeData(holdings, true);
          const result = await this.calculateAndSaveDailyProfit(userId, enriched);

          if (result) {
            success++;
            console.log(`[DailyProfit] ✓ 用户 ${userId} 补算成功: ¥${result.profit.toFixed(2)}`);
          } else {
            // 无确认基金，不算失败
            console.log(`[DailyProfit] - 用户 ${userId} 跳过（无确认基金）`);
          }
        } catch (err) {
          failed++;
          console.error(`[DailyProfit] ✗ 用户 ${userId} 补算失败:`, err.message);
        }
      }

      console.log(`[DailyProfit] ===== 兜底任务完成 =====`);
      console.log(`   待补算: ${pendingUsers.length}, 成功: ${success}, 失败: ${failed}\n`);

      return { total: userRows.length, skipped: recordedUserIds.size, success, failed };
    } catch (error) {
      console.error('[DailyProfit] 兜底任务异常:', error);
      throw error;
    }
  }

  clearCache() {
    this.lastUpdateCache.clear();
  }
}

module.exports = new DailyProfitService();