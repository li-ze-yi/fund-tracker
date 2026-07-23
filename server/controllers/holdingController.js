const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const Fund = require('../models/fund');
const holdingService = require('../services/holdingService');
const fundService = require('../services/fundService');
const dailyProfitService = require('../services/dailyProfitService');
const globalCache = require('../services/globalCache');
const UserSetting = require('../models/userSetting');

exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 自动结算 pending 交易订单（不阻塞主流程，异步执行）
    settlePendingAsync(userId);

    const holdings = await Holding.findByUserId(userId);

    // ✅ 获取前端传递的强制刷新参数
    const forceRefresh = req.query.forceRefresh === '1';

    // 获取用户的估值方法设置（全局方法 + 单基金覆盖）
    let valuationMethod = 'holdings';
    let valuationOverrides = {};
    try {
      const settings = await UserSetting.findByUserId(userId);
      valuationMethod = settings?.valuation_method || 'holdings';
      valuationOverrides = settings?.valuation_overrides || {};
    } catch { /* ignore */ }

    // ✨ holdingService.enrichHoldingsWithRealTimeData 已经内部查询每只基金的确认状态
    // 并正确设置 update_status (confirmed/pending_confirm/estimating)
    const enrichedWithStatus = await holdingService.enrichHoldingsWithRealTimeData(
      holdings,
      forceRefresh,  // ✅ 传递强制刷新参数
      valuationMethod,      // ✅ 全局估值方法
      valuationOverrides    // ✅ 单基金覆盖
    );

    // 事件驱动：异步计算并保存当日收益（不阻塞主流程）
    dailyProfitService.calculateAndSaveDailyProfit(userId, enrichedWithStatus)
      .then(result => {
        if (result) {
          console.log(`[HoldingController] 用户 ${userId} 日收益已自动更新:`, result.date);
        }
      })
      .catch(err => {
        console.error('[HoldingController] 日收益自动计算失败:', err.message);
      });

    res.json(enrichedWithStatus);
  } catch (err) {
    next(err);
  }
};

/**
 * 异步结算 pending 交易订单
 * 在用户查看持仓时自动触发，不阻塞主流程
 */
async function settlePendingAsync(userId) {
  try {
    const pendingTransactions = await Transaction.findPendingByUserId(userId);
    if (!pendingTransactions.length) return;

    console.log(`[HoldingController] 发现 ${pendingTransactions.length} 笔待结算订单，开始自动结算...`);

    for (const tx of pendingTransactions) {
      try {
        const navDate = normalizeDateStr(tx.transaction_date);
        if (!navDate) continue;

        const history = await fundService.getHistoryNetValues(tx.fund_code, navDate, navDate);
        const confirmedNav = history.length ? history[0].nav : 0;
        if (!confirmedNav) continue;

        const holding = await Holding.findByUserAndFund(userId, tx.fund_code);

        if (tx.type === 'buy') {
          // 买入结算：用确认净值计算实际份额
          const actualShares = parseFloat(tx.amount) / confirmedNav;

          if (!holding) {
            // 无持仓（定投首笔等场景）→ 新建持仓
            await Holding.create({
              userId,
              fundCode: tx.fund_code,
              shares: actualShares,
              costPrice: confirmedNav,
              totalCost: parseFloat(tx.amount)
            });
          } else {
            // 已有持仓 → 加仓
            const currentShares = parseFloat(holding.shares) + actualShares;
            const currentTotalCost = parseFloat(holding.total_cost) + parseFloat(tx.amount);
            const currentCostPrice = currentShares ? currentTotalCost / currentShares : 0;

            await Holding.update(holding.id, userId, {
              shares: currentShares,
              cost_price: currentCostPrice,
              totalCost: currentTotalCost
            });
          }

          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: actualShares,
            price: confirmedNav,
            amount: parseFloat(tx.amount)
          });

          console.log(`[HoldingController] 自动结算买入: #${tx.id}, actualShares=${actualShares.toFixed(2)}, nav=${confirmedNav}, holdingCreated=${!holding}`);
        } else if (tx.type === 'sell') {
          // 卖出结算：用确认净值计算实际金额，此时才扣减持仓份额和成本
          const sellShares = parseFloat(tx.shares);
          const actualAmount = sellShares * confirmedNav;
          // fee 字段存的是费率（pending 时直接存入），金额为 0 时用费率计算
          const feeRate = parseFloat(tx.fee) || 0;
          const feeAmount = feeRate ? actualAmount * feeRate : 0;
          const actualNetAmount = actualAmount - feeAmount;

          // 结算时才扣减份额和成本
          const newShares = parseFloat(holding.shares) - sellShares;
          const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
          const costPerShare = oldTotalCost / parseFloat(holding.shares);
          const newTotalCost = costPerShare * newShares;

          if (newShares <= 0) {
            await Holding.delete(holding.id, userId);
          } else {
            await Holding.update(holding.id, userId, { shares: newShares, totalCost: Math.round(newTotalCost * 100) / 100 });
          }

          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: sellShares,
            price: confirmedNav,
            amount: actualNetAmount
          });

          console.log(`[HoldingController] 自动结算卖出: #${tx.id}, nav=${confirmedNav}, amount=${actualNetAmount.toFixed(2)}`);
        }
      } catch (err) {
        console.error(`[HoldingController] 结算交易 #${tx.id} 失败:`, err.message);
      }
    }
  } catch (err) {
    console.error('[HoldingController] 自动结算失败:', err.message);
  }
}

