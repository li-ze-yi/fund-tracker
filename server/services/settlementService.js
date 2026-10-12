const Transaction = require('../models/transaction');
const Holding = require('../models/holding');
const fundService = require('./fundService');
const globalCache = require('./globalCache');
const pool = require('../config/database');
const { createLogger } = require('../utils/logger');
const { getLocalToday } = require('../utils/date');

const logger = createLogger('Settlement');

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * 在单个 DB 事务中执行 fn（传入事务连接）。
 * 结算路径必须原子：交易状态更新与持仓更新要么同时生效、要么同时回滚，
 * 避免中途崩溃产生"交易已确认但持仓未变"的永久不一致。
 * 注意：事务内直接用 conn.query，不走 pool 的自动重试（重试非幂等语句会造成双倍落账）。
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<*>} fn
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch { /* 回滚失败仅记录原始错误 */ }
    throw err;
  } finally {
    conn.release();
  }
}

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
 * @param {import('mysql2/promise').PoolConnection|null} conn 事务连接（传入时持仓读取带 FOR UPDATE 行锁）
 * @returns {{ holdingCreated: boolean, holdingId: number|null, finalShares: number }}
 */
async function applyBuyHolding({ userId, fundCode, shares, costPrice, totalCost, confirmedNav, navDate, groupId }, conn = null) {
  const holding = await Holding.findByUserAndFund(userId, fundCode, conn);

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
    }, conn);
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
    }, conn);
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
  }, conn);
  return { holdingCreated: false, holdingId: holding.id, finalShares: currentShares };
}

/**
 * 应用卖出持仓变更（全部 / 部分卖出）
 * - 全部卖出（newShares <= 0）→ 保留持仓记录（shares=0），记录实现盈亏与清仓日期
 * - 部分卖出 → 扣减份额与成本，累加 total_return
 * @param {import('mysql2/promise').PoolConnection|null} conn 事务连接（传入时持仓读取带 FOR UPDATE 行锁）
 * @returns {{ fullSell: boolean, realizedProfit: number, holdingMissing?: boolean }}
 */
