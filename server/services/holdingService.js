const fundService = require('./fundService');
const globalCache = require('./globalCache');
const Holding = require('../models/holding');
const pool = require('../config/database');

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
    console.error('[holdingService] 检查市场状态失败:', error.message);
    return { isMarketOpen: true, reason: 'check_failed' };
  }
}

// ✨ 优化3：批量获取所有基金数据（替代逐个请求）
// 核心优化：新浪估值用1次请求替代N次，确认净值并行获取
async function enrichHoldingsWithRealTimeData(holdings, forceRefresh = false, valuationMethod = 'holdings', valuationOverrides = {}) {
  if (!holdings.length) return [];

  const startTime = Date.now();
  const fundCodes = holdings.map(h => h.fund_code);
  console.log(`[holdingService] 开始批量处理 ${holdings.length} 只基金... (强制刷新: ${forceRefresh}, 全局方法: ${valuationMethod})`);

  const marketStatus = await checkMarketStatus(holdings);

  // ★ 查询今日交易份额
  const today = new Date().toISOString().slice(0, 10);
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
    console.error('[holdingService] 查询今日交易份额失败:', e.message);
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
    const needFetch = forceRefresh ? codes : codes.filter(code => {
      const effectiveMethod = valuationOverrides[code] || valuationMethod || 'sina';
      const cacheKey = `realtime_${code}_${effectiveMethod}`;
      const cached = globalCache.cache.get(cacheKey);
      if (cached) {
        const ttl = globalCache.getTTL('realtime');
        const age = Date.now() - cached.timestamp;
        if (age < ttl) {
          realtimeDataMap[code] = cached.data;
          return false;
        }
      }
      return true;
    });

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
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const historyNeedFetch = codes.filter(code => {
      const cacheKey = `history_${code}_3d_${today}`;
      const cached = globalCache.cache.get(cacheKey);
      if (cached) {
        const ttl = globalCache.getTTL('history_recent');
        const age = Date.now() - cached.timestamp;
        if (age < ttl) {
          historyDataMap[code] = cached.data;
          return false;
        }
      }
      return true;
    });

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
    const dbConfirmedNavDate = holding.confirmed_nav_date ? holding.confirmed_nav_date.toISOString().slice(0, 10) : null;

    let effectiveNav = latestHistoryNav > 0 ? latestHistoryNav : dbConfirmedNav;

    if (latestHistoryNav > 0 && latestHistoryDate && latestHistoryDate > dbConfirmedNavDate) {
      Holding.update(holding.id, holding.user_id, {
        confirmedNav: latestHistoryNav,
        confirmedNavDate: latestHistoryDate
      }).catch(err => console.error(`[holdingService] 更新confirmed_nav失败:`, err.message));
    }

    const fundMarketStatus = getFundMarketStatus(realTimeData, marketStatus);

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
        todayTxSharesMap[fundCode] || { buy: 0, sell: 0 }
      )
    };
  });

  const endTime = Date.now();
  const duration = endTime - startTime;
  const stats = globalCache.getStats();
  console.log(`[holdingService] 批量处理完成: ${holdings.length}只基金, 耗时${duration}ms`);
  console.log(`[GlobalCache] 统计: 命中率=${stats.hitRate}, 缓存数=${stats.size}/${stats.maxSize}`);

  return result;
}

function calculateHoldingMetrics(holding, realTimeData, isConfirmed = false, confirmedNav = 0, marketStatus = { isMarketOpen: true }, yesterdayNav = 0, todayTxShares = { buy: 0, sell: 0 }) {
  const shares = parseFloat(holding.shares) || 0;
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

  // 净值优先级：今日确认净值 > 盘中估算 > 昨日确认净值
  // 注意：pending_confirm 状态（15:00后但今日净值未确认）也应使用盘中估算
  if (confirmedNav > 0) {
    displayNav = confirmedNav;
    marketValue = shares * confirmedNav;
  } else if (estValue != null && estValue > 0) {
    // 无今日确认净值但有盘中估算 → 使用盘中估算净值（盘中+盘后待确认均适用）
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
  if (todayTxShares.buy > 0 && displayNav > 0 && costPrice > 0) {
    const todayBuyProfit = todayTxShares.buy * (displayNav - costPrice);
    cumulativeReturn -= todayBuyProfit;
  }

  const updateTime = realTimeData ? realTimeData.updateTime : null;
  let update_status, data_source, is_fresh;

  if (!marketStatus.isMarketOpen) {
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
      day_of_week: marketStatus.dayOfWeek || dayNames[now.getDay()]
    };
  }

  if (hour < 9) {
    update_status = 'pre_market';
    data_source = 'actual';
    is_fresh = false;
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
    fund_code: holding.fund_code
  };
}

// ✨ 新增：清理所有缓存的工具函数（可选，用于测试或管理接口）
function clearAllCache() {
  globalCache.clear();
  console.log('[holdingService] 所有缓存已清空');
}

module.exports = {
  enrichHoldingsWithRealTimeData,
  calculateHoldingMetrics,
  checkMarketStatus,
  clearAllCache,
  getFundMarketStatus
};
