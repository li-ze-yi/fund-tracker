const Transaction = require('../models/transaction');
const Holding = require('../models/holding');
const fundService = require('./fundService');
const globalCache = require('./globalCache');
const { createLogger } = require('../utils/logger');
const { getLocalToday } = require('../utils/date');

const logger = createLogger('Settlement');

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * 计算买入结算：费用、实际份额、含费成本均价
 * @param {number} amount 支付总金额
 * @param {number} feeRate 费率（0~1，如 0.015 表示 1.5%）
 * @param {number} nav 确认净值
 * @returns {{ feeAmount: number, actualShares: number, costPrice: number }}
 */
function computeBuySettlement(amount, feeRate, nav) {
  const feeAmount = feeRate ? amount * feeRate : 0;
  const actualInvestment = amount - feeAmount;
  const actualShares = actualInvestment / nav;
  const costPrice = actualShares > 0 ? amount / actualShares : nav;
  return { feeAmount, actualShares, costPrice };
}

/**
 * 计算卖出结算：毛额、费用、净额
 * @param {number} sellShares 卖出份额
 * @param {number} feeRate 费率（0~1）
 * @param {number} nav 确认净值
 * @returns {{ grossAmount: number, feeAmount: number, netAmount: number }}
 */
function computeSellSettlement(sellShares, feeRate, nav) {
  const grossAmount = sellShares * nav;
  const feeAmount = feeRate ? grossAmount * feeRate : 0;
  const netAmount = grossAmount - feeAmount;
  return { grossAmount, feeAmount, netAmount };
}

/**
 * 金额 → 份额 → 成本反算（手动添加/编辑持仓用，非交易结算）
 * @param {number} amount 当前市值（投入金额）
 * @param {number} totalReturn 累计收益
 * @param {number} netValue 净值
 * @returns {{ shares: number, totalCost: number, costPrice: number }}
 */
function computeSharesAndCost(amount, totalReturn, netValue) {
  const shares = amount / netValue;
  const totalCost = amount - (totalReturn || 0);
  const costPrice = shares > 0 ? totalCost / shares : 0;
  return { shares, totalCost, costPrice };
}

/**
 * 应用买入持仓变更（三分支：新建 / 占位替换 / 加仓）
 * - 无持仓 → 新建（记录确认净值与日期）
 * - 占位持仓（confirmed_nav 为 null，totalCost 已预写）→ 替换为实际数据（不累加，避免 totalCost 翻倍）
 * - 已有确认持仓 → 加仓（累加份额与成本，重算均价，清零 sold_date）
 * @returns {{ holdingCreated: boolean, holdingId: number|null, finalShares: number }}
 */
async function applyBuyHolding({ userId, fundCode, shares, costPrice, totalCost, confirmedNav, navDate, groupId }) {
  const holding = await Holding.findByUserAndFund(userId, fundCode);

  if (!holding) {
    const id = await Holding.create({
      userId,
      fundCode,
      shares,
      costPrice,
      groupId,
      confirmedNav,
      confirmedNavDate: navDate,
      totalCost
    });
    return { holdingCreated: true, holdingId: id, finalShares: shares };
  }

  if (holding.confirmed_nav === null) {
    await Holding.update(holding.id, userId, {
      shares,
      cost_price: costPrice,
      totalCost,
      confirmedNav,
      confirmedNavDate: navDate,
      soldDate: null,
      totalReturn: 0
    });
    return { holdingCreated: false, holdingId: holding.id, finalShares: shares };
  }

  const currentShares = parseFloat(holding.shares) + shares;
  const currentTotalCost = parseFloat(holding.total_cost) + totalCost;
  const currentCostPrice = currentShares ? currentTotalCost / currentShares : 0;
  await Holding.update(holding.id, userId, {
    shares: currentShares,
    cost_price: currentCostPrice,
    totalCost: currentTotalCost,
    soldDate: null,
    totalReturn: 0
  });
  return { holdingCreated: false, holdingId: holding.id, finalShares: currentShares };
}

/**
 * 应用卖出持仓变更（全部 / 部分卖出）
 * - 全部卖出（newShares <= 0）→ 保留持仓记录（shares=0），记录实现盈亏与清仓日期
 * - 部分卖出 → 扣减份额与成本，累加 total_return
 * @returns {{ fullSell: boolean, realizedProfit: number }}
 */
async function applySellHolding({ userId, fundCode, sellShares, netAmount }) {
  const holding = await Holding.findByUserAndFund(userId, fundCode);
  const oldShares = parseFloat(holding.shares);
  const newShares = oldShares - sellShares;
  const oldTotalCost = parseFloat(holding.total_cost) || oldShares * parseFloat(holding.cost_price);
  const costPerShare = oldTotalCost / oldShares;
  const newTotalCost = costPerShare * newShares;
  const realizedProfit = netAmount - (costPerShare * sellShares);

  if (newShares <= 0) {
    await Holding.update(holding.id, userId, {
      shares: 0,
      totalCost: 0,
      totalReturn: round2(realizedProfit),
      soldDate: getLocalToday()
    });
  } else {
    await Holding.update(holding.id, userId, {
      shares: newShares,
      totalCost: round2(newTotalCost),
      totalReturn: round2((parseFloat(holding.total_return) || 0) + realizedProfit)
    });
  }

  return { fullSell: newShares <= 0, realizedProfit };
}

