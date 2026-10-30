const InvestmentPlan = require('../models/investmentPlan');
const Fund = require('../models/fund');
const { normalizeDateStr } = require('../utils/date');
const { toPositiveNumber } = require('../utils/validate');

// 定投频率白名单（与 calcNextRunDate 支持的取值一致）
const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];

/**
 * 定投计划入参校验：返回错误文案，null 表示通过
 */
function validatePlanParams({ amount, frequency, dayOfWeek, dayOfMonth }) {
  const amountNum = toPositiveNumber(amount);
  if (Number.isNaN(amountNum)) {
    return '定投金额必须为正数';
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return '无效的定投频率，可选: daily, weekly, biweekly, monthly';
  }
  // weekly 的 dayOfWeek：1-7 整数（1=周一），可选（缺省按 7 天后执行）
  if (dayOfWeek != null && dayOfWeek !== '') {
    const n = Number(dayOfWeek);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      return 'dayOfWeek 必须为 1-7 的整数（1=周一）';
    }
  }
  // monthly 的 dayOfMonth：1-31 整数，可选（缺省按同日次月执行）
  if (dayOfMonth != null && dayOfMonth !== '') {
    const n = Number(dayOfMonth);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return 'dayOfMonth 必须为 1-31 的整数';
    }
  }
  return null;
}

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

    // 入参校验：金额正数、频率白名单、日期字段范围
    const invalidMsg = validatePlanParams({ amount, frequency, dayOfWeek, dayOfMonth });
    if (invalidMsg) {
      return res.status(400).json({ message: invalidMsg });
    }

    // 基金代码必须真实存在
    if (!fundCode) {
      return res.status(400).json({ message: '基金代码不能为空' });
    }
    const fund = await Fund.findByCode(fundCode);
    if (!fund) {
      return res.status(400).json({ message: '基金代码不存在' });
    }

    const amountNum = toPositiveNumber(amount);
    const nextRunDate = calcNextRunDate(new Date(), frequency, dayOfWeek, dayOfMonth);
    const id = await InvestmentPlan.create({
      userId: req.user.id,
      fundCode,
      amount: amountNum,
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

    // 入参校验：仅校验传入字段（金额正数、频率白名单、日期字段范围）
    if (amount !== undefined && Number.isNaN(toPositiveNumber(amount))) {
      return res.status(400).json({ message: '定投金额必须为正数' });
    }
    if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ message: '无效的定投频率，可选: daily, weekly, biweekly, monthly' });
    }
    if (dayOfWeek != null && dayOfWeek !== '') {
      const n = Number(dayOfWeek);
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        return res.status(400).json({ message: 'dayOfWeek 必须为 1-7 的整数（1=周一）' });
      }
    }
    if (dayOfMonth != null && dayOfMonth !== '') {
      const n = Number(dayOfMonth);
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        return res.status(400).json({ message: 'dayOfMonth 必须为 1-31 的整数' });
      }
    }

    const data = {};
    if (amount !== undefined) data.amount = toPositiveNumber(amount);
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

  return normalizeDateStr(d);
}