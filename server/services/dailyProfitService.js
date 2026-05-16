const DailyProfit = require('../models/dailyProfit');
const fundService = require('./fundService');

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
   * ★ 检查今天是否为交易日
   * @returns {boolean} 是否为交易日
   */
  isTradingDay(date = new Date()) {
    const dayOfWeek = date.getDay();
    // 周六(6)和周日(0)不是交易日
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    // TODO: 可以扩展检查法定节假日列表
    return true;
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

      // ★ 第零步：检查是否为交易日
      if (!this.isTradingDay(now)) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        console.log(`[DailyProfit] ⏸️ 今天是${dayNames[now.getDay()]}，非交易日，跳过计算`);
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

  clearCache() {
    this.lastUpdateCache.clear();
  }
}

module.exports = new DailyProfitService();