/**
 * 解析指定交易日的确认净值（结算场景专用，缓存优先 + 精确日期匹配）
 * 确认净值一旦公布即不可变，可安全复用缓存值：
 *   ① history_{code}_3d_{today} 缓存（最近 3 天数组，按 navDate 精确匹配）
 *   ② confirmed_nav_{code} 缓存（最新确认净值，仅当 date === navDate 时命中）
 *   ③ 兜底：外部历史净值接口（单日精确查询；回写 confirmed_nav 缓存）
 * @param {string} fundCode 基金代码
 * @param {string} navDate 目标成交/确认日期（YYYY-MM-DD）
 * @returns {Promise<{ nav: number, source: 'cache_3d'|'cache_confirmed_nav'|'api' }>} nav<=0 表示该日期净值尚未确认
 */
async function getConfirmedNavByDate(fundCode, navDate) {
  const today = getLocalToday();

  // ① 3d 历史缓存（含确认净值）
  const histCache = globalCache.checkCache(`history_${fundCode}_3d_${today}`, 'history_recent');
  if (histCache.hit && Array.isArray(histCache.data)) {
    const hit = histCache.data.find(r => r && r.date === navDate && parseFloat(r.nav) > 0);
    if (hit) return { nav: parseFloat(hit.nav), source: 'cache_3d' };
  }

  // ② 最新确认净值缓存
  const navCache = globalCache.checkCache(`confirmed_nav_${fundCode}`, 'history_recent');
  if (navCache.hit && navCache.data && navCache.data.date === navDate && parseFloat(navCache.data.nav) > 0) {
    return { nav: parseFloat(navCache.data.nav), source: 'cache_confirmed_nav' };
  }

  // ③ 兜底：外部拉取（真实请求，拉取后写回 confirmed_nav 缓存，下次命中不再重复拉取）
  const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
  const nav = history && history.length ? parseFloat(history[0].nav) || 0 : 0;
  if (nav > 0 && history.length) {
    const newDate = history[0].date || navDate;
    // 仅当缓存中无更新净值时写回，避免旧交易日的净值覆盖较新的已确认净值
    const existing = globalCache.peekCache(`confirmed_nav_${fundCode}`, 'history_recent');
    if (!existing.hit || !existing.data || !existing.data.date || existing.data.date <= newDate) {
      globalCache.set(`confirmed_nav_${fundCode}`, { nav, date: newDate, source: 'api' }, 'history_recent');
    }
  }
  return { nav, source: 'api' };
}

/**
 * 结算单笔 pending 交易（乐观锁防并发重复结算）
 * - 买入：actualShares = (amount - fee) / nav，三分支
 * - 卖出：netAmount = shares * nav - fee，扣减份额成本，记录盈亏
 * updateToConfirmed 仅在 status='pending' 时生效；返回 already_settled 表示已被其他任务结算
 * @returns {Promise<{ outcome: 'settled' | 'already_settled' | 'unknown_type' }>}
 */
async function settleTransaction({ userId, tx, confirmedNav, navDate }) {
  if (tx.type === 'buy') {
    const amount = parseFloat(tx.amount);
    const feeRate = parseFloat(tx.fee) || 0;
    const { feeAmount, actualShares, costPrice } = computeBuySettlement(amount, feeRate, confirmedNav);

    const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
      shares: actualShares,
      price: confirmedNav,
      amount
    });
    if (!acquired) return { outcome: 'already_settled' };

    const applied = await applyBuyHolding({
      userId,
      fundCode: tx.fund_code,
      shares: actualShares,
      costPrice,
      totalCost: amount,
      confirmedNav,
      navDate
    });

    logger.info(`买入结算 #${tx.id}: shares=${actualShares.toFixed(4)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(4)}, holdingCreated=${applied.holdingCreated}`);
    applied.outcome = 'settled';
    return applied;
  }

  if (tx.type === 'sell') {
    const sellShares = parseFloat(tx.shares);
    const feeRate = parseFloat(tx.fee) || 0;
    const { netAmount } = computeSellSettlement(sellShares, feeRate, confirmedNav);

    const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
      shares: sellShares,
      price: confirmedNav,
      amount: netAmount
    });
    if (!acquired) return { outcome: 'already_settled' };

    const applied = await applySellHolding({ userId, fundCode: tx.fund_code, sellShares, netAmount });

    logger.info(`卖出结算 #${tx.id}: netAmount=${netAmount.toFixed(2)}, nav=${confirmedNav}`);
    applied.outcome = 'settled';
    return applied;
  }

  return { outcome: 'unknown_type' };
}

module.exports = {
  computeBuySettlement,
  computeSellSettlement,
  computeSharesAndCost,
  applyBuyHolding,
  applySellHolding,
  getConfirmedNavByDate,
  settleTransaction
};