const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const Fund = require('../models/fund');
const holdingService = require('../services/holdingService');
const fundService = require('../services/fundService');
const dailyProfitService = require('../services/dailyProfitService');
const globalCache = require('../services/globalCache');

exports.list = async (req, res, next) => {
  try {
    const holdings = await Holding.findByUserId(req.user.id);

    // ✅ 获取前端传递的强制刷新参数
    const forceRefresh = req.query.forceRefresh === '1';

    // ✨ holdingService.enrichHoldingsWithRealTimeData 已经内部查询每只基金的确认状态
    // 并正确设置 update_status (confirmed/pending_confirm/estimating)
    const enrichedWithStatus = await holdingService.enrichHoldingsWithRealTimeData(
      holdings,
      forceRefresh  // ✅ 传递强制刷新参数
    );

    // 事件驱动：异步计算并保存当日收益（不阻塞主流程）
    dailyProfitService.calculateAndSaveDailyProfit(req.user.id, enrichedWithStatus)
      .then(result => {
        if (result) {
          console.log(`[HoldingController] 用户 ${req.user.id} 日收益已自动更新:`, result.date);
        }
      })
      .catch(err => {
        console.error('[HoldingController] 日益益自动计算失败:', err.message);
      });

    res.json(enrichedWithStatus);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { fundCode, amount, totalReturn, groupId } = req.body;
    console.log(`[HoldingController] 开始添加持仓: fund=${fundCode}, amount=${amount}, totalReturn=${totalReturn}`);
    
    const fund = await Fund.findByCode(fundCode);
    if (!fund) {
      console.warn(`[HoldingController] 基金不存在: ${fundCode}`);
      return res.status(400).json({ message: '基金代码不存在' });
    }

    const existing = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (existing) {
      console.warn(`[HoldingController] 基金已在持仓中: ${fundCode}`);
      return res.status(400).json({ message: '该基金已在持仓中' });
    }

    let netValue = 0;
    let netValueSource = 'unknown';
    
    try {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      
      const historyCacheKey = `history_${fundCode}_${today}`;
      let recentHistory = null;
      
      try {
        recentHistory = await globalCache.getOrFetch(
          historyCacheKey,
          () => fundService.getHistoryNetValues(fundCode, thirtyDaysAgo, today),
          { type: 'history_recent' }
        );
      } catch (e) {
        console.warn(`[HoldingController] 获取历史净值失败，继续尝试: ${e.message}`);
      }
      
      if (recentHistory && recentHistory.length > 0) {
        const latestConfirmed = recentHistory[0];
        if (latestConfirmed.nav) {
          netValue = parseFloat(latestConfirmed.nav) || 0;
        } else if (latestConfirmed.netValue) {
          netValue = parseFloat(latestConfirmed.netValue) || 0;
        }
        
        if (netValue > 0) {
          netValueSource = `confirmed(${latestConfirmed.date})`;
          console.log(`[HoldingController] 使用确认净值: ${netValue} (${latestConfirmed.date})`);
        }
      }
      
      if (netValue <= 0) {
        const realtimeCacheKey = `realtime_${fundCode}`;
        const realTime = await globalCache.getOrFetch(
          realtimeCacheKey,
          () => fundService.getRealTimeValue(fundCode),
          { type: 'realtime' }
        );
        if (realTime && realTime.netValue > 0) {
          netValue = realTime.netValue;
          netValueSource = 'realtime(estimated)';
          console.warn(`[HoldingController] 无确认净值，使用实时估值: ${netValue}`);
        }
      }
    } catch (error) {
      console.error(`[HoldingController] 获取确认净值失败:`, error.message);
      try {
        const realtimeCacheKey = `realtime_${fundCode}`;
        const realTime = await globalCache.getOrFetch(
          realtimeCacheKey,
          () => fundService.getRealTimeValue(fundCode),
          { type: 'realtime' }
        );
        if (realTime && realTime.netValue > 0) {
          netValue = realTime.netValue;
          netValueSource = 'realtime(fallback)';
        }
      } catch (e2) {
        console.error(`[HoldingController] 实时估值也获取失败:`, e2.message);
      }
    }

    if (netValue <= 0) {
      console.error(`[HoldingController] 无法获取有效净值: source=${netValueSource}, value=${netValue}`);
      return res.status(400).json({ 
        message: '无法获取有效的基金净值，请稍后重试',
        details: `净值来源: ${netValueSource}, 净值: ${netValue}`
      });
    }

    const currentValue = amount;
    const shares = currentValue / netValue;
    const cost = amount - (totalReturn || 0);
    const costPrice = shares > 0 ? cost / shares : 0;

    console.log(`[HoldingController] 计算结果: shares=${shares.toFixed(2)}, costPrice=${costPrice.toFixed(4)}, netValue=${netValue}`);

    const id = await Holding.create({
      userId: req.user.id,
      fundCode,
      shares,
      costPrice,
      groupId
    });

    await Transaction.create({
      userId: req.user.id,
      fundCode,
      type: 'buy',
      shares,
      price: netValue,
      amount,
      fee: 0,
      transactionDate: new Date().toISOString().slice(0, 10),
      metadata: JSON.stringify({ netValueSource })
    });

    console.log(`[HoldingController] 持仓创建成功: id=${id}, fund=${fundCode}`);
    res.json({ id, message: '添加成功' });
  } catch (err) {
    console.error(`[HoldingController] 创建持仓异常:`, err);
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { groupId } = req.body;
    await Holding.update(id, req.user.id, { group_id: groupId });
    res.json({ message: '更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Holding.delete(id, req.user.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
};