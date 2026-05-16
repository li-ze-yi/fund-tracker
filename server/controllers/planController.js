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

    const nextRunDate = calcNextRunDate(new Date(), frequency);
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

function calcNextRunDate(today, frequency) {
  const d = new Date(today);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}