const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const Fund = require('../models/fund');
const holdingService = require('../services/holdingService');
const fundService = require('../services/fundService');
const holidayService = require('../services/holidayService');
const dailyProfitService = require('../services/dailyProfitService');
const globalCache = require('../services/globalCache');
const UserSetting = require('../models/userSetting');
const { createLogger } = require('../utils/logger');
const { getLocalToday, normalizeDateStr } = require('../utils/date');

const logger = createLogger('HoldingController');

exports.list = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 自动结算 pending 交易订单（await 确保结算完成后再返回持仓，避免新购基金显示为 pending_purchase）
    await settlePendingAsync(userId);

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
          logger.info(`用户 ${userId} 日收益已自动更新: ${result.date}`);
        }
      })
      .catch(err => {
        logger.error(`日收益自动计算失败: ${err.message}`);
      });

    res.json(enrichedWithStatus);
  } catch (err) {
    next(err);
  }
};

/**
 * 结算优先查缓存：确认净值一旦公布即不可变，可安全复用缓存值。
 * ① history_{code}_3d_{today} 缓存（最近3天，含确认净值，由持仓 enrich 批量填充）
 * ② confirmed_nav_{code} 缓存（最新确认净值，由 resolveConfirmedNav 填充）
 * ③ 兜底：调用外部历史净值接口（仅该交易日单日查询；不写回 3d 缓存，避免污染多日数组）
 * 返回 { nav, source }，nav<=0 表示该日期净值尚未确认
 */