function normalizeDateStr(dateVal) {
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof dateVal === 'string' && dateVal) {
    let str = dateVal.split('T')[0].split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  }
  return '';
}

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
    let confirmedNavDate = null;
    
    try {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const historyCacheKey = `history_${fundCode}_30d_${today}`;
      
      try {
        const recentHistory = await globalCache.getOrFetch(
          historyCacheKey,
          () => fundService.getHistoryNetValues(fundCode, thirtyDaysAgo, today),
          { type: 'history_recent' }
        );
        
        if (recentHistory && recentHistory.length > 0) {
          const latestConfirmed = recentHistory[0];
          if (latestConfirmed.nav) {
            netValue = parseFloat(latestConfirmed.nav) || 0;
          } else if (latestConfirmed.netValue) {
            netValue = parseFloat(latestConfirmed.netValue) || 0;
          }
          
          if (netValue > 0) {
            netValueSource = `confirmed(${latestConfirmed.date})`;
            confirmedNavDate = latestConfirmed.date;
            console.log(`[HoldingController] 使用确认净值: ${netValue} (${latestConfirmed.date})`);
          }
        }
      } catch (e) {
        console.warn(`[HoldingController] 获取历史净值失败: ${e.message}`);
      }
      
      if (netValue <= 0) {
        const realtimeCacheKey = `realtime_${fundCode}`;
        try {
          const realTime = await globalCache.getOrFetch(
            realtimeCacheKey,
            () => fundService.getRealTimeValue(fundCode),
            { type: 'realtime' }
          );
          if (realTime && realTime.netValue > 0) {
            netValue = realTime.netValue;
            netValueSource = 'realtime';
            console.log(`[HoldingController] 无确认净值，使用实时估值: ${netValue}`);
          }
        } catch (e) {
          console.warn(`[HoldingController] 获取实时估值也失败: ${e.message}`);
        }
      }
    } catch (error) {
      console.error(`[HoldingController] 获取净值失败:`, error.message);
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
    const totalCost = amount - (totalReturn || 0);
    const costPrice = shares > 0 ? totalCost / shares : 0;

    console.log(`[HoldingController] 计算结果: shares=${shares.toFixed(2)}, costPrice=${costPrice.toFixed(4)}, totalCost=${totalCost}, netValue=${netValue}`);

    const id = await Holding.create({
      userId: req.user.id,
      fundCode,
      shares,
      costPrice,
      groupId,
      confirmedNav: netValue,
      confirmedNavDate,
      totalCost
    });

    console.log(`[HoldingController] 持仓创建成功: id=${id}, fund=${fundCode}`);

    // 累计收益为0时，视为新买入，生成交易记录
    if (!totalReturn) {
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
    }

    res.json({ id, message: '添加成功' });
  } catch (err) {
    console.error(`[HoldingController] 创建持仓异常:`, err);
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { groupId, amount, totalReturn } = req.body;

    const updateData = {};
    if (groupId !== undefined) updateData.group_id = groupId;

    // 修改持仓金额和累计收益，逻辑与 create 一致
    if (amount !== undefined) {
      const holding = await Holding.findByUserAndFund(req.user.id, req.body.fundCode);
      if (!holding) {
        return res.status(404).json({ message: '持仓不存在' });
      }

      // 获取当前净值（先确认净值，再实时估值）
      let netValue = parseFloat(holding.confirmed_nav) || 0;
      if (netValue <= 0) {
        const realTime = await fundService.getRealTimeValue(req.body.fundCode).catch(() => null);
        if (realTime && realTime.netValue > 0) {
          netValue = realTime.netValue;
        }
      }

      if (netValue <= 0) {
        return res.status(400).json({ message: '无法获取净值，请稍后重试' });
      }

      const currentValue = amount;
      const shares = currentValue / netValue;
      const totalCost = amount - (totalReturn || 0);
      const costPrice = shares > 0 ? totalCost / shares : 0;

      updateData.shares = shares;
      updateData.cost_price = costPrice;
      updateData.total_cost = totalCost;
    }

    await Holding.update(id, req.user.id, updateData);
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