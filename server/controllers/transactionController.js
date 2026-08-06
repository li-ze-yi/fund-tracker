const Transaction = require('../models/transaction');
const Holding = require('../models/holding');
const fundService = require('../services/fundService');
const holidayService = require('../services/holidayService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TransactionController');

// 顺延到下一个交易日（委托给 holidayService，支持节假日查询）
async function nextBusinessDay(dateStr) {
  return holidayService.nextTradingDay(dateStr);
}

// 确保日期为交易日，非交易日则顺延（委托给 holidayService，支持节假日查询）
async function ensureBusinessDay(dateStr) {
  return holidayService.ensureTradingDay(dateStr);
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
    logger.info(`买入请求: userId=${req.user.id}, fundCode=${fundCode}, amount=${amount}, date=${date}, after3pm=${after3pm}`);

    let inputDate = date;
    if (inputDate && typeof inputDate === 'string') {
      inputDate = inputDate.split('T')[0].split(' ')[0];
    }

    // 计算 navDate：after3pm=true 顺延到下一交易日，再确保是交易日
    let navDate;
    if (after3pm) {
      const nextDay = await nextBusinessDay(inputDate);
      navDate = await ensureBusinessDay(nextDay);
      logger.info(`navDate 计算 (after3pm): inputDate=${inputDate}, nextBusinessDay=${nextDay}, navDate=${navDate}`);
    } else {
      navDate = await ensureBusinessDay(inputDate);
      logger.info(`navDate 计算 (当日): inputDate=${inputDate}, navDate=${navDate}`);
    }

    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding) {
      logger.warn(`买入失败: userId=${req.user.id}, fundCode=${fundCode} 无持仓记录，请先添加持仓`);
      return res.status(400).json({ message: '请先添加持仓' });
    }

    // 尝试获取确认净值
    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const confirmedNav = history.length ? history[0].nav : 0;
    logger.info(`查询确认净值: fundCode=${fundCode}, navDate=${navDate}, confirmedNav=${confirmedNav}, historyLen=${history.length}`);

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算
      const newShares = amount / confirmedNav;
      const oldShares = parseFloat(holding.shares);
      const oldCostPrice = parseFloat(holding.cost_price);
      const oldTotalCost = parseFloat(holding.total_cost) || oldShares * oldCostPrice;
      const totalShares = oldShares + newShares;
      const newCostPrice = totalShares ? (oldShares * oldCostPrice + amount) / totalShares : 0;
      const newTotalCost = oldTotalCost + amount;

      logger.info(`立即结算买入: oldShares=${oldShares.toFixed(4)}, newShares=${newShares.toFixed(4)}, totalShares=${totalShares.toFixed(4)}, oldCost=${oldCostPrice.toFixed(4)}, newCost=${newCostPrice.toFixed(4)}, nav=${confirmedNav}`);

      await Holding.update(holding.id, req.user.id, {
        shares: totalShares,
        cost_price: newCostPrice,
        totalCost: newTotalCost,
        soldDate: null,
        totalReturn: 0
      });

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

      logger.info(`加仓已确认: userId=${req.user.id}, fundCode=${fundCode}, shares=${newShares.toFixed(4)}, nav=${confirmedNav}, navDate=${navDate}`);
      res.json({ message: '加仓成功', shares: newShares, nav: confirmedNav, tradeDate: navDate, status: 'confirmed' });
    } else {
      // 无确认净值 → 创建 pending 订单，只记录金额，等净值确认后结算时再计算份额
      logger.info(`确认净值未发布，创建 pending 订单: userId=${req.user.id}, fundCode=${fundCode}, amount=${amount}, navDate=${navDate}`);
      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'buy',
        shares: 0,
        price: 0,
        amount,
        fee: 0,
        transactionDate: navDate,
        status: 'pending'
      });

      logger.info(`加仓订单挂起: userId=${req.user.id}, fundCode=${fundCode}, amount=${amount}, navDate=${navDate}`);
      res.json({ message: '加仓订单已提交，等待净值确认后结算', amount, tradeDate: navDate, status: 'pending' });
    }
  } catch (err) {
    logger.error(`买入异常: userId=${req.user.id}, fundCode=${fundCode}, error=${err.message}`, err.stack);
    next(err);
  }
};