async function getSettleConfirmedNav(fundCode, navDate) {
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

  // ③ 兜底：外部拉取（真实请求，未命中后拉取并写回 confirmed_nav 缓存，下次命中不再重复拉取）
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
 * 异步结算 pending 交易订单
 * 在用户查看持仓时自动触发，不阻塞主流程
 */
async function settlePendingAsync(userId) {
  try {
    const pendingTransactions = await Transaction.findPendingByUserId(userId);
    if (!pendingTransactions.length) return;

    logger.info(`发现 ${pendingTransactions.length} 笔待结算订单，开始自动结算...`);

    // ★ 单笔结算逻辑封装为独立异步函数，便于并行执行（每批并发受控）
    const processTx = async (tx) => {
      try {
        const navDate = normalizeDateStr(tx.transaction_date);
        if (!navDate) return;

        const { nav: confirmedNav, source: navSource } = await getSettleConfirmedNav(tx.fund_code, navDate);
        logger.info(`[Settle] 检查交易 #${tx.id}: fund=${tx.fund_code}, type=${tx.type}, navDate=${navDate}, confirmedNav=${confirmedNav}, navSource=${navSource}, amount=${tx.amount}`);
        if (!confirmedNav) {
          logger.info(`[Settle] 跳过 #${tx.id}: NAV 未确认，下次继续`);
          return;
        }

        const holding = await Holding.findByUserAndFund(userId, tx.fund_code);

        if (tx.type === 'buy') {
          // 买入结算：用确认净值计算实际份额（扣除买入费率）
          // fee 字段存的是费率（0~1），pending 时直接存入
          const feeRate = parseFloat(tx.fee) || 0;
          const feeAmount = feeRate ? parseFloat(tx.amount) * feeRate : 0;
          const actualInvestment = parseFloat(tx.amount) - feeAmount;
          const actualShares = actualInvestment / confirmedNav;
          // 含费成本均价：总支付金额 / 实际份额
          const costPrice = actualShares > 0 ? parseFloat(tx.amount) / actualShares : confirmedNav;

          // ★ 先尝试更新交易状态（乐观锁），防止并发重复结算
          // updateToConfirmed 带 status='pending' 条件，返回 false 说明已被其他任务结算
          const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
            shares: actualShares,
            price: confirmedNav,
            amount: parseFloat(tx.amount)
          });
          if (!acquired) {
            // 已被其他任务结算，跳过持仓更新
            logger.info(`[Settle] 买入 #${tx.id} 已被其他任务结算（乐观锁未获取），跳过持仓更新`);
            return;
          }

          if (!holding) {
            // 无持仓（定投首笔等场景）→ 新建持仓
            await Holding.create({
              userId,
              fundCode: tx.fund_code,
              shares: actualShares,
              costPrice,
              totalCost: parseFloat(tx.amount)
            });
            logger.info(`[Settle] 买入 #${tx.id}: 新建持仓, shares=${actualShares.toFixed(2)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(2)}`);
          } else if (holding.confirmed_nav === null) {
            // 占位持仓（pending 购买创建）→ 替换为实际数据
            await Holding.update(holding.id, userId, {
              shares: actualShares,
              cost_price: costPrice,
              totalCost: parseFloat(tx.amount),
              confirmedNav: confirmedNav,
              confirmedNavDate: navDate,
              soldDate: null,
              totalReturn: 0
            });
            logger.info(`[Settle] 买入 #${tx.id}: 占位持仓替换(id=${holding.id}), shares=${actualShares.toFixed(2)}, nav=${confirmedNav}, costPrice=${costPrice.toFixed(4)}`);
          } else {
            // 已有持仓 → 加仓
            const currentShares = parseFloat(holding.shares) + actualShares;
            const currentTotalCost = parseFloat(holding.total_cost) + parseFloat(tx.amount);
            const currentCostPrice = currentShares ? currentTotalCost / currentShares : 0;

            await Holding.update(holding.id, userId, {
              shares: currentShares,
              cost_price: currentCostPrice,
              totalCost: currentTotalCost,
              soldDate: null,
              totalReturn: 0
            });
            logger.info(`[Settle] 买入 #${tx.id}: 加仓(holding.id=${holding.id}), addedShares=${actualShares.toFixed(2)}, totalShares=${currentShares.toFixed(2)}, nav=${confirmedNav}`);
          }

          logger.info(`自动结算买入: #${tx.id}, actualShares=${actualShares.toFixed(2)}, nav=${confirmedNav}, feeRate=${feeRate}, fee=${feeAmount.toFixed(2)}, holdingCreated=${!holding}`);
        } else if (tx.type === 'sell') {
          // 卖出结算：用确认净值计算实际金额，此时才扣减持仓份额和成本
          const sellShares = parseFloat(tx.shares);
          const actualAmount = sellShares * confirmedNav;
          // fee 字段存的是费率（pending 时直接存入），金额为 0 时用费率计算
          const feeRate = parseFloat(tx.fee) || 0;
          const feeAmount = feeRate ? actualAmount * feeRate : 0;
          const actualNetAmount = actualAmount - feeAmount;

          // ★ 先尝试更新交易状态（乐观锁），防止并发重复结算
          // updateToConfirmed 带 status='pending' 条件，返回 false 说明已被其他任务结算
          const acquired = await Transaction.updateToConfirmed(tx.id, userId, {
            shares: sellShares,
            price: confirmedNav,
            amount: actualNetAmount
          });
          if (!acquired) {
            // 已被其他任务结算，跳过持仓更新
            logger.info(`[Settle] 卖出 #${tx.id} 已被其他任务结算（乐观锁未获取），跳过持仓更新`);
            return;
          }

          // 结算时才扣减份额和成本
          const newShares = parseFloat(holding.shares) - sellShares;
          const oldTotalCost = parseFloat(holding.total_cost) || parseFloat(holding.shares) * parseFloat(holding.cost_price);
          const costPerShare = oldTotalCost / parseFloat(holding.shares);
          const newTotalCost = costPerShare * newShares;

          // 本次实现盈亏
          const realizedProfit = actualNetAmount - (costPerShare * sellShares);

          if (newShares <= 0) {
            // 全部卖出 → 保留持仓记录（shares=0），记录实现盈亏与清仓日期
            await Holding.update(holding.id, userId, {
              shares: 0,
              totalCost: 0,
              totalReturn: Math.round(realizedProfit * 100) / 100,
              soldDate: getLocalToday()
            });
          } else {
            // 部分卖出 → 累加 total_return
            await Holding.update(holding.id, userId, {
              shares: newShares,
              totalCost: Math.round(newTotalCost * 100) / 100,
              totalReturn: Math.round(((parseFloat(holding.total_return) || 0) + realizedProfit) * 100) / 100
            });
          }

          logger.info(`自动结算卖出: #${tx.id}, nav=${confirmedNav}, amount=${actualNetAmount.toFixed(2)}`);
        }
      } catch (err) {
        logger.error(`结算交易 #${tx.id} 失败: ${err.message}`);
      }
    };

    // ★ 分批并行结算：每批最多 3 笔并发，外部基金 API（getHistoryNetValues）并行但不无界，
    // 单笔失败由 processTx 内部 try/catch 兜底，Promise.allSettled 保证整批不因单笔失败中断
    const SETTLE_BATCH_SIZE = 3;
    for (let i = 0; i < pendingTransactions.length; i += SETTLE_BATCH_SIZE) {
      const chunk = pendingTransactions.slice(i, i + SETTLE_BATCH_SIZE);
      await Promise.allSettled(chunk.map(processTx));
    }
  } catch (err) {
    logger.error('自动结算失败:', err.message);
  }
}

