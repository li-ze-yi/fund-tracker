const fundService = require('./fundService');
const globalCache = require('./globalCache');
const holidayService = require('./holidayService');
const Holding = require('../models/holding');
const pool = require('../config/database');
const { createLogger } = require('../utils/logger');
const { getLocalToday, normalizeDateStr } = require('../utils/date');

const logger = createLogger('HoldingService');

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 基于实时数据判断单只基金的市场状态
 * 核心逻辑：如果全局市场开市（A股开市），但该基金的实时数据 updateTime 不是今天，
 * 说明该基金所在的市场今天休市（如港股/美股节假日）
 * 这种方式不依赖基金名称/类型识别，适用于所有基金
 */
function getFundMarketStatus(realTimeData, globalMarketStatus) {
  const now = new Date();
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 全局休市（周末/A股节假日）→ 所有基金都休市
  if (!globalMarketStatus.isMarketOpen) {
    return globalMarketStatus;
  }

  // 全局开市，但有实时数据 → 检查 updateTime 是否为今天
  if (realTimeData && realTimeData.updateTime) {
    const updateTime = realTimeData.updateTime || '';
    const hasTimeComponent = updateTime.includes(' ');
    // 旧格式: "2024-01-15 14:30"（fundgz 实时估值，含时间）
    // 新格式: "2026-07-21"（lsjz 确认净值，仅日期）
    const updateDate = updateTime.split(' ')[0];
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (updateDate === todayStr) {
      // 数据是今天的 → 市场今天有开市
      return { isMarketOpen: true, reason: 'normal' };
    }

    // 数据不是今天的
    if (hasTimeComponent) {
      // 旧格式（实时估值）：updateTime 不是今天 → 该基金所在市场今天休市
      return {
        isMarketOpen: false,
        reason: 'holiday',
        dayOfWeek: dayNames[now.getDay()],
        message: '非交易日'
      };
    }
    // 新格式（确认净值）：updateTime 不是今天属于正常情况（当日净值尚未公布）
    // 回退到全局市场状态判断
  }

  // 全局开市，但没有实时数据 → 保持全局状态（A股基金正常开市）
  return globalMarketStatus;
}

async function checkMarketStatus(holdings) {
  if (!holdings || holdings.length === 0) {
    return { isMarketOpen: true, reason: 'no_data' };
  }

  const now = new Date();
  
  if (isWeekend(now)) {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return { 
      isMarketOpen: false, 
      reason: 'weekend',
      dayOfWeek: dayNames[now.getDay()]
    };
  }

  try {
    // ✨ 使用全局智能缓存（市场状态缓存15秒）
    const cacheKey = 'market_status';
    
    return await globalCache.getOrFetch(cacheKey, async () => {
      // 缓存未命中时才执行实际检测
      const sampleCodes = holdings.slice(0, 3).map(h => h.fund_code);
      const results = await Promise.allSettled(
        sampleCodes.map(code => fundService.getRealTimeValue(code))
      );

      let validDataCount = 0;
      let emptyDataCount = 0;
      let latestUpdateTime = null;

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const data = result.value;

          if (data.updateTime) {
            const updateTime = new Date(data.updateTime);
            if (!latestUpdateTime || updateTime > latestUpdateTime) {
              latestUpdateTime = updateTime;
            }
          }

          if (data.netValue && data.netValue > 0) {
            validDataCount++;
          } else {
            emptyDataCount++;
          }
        } else {
          emptyDataCount++;
        }
      }

      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      let status;

      if (validDataCount === 0 && emptyDataCount > 0) {
        const hour = now.getHours();

        if (hour >= 9 && hour < 15) {
          let isLikelyHoliday = false;
          if (latestUpdateTime) {
            const hoursDiff = (now - latestUpdateTime) / (1000 * 60 * 60);
            isLikelyHoliday = hoursDiff > 20;
          }
          if (isLikelyHoliday) {
            status = {
              isMarketOpen: false,
              reason: 'holiday',
              dayOfWeek: dayNames[now.getDay()],
              message: '非交易日(节假日)'
            };
          } else {
            status = { isMarketOpen: true, reason: 'trading_hours_no_data' };
          }
        } else if (hour >= 15 || hour < 9) {
          status = {
            isMarketOpen: false,
            reason: 'holiday',
            dayOfWeek: dayNames[now.getDay()],
            message: '非交易日'
          };
        } else {
          status = { isMarketOpen: true, reason: 'unknown' };
        }
      } else if (latestUpdateTime) {
        // 检查 updateTime 是否为纯日期格式（确认净值，如 "2026-07-21"）
        const sampleUpdateStr = results.find(r => r.status === 'fulfilled' && r.value?.updateTime)?.value?.updateTime || '';
        const isDateOnly = !sampleUpdateStr.includes(' ');

        const hour = now.getHours();
        const isInTradingHours = hour >= 9 && hour < 15;
        let isStale = false;

        if (isDateOnly) {
          // 纯日期格式（确认净值）：按日历天数判断
          // 交易日盘中，昨日确认净值是正常的（当日净值尚未公布）
          const updateDate = new Date(latestUpdateTime.getFullYear(), latestUpdateTime.getMonth(), latestUpdateTime.getDate());
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dayDiff = Math.round((todayDate - updateDate) / (24 * 60 * 60 * 1000));
          const dayOfWeek = now.getDay();
          // 周一允许3天差值（周五数据），其他交易日允许1天差值
          const maxNormalDiff = dayOfWeek === 1 ? 3 : 1;
          isStale = dayDiff > maxNormalDiff;
        } else {
          // 含时间格式（实时估值）：按小时判断
          const timeDiff = now - latestUpdateTime;
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          isStale = hoursDiff > 72 || (isInTradingHours && hoursDiff > 20);
        }

        if (isStale) {
          status = {
            isMarketOpen: false,
            reason: 'stale_data',
            dayOfWeek: dayNames[now.getDay()],
            message: '数据未更新'
          };
        } else {
          status = { isMarketOpen: true, reason: 'normal' };
        }
      } else {
        status = { isMarketOpen: true, reason: 'default' };
      }

      return status;  // 返回给缓存系统存储
    }, {
      type: 'market_status'  // 特殊类型：固定15秒TTL
    });

  } catch (error) {
    logger.error(`检查市场状态失败: ${error.message}`);
    return { isMarketOpen: true, reason: 'check_failed' };
  }
}