exports.sell = async (req, res, next) => {
  try {
    const { fundCode, shares: sellShares, fee: feeRate, date, after3pm } = req.body;
    logger.info(`卖出请求: userId=${req.user.id}, fundCode=${fundCode}, shares=${sellShares}, feeRate=${feeRate}, date=${date}, after3pm=${after3pm}`);

    let inputDate = date;
    if (inputDate && typeof inputDate === 'string') {
      inputDate = inputDate.split('T')[0].split(' ')[0];
    }

    // 计算 navDate：after3pm=true 顺延到下一交易日，再确保是交易日
    let navDate;
    if (after3pm) {
      const nextDay = await nextBusinessDay(inputDate);
      navDate = await ensureBusinessDay(nextDay);
      logger.info(`navDate 计算 (after3pm): inputDate=${inputDate}, nextBusinessDay=${nextDay}, navDate=${navDate}`);
    } else {
      navDate = await ensureBusinessDay(inputDate);
      logger.info(`navDate 计算 (当日): inputDate=${inputDate}, navDate=${navDate}`);
    }

    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding || parseFloat(holding.shares) < sellShares) {
      logger.warn(`卖出失败: userId=${req.user.id}, fundCode=${fundCode}, holdingShares=${holding ? holding.shares : '无持仓'}, requestShares=${sellShares}, 份额不足`);
      return res.status(400).json({ message: '持有份额不足' });
    }

    // 尝试获取确认净值
    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const confirmedNav = history.length ? history[0].nav : 0;
    logger.info(`查询确认净值: fundCode=${fundCode}, navDate=${navDate}, confirmedNav=${confirmedNav}, historyLen=${history.length}`);

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算
      const sellAmount = sellShares * confirmedNav;
      const feeAmount = feeRate ? sellAmount * feeRate : 0;
      const actualAmount = sellAmount - feeAmount;

      const newShares = parseFloat(holding.shares) - sellShares;
      const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
      const costPerShare = oldTotalCost / parseFloat(holding.shares);
      const newTotalCost = costPerShare * newShares;

      // 本次实现盈亏
      const realizedProfit = actualAmount - (costPerShare * sellShares);

      logger.info(`立即结算卖出: sellShares=${sellShares.toFixed(4)}, nav=${confirmedNav}, grossAmount=${sellAmount.toFixed(2)}, fee=${feeAmount.toFixed(2)}, netAmount=${actualAmount.toFixed(2)}, realizedProfit=${realizedProfit.toFixed(2)}`);

      if (newShares <= 0) {
        // 全部卖出 → 保留持仓记录（shares=0），记录实现盈亏与清仓日期
        logger.info(`全部卖出: oldShares=${parseFloat(holding.shares).toFixed(4)}, remaining=${newShares.toFixed(4)}, 清仓`);
        await Holding.update(holding.id, req.user.id, {
          shares: 0,
          totalCost: 0,
          totalReturn: Math.round(realizedProfit * 100) / 100,
          soldDate: new Date().toISOString().slice(0, 10)
        });
      } else {
        // 部分卖出 → 累加 total_return
        logger.info(`部分卖出: oldShares=${parseFloat(holding.shares).toFixed(4)}, remaining=${newShares.toFixed(4)}, oldTotalCost=${oldTotalCost.toFixed(2)}, newTotalCost=${newTotalCost.toFixed(2)}`);
        await Holding.update(holding.id, req.user.id, {
          shares: newShares,
          totalCost: Math.round(newTotalCost * 100) / 100,
          totalReturn: Math.round(((parseFloat(holding.total_return) || 0) + realizedProfit) * 100) / 100
        });
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

      logger.info(`卖出已确认: userId=${req.user.id}, fundCode=${fundCode}, shares=${sellShares}, nav=${confirmedNav}, navDate=${navDate}`);
      res.json({ message: '卖出成功', amount: actualAmount, fee: feeAmount, tradeDate: navDate, status: 'confirmed' });
    } else {
      // 无确认净值 → 创建 pending 订单，只记录份额，等净值确认后结算时再计算金额
      logger.info(`确认净值未发布，创建 pending 卖出订单: userId=${req.user.id}, fundCode=${fundCode}, shares=${sellShares}, navDate=${navDate}`);
      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'sell',
        shares: sellShares,
        price: 0,
        amount: 0,
        fee: feeRate || 0,
        transactionDate: navDate,
        status: 'pending'
      });

      logger.info(`卖出订单挂起: userId=${req.user.id}, fundCode=${fundCode}, shares=${sellShares}, navDate=${navDate}`);
      res.json({ message: '卖出订单已提交，等待净值确认后结算', shares: sellShares, tradeDate: navDate, status: 'pending' });
    }
  } catch (err) {
    logger.error(`卖出异常: userId=${req.user.id}, fundCode=${fundCode}, error=${err.message}`, err.stack);
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
      logger.info(`结算 pending 请求: userId=${userId}, 无待结算订单`);
      return res.json({ message: '没有待结算订单', settled: 0 });
    }

    logger.info(`结算 pending 请求: userId=${userId}, 待结算订单数=${pendingTransactions.length}`);

    let settled = 0;
    const errors = [];

    for (const tx of pendingTransactions) {
      try {
        const navDate = normalizeDateStr(tx.transaction_date);
        if (!navDate) {
          logger.warn(`订单 #${tx.id} 日期无效: rawDate=${tx.transaction_date}`);
          errors.push(`交易 #${tx.id} 日期无效`);
          continue;
        }

        logger.info(`处理订单 #${tx.id}: type=${tx.type}, fund=${tx.fund_code}, navDate=${navDate}, amount=${tx.amount}, shares=${tx.shares}`);

        const history = await fundService.getHistoryNetValues(tx.fund_code, navDate, navDate);
        const confirmedNav = history.length ? history[0].nav : 0;

        if (!confirmedNav) {
          // 确认净值仍未发布，跳过
          logger.info(`订单 #${tx.id} 净值未发布 (navDate=${navDate})，跳过`);
          continue;
        }

        logger.info(`订单 #${tx.id} 确认净值已发布: nav=${confirmedNav}, navDate=${navDate}`);

        const holding = await Holding.findByUserAndFund(userId, tx.fund_code);

        if (tx.type === 'buy') {
          // 买入结算：用确认净值计算实际份额
          const actualShares = parseFloat(tx.amount) / confirmedNav;
          logger.info(`订单 #${tx.id} 买入结算计算: amount=${tx.amount}, nav=${confirmedNav}, actualShares=${actualShares.toFixed(4)}`);

          if (!holding) {
            // 无持仓（定投首笔等场景）→ 新建持仓
            logger.info(`订单 #${tx.id} 无持仓记录，新建持仓: fund=${tx.fund_code}, shares=${actualShares.toFixed(4)}, costPrice=${confirmedNav}, totalCost=${tx.amount}`);
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

            logger.info(`订单 #${tx.id} 加仓: oldShares=${parseFloat(holding.shares).toFixed(4)}, newShares=${currentShares.toFixed(4)}, oldCost=${parseFloat(holding.cost_price).toFixed(4)}, newCost=${currentCostPrice.toFixed(4)}`);

            await Holding.update(holding.id, userId, {
              shares: currentShares,
              cost_price: currentCostPrice,
              totalCost: currentTotalCost,
              soldDate: null,
              totalReturn: 0
            });
          }

          // 更新交易记录
          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: actualShares,
            price: confirmedNav,
            amount: parseFloat(tx.amount)
          });

          logger.info(`订单 #${tx.id} 买入结算完成: actualShares=${actualShares.toFixed(4)}, nav=${confirmedNav}, holdingCreated=${!holding}`);
          settled++;
        } else if (tx.type === 'sell') {
          // 卖出结算：用确认净值计算实际金额，此时才扣减持仓份额和成本
          const sellShares = parseFloat(tx.shares);
          const actualAmount = sellShares * confirmedNav;
          // fee 字段存的是费率（pending 时直接存入），金额为 0 时用费率计算
          const feeRate = parseFloat(tx.fee) || 0;
          const feeAmount = feeRate ? actualAmount * feeRate : 0;
          const actualNetAmount = actualAmount - feeAmount;

          logger.info(`订单 #${tx.id} 卖出结算计算: sellShares=${sellShares.toFixed(4)}, nav=${confirmedNav}, grossAmount=${actualAmount.toFixed(2)}, feeRate=${feeRate}, fee=${feeAmount.toFixed(2)}, netAmount=${actualNetAmount.toFixed(2)}`);

          // 结算时才扣减份额和成本
          const newShares = parseFloat(holding.shares) - sellShares;
          const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
          const costPerShare = oldTotalCost / parseFloat(holding.shares);
          const newTotalCost = costPerShare * newShares;

          // 本次实现盈亏
          const realizedProfit = actualNetAmount - (costPerShare * sellShares);

          if (newShares <= 0) {
            // 全部卖出 → 保留持仓记录（shares=0），记录实现盈亏与清仓日期
            logger.info(`订单 #${tx.id} 全部卖出: oldShares=${parseFloat(holding.shares).toFixed(4)}, remaining=${newShares.toFixed(4)}, realizedProfit=${realizedProfit.toFixed(2)}, 清仓`);
            await Holding.update(holding.id, userId, {
              shares: 0,
              totalCost: 0,
              totalReturn: Math.round(realizedProfit * 100) / 100,
              soldDate: new Date().toISOString().slice(0, 10)
            });
          } else {
            // 部分卖出 → 累加 total_return
            logger.info(`订单 #${tx.id} 部分卖出: oldShares=${parseFloat(holding.shares).toFixed(4)}, remaining=${newShares.toFixed(4)}, realizedProfit=${realizedProfit.toFixed(2)}`);
            await Holding.update(holding.id, userId, {
              shares: newShares,
              totalCost: Math.round(newTotalCost * 100) / 100,
              totalReturn: Math.round(((parseFloat(holding.total_return) || 0) + realizedProfit) * 100) / 100
            });
          }

          await Transaction.updateToConfirmed(tx.id, userId, {
            shares: sellShares,
            price: confirmedNav,
            amount: actualNetAmount
          });

          logger.info(`订单 #${tx.id} 卖出结算完成: netAmount=${actualNetAmount.toFixed(2)}, nav=${confirmedNav}`);
          settled++;
        }
      } catch (err) {
        logger.error(`结算交易 #${tx.id} 失败: ${err.message}`, err.stack);
        errors.push(`交易 #${tx.id} 结算失败: ${err.message}`);
      }
    }

    logger.info(`结算 pending 完成: userId=${userId}, total=${pendingTransactions.length}, settled=${settled}, errors=${errors.length}`);

    res.json({
      message: `已结算 ${settled} 笔订单`,
      settled,
      total: pendingTransactions.length,
      errors: errors.length ? errors : undefined
    });
  } catch (err) {
    logger.error(`结算 pending 异常: userId=${req.user.id}, error=${err.message}`, err.stack);
    next(err);
  }
};
