const fundService = require('./fundService');
const globalCache = require('./globalCache');

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
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
          
          if (data.netValue && data.netValue > 0) {
            validDataCount++;
            
            if (data.updateTime) {
              const updateTime = new Date(data.updateTime);
              if (!latestUpdateTime || updateTime > latestUpdateTime) {
                latestUpdateTime = updateTime;
              }
            }
          } else {
            emptyDataCount++;
          }
        } else {
          emptyDataCount++;
        }
      }

      let status;
      
      if (validDataCount === 0 && emptyDataCount > 0) {
        const hour = now.getHours();
        
        if (hour >= 9 && hour < 15) {
          status = { isMarketOpen: true, reason: 'trading_hours_no_data' };
        } else if (hour >= 15 || hour < 9) {
          const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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
        const timeDiff = now - latestUpdateTime;
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff > 48 && emptyDataCount > 0) {
          const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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

// ✨ 优化2：合并两轮请求为一轮（同时获取实时数据和确认状态）
// ✨ 新增：支持强制刷新参数（跳过缓存）
async function enrichHoldingsWithRealTimeData(holdings, forceRefresh = false) {
  if (!holdings.length) return [];
  
  const startTime = Date.now();
  console.log(`[holdingService] 开始处理 ${holdings.length} 只基金... (强制刷新: ${forceRefresh})`);

  // 第1步：检查市场状态（使用全局智能缓存）
  const marketStatus = await checkMarketStatus(holdings);

  // ✨ 核心优化：单轮并行获取所有数据（使用全局缓存）
  const enrichedWithAllData = await Promise.all(
    holdings.map(async (holding) => {
      const fundCode = holding.fund_code;

      try {
        // 构建缓存键
        const realtimeCacheKey = `realtime_${fundCode}`;
        const historyCacheKey = `history_${fundCode}_${new Date().toISOString().slice(0, 10)}`;

        // 使用全局缓存的 getOrFetch 方法
        const [realTimeData, isConfirmed] = await Promise.all([
          // 实时估值数据（使用 realtime 类型，自动根据交易时段调整TTL）
          forceRefresh 
            ? fundService.getRealTimeValue(fundCode).catch(err => { console.error(`强制刷新${fundCode}失败:`, err); return null; })
            : globalCache.getOrFetch(realtimeCacheKey, () => 
                fundService.getRealTimeValue(fundCode),
                { type: 'realtime' }  // 自动应用智能TTL策略
              ),
          
          // 确认状态数据（使用 history_recent 类型，1小时TTL）
          forceRefresh
            ? fundService.getHistoryNetValues(fundCode, new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10))
                .then(data => data?.length > 0)
                .catch(() => false)
            : globalCache.getOrFetch(historyCacheKey, () => 
                fundService.getHistoryNetValues(fundCode, new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10))
                  .then(data => data?.length > 0),
                { type: 'history_recent' }  // 最近历史数据缓存1小时
              )
        ]);
        
        return {
          ...holding,
          realTimeData: realTimeData,
          _confirmed: isConfirmed
        };
        
      } catch (error) {
        console.error(`[holdingService] 处理基金 ${fundCode} 失败:`, error.message);
        return {
          ...holding,
          realTimeData: null,
          _confirmed: false
        };
      }
    })
  );

  // 第2步：计算指标
  const result = enrichedWithAllData.map(holding => ({
    ...holding,
    ...calculateHoldingMetrics(
      holding, 
      holding.realTimeData, 
      holding._confirmed, 
      marketStatus
    )
  }));

  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // 输出性能统计（包含缓存命中率）
  const stats = globalCache.getStats();
  console.log(`[holdingService] 处理完成: ${holdings.length}只基金, 耗时${duration}ms`);
  console.log(`[GlobalCache] 统计: 命中率=${stats.hitRate}, 缓存数=${stats.size}/${stats.maxSize}`);
  
  return result;
}

function calculateHoldingMetrics(holding, realTimeData, isConfirmed = false, marketStatus = { isMarketOpen: true }) {
  const shares = parseFloat(holding.shares) || 0;
  const costPrice = parseFloat(holding.cost_price) || 0;
  const totalCost = shares * costPrice;
  let currentValue = 0;
  let dailyGain = 0;
  let gainPercent = null;

  if (realTimeData && realTimeData.netValue) {
    currentValue = shares * realTimeData.netValue;
    gainPercent = realTimeData.gainPercent;
    if (gainPercent) {
      dailyGain = currentValue * gainPercent / (100 + gainPercent);
    }
  }

  const cumulativeReturn = currentValue - totalCost;

  const now = new Date();
  const updateTime = realTimeData ? realTimeData.updateTime : null;
  let update_status, data_source, is_fresh;

  if (!marketStatus.isMarketOpen) {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    update_status = 'market_closed';
    data_source = 'actual';
    is_fresh = false;
    
    return {
      market_value: Math.round(currentValue * 100) / 100,
      estimated_change: null,
      daily_profit: 0,
      accumulated_profit: Math.round(cumulativeReturn * 100) / 100,
      net_value: realTimeData ? realTimeData.netValue : null,
      cost_price: Math.round(costPrice * 10000) / 10000,
      shares: shares,
      update_time: updateTime || null,
      last_updated: updateTime || null,
      is_fresh: is_fresh,
      update_status: update_status,
      data_source: data_source,
      fund_code: holding.fund_code,
      day_of_week: marketStatus.dayOfWeek || dayNames[now.getDay()]
    };
  }

  if (isConfirmed) {
    update_status = 'confirmed';
    data_source = 'actual';
    is_fresh = true;
  } else {
    const hour = now.getHours();
    
    if (hour >= 9 && hour < 15) {
      update_status = 'estimating';
      data_source = 'estimated';
      is_fresh = true;
    } else {
      update_status = 'pending_confirm';
      data_source = 'estimated';
      is_fresh = false;
    }
  }

  return {
    market_value: Math.round(currentValue * 100) / 100,
    estimated_change: gainPercent,
    daily_profit: Math.round(dailyGain * 100) / 100,
    accumulated_profit: Math.round(cumulativeReturn * 100) / 100,
    net_value: realTimeData ? realTimeData.netValue : null,
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
  clearAllCache  // 导出供测试和管理接口使用
};