/**
 * ★ 确认净值三级来源解析：缓存 → 数据库 → API
 * 盘中估算以解析出的确认净值为基准，减少对外部 API 基准确认净值的依赖。
 * 解析优先级：
 *   ① 缓存命中（confirmed_nav_{code}，复用 history_recent 动态TTL）→ 直接返回
 *   ② 数据库值新鲜（holdings.confirmed_nav > 0 且 confirmed_nav_date === 最近确认交易日）→ 使用并写回缓存
 *   ③ API（fundmobapi 确认净值 / lsjz 历史最新值）→ 使用并写回缓存
 * @param {string} fundCode 基金代码
 * @param {object|null} holding 持仓记录（用于 DB confirmed_nav）
 * @param {Array|null} historyData 最近历史净值（判定 DB 新鲜度 / API 兜底）
 * @param {object|null} realTimeData 实时数据（fundmobapi 确认净值，API 兜底源）
 * @returns {{ nav: number, date: string|null, source: 'cache'|'db'|'api'|'none' }} nav<=0 表示解析失败
 */
function resolveConfirmedNav(fundCode, holding, historyData, realTimeData) {
  const cacheKey = `confirmed_nav_${fundCode}`;
  const cacheType = 'history_recent'; // 确认净值复用历史近期动态TTL（收盘后快速刷新）

  const normalizeDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return normalizeDateStr(v) || String(v).split('T')[0].split(' ')[0];
    return String(v).split('T')[0].split(' ')[0];
  };

  // ① 缓存命中 → 不再访问 DB/API（真实请求按 checkCache 统计：命中 hit / 未命中 miss）
  const cached = globalCache.checkCache(cacheKey, cacheType);
  if (cached.hit && cached.data && parseFloat(cached.data.nav) > 0) {
    return cached.data;
  }

  const latestHistory = historyData && historyData.length > 0 ? historyData[0] : null;
  const latestHistoryDate = latestHistory ? latestHistory.date : null;

  // ② 数据库值新鲜（占位持仓 confirmed_nav<=0 或日期不匹配则不命中）
  const dbNav = parseFloat(holding && holding.confirmed_nav) || 0;
  const dbNavDate = normalizeDate(holding && holding.confirmed_nav_date);
  // 本地今日字符串（YYYY-MM-DD，用本地时间拼，避免 UTC 偏移）
  const nowDate = new Date();
  const todayStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  let dbFresh = false;
  if (latestHistoryDate) {
    // 盘后正常拉取到历史：日期须与最近确认交易日一致
    dbFresh = dbNavDate === latestHistoryDate;
  } else {
    // 盘中跳过拉取后无历史数据：改用日期启发式，覆盖周末/节假日（距今不超过 4 天视为新鲜）
    dbFresh = dbNav > 0 && dbNavDate && dbNavDate < todayStr &&
      (new Date(todayStr) - new Date(dbNavDate)) / (24 * 3600 * 1000) <= 4;
  }
  if (dbNav > 0 && dbFresh) {
    const data = { nav: dbNav, date: dbNavDate, source: 'db' };
    globalCache.set(cacheKey, data, cacheType);
    return data;
  }

  // ③ API：优先复用 fundmobapi 确认净值，其次 lsjz 历史最新值
  let apiNav = 0;
  let apiDate = null;
  if (realTimeData && parseFloat(realTimeData.netValue) > 0) {
    apiNav = parseFloat(realTimeData.netValue);
    apiDate = normalizeDate(realTimeData.updateTime);
  } else if (latestHistory && parseFloat(latestHistory.nav) > 0) {
    apiNav = parseFloat(latestHistory.nav);
    apiDate = latestHistoryDate;
  }
  if (apiNav > 0) {
    const data = { nav: apiNav, date: apiDate, source: 'api' };
    globalCache.set(cacheKey, data, cacheType);
    // ★ 自愈：非占位持仓（confirmed_nav !== null）且拿到 API 日期时回写数据库，避免 DB 值长期滞后
    if (apiDate && holding && holding.confirmed_nav !== null) {
      Holding.update(holding.id, holding.user_id, {
        confirmedNav: apiNav,
        confirmedNavDate: apiDate
      }).catch(err => {
        logger.error(`确认净值回写数据库失败: fund=${fundCode}, holdingId=${holding.id}, err=${err.message}`);
      });
      logger.info(`盘中确认净值回写数据库: fund=${fundCode}, holdingId=${holding.id}, nav=${apiNav}, date=${apiDate}`);
    }
    return data;
  }

  return { nav: 0, date: null, source: 'none' };
}

