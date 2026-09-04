const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Favorite = require('../models/favorite');
const fundService = require('../services/fundService');
const holdingService = require('../services/holdingService');
const holidayService = require('../services/holidayService');
const globalCache = require('../services/globalCache');
const pool = require('../config/database');
const UserSetting = require('../models/userSetting');
const { getLocalToday, normalizeDateStr } = require('../utils/date');
const { createLogger } = require('../utils/logger');

const logger = createLogger('FundController');

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
    const kw = keyword.trim();
    // ★ 搜索结果缓存（fund_list 类型 6h TTL）：搜索关键词复用率高，
    // 原实现每次请求都全表扫描 2.7 万行（LIKE 前导 % 无法走索引）；
    // globalCache 自带在途请求去重，高并发同一关键词只打一次数据库
    const cacheKey = `search_${kw}`;
    const funds = await globalCache.getOrFetch(
      cacheKey,
      () => Fund.search(kw),
      { type: 'fund_list' }
    );
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

    // ★ 全天休市检测（周末/法定节假日）：权威信号为 isTradingDay === false，
    // 不能以 marketStatus.reason==='holiday' 判定（交易日盘后也会返回该值）
    const today = getLocalToday();
    let isFullDayClosed = false;
    try {
      isFullDayClosed = !(await holidayService.isTradingDay(today));
    } catch (e) {
      isFullDayClosed = false; // 节假日 API 失败 → 按非休市处理（fail-safe）
    }

    // ★ 待开市判断：交易日盘前 9 点前实时估值尚未更新，同样无需外部拉取
    const now = new Date();
    const hour = now.getHours();
    const isPreMarket = !isFullDayClosed && hour < 9;

    // ★ 提前查询持仓（供休市/待开市净值兜底与下方收益计算复用，避免重复查询）
    let holding = null;
    if (req.user) {
      holding = await Holding.findByUserAndFund(req.user.id, code).catch(() => null);
    }

    // ★ 实时估值：全天休市或待开市时不查询实时估值（实时估值无用）
    // 展示净值直接走确认净值链：confirmed_nav 缓存 → history_3d 缓存 → 持仓 DB；取到后写回 confirmed_nav 缓存下次命中
    let realTime = null;
    if (isFullDayClosed || isPreMarket) {
      // ★ 统一确认净值链：confirmed_nav 缓存 → 持仓 DB → history_3d 缓存 → API 兜底（复用 resolveConfirmedNav）
      const resolved = await holdingService.resolveConfirmedNav(code, holding, null, null, { isQDII: holdingService.isQdiiFundType(fund?.type) });
      if (resolved && resolved.nav > 0) {
        realTime = {
          netValue: resolved.nav,
          gainPercent: null,
          updateTime: resolved.date || null,
          estimatedValue: null,
          estimatedChange: null,
          estimationMethod: null,
          estimationCoverage: null,
        };
      }
      logger.info(`${isFullDayClosed ? '全天休市' : '待开市'}，跳过实时估值（不查询缓存）(${code})`);
    } else {
      // ★ 开市：真实请求按 checkCache 统计（命中 hit / 未命中 miss），未命中才外部拉取，拉取后写回缓存下次命中
      const cacheKey = `realtime_${code}_${valuationMethod}`;
      const cached = globalCache.checkCache(cacheKey, 'realtime');
      if (cached.hit) {
        realTime = cached.data;
      } else {
        realTime = await fundService.getRealTimeValueWithMethod(code, valuationMethod, {
          isQDII: holdingService.isQdiiFundType(fund?.type),
          fundName: fund?.name || '',
        }).catch(() => null);
        if (realTime) {
          globalCache.set(cacheKey, realTime, 'realtime');
        }
      }
    }

    const result = {
      code: fund.code,
      name: fund.name,
      type: fund.type,
      net_value: realTime ? realTime.netValue : null,
      estimated_change: null, // 初始置null，后续根据市场状态分支赋值（避免估算失败时显示昨日涨幅）
      update_time: realTime ? realTime.updateTime : null,
      // 盘中估算字段
      estimated_value: realTime?.estimatedValue ?? null,
      estimation_method: realTime?.estimationMethod ?? null,
      estimation_coverage: realTime?.estimationCoverage ?? null,
    };

    // ★ 计算更新状态（与holdingService统一使用checkMarketStatus）
    const updateTime = realTime ? realTime.updateTime : null;
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    // ★ 使用统一的checkMarketStatus判断（支持节假日检测）
    const marketStatus = await holdingService.checkMarketStatus([{ fund_code: code }]);

    // ★ 基于实时数据判断该基金的市场状态（不依赖名称识别）
    const effectiveMarketStatus = holdingService.getFundMarketStatus(realTime, marketStatus);

    result.last_updated = updateTime || null;

    // ★ 工作日：检查是否有确认净值（仅开市时才需要确认净值）
    let isConfirmed = false;
    let confirmedNav = null;
    let yesterdayNav = null;
    if (effectiveMarketStatus.isMarketOpen) {
      try {
        const todayStr = getLocalToday();
        const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
        // ★ 统一缓存统计：真实请求按 checkCache 统计（命中 hit / 未命中 miss），未命中才外部拉取，拉取后写回 3d 历史缓存
        const historyCacheKey = `history_${code}_3d_${todayStr}`;
        let history = null;
        const historyCached = globalCache.checkCache(historyCacheKey, 'history_recent');
        if (historyCached.hit) {
          history = historyCached.data;
        } else {
          history = await fundService.getHistoryNetValues(code, threeDaysAgo, todayStr);
          if (history && history.length > 0) {
            globalCache.set(historyCacheKey, history, 'history_recent');
          }
        }

        if (history && history.length > 0) {
          const todayStr2 = getLocalToday();
          // history 是从新到旧排列
          const latestRecord = history[0];
          if (latestRecord && latestRecord.date === todayStr2) {
            isConfirmed = true;
            confirmedNav = parseFloat(latestRecord.nav) || 0;
            // 取昨日净值（history[1]）
            if (history.length > 1) {
              yesterdayNav = parseFloat(history[1].nav) || 0;
            }
            logger.info(`基金 ${code} 今天已有确认净值: ${confirmedNav}, 昨日净值: ${yesterdayNav}`);
          }
        }
      } catch (error) {
        logger.error(`查询 ${code} 确认净值失败: ${error.message}`);
      }
    }

    // ★ 统一状态判定（收敛 pre_market/confirmed/estimating/no_estimate/pending_confirm/market_closed）
    const status = holdingService.resolveUpdateStatus({
      hour,
      isMarketOpen: effectiveMarketStatus.isMarketOpen,
      isConfirmed,
      hasEstimate: realTime?.estimatedChange != null,
      dayOfWeek: effectiveMarketStatus.dayOfWeek || dayNames[now.getDay()]
    });
    result.update_status = status.update_status;
    result.data_source = status.data_source;
    result.is_fresh = status.is_fresh;
    if (status.day_of_week) result.day_of_week = status.day_of_week;

    // ★ 依据状态附加涨跌幅 / 净值字段
    if (status.update_status === 'pre_market') {
      result.estimated_change = null;
    } else if (status.update_status === 'confirmed') {
      // ★ 确认净值后，优先使用API的除权涨跌幅（NAVCHGRT，已扣除分红影响）
      if (confirmedNav > 0) {
        result.net_value = confirmedNav;
        if (realTime?.gainPercent != null) {
          result.estimated_change = realTime.gainPercent;
        } else if (yesterdayNav > 0) {
          // 回退：原始净值差计算（含分红，可能偏大）
          result.estimated_change = parseFloat(((confirmedNav - yesterdayNav) / yesterdayNav * 100).toFixed(2));
        } else {
          result.estimated_change = null;
        }
      }
    } else if (status.update_status === 'estimating' || status.update_status === 'pending_confirm') {
      result.estimated_change = realTime.estimatedChange;
    } else if (status.update_status === 'no_estimate') {
      result.estimated_change = realTime?.gainPercent ?? null;
      result.net_value = realTime?.netValue ?? null;
    }

    if (req.user) {
      if (holding) {
        // ★ 持仓指标与持仓列表统一计算（复用 holdingService.calculateHoldingMetrics），
        // 保证当日收益/累计收益/持仓金额/估算涨幅/净值/更新状态与持仓列表完全一致。
        const shares = parseFloat(holding.shares) || 0;
        const costPrice = parseFloat(holding.cost_price) || 0;
        const totalCost = shares * costPrice;

        // ★ 查询今日交易份额（transaction_date=今天 AND confirmed），排除当日交易对日收益的影响
        let todayTxShares = { buy: 0, sell: 0 };
        try {
          const today = getLocalToday();
          const [rows] = await pool.query(
            `SELECT type, SUM(shares) as total_shares FROM transactions
             WHERE user_id = ? AND fund_code = ? AND transaction_date = ? AND status = 'confirmed'
             GROUP BY type`,
            [req.user.id, code, today]
          );
          rows.forEach(r => {
            if (r.type === 'buy') todayTxShares.buy = parseFloat(r.total_shares) || 0;
            if (r.type === 'sell') todayTxShares.sell = parseFloat(r.total_shares) || 0;
          });
        } catch (e) { /* ignore */ }

        // ★ 占位持仓判定（与持仓列表一致：存在 pending 买入且 confirmed_nav 为空）
        let isPendingPurchase = false;
        if (holding.confirmed_nav === null) {
          try {
            const [pendingRows] = await pool.query(
              `SELECT COUNT(*) as cnt FROM transactions
               WHERE user_id = ? AND fund_code = ? AND status = 'pending' AND type = 'buy'`,
              [req.user.id, code]
            );
            isPendingPurchase = (parseInt(pendingRows[0]?.cnt || 0, 10)) > 0;
          } catch (e) { /* ignore */ }
        }

        // ★ 确认净值基准（缓存→DB→API，与持仓列表 resolveConfirmedNav 一致）；
        // 盘中（今日净值未公布）解析出昨日确认净值，保证持仓金额/累计收益盘中稳定
        let baseNav = parseFloat(confirmedNav) || 0;
        if (baseNav <= 0) {
          try {
            const resolved = await holdingService.resolveConfirmedNav(code, holding, null, realTime, { isQDII: holdingService.isQdiiFundType(fund?.type) });
            baseNav = resolved.nav > 0 ? resolved.nav : (parseFloat(holding.confirmed_nav) || 0);
          } catch (e) { /* ignore */ }
        }

        const metrics = holdingService.calculateHoldingMetrics(
          holding,
          realTime,
          isConfirmed,
          baseNav,
          effectiveMarketStatus,
          yesterdayNav,
          todayTxShares,
          isPendingPurchase
        );

        // ★ 合并指标字段（与持仓列表口径一致）
        result.shares = metrics.shares;
        result.cost_price = metrics.cost_price;
        result.total_cost = parseFloat(holding.total_cost) || totalCost;
        result.market_value = metrics.market_value;
        result.accumulated_profit = metrics.accumulated_profit;
        result.daily_profit = metrics.daily_profit;
        result.net_value = metrics.net_value;
        result.estimated_change = metrics.estimated_change;
        result.update_status = metrics.update_status;
        result.data_source = metrics.data_source;
        result.is_fresh = metrics.is_fresh;
        if (metrics.day_of_week) result.day_of_week = metrics.day_of_week;
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
    const today = getLocalToday();
    // ★ 锚点感知兜底窗口（覆盖长假）：startDate = 最近交易日 − 1 天；交易日历不可用时回退 today-3
    const fallbackStartDate = await holdingService.getHistoryFallbackStartDate(today);

    // ★ 全天休市检测（周末/法定节假日）：权威信号为 isTradingDay === false，
    // 不能以 marketStatus.reason==='holiday' 判定（交易日盘后也会返回该值）
    let isFullDayClosed = false;
    try {
      isFullDayClosed = !(await holidayService.isTradingDay(today));
    } catch (e) {
      isFullDayClosed = false; // 节假日 API 失败 → 按非休市处理（fail-safe）
    }

    // ★ 待开市判断：交易日盘前 9 点前实时估值尚未更新，同样无需外部拉取
    const nowHour = new Date().getHours();
    const isPreMarket = !isFullDayClosed && nowHour < 9;

    // 实时估值：全天休市或待开市时不查询实时估值（实时估值无用），展示走确认净值链（组装阶段兜底）
    // 开市：真实数据请求按 checkCache 统计（命中 hit / 未命中 miss）；未命中才外部拉取，拉取后写回缓存下次命中
    let realtimeMap = {};
    if (isFullDayClosed || isPreMarket) {
      logger.info(`${isFullDayClosed ? '全天休市' : '待开市'}，跳过实时估值（不查询缓存）(${fundCodes.length} 只)`);
    } else {
      // 开市：逐只查缓存，未命中按 effectiveMethod 分组批量拉取，拉取后写回
      // QDII 类型标记与基金名称（供持仓穿透板块化/成分加权分支；纯 A 股基金不受影响）
      const qdiiTypeRows = await Fund.findByCodes(fundCodes).catch(() => []);
      const isQdiiMap = {};
      const fundNameMap = {};
      for (const f of qdiiTypeRows) if (f) {
        isQdiiMap[f.code] = holdingService.isQdiiFundType(f.type || '');
        fundNameMap[f.code] = f.name || '';
      }
      const fetchGroups = {}; // effectiveMethod -> [fundCodes]
      for (const code of fundCodes) {
        const effectiveMethod = valuationOverrides[code] || valuationMethod || 'holdings';
        const cacheKey = `realtime_${code}_${effectiveMethod}`;
        const result = globalCache.checkCache(cacheKey, 'realtime');
        if (result.hit) {
          realtimeMap[code] = result.data;
        } else {
          if (!fetchGroups[effectiveMethod]) fetchGroups[effectiveMethod] = [];
          fetchGroups[effectiveMethod].push(code);
        }
      }
      const fetchMethods = Object.keys(fetchGroups);
      let fetchCount = 0;
      for (const method of fetchMethods) {
        const codes = fetchGroups[method];
        fetchCount += codes.length;
        const freshMap = await fundService.batchGetRealTimeValuesWithMethod(codes, method, { isQdiiMap, fundNameMap });
        for (const code of codes) {
          const data = freshMap[code];
          if (data) {
            globalCache.set(`realtime_${code}_${method}`, data, 'realtime');
          }
          realtimeMap[code] = data;
        }
      }
      logger.info(`实时估值: 缓存命中 ${fundCodes.length - fetchCount}/${fundCodes.length}, 拉取 ${fetchCount} 只`);
    }

    // 历史净值：全天休市或待开市时不预查 3d 历史（确认净值优先走 confirmed_nav/DB，仅组装阶段按需兜底）
    // 开市：真实请求按 checkCache 统计，未命中才批量拉取，拉取后写回缓存下次命中
    let historyMap = {};
    if (isFullDayClosed || isPreMarket) {
      logger.info(`${isFullDayClosed ? '全天休市' : '待开市'}，跳过历史净值预取（按需兜底）(${fundCodes.length} 只)`);
    } else {
      // 开市/待开市：逐只查缓存，未命中才批量拉取，拉取后写回
      const needFetch = [];
      for (const code of fundCodes) {
        const cacheKey = `history_${code}_3d_${today}`;
        const result = globalCache.checkCache(cacheKey, 'history_recent');
        if (result.hit) {
          historyMap[code] = result.data;
        } else {
          needFetch.push(code);
        }
      }
      if (needFetch.length > 0) {
        const freshMap = await fundService.batchGetHistoryNetValues(needFetch, fallbackStartDate, today);
        for (const code of needFetch) {
          const data = freshMap[code];
          if (data && data.length > 0) {
            globalCache.set(`history_${code}_3d_${today}`, data, 'history_recent');
          }
          historyMap[code] = data;
        }
      }
      logger.info(`历史净值: 缓存命中 ${fundCodes.length - needFetch.length}/${fundCodes.length}, 拉取 ${needFetch.length} 只`);
    }

    // 市场状态（用前3只基金检测）
    const marketStatus = await holdingService.checkMarketStatus(fundCodes.slice(0, 3).map(c => ({ fund_code: c })));

    // 批量查询所有基金基本信息与持仓（单次 WHERE IN，消除 N+1）
    const [fundRows, holdingRows] = await Promise.all([
      Fund.findByCodes(fundCodes).catch(() => []),
      userId ? Holding.findByUserAndCodes(userId, fundCodes).catch(() => []) : Promise.resolve([]),
    ]);

    // 构建查找表
    const fundMap = {};
    for (const fund of fundRows) {
      if (fund) fundMap[fund.code] = fund;
    }
    const holdingMap = {};
    for (const holding of holdingRows) {
      if (holding) holdingMap[holding.fund_code] = holding;
    }

    // ★ 休市/待开市：展示净值走统一确认净值链 resolveConfirmedNav（confirmed_nav 缓存 → 持仓 DB → history_3d 缓存 → API），
    // 仅组装前解析一次，避免组装阶段重复查缓存导致统计翻倍；缺失码批量拉取后二次回调，避免逐只串行 API 兜底
    const displayNavMap = {}; // code -> { nav, date }
    if (isFullDayClosed || isPreMarket) {
      // ① 先按缓存/DB/3d历史解析（跳过单只 API 兜底），收集确实需要批量拉取的基金码
      const needFetch = [];
      for (const code of fundCodes) {
        const holding = holdingMap[code] || null;
        const resolved = await holdingService.resolveConfirmedNav(code, holding, null, null, { skipApiFallback: true, isQDII: holdingService.isQdiiFundType(fundMap[code]?.type) });
        if (resolved && resolved.nav > 0) {
          displayNavMap[code] = { nav: resolved.nav, date: resolved.date };
        } else {
          needFetch.push(code);
        }
      }
      // ② 批量拉取确需兜底的基金，写回 history_3d 后二次回调 resolveConfirmedNav（回写 confirmed_nav 缓存 + DB）
      if (needFetch.length > 0) {
        logger.info(`休市/待开市确认净值批量拉取: ${needFetch.join(',')}`);
        const freshMap = await fundService.batchGetHistoryNetValues(needFetch, fallbackStartDate, today);
        for (const code of needFetch) {
          const data = freshMap[code];
          if (data && data.length > 0 && parseFloat(data[0].nav) > 0) {
            globalCache.set(`history_${code}_3d_${today}`, data, 'history_recent');
            const holding = holdingMap[code] || null;
            const resolved = await holdingService.resolveConfirmedNav(code, holding, data, null, { skipApiFallback: true, isQDII: holdingService.isQdiiFundType(fundMap[code]?.type) });
            if (resolved && resolved.nav > 0) {
              displayNavMap[code] = { nav: resolved.nav, date: resolved.date };
            }
          }
        }
      }
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
      let realTime = realtimeMap[code] || null;
      const history = historyMap[code] || [];
      const holding = holdingMap[code] || null;
      const txShares = todayTxSharesMap[code] || { buy: 0, sell: 0 };

      // ★ 休市/待开市：展示净值直接用确认净值链结果（组装前已解析并写回缓存，避免重复查缓存导致统计翻倍）
      if ((isFullDayClosed || isPreMarket) && !realTime && displayNavMap[code]) {
        realTime = { netValue: displayNavMap[code].nav, gainPercent: null, updateTime: displayNavMap[code].date || null, estimatedValue: null, estimatedChange: null, estimationMethod: null, estimationCoverage: null };
      }

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
        estimation_method: realTime?.estimationMethod ?? null,
        estimation_coverage: realTime?.estimationCoverage ?? null,
      };

      // 更新状态（统一状态判定）
      result.last_updated = realTime?.updateTime || null;
      const status = holdingService.resolveUpdateStatus({
        hour: now.getHours(),
        isMarketOpen: fundMarketStatus.isMarketOpen,
        isConfirmed: isConfirmed && latestHistoryNav > 0,
        hasEstimate: realTime?.estimatedChange != null,
        dayOfWeek: fundMarketStatus.dayOfWeek || dayNames[now.getDay()]
      });
      result.update_status = status.update_status;
      result.data_source = status.data_source;
      result.is_fresh = status.is_fresh;
      if (status.day_of_week) result.day_of_week = status.day_of_week;

      // 依据状态附加涨跌幅 / 净值字段
      if (status.update_status === 'pre_market') {
        result.estimated_change = null;
      } else if (status.update_status === 'confirmed') {
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
      } else if (status.update_status === 'estimating' || status.update_status === 'pending_confirm') {
        result.estimated_change = realTime.estimatedChange;
      } else if (status.update_status === 'no_estimate') {
        result.estimated_change = realTime?.gainPercent ?? null;
        result.net_value = realTime?.netValue ?? null;
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

    // 走势图历史净值缓存（按日期范围区分，跨天自动 miss，外部 API：eastmoney/lsjz）
    const cacheKey = `history_${code}_${startDate || ''}_${endDate || ''}`; // 走势图历史净值缓存键
    const today = getLocalToday();
    const yesterday = normalizeDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
    // ★ 改用 checkCache 统一统计口径（命中/未命中/过期均计入 stats）
    const cacheResult = globalCache.checkCache(cacheKey, 'history_chart');

    // 检查缓存是否命中且未过期（history_chart 类型，固定 24h TTL）
    if (cacheResult.hit) {
      // 缓存命中，取最新记录日期（借鉴 getByCode L82-106）
      const latestDate = cacheResult.data && cacheResult.data.length > 0 ? cacheResult.data[0].date : null;

      if (latestDate === today) {
        // 情况1：缓存最新 = 今天 → 今天净值已确认，数据完整，直接返回缓存
        logger.info(`走势图缓存命中: ${code} (latestDate=${latestDate}=今天)`);
        return res.json({ records: cacheResult.data });
      }

      if (latestDate === yesterday) {
        // 情况2：缓存最新 = 昨天 → 检查今天是否已确认
        try {
          const todayCheck = await fundService.getHistoryNetValues(code, today, today); // 轻量查询（仅查1天，极小开销）
          if (todayCheck && todayCheck.length > 0) {
            // 今天净值已确认，缓存过期，重新请求完整日期范围
            logger.info(`走势图缓存过期: ${code} (latestDate=${latestDate}=昨天, 今天净值已确认)`);
          } else {
            // 今天净值未确认，返回缓存（昨天数据仍是当前最新）
            logger.info(`走势图缓存命中: ${code} (latestDate=${latestDate}=昨天, 今天净值未确认)`);
            return res.json({ records: cacheResult.data });
          }
        } catch (e) {
          // 轻量查询失败，降级返回缓存
          logger.warn(`走势图确认检查失败: ${code}, ${e.message}, 降级使用缓存`);
          return res.json({ records: cacheResult.data });
        }
      } else if (latestDate && latestDate < yesterday) {
        // 情况3：缓存最新 < 昨天 → 缓存落后（至少缺了昨天的确认净值），直接重新请求
        logger.info(`走势图缓存落后: ${code} (latestDate=${latestDate} < 昨天=${yesterday}), 重新请求`);
      }
    }

    // 缓存未命中/已过期/落后 → 重新请求完整日期范围（eastmoney/lsjz）
    const records = await fundService.getHistoryNetValues(code, startDate || '', endDate || '');
    if (records && records.length > 0) {
      globalCache.set(cacheKey, records, 'history_chart'); // 走势图专用缓存，固定 24h TTL
    }
    res.json({ records });
  } catch (err) {
    next(err);
  }
};