/**
 * 根据购买日期和 after3pm 标志计算确认净值日期（委托 holidayService 支持节假日）
 * - after3pm=false → 当日净值（确保是交易日，否则顺延）
 * - after3pm=true  → 下一交易日净值
 * @param {string} purchaseDate YYYY-MM-DD
 * @param {boolean} after3pm 是否 15:00 后
 * @returns {Promise<string>} YYYY-MM-DD 格式的 NAV 日期
 */
async function computeNavDate(purchaseDate, after3pm) {
  if (after3pm) {
    const nextDay = await holidayService.nextTradingDay(purchaseDate);
    return nextDay;
  }
  return await holidayService.ensureTradingDay(purchaseDate);
}

exports.create = async (req, res, next) => {
  try {
    const { fundCode, amount, totalReturn, groupId } = req.body;
    logger.info(`开始添加持仓: fund=${fundCode}, amount=${amount}, totalReturn=${totalReturn}`);
    
    const fund = await Fund.findByCode(fundCode);
    if (!fund) {
      logger.warn(`基金不存在: ${fundCode}`);
      return res.status(400).json({ message: '基金代码不存在' });
    }

    const existing = await Holding.findByUserAndFund(req.user.id, fundCode);
    if (existing && parseFloat(existing.shares) > 0) {
      logger.warn(`基金已在持仓中: ${fundCode}`);
      return res.status(400).json({ message: '该基金已在持仓中' });
    }

    let netValue = 0;
    let netValueSource = 'unknown';
    let confirmedNavDate = null;
    
    try {
      const today = getLocalToday();
      const thirtyDaysAgo = normalizeDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const historyCacheKey = `history_${fundCode}_30d_${today}`;
      
      try {
        const recentHistory = await globalCache.getOrFetch(
          historyCacheKey,
          () => fundService.getHistoryNetValues(fundCode, thirtyDaysAgo, today),
          { type: 'history_older' } // 远期历史净值缓存，72h TTL
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
            logger.info(`使用确认净值: ${netValue} (${latestConfirmed.date})`);
          }
        }
      } catch (e) {
        logger.warn(`获取历史净值失败: ${e.message}`);
      }
      
      if (netValue <= 0) {
        const realtimeCacheKey = `realtime_${fundCode}_auto`; // 基金实时估值缓存，auto=自动选择数据源
        try {
          const realTime = await globalCache.getOrFetch(
            realtimeCacheKey,
            () => fundService.getRealTimeValue(fundCode),
            { type: 'realtime' }
          );
          if (realTime && realTime.netValue > 0) {
            netValue = realTime.netValue;
            netValueSource = 'realtime';
            logger.info(`无确认净值，使用实时估值: ${netValue}`);
          }
        } catch (e) {
          logger.warn(`获取实时估值也失败: ${e.message}`);
        }
      }
    } catch (error) {
      logger.error(`获取净值失败: ${error.message}`);
    }

    if (netValue <= 0) {
      logger.error(`无法获取有效净值: source=${netValueSource}, value=${netValue}`);
      return res.status(400).json({ 
        message: '无法获取有效的基金净值，请稍后重试',
        details: `净值来源: ${netValueSource}, 净值: ${netValue}`
      });
    }

    const currentValue = amount;
    const shares = currentValue / netValue;
    const totalCost = amount - (totalReturn || 0);
    const costPrice = shares > 0 ? totalCost / shares : 0;

    logger.info(`计算结果: shares=${shares.toFixed(2)}, costPrice=${costPrice.toFixed(4)}, totalCost=${totalCost}, netValue=${netValue}`);

    if (existing) {
      // 已清仓基金重新添加 → 更新现有持仓（避免违反 uk_user_fund 唯一约束）
      await Holding.update(existing.id, req.user.id, {
        shares,
        costPrice,
        totalCost,
        confirmedNav: netValue,
        confirmedNavDate: confirmedNavDate || null,
        soldDate: null,
        totalReturn: 0
      });
      logger.info(`已清仓基金重新添加: id=${existing.id}, fund=${fundCode}`);

      // 生成交易记录（与新建一致）
      if (!totalReturn) {
        await Transaction.create({
          userId: req.user.id,
          fundCode,
          type: 'buy',
          shares,
          price: netValue,
          amount,
          fee: 0,
          transactionDate: confirmedNavDate || getLocalToday(),
          metadata: JSON.stringify({ netValueSource })
        });
      }

      return res.json({ id: existing.id, message: '添加成功' });
    }

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

    logger.info(`持仓创建成功: id=${id}, fund=${fundCode}`);

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
        transactionDate: confirmedNavDate || getLocalToday(),
        metadata: JSON.stringify({ netValueSource })
      });
    }

    res.json({ id, message: '添加成功' });
  } catch (err) {
    logger.error(`创建持仓异常: ${err.message}`);
    next(err);
  }
};

