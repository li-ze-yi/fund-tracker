const DailyProfit = require('../models/dailyProfit');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const Fund = require('../models/fund');
const pool = require('../config/database');
const globalCache = require('./globalCache');
const holdingService = require('./holdingService');
const fundService = require('./fundService');
const settlementService = require('./settlementService');
const holidayService = require('./holidayService');
const { getLocalToday, normalizeDateStr } = require('../utils/date');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DailyProfit');

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
      logger.error(`checkMarketStatus 失败，降级为周末检查: ${error.message}`);
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
        logger.info(`用户 ${userId} 无持仓，跳过`);
        return null;
      }

      const now = new Date();
      const today = getLocalToday();
      const cacheKey = `${userId}_${today}`;

      const lastUpdate = this.lastUpdateCache.get(cacheKey);
      if (lastUpdate) {
        const minutesSinceLastUpdate = (now - lastUpdate) / (1000 * 60);
        if (minutesSinceLastUpdate < this.MIN_UPDATE_INTERVAL_MINUTES) {
          return null;
        }
      }

      logger.info(`===== 开始处理用户 ${userId} (${today}) =====`);

      // ★ 第零步：检查是否为交易日（统一使用checkMarketStatus）
      if (!await this.isTradingDay(holdingsWithRealTimeData)) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        logger.info(`今天是${dayNames[now.getDay()]}或节假日，非交易日，跳过计算`);
        return null;
      }

      // ★ 第一步：直接复用 holdingService 已计算的确认状态（不重复请求1天历史数据）
      const confirmedFunds = [];
      const unconfirmedFunds = [];
      for (const holding of holdingsWithRealTimeData) {
        if (holding.is_confirmed === true) {
          confirmedFunds.push(holding);
        } else {
          if (holding.is_confirmed !== false) {
            // is_confirmed 为 undefined/null 时打印警告
            logger.warn(`基金 ${holding.fund_code} 缺少 is_confirmed 字段，按未确认处理`);
          }
          unconfirmedFunds.push(holding);
        }
      }

      logger.info(`已确认: ${confirmedFunds.length}/${holdingsWithRealTimeData.length}`);
      if (confirmedFunds.length > 0) {
        logger.info(`确认列表: ${confirmedFunds.map(f => f.fund_code).join(', ')}`);
      }
      if (unconfirmedFunds.length > 0) {
        const pendingCodes = unconfirmedFunds.map(f => f.fund_code).join(', ');
        logger.info(`待确认: ${pendingCodes} (不参与计算)`);
      }

      // ★ 第二步：如果没有任何基金确认，直接返回
      if (confirmedFunds.length === 0) {
        logger.info(`今天暂无任何基金确认，跳过计算`);
        return null;
      }

      // ★ 2.5步：检查确认基金的收益数据是否有效（防止假期旧数据）
      const validProfits = confirmedFunds
        .map(f => f.daily_profit)
        .filter(p => p !== undefined && p !== null && !isNaN(p));

      if (validProfits.length === 0 || validProfits.every(p => p === 0)) {
        logger.info(`所有确认基金的收益为0或无效，可能为非交易日，跳过`);
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

      logger.info(`✅ 日收益已更新 (仅基于${confirmedFunds.length}只确认基金):`);
      logger.info(`收益: ¥${calculationResult.totalDailyProfit.toFixed(2)} (${returnRate.toFixed(2)}%)`);
      logger.info(`待确认: ${unconfirmedFunds.length}只 (确认后将自动加入)`);

      return result;

    } catch (error) {
      logger.error('失败:', error);
      throw error;
    }
  }

  /**
   * ★ 兜底任务专用：仅基于历史确认净值直算日收益（不调用任何实时估值接口）
   * 23:55 A股已收盘，实时估值无意义；此方法只拉历史净值，按确认净值差直算当日盈亏
   */
  async calculateAndSaveDailyProfitFromConfirmedNav(userId, holdings) {
    try {
      if (!holdings || holdings.length === 0) {
        logger.info(`用户 ${userId} 无持仓，跳过`);
        return null;
      }

      const now = new Date();
      const today = getLocalToday();
      const cacheKey = `${userId}_${today}`;

      const lastUpdate = this.lastUpdateCache.get(cacheKey);
      if (lastUpdate) {
        const minutesSinceLastUpdate = (now - lastUpdate) / (1000 * 60);
        if (minutesSinceLastUpdate < this.MIN_UPDATE_INTERVAL_MINUTES) {
          return null;
        }
      }

      logger.info(`===== 开始处理用户 ${userId} (${today}) [确认净值直算] =====`);

      // ★ 只拉历史净值，不调用任何实时估值接口
      // 优先使用缓存：命中且缓存中最新净值日期 === today 才直接复用（避免白天未含今日净值的旧缓存导致 isConfirmed 误判）
      // 未命中或缓存中无今日净值 → 调 API 拉取并回写缓存（与 enrichHoldingsWithRealTimeData 共享同一 cacheKey，盘中已缓存的兜底可直接复用）
      const fundCodes = holdings.map(h => h.fund_code);
      const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
      const historyMap = {};
      const needFetch = [];
      for (const code of fundCodes) {
        const cacheKey = `history_${code}_3d_${today}`;
        const result = globalCache.checkCache(cacheKey, 'history_recent');
        if (result.hit && result.data && result.data.length > 0 && result.data[0].date === today) {
          historyMap[code] = result.data;
        } else {
          needFetch.push(code);
        }
      }

      if (needFetch.length > 0) {
        const freshMap = await fundService.batchGetHistoryNetValues(needFetch, threeDaysAgo, today);
        for (const code of needFetch) {
          const data = freshMap[code];
          if (data && data.length > 0) {
            const cacheKey = `history_${code}_3d_${today}`;
            globalCache.set(cacheKey, data, 'history_recent');
          }
          historyMap[code] = data;
        }
        logger.info(`历史净值: 缓存命中 ${fundCodes.length - needFetch.length}/${fundCodes.length}, 拉取 ${needFetch.length} 只`);
      } else {
        logger.info(`历史净值: 全部缓存命中 ${fundCodes.length}/${fundCodes.length}`);
      }

      // ★ 批量查询基金类型（识别 QDII/海外：其确认净值合法滞后 A 股 1-2 天，需放宽"已确认"判定）
      let fundTypeMap = {};
      try {
        const fundRows = await Fund.findByCodes(fundCodes);
        for (const f of fundRows) {
          if (f && f.code) fundTypeMap[f.code] = f.type;
        }
      } catch (e) {
        logger.warn(`批量查询基金类型失败，QDII 识别降级为严格判定: ${e.message}`);
      }

      // ★ 读取最近一条日收益记录中各基金已计入的净值日期（nav_date）：
      // QDII 净值停滞（美股节假日等）时最新净值日期未推进 → 跳过防重复计入
      let prevNavDateMap = {};
      try {
        const prevRecord = await DailyProfit.findLatestByUserId(userId);
        if (prevRecord && prevRecord.details) {
          let pd = prevRecord.details;
          if (typeof pd === 'string') pd = JSON.parse(pd);
          if (pd && Array.isArray(pd.funds)) {
            for (const f of pd.funds) {
              if (f && f.fund_code && f.nav_date) prevNavDateMap[f.fund_code] = f.nav_date;
            }
          }
        }
      } catch (e) {
        logger.warn(`读取最近记录失败，跳过净值日去重: ${e.message}`);
      }

      // ★ 查询今日交易份额（复用 holdingService.enrichHoldingsWithRealTimeData 中的逻辑）
      let todayTxSharesMap = {};
      try {
        const [rows] = await pool.query(
          `SELECT fund_code, type, SUM(shares) as total_shares FROM transactions
           WHERE user_id = ? AND transaction_date = ? AND status = 'confirmed'
           GROUP BY fund_code, type`,
          [userId, today]
        );
        rows.forEach(r => {
          if (!todayTxSharesMap[r.fund_code]) todayTxSharesMap[r.fund_code] = { buy: 0, sell: 0 };
          todayTxSharesMap[r.fund_code][r.type] = parseFloat(r.total_shares) || 0;
        });
      } catch (e) {
        logger.error(`查询今日交易份额失败: ${e.message}`);
      }

      const confirmedFunds = [];
      const unconfirmedFunds = [];
      const confirmedProfits = [];
      let totalMarketValue = 0;
      let totalCost = 0;
      let totalDailyProfit = 0;
      const fundsDetails = [];

      for (const holding of holdings) {
        const fundCode = holding.fund_code;
        const history = historyMap[fundCode] || [];
        const latestHistoryDate = history.length > 0 ? history[0].date : null;
        // ★ QDII/海外基金确认净值合法滞后 A 股 1-2 天：最新净值日期距今 ≤2 天视为已确认，参与日收益
        const isQDII = holdingService.isQdiiFundType(fundTypeMap[fundCode]);
        const isConfirmed = latestHistoryDate === today ||
          (isQDII && latestHistoryDate && (new Date(today) - new Date(latestHistoryDate)) / (24 * 3600 * 1000) <= 2);

        // 未确认基金（A 股最新净值 < 今天；QDII 滞后超 2 天）不参与计算
        if (!isConfirmed) {
          unconfirmedFunds.push(holding);
          continue;
        }

        // ★ 净值日去重（仅 QDII）：净值停滞（美股节假日等）时最新净值日期未推进 → 跳过，防止重复计入同一净值差。
        // 仅对 QDII 生效；A 股最新净值日总是今天，保持原逻辑（每天按当天净值覆盖重算，不受去重影响）
        const prevNavDate = prevNavDateMap[fundCode];
        if (isQDII && prevNavDate && latestHistoryDate && latestHistoryDate <= prevNavDate) {
          logger.debug(`${fundCode}: 最新净值日 ${latestHistoryDate} 未推进(上次计入 ${prevNavDate})，跳过防重复`);
          unconfirmedFunds.push(holding);
          continue;
        }

        const shares = parseFloat(holding.shares) || 0;
        const costPrice = parseFloat(holding.cost_price) || 0;
        const todayNav = parseFloat(history[0].nav) || 0;
        const yesterdayNav = history[1] ? (parseFloat(history[1].nav) || 0) : 0;

        // ★ 回写确认净值到 holdings（保证 DB confirmed_nav 新鲜，供盘中估算三级解析命中 DB/缓存）
        // 幂等：todayNav<=0 或 DB 日期已不早于最新确认交易日时不写库，重复运行不覆盖更新的值
        if (todayNav > 0) {
          // 占位持仓（pending 买入未结算，confirmed_nav 为 null）：跳过回写，保持占位状态
          if (holding.confirmed_nav === null) {
            logger.info(`[回写确认净值] 跳过占位持仓: fund=${fundCode}, holdingId=${holding.id}`);
          } else {
            const dbNavDate = holding.confirmed_nav_date
              ? this._normalizeDateStr(holding.confirmed_nav_date)
              : null;
            if (!dbNavDate || dbNavDate < latestHistoryDate) {
              logger.info(`[回写确认净值] fund=${fundCode}, nav=${todayNav}, date=${latestHistoryDate}, 回写 holdings`);
              Holding.update(holding.id, holding.user_id, {
                confirmedNav: todayNav,
                confirmedNavDate: latestHistoryDate
              }).catch(err => {
                logger.error(`[回写确认净值] 失败 fund=${fundCode}, holdingId=${holding.id}: ${err.message}`);
              });
            }
          }
        }
        const todayTx = todayTxSharesMap[fundCode] || { buy: 0, sell: 0 };
        // 昨日份额 = 当前份额 - 今日买入 + 今日卖出
        const yesterdayShares = Math.max(0, shares - (todayTx.buy || 0) + (todayTx.sell || 0));

        // 跳过昨日无份额的基金（今日新购未入库 / 占位持仓未结算），不计入日收益
        if (yesterdayShares === 0) {
          unconfirmedFunds.push(holding);
          logger.debug(`${fundCode}: yesterdayShares=0，跳过（今日新购或未结算）`);
          continue;
        }

        confirmedFunds.push(holding);

        const dailyProfit = yesterdayShares * (todayNav - yesterdayNav);
        const marketValue = shares * todayNav;
        const totalCostForFund = shares * costPrice;
        const gainPercent = yesterdayNav > 0 ? ((todayNav - yesterdayNav) / yesterdayNav) * 100 : 0;

        totalMarketValue += marketValue;
        totalCost += totalCostForFund;
        totalDailyProfit += dailyProfit;
        confirmedProfits.push(dailyProfit);

        logger.debug(`${fundCode}: 今日净值=${todayNav}, 昨日净值=${yesterdayNav}, 当日盈亏=¥${dailyProfit.toFixed(2)}`);

        fundsDetails.push({
          fund_code: fundCode,
          fund_name: holding.fund_name || '',
          shares: shares,
          net_value: todayNav,
          market_value: Math.round(marketValue * 100) / 100,
          cost_price: costPrice,
          total_cost: Math.round(totalCostForFund * 100) / 100,
          daily_profit: Math.round(dailyProfit * 100) / 100,
          gain_percent: Math.round(gainPercent * 10000) / 10000,
          data_source: 'actual',
          update_status: 'confirmed',
          nav_date: latestHistoryDate
        });
      }

      logger.info(`已确认: ${confirmedFunds.length}/${holdings.length}`);
      if (confirmedFunds.length > 0) {
        logger.info(`确认列表: ${confirmedFunds.map(f => f.fund_code).join(', ')}`);
      }
      if (unconfirmedFunds.length > 0) {
        const pendingCodes = unconfirmedFunds.map(f => f.fund_code).join(', ');
        logger.info(`待确认: ${pendingCodes} (不参与计算)`);
      }

      // ★ 没有任何基金确认 → 跳过
      if (confirmedFunds.length === 0) {
        logger.info(`今天暂无任何基金确认，跳过计算`);
        return null;
      }

      // ★ 全 0 跳过判定（基于本次直算结果）
      if (confirmedProfits.length === 0 || confirmedProfits.every(p => p === 0)) {
        logger.info(`所有确认基金的收益为0或无效，可能为非交易日，跳过`);
        return null;
      }

      const calculationResult = {
        fundsDetails,
        totalMarketValue: Math.round(totalMarketValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalDailyProfit: Math.round(totalDailyProfit * 100) / 100,
        fundCount: confirmedFunds.length
      };

      // ★ 获取基准值并计算收益率
      const yesterdayRecord = await DailyProfit.findYesterdayByUserId(userId);
      let baselineValue = calculationResult.totalCost;
      if (baselineValue <= 0) {
        baselineValue = yesterdayRecord?.market_value || calculationResult.totalMarketValue;
      }
      const returnRate = baselineValue > 0 ? (calculationResult.totalDailyProfit / baselineValue) * 100 : 0;

      // ★ 构建详细信息（仅包含已确认基金）
      const details = this.buildDetails(calculationResult, confirmedFunds.length, holdings.length);

      // ★ 保存到数据库
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
        totalCount: holdings.length,
        pendingCount: unconfirmedFunds.length,
        details
      };

      logger.info(`✅ 日收益已更新 (仅基于${confirmedFunds.length}只确认基金):`);
      logger.info(`收益: ¥${calculationResult.totalDailyProfit.toFixed(2)} (${returnRate.toFixed(2)}%)`);
      logger.info(`待确认: ${unconfirmedFunds.length}只 (确认后将自动加入)`);

      return result;

    } catch (error) {
      logger.error('失败:', error);
      throw error;
    }
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

      logger.debug(`${fund.fund_code}: 净值=${netValue}, 涨跌幅=${fund.estimated_change}%, 当日盈亏=¥${dailyProfit.toFixed(2)}`);

      return {
        fund_code: fund.fund_code,
        fund_name: fund.fund_name || '',
        shares: shares,
        net_value: netValue,
        market_value: Math.round(marketValue * 100) / 100,
        cost_price: costPrice,
        total_cost: Math.round(totalCostForFund * 100) / 100,
        daily_profit: Math.round(dailyProfit * 100) / 100,
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
   * ★ 定时兜底任务：为今天未记录或部分记录日收益的用户补算
   * 在每天 23:55 由 cron 触发，确保即使用户当天未打开 App 也能记录日收益
   * 改造：不再调用新浪实时估值接口，改为只拉历史确认净值直算日收益
   *       修复"部分记录"用户漏算问题（早打开 App 时部分基金未确认 → 后续确认后补全）
   */
  async backfillDailyProfit() {
    const today = getLocalToday();
    logger.info(`===== 定时兜底任务启动 (${today} 23:55) =====`);

    try {
      // ★ 交易日判断：直接使用 holidayService，避免触发新浪请求
      // 非交易日直接返回，不调历史净值接口
      let isTrading = false;
      try {
        isTrading = await holidayService.isTradingDay(today);
      } catch (error) {
        logger.error(`holidayService.isTradingDay 失败，降级为周末检查: ${error.message}`);
        const dayOfWeek = new Date().getDay();
        isTrading = !(dayOfWeek === 0 || dayOfWeek === 6);
      }
      if (!isTrading) {
        logger.info('非交易日（节假日/周末），跳过补算');
        return { total: 0, skipped: 0, success: 0, failed: 0 };
      }

      // 查询所有有持仓的用户
      const [userRows] = await pool.query(
        `SELECT DISTINCT user_id FROM holdings`
      );

      if (!userRows.length) {
        logger.info('无持仓用户，跳过');
        return { total: 0, skipped: 0, success: 0, failed: 0 };
      }

      // 查询今天已有日收益记录的用户（含 details 用于判断是否为完整记录）
      const [recordedRows] = await pool.query(
        `SELECT user_id, details FROM daily_profits WHERE date = ?`,
        [today]
      );

      // ★ 去重逻辑改造：判定"完整记录跳过" vs "待补算"（无记录或部分记录）
      // 完整记录：details.summary.confirmed_funds >= details.summary.total_funds → 跳过
      // 部分记录：confirmed_funds < total_funds → 纳入补算（覆盖写入补全后续确认的基金）
      // 容错：details 解析失败或缺字段 → 按"部分记录"处理，避免漏算
      const pendingUsers = [];
      let fullRecordSkipCount = 0;

      for (const row of userRows) {
        const userId = row.user_id;
        const recorded = recordedRows.find(r => r.user_id === userId);
        if (!recorded) {
          // 无记录 → 纳入补算
          pendingUsers.push(row);
          continue;
        }

        let isFullRecord = false;
        try {
          let details = recorded.details;
          if (typeof details === 'string') {
            details = JSON.parse(details);
          }
          const summary = details && details.summary;
          if (summary && typeof summary.confirmed_funds === 'number' && typeof summary.total_funds === 'number') {
            isFullRecord = summary.confirmed_funds >= summary.total_funds;
          } else {
            // 缺字段 → 按部分记录处理
            isFullRecord = false;
          }
        } catch (e) {
          // 解析失败 → 按部分记录处理
          isFullRecord = false;
        }

        if (isFullRecord) {
          fullRecordSkipCount++;
        } else {
          pendingUsers.push(row);
        }
      }

      logger.info(`持仓用户: ${userRows.length}, 完整记录跳过: ${fullRecordSkipCount}, 待补算(含部分记录): ${pendingUsers.length}`);

      if (!pendingUsers.length) {
        logger.info('所有用户今日收益已完整记录，无需补算');
        return { total: userRows.length, skipped: fullRecordSkipCount, success: 0, failed: 0 };
      }

      // 逐用户补算（串行，避免并发请求外部API过多）
      let success = 0;
      let failed = 0;

      for (const row of pendingUsers) {
        const userId = row.user_id;
        try {
          // 清除该用户的更新缓存，允许重新计算
          this.lastUpdateCache.delete(`${userId}_${today}`);

          // ★ 先结算该用户的 pending 订单，避免卖出订单未结算导致持仓份额仍 >0
          // （盘中全部卖出但未重新打开 App 时，兜底任务必须先结算才能正确计算当日收益）
          await this._settlePendingTransactions(userId);

          // 结算后重新获取最新持仓
          const holdings = await Holding.findByUserId(userId);
          if (!holdings || holdings.length === 0) continue;

          // ★ 不再调用 enrichHoldingsWithRealTimeData，直接基于历史确认净值直算
          const result = await this.calculateAndSaveDailyProfitFromConfirmedNav(userId, holdings);

          if (result) {
            success++;
            logger.info(`用户 ${userId} 补算成功: ¥${result.profit.toFixed(2)}`);
          } else {
            // 无确认基金，不算失败
            logger.info(`用户 ${userId} 跳过（无确认基金）`);
          }
        } catch (err) {
          failed++;
          logger.error(`用户 ${userId} 补算失败: ${err.message}`);
        }
      }

      logger.info(`===== 兜底任务完成 =====`);
      logger.info(`待补算(含部分记录): ${pendingUsers.length}, 成功: ${success}, 失败: ${failed}`);

      return { total: userRows.length, skipped: fullRecordSkipCount, success, failed };
    } catch (error) {
      logger.error('兜底任务异常:', error);
      throw error;
    }
  }

  /**
   * ★ 结算用户 pending 交易订单（统一结算逻辑，来自 settlementService）
   * 在 backfillDailyProfit 中先调用此方法，确保卖出订单已结算后再计算当日收益
   * 每笔交易独立 try/catch，单笔失败不中断整体流程
   */
  async _settlePendingTransactions(userId) {
    try {
      const pendingTransactions = await Transaction.findPendingByUserId(userId);
      if (!pendingTransactions.length) return;

      logger.info(`发现 ${pendingTransactions.length} 笔待结算订单，开始自动结算 (用户 ${userId})...`);

      for (const tx of pendingTransactions) {
        try {
          const navDate = this._normalizeDateStr(tx.transaction_date);
          if (!navDate) continue;

          const { nav: confirmedNav } = await settlementService.getConfirmedNavByDate(tx.fund_code, navDate);
          if (!confirmedNav) continue; // 净值未确认，保持 pending

          // 统一结算逻辑（费用/份额/成本反算 + 乐观锁 + 新建/占位替换/加仓三分支）
          await settlementService.settleTransaction({ userId, tx, confirmedNav, navDate });
        } catch (err) {
          logger.error(`结算交易 #${tx.id} 失败: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`用户 ${userId} 自动结算失败: ${err.message}`);
    }
  }

  /**
   * 规范化日期字符串：复用公共 normalizeDateStr（Date 对象用本地时间，字符串取前 10 字符）
   * mysql2 会把 DATE 列转成 UTC Date 对象，必须用本地时间提取。
   */
  _normalizeDateStr(dateVal) {
    return normalizeDateStr(dateVal);
  }

  clearCache() {
    this.lastUpdateCache.clear();
  }
}

module.exports = new DailyProfitService();