async function applySellHolding({ userId, fundCode, sellShares, netAmount }, conn = null) {
  const holding = await Holding.findByUserAndFund(userId, fundCode, conn);
  // 空持仓守卫：卖出结算时持仓可能已被删除，直接跳过持仓更新（交易仍确认）
  if (!holding) {
    logger.warn(`卖出结算无持仓记录，跳过持仓更新: userId=${userId}, fund=${fundCode}, sellShares=${sellShares}`);
    return { fullSell: false, realizedProfit: 0, holdingMissing: true };
  }
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
    }, conn);
  } else {
    await Holding.update(holding.id, userId, {
      shares: newShares,
      totalCost: round2(newTotalCost),
      totalReturn: round2((parseFloat(holding.total_return) || 0) + realizedProfit)
    }, conn);
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
 * @param {object} [options] 可选配置
 * @param {boolean} [options.skipCacheWrite=false] 为 true 时不写回 confirmed_nav 缓存。
 *   新购基金（holdingController.purchase）入口使用：用户可任选历史日期，避免买入日历史净值污染「最新确认净值」缓存。
 * @returns {Promise<{ nav: number, source: 'cache_3d'|'cache_confirmed_nav'|'api' }>} nav<=0 表示该日期净值尚未确认
 */
async function getConfirmedNavByDate(fundCode, navDate, options = {}) {
  const today = getLocalToday();

  // ① 3d 历史缓存（含确认净值）
  const histCache = await globalCache.checkCache(`history_${fundCode}_3d_${today}`, 'history_recent');
  if (histCache.hit && Array.isArray(histCache.data)) {
    const hit = histCache.data.find(r => r && r.date === navDate && parseFloat(r.nav) > 0);
    if (hit) return { nav: parseFloat(hit.nav), source: 'cache_3d' };
  }

  // ② 最新确认净值缓存
  const navCache = await globalCache.checkCache(`confirmed_nav_${fundCode}`, 'history_recent');
  if (navCache.hit && navCache.data && navCache.data.date === navDate && parseFloat(navCache.data.nav) > 0) {
    return { nav: parseFloat(navCache.data.nav), source: 'cache_confirmed_nav' };
  }

  // ③ 兜底：外部拉取（真实请求，拉取后写回 confirmed_nav 缓存，下次命中不再重复拉取）
  const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
  const nav = history && history.length ? parseFloat(history[0].nav) || 0 : 0;
  if (nav > 0 && history.length) {
    const newDate = history[0].date || navDate;
    // 仅当缓存中无更新净值时写回，避免旧交易日的净值覆盖较新的已确认净值
    const existing = await globalCache.peekCache(`confirmed_nav_${fundCode}`, 'history_recent');
    if (!existing.hit || !existing.data || !existing.data.date || existing.data.date <= newDate) {
      // ★ 新购基金（skipCacheWrite=true）不写回：用户可任选历史日期，拉到的可能是买入日历史净值，
      // 写入「最新确认净值」缓存会把市值钉在买入日 → 累计收益≈0。其他结算场景（当天/近期日期）保持写回。
      if (!options.skipCacheWrite) {
        globalCache.set(`confirmed_nav_${fundCode}`, { nav, date: newDate, source: 'api' }, 'history_recent');
      }
    }
  }
  return { nav, source: 'api' };
}

/**
 * 结算单笔 pending 交易（DB 事务 + 乐观锁防并发重复结算）
 * - 买入：actualShares = (amount - fee) / nav，三分支
 * - 卖出：netAmount = shares * nav - fee，扣减份额成本，记录盈亏
 * 事务内执行顺序（关键）：先 updateToConfirmed 抢占交易行状态锁，
 * 并发结算者命中 0 行 → already_settled 回滚，不会双重加仓；
 * 交易状态与持仓变更同事务提交，中途崩溃整体回滚保持一致。
 * @returns {Promise<{ outcome: 'settled' | 'already_settled' | 'unknown_type' }>}
 */
async function settleTransaction({ userId, tx, confirmedNav, navDate }) {
  if (tx.type === 'buy') {
    const amount = parseFloat(tx.amount);
    const feeRate = parseFloat(tx.fee) || 0;
    const { feeAmount, actualShares, costPrice } = computeBuySettlement(amount, feeRate, confirmedNav);

    const applied = await withTransaction(async (conn) => {
      const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
        shares: actualShares,
        price: confirmedNav,
        amount
      }, conn);
      if (!acquired) return { outcome: 'already_settled' };

      const result = await applyBuyHolding({
        userId,
        fundCode: tx.fund_code,
        shares: actualShares,
        costPrice,
        totalCost: amount,
        confirmedNav,
        navDate
      }, conn);
      result.outcome = 'settled';
      return result;
    });

    if (applied.outcome === 'settled') {
      logger.info(`买入结算 #${tx.id}: shares=${actualShares.toFixed(4)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(4)}, holdingCreated=${applied.holdingCreated}`);
    }
    return applied;
  }

  if (tx.type === 'sell') {
    const sellShares = parseFloat(tx.shares);
    const feeRate = parseFloat(tx.fee) || 0;
    const { netAmount } = computeSellSettlement(sellShares, feeRate, confirmedNav);

    const applied = await withTransaction(async (conn) => {
      const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
        shares: sellShares,
        price: confirmedNav,
        amount: netAmount
      }, conn);
      if (!acquired) return { outcome: 'already_settled' };

      const result = await applySellHolding({ userId, fundCode: tx.fund_code, sellShares, netAmount }, conn);
      result.outcome = 'settled';
      return result;
    });

    if (applied.outcome === 'settled') {
      logger.info(`卖出结算 #${tx.id}: netAmount=${netAmount.toFixed(2)}, nav=${confirmedNav}`);
    }
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