const Transaction = require('../models/transaction');
const Holding = require('../models/holding');
const fundService = require('../services/fundService');

function nextBusinessDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); // 明确使用本地时间
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) { // 周末
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

exports.listByFund = async (req, res, next) => {
  try {
    const { fundCode } = req.params;
    const transactions = await Transaction.findByUserAndFund(req.user.id, fundCode);
    res.json(transactions.map(tx => ({ ...tx, transaction_date: normalizeDateStr(tx.transaction_date) || '' })));
  } catch (err) {
    next(err);
  }
};

exports.buy = async (req, res, next) => {
  try {
    const { fundCode, amount, date, after3pm } = req.body;
    console.log('[TransactionController] 买入请求 - date:', date, 'after3pm:', after3pm);

    let inputDate = date;
    if (inputDate && typeof inputDate === 'string') {
      inputDate = inputDate.split('T')[0].split(' ')[0];
    }

    const navDate = after3pm ? nextBusinessDay(inputDate) : inputDate;
    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding) {
      return res.status(400).json({ message: '请先添加持仓' });
    }

    // 尝试获取确认净值
    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const confirmedNav = history.length ? history[0].nav : 0;

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算
      const newShares = amount / confirmedNav;
      const oldShares = parseFloat(holding.shares);
      const oldCostPrice = parseFloat(holding.cost_price);
      const oldTotalCost = parseFloat(holding.total_cost) || oldShares * oldCostPrice;
      const totalShares = oldShares + newShares;
      const newCostPrice = totalShares ? (oldShares * oldCostPrice + amount) / totalShares : 0;
      const newTotalCost = oldTotalCost + amount;

      await Holding.update(holding.id, req.user.id, { shares: totalShares, cost_price: newCostPrice, totalCost: newTotalCost });

      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'buy',
        shares: newShares,
        price: confirmedNav,
        amount,
        fee: 0,
        transactionDate: navDate,
        status: 'confirmed'
      });

      console.log(`[TransactionController] 加仓已确认: shares=${newShares.toFixed(2)}, nav=${confirmedNav}`);
      res.json({ message: '加仓成功', shares: newShares, nav: confirmedNav, tradeDate: navDate, status: 'confirmed' });
    } else {
      // 无确认净值 → 挂起订单，用实时估值计算预估份额
      const realTime = await fundService.getRealTimeValue(fundCode).catch(() => null);
      const estimatedNav = realTime && realTime.netValue > 0 ? realTime.netValue : 0;

      if (!estimatedNav) {
        return res.status(400).json({ message: '无法获取基金净值，请稍后重试' });
      }

      const estimatedShares = amount / estimatedNav;

      // 用预估份额临时更新持仓（等确认净值发布后再调整）
      const oldShares = parseFloat(holding.shares);
      const oldCostPrice = parseFloat(holding.cost_price);
      const oldTotalCost = parseFloat(holding.total_cost) || oldShares * oldCostPrice;
      const totalShares = oldShares + estimatedShares;
      const newCostPrice = totalShares ? (oldShares * oldCostPrice + amount) / totalShares : 0;
      const newTotalCost = oldTotalCost + amount;

      await Holding.update(holding.id, req.user.id, { shares: totalShares, cost_price: newCostPrice, totalCost: newTotalCost });

      // 创建 pending 交易记录
      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'buy',
        shares: estimatedShares,
        price: estimatedNav,
        amount,
        fee: 0,
        transactionDate: navDate,
        status: 'pending'
      });

      console.log(`[TransactionController] 加仓订单挂起: estimatedShares=${estimatedShares.toFixed(2)}, estimatedNav=${estimatedNav}, navDate=${navDate}`);
      res.json({ message: '加仓订单已提交，等待净值确认', shares: estimatedShares, nav: estimatedNav, tradeDate: navDate, status: 'pending' });
    }
  } catch (err) {
    next(err);
  }
};

exports.sell = async (req, res, next) => {
  try {
    const { fundCode, shares: sellShares, fee: feeRate, date, after3pm } = req.body;
    console.log('[TransactionController] 卖出请求 - date:', date, 'after3pm:', after3pm);

    let inputDate = date;
    if (inputDate && typeof inputDate === 'string') {
      inputDate = inputDate.split('T')[0].split(' ')[0];
    }

    const navDate = after3pm ? nextBusinessDay(inputDate) : inputDate;
    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding || parseFloat(holding.shares) < sellShares) {
      return res.status(400).json({ message: '持有份额不足' });
    }

    // 尝试获取确认净值
    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const confirmedNav = history.length ? history[0].nav : 0;

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算
      const sellAmount = sellShares * confirmedNav;
      const feeAmount = feeRate ? sellAmount * feeRate : 0;
      const actualAmount = sellAmount - feeAmount;

      const newShares = parseFloat(holding.shares) - sellShares;
      const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
      const costPerShare = oldTotalCost / parseFloat(holding.shares);
      const newTotalCost = costPerShare * newShares;

      if (newShares <= 0) {
        await Holding.delete(holding.id, req.user.id);
      } else {
        await Holding.update(holding.id, req.user.id, { shares: newShares, totalCost: Math.round(newTotalCost * 100) / 100 });
      }

      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'sell',
        shares: sellShares,
        price: confirmedNav,
        amount: actualAmount,
        fee: feeAmount,
        transactionDate: navDate,
        status: 'confirmed'
      });

      console.log(`[TransactionController] 卖出已确认: shares=${sellShares}, nav=${confirmedNav}`);
      res.json({ message: '卖出成功', amount: actualAmount, fee: feeAmount, tradeDate: navDate, status: 'confirmed' });
    } else {
      // 无确认净值 → 挂起订单，用实时估值计算预估金额
      const realTime = await fundService.getRealTimeValue(fundCode).catch(() => null);
      const estimatedNav = realTime && realTime.netValue > 0 ? realTime.netValue : 0;

      if (!estimatedNav) {
        return res.status(400).json({ message: '无法获取基金净值，请稍后重试' });
      }

      const estimatedAmount = sellShares * estimatedNav;
      const feeAmount = feeRate ? estimatedAmount * feeRate : 0;
      const estimatedActualAmount = estimatedAmount - feeAmount;

      // 卖出时份额立即扣减（份额是确定的），金额待确认
      const newShares = parseFloat(holding.shares) - sellShares;
      const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
      const costPerShare = oldTotalCost / parseFloat(holding.shares);
      const newTotalCost = costPerShare * newShares;

      if (newShares <= 0) {
        await Holding.delete(holding.id, req.user.id);
      } else {
        await Holding.update(holding.id, req.user.id, { shares: newShares, totalCost: Math.round(newTotalCost * 100) / 100 });
      }

      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'sell',
        shares: sellShares,
        price: estimatedNav,
        amount: estimatedActualAmount,
        fee: feeAmount,
        transactionDate: navDate,
        status: 'pending'
      });

      console.log(`[TransactionController] 卖出订单挂起: shares=${sellShares}, estimatedNav=${estimatedNav}, navDate=${navDate}`);
      res.json({ message: '卖出订单已提交，等待净值确认', amount: estimatedActualAmount, fee: feeAmount, tradeDate: navDate, status: 'pending' });
    }
  } catch (err) {
    next(err);
  }
};