// ✨ 优化3：批量获取所有基金数据（替代逐个请求）
// 核心优化：新浪估值用1次请求替代N次，确认净值并行获取
async function enrichHoldingsWithRealTimeData(holdings, forceRefresh = false, valuationMethod = 'holdings', valuationOverrides = {}) {
  if (!holdings.length) return [];

  const startTime = Date.now();
  const fundCodes = holdings.map(h => h.fund_code);
  logger.info(`开始批量处理 ${holdings.length} 只基金... (强制刷新: ${forceRefresh}, 全局方法: ${valuationMethod})`);

  const marketStatus = await checkMarketStatus(holdings);

  // ★ 查询今日交易份额（使用北京时间，避免凌晨 UTC 日期偏移导致 yesterdayShares=0）
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

  // ★ 全天休市检测（周末/法定节假日）
  // 注意：不能以 marketStatus.reason === 'holiday' 作为权威信号——checkMarketStatus 在普通工作日
  // 收盘后（15:00 后）也会返回 reason='holiday'，会误导此判断。全天休市的权威信号是 isTradingDay === false。
  let isFullDayClosed = false;
  try {
    isFullDayClosed = !(await holidayService.isTradingDay(today));
  } catch (e) {
    // 节假日 API 失败 → 按非休市处理（与 holidayService 内部降级为非节假日一致）
    logger.warn(`全天休市检测失败，按非休市处理: ${e.message}`);
    isFullDayClosed = false;
  }
  // ★ 待开市判断：交易日盘前 9 点前实时估值尚未更新，同样无需外部拉取
  const isPreMarket = !isFullDayClosed && new Date().getHours() < 9;
  const userId = holdings[0].user_id;
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

  // ★ 查询 pending 买入订单对应的基金集合（占位持仓不计算收益）
  let pendingBuyFundSet = new Set();
  try {
    const [pendingRows] = await pool.query(
      `SELECT DISTINCT fund_code FROM transactions WHERE user_id = ? AND status = 'pending' AND type = 'buy'`,
      [userId]
    );
    pendingRows.forEach(r => pendingBuyFundSet.add(r.fund_code));
  } catch (e) {
    logger.error(`查询pending买入订单失败: ${e.message}`);
  }

  // ═══════════════════════════════════════════
  // ★ 核心优化：批量获取所有基金数据
  // 原来：N只基金 × 每只2-3个串行API = 几十次外部请求
  // 现在：1次新浪批量 + N个并行确认净值 + N个并行历史净值 = 2N+1次，但并行执行
  // ═══════════════════════════════════════════

  // 按估值方法分组（相同方法可以批量请求）
  const methodGroups = {};
  for (const code of fundCodes) {
    const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
    if (!methodGroups[effectiveMethod]) methodGroups[effectiveMethod] = [];
    methodGroups[effectiveMethod].push(code);
  }

  // 并行获取各方法组的实时数据
  const realtimeDataMap = {}; // fundCode -> realTimeData
  const historyDataMap = {};  // fundCode -> historyData

  const batchPromises = [];

  for (const [method, codes] of Object.entries(methodGroups)) {
    // 批量获取实时数据（确认净值 + 盘中估算）
    const cacheKeys = codes.map(code => {
      const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
      return { code, cacheKey: `realtime_${code}_${effectiveMethod}` };
    });

    // 检查哪些需要从外部获取（缓存未命中或强制刷新）
    let needFetch;
    if (isFullDayClosed || isPreMarket) {
      // ★ 全天休市或待开市：跳过实时估值外部拉取，仅复用缓存命中项，未命中留空
      // 真实请求按 checkCache 统计（命中 hit / 未命中 miss）
      for (const code of codes) {
        const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
        const cacheKey = `realtime_${code}_${effectiveMethod}`;
        const result = globalCache.checkCache(cacheKey, 'realtime');
        if (result.hit) {
          realtimeDataMap[code] = result.data;
        }
      }
      needFetch = [];
      logger.info(`${isFullDayClosed ? '全天休市' : '待开市'}，跳过实时估值外部拉取 (${codes.length} 只)`);
    } else {
      needFetch = forceRefresh ? codes : codes.filter(code => {
        const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
        const cacheKey = `realtime_${code}_${effectiveMethod}`;
        // ★ 改用 checkCache 统一统计口径（命中/未命中/过期均计入 stats）
        const result = globalCache.checkCache(cacheKey, 'realtime');
        if (result.hit) {
          realtimeDataMap[code] = result.data;
          return false;
        }
        return true;
      });
    }

    if (needFetch.length > 0) {
      batchPromises.push(
        fundService.batchGetRealTimeValuesWithMethod(needFetch, method).then(map => {
          // 存入缓存
          for (const [code, data] of Object.entries(map)) {
            const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
            const cacheKey = `realtime_${code}_${effectiveMethod}`;
            if (data) {
              globalCache.set(cacheKey, data, 'realtime');
            }
            realtimeDataMap[code] = data;
          }
        })
      );
    }

    // 批量获取历史净值
    const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    // ★ 盘中（本地 9:00-15:00）跳过历史净值 API 拉取：仅复用已有缓存，未命中留空
    const nowHour = new Date().getHours();
    const isTradingHours = nowHour >= 9 && nowHour < 15;
    let historyNeedFetch;
    if (isFullDayClosed) {
      // ★ 全天休市（周末/法定节假日）：跳过历史净值外部拉取，仅复用缓存命中项，未命中留空
      // 真实请求按 checkCache 统计（命中 hit / 未命中 miss）
      for (const code of codes) {
        const cacheKey = `history_${code}_3d_${today}`;
        const result = globalCache.checkCache(cacheKey, 'history_recent');
        if (result.hit) {
          historyDataMap[code] = result.data;
        }
      }
      historyNeedFetch = [];
      logger.info(`全天休市，跳过历史净值外部拉取 (${codes.length} 只)`);
    } else if (isTradingHours) {
      // 交易时段（含 forceRefresh）跳过 API 拉取，只复用缓存命中项
      for (const code of codes) {
        const cacheKey = `history_${code}_3d_${today}`;
        const result = globalCache.checkCache(cacheKey, 'history_recent');
        if (result.hit) {
          historyDataMap[code] = result.data;
        }
      }
      historyNeedFetch = [];
      logger.info(`盘中（9:00-15:00）跳过 ${codes.length} 只基金的历史净值拉取`);
    } else {
      // 非交易时段：forceRefresh 时强制重新拉取历史净值（兜底任务依赖最新确认净值，旧缓存会导致 isConfirmed 误判）
      historyNeedFetch = forceRefresh ? codes : codes.filter(code => {
        const cacheKey = `history_${code}_3d_${today}`;
        // ★ 改用 checkCache 统一统计口径（命中/未命中/过期均计入 stats）
        const result = globalCache.checkCache(cacheKey, 'history_recent');
        if (result.hit) {
          historyDataMap[code] = result.data;
          return false;
        }
        return true;
      });
    }

    if (historyNeedFetch.length > 0) {
      batchPromises.push(
        fundService.batchGetHistoryNetValues(historyNeedFetch, threeDaysAgo, today).then(map => {
          for (const [code, data] of Object.entries(map)) {
            const cacheKey = `history_${code}_3d_${today}`;
            if (data && data.length > 0) {
              globalCache.set(cacheKey, data, 'history_recent');
            }
            historyDataMap[code] = data;
          }
        })
      );
    }
  }

  // 等待所有批量请求完成
  await Promise.all(batchPromises);

  // ═══════════════════════════════════════════
  // 合并数据并计算指标
  // ═══════════════════════════════════════════

  const result = holdings.map(holding => {
    const fundCode = holding.fund_code;
    const realTimeData = realtimeDataMap[fundCode] || null;
    const historyData = historyDataMap[fundCode] || null;

    const latestHistoryNav = historyData && historyData.length > 0 ? parseFloat(historyData[0].nav) || 0 : 0;
    const latestHistoryDate = historyData && historyData.length > 0 ? historyData[0].date : null;
    const isConfirmed = latestHistoryDate === today;
    const yesterdayNav = historyData && historyData.length > 1 ? parseFloat(historyData[1].nav) || 0 : 0;

    const dbConfirmedNav = parseFloat(holding.confirmed_nav) || 0;
    const dbConfirmedNavDate = holding.confirmed_nav_date ? normalizeDateStr(holding.confirmed_nav_date) : null;

    // ★ 确认净值三级来源解析（缓存 → 数据库 → API），盘中估算以解析出的确认净值为基准
    // 真实请求按 checkCache 统计（命中 hit / 未命中 miss），获取后由 resolveConfirmedNav 写回缓存
    const resolvedNav = resolveConfirmedNav(fundCode, holding, historyData, realTimeData);
    const effectiveNav = resolvedNav.nav > 0 ? resolvedNav.nav : dbConfirmedNav;

    // ★ 全天休市（周末/节假日）+ 确认净值无法解析（缓存未命中且 DB confirmed_nav 缺失/过期）
    // → 仅对该基金做定向修复拉取：写回 DB confirmed_nav 并填充 3d 历史缓存。
    // 不阻塞响应（fire-and-forget），不抛错。
    if (isFullDayClosed && resolvedNav.source === 'none') {
      const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
      fundService.getHistoryNetValues(fundCode, threeDaysAgo, today)
        .then(historyData => {
          if (!historyData || !historyData.length) return;
          const latest = historyData[0];
          if (!latest || !(parseFloat(latest.nav) > 0)) return;
          globalCache.set(`history_${fundCode}_3d_${today}`, historyData, 'history_recent');
          return Holding.update(holding.id, holding.user_id, {
            confirmedNav: parseFloat(latest.nav),
            confirmedNavDate: latest.date
          });
        })
        .then(() => {
          logger.info(`全天休市定向修复: fund=${fundCode}, holdingId=${holding.id}, source=none`);
        })
        .catch(err => {
          logger.error(`全天休市定向修复失败: fund=${fundCode}, err=${err.message}`);
        });
    }

    // 保留原写库：API 历史净值比 DB 更新时回写（保证 DB confirmed_nav 新鲜）
    if (latestHistoryNav > 0 && latestHistoryDate && latestHistoryDate > dbConfirmedNavDate) {
      Holding.update(holding.id, holding.user_id, {
        confirmedNav: latestHistoryNav,
        confirmedNavDate: latestHistoryDate
      }).catch(err => logger.error(`更新confirmed_nav失败: ${err.message}`));
    }

    const fundMarketStatus = getFundMarketStatus(realTimeData, marketStatus);

    const isPendingPurchase = pendingBuyFundSet.has(fundCode) && holding.confirmed_nav === null;

    if (isPendingPurchase) {
      logger.info(`[HoldingService] 占位持仓: fund=${fundCode}, holdingId=${holding.id}, totalCost=${holding.total_cost}, shares=${holding.shares}, confirmed_nav=${holding.confirmed_nav}, update_status=pending_purchase`);
    } else if (pendingBuyFundSet.has(fundCode)) {
      logger.info(`[HoldingService] 确认持仓含pending: fund=${fundCode}, holdingId=${holding.id}, confirmed_nav=${holding.confirmed_nav}, 不标记为待入库`);
    }

    return {
      ...holding,
      realTimeData: realTimeData,
      ...calculateHoldingMetrics(
        holding,
        realTimeData,
        isConfirmed,
        effectiveNav,
        fundMarketStatus,
        yesterdayNav,
        todayTxSharesMap[fundCode] || { buy: 0, sell: 0 },
        isPendingPurchase
      )
    };
  });

  const endTime = Date.now();
  const duration = endTime - startTime;
  const stats = globalCache.getStats();
  logger.info(`批量处理完成: ${holdings.length}只基金, 耗时${duration}ms`);
  logger.info(`GlobalCache 统计: 命中率=${stats.hitRate}, 缓存数=${stats.size}/${stats.maxSize}`);

  return result;
}

