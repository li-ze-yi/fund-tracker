const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Favorite = require('../models/favorite');
const fundService = require('../services/fundService');
const holdingService = require('../services/holdingService');
const globalCache = require('../services/globalCache');
const pool = require('../config/database');
const UserSetting = require('../models/userSetting');

// 获取用户对某个基金的估值方法
async function getUserValuationMethod(userId, fundCode) {
  if (!userId) return 'holdings';
  try {
    const settings = await UserSetting.findByUserId(userId);
    const overrides = settings?.valuation_overrides || {};
    // 单基金覆盖 > 全局设置 > 默认（持仓穿透）
    if (overrides[fundCode]) return overrides[fundCode];
    return settings?.valuation_method || 'holdings';
  } catch {
    return 'holdings';
  }
}

exports.search = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    if (!keyword || !keyword.trim()) {
      return res.json([]);
    }
    const funds = await Fund.search(keyword.trim());
    res.json(funds);
  } catch (err) {
    next(err);
  }
};

exports.getByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const fund = await Fund.findByCode(code);
    if (!fund) {
      return res.status(404).json({ message: '基金不存在' });
    }

    // 获取用户设置的估值方法
    const valuationMethod = req.user ? await getUserValuationMethod(req.user.id, code) : 'holdings';
    const realTime = await fundService.getRealTimeValueWithMethod(code, valuationMethod).catch(() => null);

    const result = {
      code: fund.code,
      name: fund.name,
      type: fund.type,
      net_value: realTime ? realTime.netValue : null,
      estimated_change: null, // 初始置null，后续根据市场状态分支赋值（避免估算失败时显示昨日涨幅）
      update_time: realTime ? realTime.updateTime : null,
      // 盘中估算字段
      estimated_value: realTime?.estimatedValue ?? null,
      estimated_change_pct: realTime?.estimatedChange ?? null,
      estimation_method: realTime?.estimationMethod ?? null,
      estimation_coverage: realTime?.estimationCoverage ?? null,
    };

    // ★ 计算更新状态（与holdingService统一使用checkMarketStatus）
    const now = new Date();
    const updateTime = realTime ? realTime.updateTime : null;
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    // ★ 使用统一的checkMarketStatus判断（支持节假日检测）
    const marketStatus = await holdingService.checkMarketStatus([{ fund_code: code }]);

    // ★ 基于实时数据判断该基金的市场状态（不依赖名称识别）
    const effectiveMarketStatus = holdingService.getFundMarketStatus(realTime, marketStatus);

    if (!effectiveMarketStatus.isMarketOpen) {
      result.last_updated = updateTime || null;
      result.data_source = 'actual';
      result.is_fresh = false;
      result.update_status = 'market_closed';
      result.day_of_week = effectiveMarketStatus.dayOfWeek || dayNames[now.getDay()];
    } else {
      // ★ 工作日：检查是否有确认净值
      let isConfirmed = false;
      let confirmedNav = null;
      let yesterdayNav = null;
      try {
        const todayStr = now.toISOString().slice(0, 10);
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const history = await fundService.getHistoryNetValues(code, threeDaysAgo, todayStr);

        if (history && history.length > 0) {
          const todayStr2 = now.toISOString().slice(0, 10);
          // history 是从新到旧排列
          const latestRecord = history[0];
          if (latestRecord && latestRecord.date === todayStr2) {
            isConfirmed = true;
            confirmedNav = parseFloat(latestRecord.nav) || 0;
            // 取昨日净值（history[1]）
            if (history.length > 1) {
              yesterdayNav = parseFloat(history[1].nav) || 0;
            }
            console.log(`[FundController] 基金 ${code} 今天已有确认净值: ${confirmedNav}, 昨日净值: ${yesterdayNav}`);
          }
        }
      } catch (error) {
        console.error(`[FundController] 查询 ${code} 确认净值失败:`, error.message);
      }

      result.last_updated = updateTime || null;

      const hour = now.getHours();
      if (hour < 9) {
        // 盘前待开市：无论是否已确认，都显示待开市，清空涨幅
        result.update_status = 'pre_market';
        result.data_source = 'actual';
        result.is_fresh = false;
        result.estimated_change = null;
      } else if (isConfirmed) {
        result.update_status = 'confirmed';
        result.data_source = 'actual';
        result.is_fresh = true;
        // ★ 确认净值后，优先使用API的除权涨跌幅（NAVCHGRT，已扣除分红影响）
        if (confirmedNav > 0) {
          result.net_value = confirmedNav;
          // 优先：东方财富API除权涨幅
          if (realTime?.gainPercent != null) {
            result.estimated_change = realTime.gainPercent;
          } else if (yesterdayNav > 0) {
            // 回退：原始净值差计算（含分红，可能偏大）
            result.estimated_change = parseFloat(((confirmedNav - yesterdayNav) / yesterdayNav * 100).toFixed(2));
          } else {
            result.estimated_change = null;
          }
        }
      } else if (hour >= 9 && hour < 15) {
        if (realTime?.estimatedChange != null) {
          // 盘中估算成功
          result.update_status = 'estimating';
          result.data_source = 'estimated';
          result.is_fresh = true;
          result.estimated_change = realTime.estimatedChange;
        } else {
          // 盘中估算失败 → 显示前一天确认数据
          result.update_status = 'no_estimate';
          result.data_source = 'actual';
          result.is_fresh = false;
          result.estimated_change = realTime?.gainPercent ?? null;
          result.net_value = realTime?.netValue ?? null;
        }
      } else {
        if (realTime?.estimatedChange != null) {
          // 待确认：使用估算涨跌幅
          result.update_status = 'pending_confirm';
          result.data_source = 'estimated';
          result.is_fresh = false;
          result.estimated_change = realTime.estimatedChange;
        } else {
          // 估算失败 → 显示前一天确认数据
          result.update_status = 'no_estimate';
          result.data_source = 'actual';
          result.is_fresh = false;
          result.estimated_change = realTime?.gainPercent ?? null;
          result.net_value = realTime?.netValue ?? null;
        }
      }
    }

    if (req.user) {
      const holding = await Holding.findByUserAndFund(req.user.id, code);
      if (holding) {
        const shares = parseFloat(holding.shares) || 0;
        const costPrice = parseFloat(holding.cost_price) || 0;
        const totalCost = shares * costPrice;
        // ★ 优先使用确认净值计算市值和收益
        const effectiveNav = result.net_value || (realTime ? realTime.netValue : 0);
        let currentValue = shares * effectiveNav;
        let dailyGain = 0;

        // ★ 查询今日交易份额，排除当日交易对日收益的影响
        // 昨日份额 = 当前份额 - 今日买入 + 今日卖出
        let todayBuyShares = 0, todaySellShares = 0;
        try {
          const today = new Date().toISOString().slice(0, 10);
          const [rows] = await pool.query(
            `SELECT type, SUM(shares) as total_shares FROM transactions
             WHERE user_id = ? AND fund_code = ? AND transaction_date = ? AND status = 'confirmed'
             GROUP BY type`,
            [req.user.id, code, today]
          );
          rows.forEach(r => {
            if (r.type === 'buy') todayBuyShares = parseFloat(r.total_shares) || 0;
            if (r.type === 'sell') todaySellShares = parseFloat(r.total_shares) || 0;
          });
        } catch (e) { /* ignore */ }
        const yesterdayShares = Math.max(0, shares - todayBuyShares + todaySellShares);

        if (result.update_status === 'confirmed' && effectiveNav > 0) {
          // 确认净值后：仅用昨日份额计算当日收益
          if (result.estimated_change != null) {
            const yesterdayValue = yesterdayShares * effectiveNav;
            dailyGain = yesterdayValue * result.estimated_change / (100 + result.estimated_change);
          }
        } else if (realTime && realTime.netValue) {
          currentValue = shares * realTime.netValue;
          if (realTime.gainPercent) {
            const yesterdayValue = yesterdayShares * realTime.netValue;
            dailyGain = yesterdayValue * realTime.gainPercent / (100 + realTime.gainPercent);
          }
        }

        result.shares = shares;
        result.cost_price = costPrice;
        result.total_cost = parseFloat(holding.total_cost) || totalCost;
        result.market_value = Math.round(currentValue * 100) / 100;
        result.accumulated_profit = Math.round((currentValue - totalCost) * 100) / 100;
        result.daily_profit = Math.round(dailyGain * 100) / 100;
        result.holding_id = holding.id;
      }

      const fav = await Favorite.isFavorited(req.user.id, code);
      result.is_favorite = !!fav;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 批量获取基金实时信息（供自选页使用）
 * 一次请求获取多只基金的实时数据，替代前端逐个调用 /funds/:code
 * POST /api/funds/batch  { codes: ['001234', '005678'] }
 */
exports.batchGetInfo = async (req, res, next) => {
  try {
    const { codes } = req.body;
    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return res.json([]);
    }

    // 限制最多50只
    const fundCodes = codes.slice(0, 50);
    const userId = req.user?.id || null;

    // 获取用户估值方法
    let valuationMethod = 'holdings';
    let valuationOverrides = {};
    if (userId) {
      try {
        const settings = await UserSetting.findByUserId(userId);
        valuationMethod = settings?.valuation_method || 'holdings';
        valuationOverrides = settings?.valuation_overrides || {};
      } catch { /* ignore */ }
    }

    // ★ 批量获取实时数据（核心优化：1次新浪请求 + 并行确认净值）
    const realtimeMap = await fundService.batchGetRealTimeValuesWithMethod(fundCodes, valuationMethod);

    // 批量获取历史净值
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const historyMap = await fundService.batchGetHistoryNetValues(fundCodes, threeDaysAgo, today);

    // 市场状态（用前3只基金检测）
    const marketStatus = await holdingService.checkMarketStatus(fundCodes.slice(0, 3).map(c => ({ fund_code: c })));

    // 并行查询所有基金的基本信息和持仓
    const fundInfoPromises = fundCodes.map(async (code) => {
      const fund = await Fund.findByCode(code).catch(() => null);
      return { code, fund };
    });

    const holdingPromises = userId
      ? fundCodes.map(async (code) => {
          const holding = await Holding.findByUserAndFund(userId, code).catch(() => null);
          return { code, holding };
        })
      : [];

    const [fundInfoResults, holdingResults] = await Promise.all([
      Promise.allSettled(fundInfoPromises),
      Promise.allSettled(holdingPromises),
    ]);

    // 构建查找表
    const fundMap = {};
    for (const r of fundInfoResults) {
      if (r.status === 'fulfilled' && r.value.fund) fundMap[r.value.code] = r.value.fund;
    }
    const holdingMap = {};
    for (const r of holdingResults) {
      if (r.status === 'fulfilled' && r.value.holding) holdingMap[r.value.code] = r.value.holding;
    }

    // 查询今日交易份额
    let todayTxSharesMap = {};
    if (userId) {
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
      } catch { /* ignore */ }
    }

    // 组装结果
    const now = new Date();
    const results = fundCodes.map(code => {
      const fund = fundMap[code];
      const realTime = realtimeMap[code] || null;
      const history = historyMap[code] || [];
      const holding = holdingMap[code] || null;
      const txShares = todayTxSharesMap[code] || { buy: 0, sell: 0 };

      const latestHistoryNav = history.length > 0 ? parseFloat(history[0].nav) || 0 : 0;
      const latestHistoryDate = history.length > 0 ? history[0].date : null;
      const isConfirmed = latestHistoryDate === today;
      const yesterdayNav = history.length > 1 ? parseFloat(history[1].nav) || 0 : 0;

      const fundMarketStatus = holdingService.getFundMarketStatus(realTime, marketStatus);
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

      const result = {
        code: code,
        name: fund?.name || code,
        type: fund?.type || '',
        net_value: realTime?.netValue ?? null,
        estimated_change: null, // 初始置null，后续根据市场状态分支赋值
        update_time: realTime?.updateTime ?? null,
        estimated_value: realTime?.estimatedValue ?? null,
        estimated_change_pct: realTime?.estimatedChange ?? null,
        estimation_method: realTime?.estimationMethod ?? null,
        estimation_coverage: realTime?.estimationCoverage ?? null,
      };

      // 更新状态
      if (!fundMarketStatus.isMarketOpen) {
        result.last_updated = realTime?.updateTime || null;
        result.data_source = 'actual';
        result.is_fresh = false;
        result.update_status = 'market_closed';
        result.day_of_week = fundMarketStatus.dayOfWeek || dayNames[now.getDay()];
      } else {
        result.last_updated = realTime?.updateTime || null;
        const hour = now.getHours();
        if (hour < 9) {
          result.update_status = 'pre_market';
          result.data_source = 'actual';
          result.is_fresh = false;
          result.estimated_change = null;
        } else if (isConfirmed && latestHistoryNav > 0) {
          result.update_status = 'confirmed';
          result.data_source = 'actual';
          result.is_fresh = true;
          result.net_value = latestHistoryNav;
          // 优先：东方财富API除权涨幅（NAVCHGRT，已扣除分红影响）
          if (realTime?.gainPercent != null) {
            result.estimated_change = realTime.gainPercent;
          } else if (yesterdayNav > 0) {
            // 回退：原始净值差计算（含分红，可能偏大）
            result.estimated_change = parseFloat(((latestHistoryNav - yesterdayNav) / yesterdayNav * 100).toFixed(2));
          } else {
            result.estimated_change = null;
          }
        } else if (hour >= 9 && hour < 15) {
          if (realTime?.estimatedChange != null) {
            result.update_status = 'estimating';
            result.data_source = 'estimated';
            result.is_fresh = true;
            result.estimated_change = realTime.estimatedChange;
          } else {
            // 盘中估算失败 → 显示前一天确认数据
            result.update_status = 'no_estimate';
            result.data_source = 'actual';
            result.is_fresh = false;
            result.estimated_change = realTime?.gainPercent ?? null;
            result.net_value = realTime?.netValue ?? null;
          }
        } else {
          if (realTime?.estimatedChange != null) {
            result.update_status = 'pending_confirm';
            result.data_source = 'estimated';
            result.is_fresh = false;
            result.estimated_change = realTime.estimatedChange;
          } else {
            // 估算失败 → 显示前一天确认数据
            result.update_status = 'no_estimate';
            result.data_source = 'actual';
            result.is_fresh = false;
            result.estimated_change = realTime?.gainPercent ?? null;
            result.net_value = realTime?.netValue ?? null;
          }
        }
      }

      // 持仓信息
      if (holding) {
        const shares = parseFloat(holding.shares) || 0;
        const costPrice = parseFloat(holding.cost_price) || 0;
        const totalCost = parseFloat(holding.total_cost) || shares * costPrice;
        const effectiveNav = result.net_value || realTime?.netValue || 0;
        let currentValue = shares * effectiveNav;
        let dailyGain = 0;
        const yesterdayShares = Math.max(0, shares - txShares.buy + txShares.sell);

        if (result.update_status === 'confirmed' && effectiveNav > 0 && result.estimated_change != null) {
          const yesterdayValue = yesterdayShares * effectiveNav;
          dailyGain = yesterdayValue * result.estimated_change / (100 + result.estimated_change);
        } else if (realTime?.gainPercent && effectiveNav > 0) {
          const yesterdayValue = yesterdayShares * effectiveNav;
          dailyGain = yesterdayValue * realTime.gainPercent / (100 + realTime.gainPercent);
        }

        result.shares = shares;
        result.cost_price = costPrice;
        result.total_cost = totalCost;
        result.market_value = Math.round(currentValue * 100) / 100;
        result.accumulated_profit = Math.round((currentValue - totalCost) * 100) / 100;
        result.daily_profit = Math.round(dailyGain * 100) / 100;
        result.holding_id = holding.id;
      }

      return result;
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 50;
    const funds = await Fund.getAll(offset, limit);
    res.json(funds);
  } catch (err) {
    next(err);
  }
};

exports.getNavHistory = async (req, res, next) => {
  try {
    const { code, startDate, endDate } = req.query;
    if (!code) return res.status(400).json({ message: '缺少基金代码' });
    const records = await fundService.getHistoryNetValues(code, startDate || '', endDate || '');
    res.json({ records });
  } catch (err) {
    next(err);
  }
};