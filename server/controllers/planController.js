const InvestmentPlan = require('../models/investmentPlan');

exports.list = async (req, res, next) => {
  try {
    const plans = await InvestmentPlan.findByUserId(req.user.id);
    res.json(plans);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { fundCode, amount, frequency, dayOfWeek, dayOfMonth } = req.body;

    const nextRunDate = calcNextRunDate(new Date(), frequency, dayOfWeek, dayOfMonth);
    const id = await InvestmentPlan.create({
      userId: req.user.id,
      fundCode,
      amount,
      frequency,
      dayOfWeek,
      dayOfMonth,
      nextRunDate
    });

    res.json({ id, message: '定投计划创建成功' });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, frequency, dayOfWeek, dayOfMonth } = req.body;

    const data = {};
    if (amount !== undefined) data.amount = amount;
    if (frequency !== undefined) {
      data.frequency = frequency;
      data.day_of_week = dayOfWeek || null;
      data.day_of_month = dayOfMonth || null;
      data.next_run_date = calcNextRunDate(new Date(), frequency, dayOfWeek, dayOfMonth);
    }

    await InvestmentPlan.update(id, req.user.id, data);
    res.json({ message: '定投计划更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await InvestmentPlan.updateStatus(id, req.user.id, status);
    res.json({ message: '状态更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    await InvestmentPlan.delete(id, req.user.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
};

function calcNextRunDate(today, frequency, dayOfWeek, dayOfMonth) {
  const d = new Date(today);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly': {
      if (dayOfWeek != null) {
        const target = dayOfWeek;
        const current = d.getDay() || 7;
        let diff = target - current;
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
      } else {
        d.setDate(d.getDate() + 7);
      }
      break;
    }
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly': {
      if (dayOfMonth != null) {
        d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      break;
    }
    default:
      d.setMonth(d.getMonth() + 1);
  }

  // 确保不落在周末（非交易日无净值）
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }

  return d.toISOString().slice(0, 10);
}