function calculateHoldingMetrics(holding, realTimeData, isConfirmed = false, confirmedNav = 0, marketStatus = { isMarketOpen: true }, yesterdayNav = 0, todayTxShares = { buy: 0, sell: 0 }, isPendingPurchase = false) {
  const shares = parseFloat(holding.shares) || 0;

  // 已清仓且非卖出当天（sold_date < today）→ 返回 sold_out 状态，accumulated_profit 显示实现盈亏
  // 卖出当天（sold_date == today）→ 走正常逻辑，不显示"已清仓"徽章
  if (shares === 0 && holding.sold_date) {
    // 使用本地时间格式化日期，避免 mysql2 DATE→Date 对象的时区偏移
    const fmtDate = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const soldDateStr = fmtDate(holding.sold_date);
    if (soldDateStr < todayStr) {
      return {
        market_value: 0,
        estimated_change: null,
        daily_profit: 0,
        accumulated_profit: Math.round((parseFloat(holding.total_return) || 0) * 100) / 100,
        net_value: null,
        cost_price: parseFloat(holding.cost_price) || 0,
        shares: 0,
        update_time: null,
        last_updated: null,
        is_fresh: false,
        update_status: 'sold_out',
        data_source: 'actual',
        fund_code: holding.fund_code,
        is_confirmed: false
      };
    }
  }

  // 占位持仓（pending 购买创建）→ 不计算收益，仅展示估算市值
  if (isPendingPurchase) {
    const estValue = realTimeData?.estimatedValue || realTimeData?.netValue || 0;
    const marketValue = shares > 0 && estValue > 0 ? shares * estValue : 0;
    return {
      market_value: Math.round(marketValue * 100) / 100,
      estimated_change: null,
      daily_profit: 0,
      accumulated_profit: 0,
      net_value: estValue > 0 ? estValue : null,
      cost_price: parseFloat(holding.cost_price) || 0,
      shares: shares,
      update_time: realTimeData?.updateTime || null,
      last_updated: realTimeData?.updateTime || null,
      is_fresh: false,
      update_status: 'pending_purchase',
      data_source: 'estimated',
      fund_code: holding.fund_code,
      is_confirmed: false
    };
  }

  const costPrice = parseFloat(holding.cost_price) || 0;
  const totalCost = parseFloat(holding.total_cost) || shares * costPrice;
  // 昨日份额 = 当前份额 - 今日买入 + 今日卖出
  const yesterdayShares = Math.max(0, shares - (todayTxShares.buy || 0) + (todayTxShares.sell || 0));

  const now = new Date();
  const hour = now.getHours();
  const isTradingHours = hour >= 9 && hour < 15;

  // 盘中估算数据
  const estValue = realTimeData?.estimatedValue;
  const estChange = realTimeData?.estimatedChange;

  let marketValue = 0;
  let dailyGain = 0;
  let gainPercent = null;
  let displayNav = null;
  let usedEstimated = false;

  // 净值优先级：确认净值基准的盘中估算 > 确认净值（今日/昨日）> API 盘中估算 > 实时接口净值
  // 盘中（A股交易时段 9:00-15:00 且有实时估算涨跌幅）以三级解析出的确认净值为基准计算估算净值，
  // 让估算基准与展示值一致；非盘中（盘前/盘后/休市）仍用确认净值保持稳定。
  // 注：不能单用 marketStatus.isMarketOpen——收盘后今日净值已确认时它仍为 true，会导致盘后误用估算值。
  if (confirmedNav > 0) {
    if (isTradingHours && estChange != null) {
      // ★ 盘中估算：净值展示用估算值，但持仓金额/累计收益保持稳定（基于确认净值，避免盘中波动）
      displayNav = confirmedNav * (1 + estChange / 100);
      marketValue = shares * confirmedNav;   // 持仓金额稳定：基于确认净值
      usedEstimated = true;
      logger.info(`${holding.fund_code}: 盘中估算基准=解析确认净值 ${confirmedNav}, change=${estChange}%, estimatedValue=${displayNav.toFixed(4)}`);
    } else {
      // 使用确认净值（今日已公布则用今日，否则用昨日），持仓金额保持稳定
      displayNav = confirmedNav;
      marketValue = shares * confirmedNav;
    }
  } else if (hour >= 9 && estValue != null && estValue > 0 && estChange != null) {
    // 无确认净值但有盘中估算 → 退而求其次使用估算值
    displayNav = estValue;
    marketValue = shares * estValue;
    usedEstimated = true;
  } else if (realTimeData && realTimeData.netValue) {
    displayNav = realTimeData.netValue;
    marketValue = shares * realTimeData.netValue;
  }

  // 收益计算（优先级：API除权涨幅 > 确认净值差 > 估算涨跌幅 > 回退涨幅）
  if (isConfirmed && confirmedNav > 0 && realTimeData?.gainPercent != null) {
    // 1. 已确认 → 优先使用东方财富API的除权涨幅（NAVCHGRT，已扣除分红影响）
    gainPercent = realTimeData.gainPercent;
    if (yesterdayShares > 0 && confirmedNav > 0) {
      dailyGain = yesterdayShares * confirmedNav * gainPercent / (100 + gainPercent);
    }
  } else if (isConfirmed && confirmedNav > 0 && yesterdayNav > 0) {
    // 2. 已确认但API无除权涨幅 → 使用原始净值差计算（含分红，可能偏大）
    dailyGain = yesterdayShares * (confirmedNav - yesterdayNav);
    gainPercent = ((confirmedNav - yesterdayNav) / yesterdayNav) * 100;
  } else if (isConfirmed && confirmedNav > 0) {
    // 3. 已确认但无法获取任何涨幅数据 → 不显示涨幅（绝不用估算值）
    gainPercent = null;
    dailyGain = 0;
  } else if (estChange != null && displayNav > 0) {
    // 4. 无今日确认净值但有盘中估算涨跌幅 → 使用今日估算涨跌幅（盘中+盘后待确认均适用）
    gainPercent = estChange;
    const yesterdayMarketValue = yesterdayShares * (realTimeData?.netValue || confirmedNav || displayNav);
    if (yesterdayMarketValue > 0) {
      dailyGain = yesterdayMarketValue * gainPercent / (100 + gainPercent);
    }
    usedEstimated = true;
  } else if (realTimeData && realTimeData.gainPercent != null) {
    // 5. 回退到东方财富API的确认涨幅
    gainPercent = realTimeData.gainPercent;
    const yesterdayMarketValue = yesterdayShares * (realTimeData.netValue || confirmedNav || 0);
    if (yesterdayMarketValue > 0) {
      dailyGain = yesterdayMarketValue * gainPercent / (100 + gainPercent);
    }
  }

  let cumulativeReturn = marketValue - totalCost;
  // ★ 今日买入收益调整使用确认净值（而非盘中估算值），保证盘中累计收益稳定
  if (todayTxShares.buy > 0 && confirmedNav > 0 && costPrice > 0) {
    const todayBuyProfit = todayTxShares.buy * (confirmedNav - costPrice);
    cumulativeReturn -= todayBuyProfit;
  }
  // ★ 已清仓卖出当天（shares==0 && sold_date存在且==today）→ 累计收益应为实现盈亏（total_return），而非 marketValue - totalCost（均为0）
  // 注意：sold_date < today 的情况已在前面 return sold_out，此处仅处理 sold_date == today 的 fall-through 场景
  if (shares === 0 && holding.sold_date) {
    cumulativeReturn = parseFloat(holding.total_return) || 0;
  }

  const updateTime = realTimeData ? realTimeData.updateTime : null;
  let update_status, data_source, is_fresh;

  if (!marketStatus.isMarketOpen) {
    // ★ 例外：已清仓卖出当天（shares==0 && sold_date==today && isConfirmed && confirmedNav>0）时跳过早返回
    // 此时 yesterdayShares = todayTxShares.sell，dailyGain 已在前面基于 isConfirmed 分支计算
    let isSoldOutTodayException = false;
    if (shares === 0 && holding.sold_date && isConfirmed && confirmedNav > 0) {
      const _now = new Date();
      const _todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
      const _soldDate = holding.sold_date instanceof Date ? holding.sold_date : new Date(holding.sold_date);
      const _soldDateStr = `${_soldDate.getFullYear()}-${String(_soldDate.getMonth() + 1).padStart(2, '0')}-${String(_soldDate.getDate()).padStart(2, '0')}`;
      isSoldOutTodayException = (_soldDateStr === _todayStr);
    }

    if (!isSoldOutTodayException) {
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return {
        market_value: Math.round(marketValue * 100) / 100,
        estimated_change: null,
        daily_profit: 0,
        accumulated_profit: Math.round(cumulativeReturn * 100) / 100,
        net_value: displayNav,
        cost_price: Math.round(costPrice * 10000) / 10000,
        shares: shares,
        update_time: updateTime || null,
        last_updated: updateTime || null,
        is_fresh: false,
        update_status: 'market_closed',
        data_source: 'actual',
        fund_code: holding.fund_code,
        day_of_week: marketStatus.dayOfWeek || dayNames[now.getDay()],
        is_confirmed: isConfirmed  // ★ 新增：暴露确认状态供 dailyProfitService 复用
      };
    }
    // 已清仓卖出当天 → 跳过早返回，继续走后续已确认收益计算逻辑（line 493+）
  }

  if (hour < 9) {
    update_status = 'pre_market';
    data_source = 'actual';
    is_fresh = false;
    // 盘前统一清零（市值用确认净值，日涨幅和日收益也应为 0，保持一致）
    gainPercent = null;
    dailyGain = 0;
  } else if (isConfirmed) {
    update_status = 'confirmed';
    data_source = 'actual';
    is_fresh = true;
  } else if (isTradingHours) {
    if (usedEstimated) {
      update_status = 'estimating';
      data_source = 'estimated';
      is_fresh = true;
    } else {
      // 盘中估算失败 → 显示前一天确认数据
      update_status = 'no_estimate';
      data_source = 'actual';
      is_fresh = false;
    }
  } else {
    if (usedEstimated) {
      update_status = 'pending_confirm';
      data_source = 'estimated';
      is_fresh = false;
    } else {
      // 估算失败 → 显示前一天确认数据
      update_status = 'no_estimate';
      data_source = 'actual';
      is_fresh = false;
    }
  }

  return {
    market_value: Math.round(marketValue * 100) / 100,
    estimated_change: gainPercent,
    daily_profit: Math.round(dailyGain * 100) / 100,
    accumulated_profit: Math.round(cumulativeReturn * 100) / 100,
    net_value: displayNav,
    cost_price: Math.round(costPrice * 10000) / 10000,
    shares: shares,
    update_time: updateTime || null,
    last_updated: updateTime || null,
    is_fresh: is_fresh,
    update_status: update_status,
    data_source: data_source,
    fund_code: holding.fund_code,
    is_confirmed: isConfirmed  // ★ 新增：暴露确认状态供 dailyProfitService 复用
  };
}

// ✨ 新增：清理所有缓存的工具函数（可选，用于测试或管理接口）
function clearAllCache() {
  globalCache.clear();
  logger.info('所有缓存已清空');
}

module.exports = {
  enrichHoldingsWithRealTimeData,
  calculateHoldingMetrics,
  checkMarketStatus,
  clearAllCache,
  getFundMarketStatus,
  resolveConfirmedNav
};