/**
 * 新购基金（支持指定购买日期和时间，15:00 为分界）
 * POST /holdings/purchase
 * body: { fundCode, amount, purchaseDate, purchaseTime, groupId }
 *
 * 核心逻辑：
 * 1. 根据 purchaseDate/purchaseTime 计算 NAV 日期（15:00 分界 + 跳过周末）
 * 2. 按 NAV 日期查询确认净值：
 *    - 有确认净值 → confirmed 流程（新建/替换占位/加仓）
 *    - 无确认净值且 NAV 日期 >= 今天 → pending 流程（创建占位持仓 + pending 交易）
 *    - 无确认净值且 NAV 日期 < 今天 → 400（数据异常）
 */
exports.purchase = async (req, res, next) => {
  try {
    const { fundCode, amount, purchaseDate, after3pm, feeRate, groupId } = req.body;
    const userId = req.user.id;

    // 1. 参数校验
    if (!fundCode) {
      return res.status(400).json({ message: '基金代码不能为空' });
    }
    const fund = await Fund.findByCode(fundCode);
    if (!fund) {
      return res.status(400).json({ message: '基金代码不存在' });
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ message: '购买金额必须大于0' });
    }
    if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return res.status(400).json({ message: '购买日期格式不正确，应为 YYYY-MM-DD' });
    }

    // 今天日期（本地时间，与交易时段判断保持一致）
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (purchaseDate > todayStr) {
      return res.status(400).json({ message: '购买日期不能晚于今天' });
    }

    // 买入费率（0~1，如 0.015 表示 1.5%），存费率而非金额（与卖出一致）
    const fee = parseFloat(feeRate) || 0;

    // 2. 确定 NAV 日期（after3pm 分界，委托 holidayService 支持节假日）
    const navDate = await computeNavDate(purchaseDate, after3pm);
    logger.info(`新购基金: fund=${fundCode}, amount=${amt}, purchaseDate=${purchaseDate}, after3pm=${!!after3pm}, feeRate=${fee}, navDate=${navDate}`);

    // 3. 按 NAV 日期获取确认净值（与加仓逻辑一致，直接查询不缓存空结果）
    let confirmedNav = 0;
    try {
      const history = await fundService.getHistoryNetValues(fundCode, navDate, navDate);
      if (history && history.length > 0 && parseFloat(history[0].nav) > 0) {
        confirmedNav = parseFloat(history[0].nav);
      }
    } catch (e) {
      logger.warn(`获取确认净值失败: ${e.message}`);
    }

    logger.info(`[Purchase] NAV查询: fund=${fundCode}, navDate=${navDate}, confirmedNav=${confirmedNav}, 分支=${confirmedNav > 0 ? 'confirmed' : 'pending'}`);

    const round2 = (v) => Math.round(v * 100) / 100;

    // 4. 分支处理
    if (confirmedNav > 0) {
      // === confirmed 流程：NAV 日期 <= 今天且有确认净值 ===
      // 扣除买入费率后的实际投资额
      const feeAmount = fee ? amt * fee : 0;
      const actualInvestment = amt - feeAmount;
      const shares = actualInvestment / confirmedNav;
      const costPrice = shares > 0 ? amt / shares : confirmedNav; // 含费成本均价
      const existing = await Holding.findByUserAndFund(userId, fundCode);

      if (!existing) {
        // 无持仓 → 新建
        const id = await Holding.create({
          userId, fundCode, shares, costPrice, groupId,
          confirmedNav, confirmedNavDate: navDate, totalCost: amt
        });
        await Transaction.create({
          userId, fundCode, type: 'buy', shares, price: confirmedNav, amount: amt,
          fee, transactionDate: navDate, status: 'confirmed'
        });
        logger.info(`新购确认(新建持仓): id=${id}, shares=${shares.toFixed(2)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(2)}, navDate=${navDate}`);
        return res.json({ status: 'confirmed', id, shares: round2(shares), nav: confirmedNav, navDate });
      }

      if (existing.confirmed_nav === null) {
        // 占位持仓 → 替换为实际数据
        await Holding.update(existing.id, userId, {
          shares,
          cost_price: costPrice,
          totalCost: amt,
          confirmedNav: confirmedNav,
          confirmedNavDate: navDate,
          soldDate: null,
          totalReturn: 0
        });
        await Transaction.create({
          userId, fundCode, type: 'buy', shares, price: confirmedNav, amount: amt,
          fee, transactionDate: navDate, status: 'confirmed'
        });
        logger.info(`新购确认(替换占位持仓): id=${existing.id}, shares=${shares.toFixed(2)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(2)}, navDate=${navDate}`);
        return res.json({ status: 'confirmed', id: existing.id, shares: round2(shares), nav: confirmedNav, navDate });
      }

      // 已有确认持仓 → 加仓：累加份额、重算均价、清零 sold_date
      const currentShares = parseFloat(existing.shares) + shares;
      const currentTotalCost = parseFloat(existing.total_cost) + amt;
      const currentCostPrice = currentShares ? currentTotalCost / currentShares : 0;
      await Holding.update(existing.id, userId, {
        shares: currentShares,
        cost_price: currentCostPrice,
        totalCost: currentTotalCost,
        soldDate: null,
        totalReturn: 0
      });
      await Transaction.create({
        userId, fundCode, type: 'buy', shares, price: confirmedNav, amount: amt,
        fee, transactionDate: navDate, status: 'confirmed'
      });
      logger.info(`新购确认(加仓): id=${existing.id}, addedShares=${shares.toFixed(2)}, totalShares=${currentShares.toFixed(2)}, nav=${confirmedNav}, fee=${feeAmount.toFixed(2)}, navDate=${navDate}`);
      return res.json({ status: 'confirmed', id: existing.id, shares: round2(currentShares), nav: confirmedNav, navDate });
    }

    // 无确认净值
    if (navDate < todayStr) {
      // NAV 日期 < 今天但无确认净值 → 数据异常
      return res.status(400).json({ message: '无法获取该日期的基金净值，请确认日期是否正确' });
    }

    // === pending 流程：navDate >= 今天但无确认净值 ===
    // 创建 pending 交易 + 占位持仓（confirmed_nav=NULL），持仓界面立即可见
    const existing = await Holding.findByUserAndFund(userId, fundCode);
    if (!existing) {
      await Holding.create({
        userId, fundCode, shares: 0, costPrice: 0, groupId,
        confirmedNav: null, confirmedNavDate: null, totalCost: amt
      });
      logger.info(`[Purchase] 占位持仓已创建: fund=${fundCode}, amount=${amt}, navDate=${navDate}`);
    } else {
      logger.info(`[Purchase] 持仓已存在(id=${existing.id})，跳过占位创建: fund=${fundCode}`);
    }
    await Transaction.create({
      userId, fundCode, type: 'buy', shares: 0, price: 0, amount: amt,
      fee, transactionDate: navDate, status: 'pending'
    });

    logger.info(`新购pending: fund=${fundCode}, amount=${amt}, navDate=${navDate}, feeRate=${fee}`);
    return res.json({ status: 'pending', message: '购买订单已提交，等待净值确认后自动入库' });
  } catch (err) {
    logger.error(`新购基金异常: ${err.message}`);
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