exports.listAll = async (req, res, next) => {
  try {
    const transactions = await Transaction.findByUserId(req.user.id);
    res.json(transactions.map(tx => ({ ...tx, transaction_date: normalizeDateStr(tx.transaction_date) || '' })));
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ message: '无效的交易记录ID' });
    }

    const deleted = await Transaction.deleteById(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({ message: '交易记录不存在或无权删除' });
    }

    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
};

/**
 * 结算用户的 pending 交易订单
 * 检查每笔 pending 订单的 navDate 是否已有确认净值
 * 如果有，则用确认净值重新计算份额/金额，更新交易记录和持仓
 */
exports.settlePending = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pendingTransactions = await Transaction.findPendingByUserId(userId);

    if (!pendingTransactions.length) {
      return res.json({ message: '没有待结算订单', settled: 0 });
    }

    let settled = 0;
    const errors = [];

    for (const tx of pendingTransactions) {
      try {
        const navDate = normalizeDateStr(tx.transaction_date);
        if (!navDate) {
          errors.push(`交易 #${tx.id} 日期无效`);
          continue;
        }

        const history = await fundService.getHistoryNetValues(tx.fund_code, navDate, navDate);
        const confirmedNav = history.length ? history[0].nav : 0;

        if (!confirmedNav) {
          // 确认净值仍未发布，跳过
          continue;
        }

        const holding = await Holding.findByUserAndFund(userId, tx.fund_code);
        if (!holding) {
          errors.push(`交易 #${tx.id} 对应的持仓不存在`);
          continue;
        }

        if (tx.type === 'buy') {
          // 买入结算：用确认净值重新计算份额
          const oldEstimatedShares = parseFloat(tx.shares);
          const actualShares = parseFloat(tx.amount) / confirmedNav;
          const sharesDiff = actualShares - oldEstimatedShares;

          // 更新持仓：调整份额差额
          const currentShares = parseFloat(holding.shares) + sharesDiff;
          const currentTotalCost = parseFloat(holding.total_cost);
          const currentCostPrice = currentShares ? currentTotalCost / currentShares : 0;

          await Holding.update(holding.id, userId, {
            shares: currentShares,
            cost_price: currentCostPrice,
            totalCost: currentTotalCost
          });

          // 更新交易记录
          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: actualShares,
            price: confirmedNav,
            amount: parseFloat(tx.amount)
          });

          console.log(`[TransactionController] 买入订单结算: #${tx.id}, estimatedShares=${oldEstimatedShares.toFixed(2)} → actualShares=${actualShares.toFixed(2)}, nav=${confirmedNav}`);
          settled++;
        } else if (tx.type === 'sell') {
          // 卖出结算：用确认净值重新计算金额
          const actualAmount = parseFloat(tx.shares) * confirmedNav;
          const feeRate = parseFloat(tx.amount) > 0 && parseFloat(tx.fee) > 0
            ? parseFloat(tx.fee) / (parseFloat(tx.amount) + parseFloat(tx.fee))
            : 0;
          const feeAmount = feeRate ? actualAmount * feeRate : 0;
          const actualNetAmount = actualAmount - feeAmount;

          // 卖出时份额已经扣减，只需更新交易金额
          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: parseFloat(tx.shares),
            price: confirmedNav,
            amount: actualNetAmount
          });

          console.log(`[TransactionController] 卖出订单结算: #${tx.id}, estimatedAmount=${parseFloat(tx.amount).toFixed(2)} → actualAmount=${actualNetAmount.toFixed(2)}, nav=${confirmedNav}`);
          settled++;
        }
      } catch (err) {
        console.error(`[TransactionController] 结算交易 #${tx.id} 失败:`, err.message);
        errors.push(`交易 #${tx.id} 结算失败: ${err.message}`);
      }
    }

    res.json({
      message: `已结算 ${settled} 笔订单`,
      settled,
      total: pendingTransactions.length,
      errors: errors.length ? errors : undefined
    });
  } catch (err) {
    next(err);
  }
};
