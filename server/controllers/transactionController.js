const Transaction = require('../models/transaction');
const Holding = require('../models/holding');
const settlementService = require('../services/settlementService');
const holidayService = require('../services/holidayService');
const { createLogger } = require('../utils/logger');
const { normalizeDateStr } = require('../utils/date');

const logger = createLogger('TransactionController');

// 顺延到下一个交易日（委托给 holidayService，支持节假日查询）
async function nextBusinessDay(dateStr) {
  return holidayService.nextTradingDay(dateStr);
}

// 确保日期为交易日，非交易日则顺延（委托给 holidayService，支持节假日查询）
async function ensureBusinessDay(dateStr) {
  return holidayService.ensureTradingDay(dateStr);
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

    // 尝试获取确认净值（统一结算场景 NAV 解析，缓存优先 + 精确日期匹配）
    const { nav: confirmedNav } = await settlementService.getConfirmedNavByDate(fundCode, navDate);
    logger.info(`查询确认净值: fundCode=${fundCode}, navDate=${navDate}, confirmedNav=${confirmedNav}`);

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算（加仓，买入费率为 0）
      const { actualShares, costPrice } = settlementService.computeBuySettlement(amount, 0, confirmedNav);
      await settlementService.applyBuyHolding({
        userId: req.user.id,
        fundCode,
        shares: actualShares,
        costPrice,
        totalCost: amount,
        confirmedNav,
        navDate
      });

      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'buy',
        shares: actualShares,
        price: confirmedNav,
        amount,
        fee: 0,
        transactionDate: navDate,
        status: 'confirmed'
      });

      logger.info(`加仓已确认: userId=${req.user.id}, fundCode=${fundCode}, shares=${actualShares.toFixed(4)}, nav=${confirmedNav}, navDate=${navDate}`);
      res.json({ message: '加仓成功', shares: actualShares, nav: confirmedNav, tradeDate: navDate, status: 'confirmed' });
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
    logger.error(`买入异常: userId=${req.user.id}, fundCode=${req.body?.fundCode}, error=${err.message}`, err.stack);
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

    // 尝试获取确认净值（统一结算场景 NAV 解析，缓存优先 + 精确日期匹配）
    const { nav: confirmedNav } = await settlementService.getConfirmedNavByDate(fundCode, navDate);
    logger.info(`查询确认净值: fundCode=${fundCode}, navDate=${navDate}, confirmedNav=${confirmedNav}`);

    if (confirmedNav > 0) {
      // 有确认净值 → 立即结算
      const { feeAmount, netAmount } = settlementService.computeSellSettlement(sellShares, feeRate, confirmedNav);
      await settlementService.applySellHolding({ userId: req.user.id, fundCode, sellShares, netAmount });

      await Transaction.create({
        userId: req.user.id,
        fundCode,
        type: 'sell',
        shares: sellShares,
        price: confirmedNav,
        amount: netAmount,
        fee: feeAmount,
        transactionDate: navDate,
        status: 'confirmed'
      });

      logger.info(`卖出已确认: userId=${req.user.id}, fundCode=${fundCode}, shares=${sellShares}, nav=${confirmedNav}, navDate=${navDate}`);
      res.json({ message: '卖出成功', amount: netAmount, fee: feeAmount, tradeDate: navDate, status: 'confirmed' });
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
    logger.error(`卖出异常: userId=${req.user.id}, fundCode=${req.body?.fundCode}, error=${err.message}`, err.stack);
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

        const { nav: confirmedNav } = await settlementService.getConfirmedNavByDate(tx.fund_code, navDate);

        if (!confirmedNav) {
          // 确认净值仍未发布，跳过
          logger.info(`订单 #${tx.id} 净值未发布 (navDate=${navDate})，跳过`);
          continue;
        }

        // 统一结算逻辑（费用/份额/成本反算 + 乐观锁 + 新建/占位替换/加仓三分支）
        const result = await settlementService.settleTransaction({ userId, tx, confirmedNav, navDate });

        if (result.outcome === 'settled') {
          settled++;
        } else if (result.outcome === 'already_settled') {
          logger.warn(`订单 #${tx.id} 已被其他任务结算（乐观锁未获取），跳过持仓更新`);
        } else {
          logger.warn(`订单 #${tx.id} 未知交易类型: type=${tx.type}, 跳过`);
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
