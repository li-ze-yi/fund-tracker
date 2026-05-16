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

exports.listByFund = async (req, res, next) => {
  try {
    const { fundCode } = req.params;
    const transactions = await Transaction.findByUserAndFund(req.user.id, fundCode);

    // 标准化所有记录的日期字段 - 正确处理Date对象和字符串
    const normalizedTransactions = transactions.map(tx => {
      let dateStr = tx.transaction_date;

      // 处理JavaScript Date对象（mysql2驱动可能将DATE类型转为Date）
      if (dateStr instanceof Date) {
        const year = dateStr.getFullYear();
        const month = String(dateStr.getMonth() + 1).padStart(2, '0');
        const day = String(dateStr.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      }
      // 处理字符串格式（可能是ISO格式或其他）
      else if (typeof dateStr === 'string' && dateStr) {
        // 移除时间部分和T分隔符，只保留YYYY-MM-DD
        dateStr = dateStr.split('T')[0].split(' ')[0];
        // 如果结果不是有效的日期格式，尝试从created_at推断
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && tx.created_at) {
          const createdDate = tx.created_at instanceof Date ? tx.created_at : new Date(tx.created_at);
          if (!isNaN(createdDate.getTime())) {
            const year = createdDate.getFullYear();
            const month = String(createdDate.getMonth() + 1).padStart(2, '0');
            const day = String(createdDate.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
        }
      }

      return {
        ...tx,
        transaction_date: dateStr || ''  // 确保始终是字符串
      };
    });

    res.json(normalizedTransactions);
  } catch (err) {
    next(err);
  }
};

exports.buy = async (req, res, next) => {
  try {
    const { fundCode, amount, date, after3pm } = req.body;
    console.log('[DEBUG] 买入请求 - 原始date:', date, '类型:', typeof date);
    
    // 标准化日期格式
    let inputDate = date;
    if (inputDate && typeof inputDate === 'string') {
      inputDate = inputDate.split('T')[0].split(' ')[0];
      console.log('[DEBUG] 标准化后的inputDate:', inputDate);
    }
    
    const navDate = after3pm ? nextBusinessDay(inputDate) : inputDate;
    console.log('[DEBUG] 最终navDate:', navDate, 'after3pm:', after3pm);
    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding) {
      return res.status(400).json({ message: '请先添加持仓' });
    }

    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const nav = history.length ? history[0].nav : 0;
    const newShares = nav ? amount / nav : 0;

    const oldShares = parseFloat(holding.shares);
    const oldCostPrice = parseFloat(holding.cost_price);
    const totalShares = oldShares + newShares;
    const newCostPrice = totalShares ? (oldShares * oldCostPrice + amount) / totalShares : 0;

    await Holding.update(holding.id, req.user.id, { shares: totalShares, cost_price: newCostPrice });

    await Transaction.create({
      userId: req.user.id,
      fundCode,
      type: 'buy',
      shares: newShares,
      price: nav,
      amount,
      fee: 0,
      transactionDate: navDate
    });

    res.json({ message: '加仓成功', shares: newShares, nav, tradeDate: navDate });
  } catch (err) {
    next(err);
  }
};

exports.sell = async (req, res, next) => {
  try {
    const { fundCode, shares: sellShares, fee: feeRate, date, after3pm } = req.body;
    console.log('[DEBUG] 卖出请求 - 原始date:', date, '类型:', typeof date);
    
    // 标准化日期格式：确保是 YYYY-MM-DD 格式
    let inputDate = date;
    if (inputDate) {
      if (typeof inputDate === 'string') {
        // 移除可能的时间部分，只保留日期
        inputDate = inputDate.split('T')[0].split(' ')[0];
        console.log('[DEBUG] 标准化后的inputDate:', inputDate);
      }
    }
    
    const navDate = after3pm ? nextBusinessDay(inputDate) : inputDate;
    console.log('[DEBUG] 最终navDate:', navDate, 'after3pm:', after3pm);
    
    const holding = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (!holding || parseFloat(holding.shares) < sellShares) {
      return res.status(400).json({ message: '持有份额不足' });
    }

    const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
    const nav = history.length ? history[0].nav : 0;
    const sellAmount = sellShares * nav;
    const feeAmount = feeRate ? sellAmount * feeRate : 0;
    const actualAmount = sellAmount - feeAmount;

    const newShares = parseFloat(holding.shares) - sellShares;
    if (newShares <= 0) {
      await Holding.delete(holding.id, req.user.id);
    } else {
      await Holding.update(holding.id, req.user.id, { shares: newShares });
    }

    await Transaction.create({
      userId: req.user.id,
      fundCode,
      type: 'sell',
      shares: sellShares,
      price: nav,
      amount: actualAmount,
      fee: feeAmount,
      transactionDate: navDate
    });

    res.json({ message: '卖出成功', amount: actualAmount, fee: feeAmount, tradeDate: navDate });
  } catch (err) {
    next(err);
  }
};

exports.listAll = async (req, res, next) => {
  try {
    const transactions = await Transaction.findByUserId(req.user.id);

    // 标准化所有记录的日期字段（与listByFund保持一致）
    const normalizedTransactions = transactions.map(tx => {
      let dateStr = tx.transaction_date;

      if (dateStr instanceof Date) {
        const year = dateStr.getFullYear();
        const month = String(dateStr.getMonth() + 1).padStart(2, '0');
        const day = String(dateStr.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      }
      else if (typeof dateStr === 'string' && dateStr) {
        dateStr = dateStr.split('T')[0].split(' ')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && tx.created_at) {
          const createdDate = tx.created_at instanceof Date ? tx.created_at : new Date(tx.created_at);
          if (!isNaN(createdDate.getTime())) {
            const year = createdDate.getFullYear();
            const month = String(createdDate.getMonth() + 1).padStart(2, '0');
            const day = String(createdDate.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
        }
      }

      return { ...tx, transaction_date: dateStr || '' };
    });

    res.json(normalizedTransactions);
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 验证ID是否为有效数字
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