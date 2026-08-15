const InvestmentPlan = require('../models/investmentPlan');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('./fundService');
const globalCache = require('./globalCache');
const pool = require('../config/database');
const holidayService = require('./holidayService');
const { getLocalToday, normalizeDateStr } = require('../utils/date');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PlanService');

async function executeDuePlans() {
  const startTime = Date.now();
  const today = getLocalToday();
  logger.info(`===== 定投计划调度开始 | 日期: ${today} | 时间: ${new Date().toLocaleString('zh-CN')} =====`);

  const plans = await InvestmentPlan.findActiveDueToday();
  logger.info(`查询到 ${plans.length} 个到期定投计划 (status=active AND next_run_date<=${today})`);

  if (plans.length === 0) {
    logger.info('无到期计划，跳过执行');
    logger.info('===== 定投计划调度结束 (无任务) =====');
    return { success: 0, skipped: 0, failed: 0, pending: 0 };
  }

  // 打印所有到期计划摘要
  plans.forEach((p, i) => {
    logger.info(`  ${i + 1}. Plan#${p.id} | user=${p.user_id} | fund=${p.fund_code} | freq=${p.frequency} | amount=¥${p.amount} | dayOfWeek=${p.day_of_week ?? '-'} | dayOfMonth=${p.day_of_month ?? '-'} | nextRun=${p.next_run_date}`);
  });

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let pendingCount = 0;

  for (const plan of plans) {
    try {
      // MySQL Decimal 类型返回字符串，必须 parseFloat 避免 + 运算时字符串拼接导致 NaN
      const planAmount = parseFloat(plan.amount);
      const planDayOfWeek = plan.day_of_week != null ? parseInt(plan.day_of_week) : null;
      const planDayOfMonth = plan.day_of_month != null ? parseInt(plan.day_of_month) : null;

      logger.info(`──▶ 开始处理 Plan#${plan.id} (user=${plan.user_id}, fund=${plan.fund_code}, freq=${plan.frequency}, amount=¥${planAmount})`);

      // ★ 防重复执行：检查今天是否已有该计划的已确认自动定投交易记录
      // 注意：pending 状态的交易不算重复，可能是上次净值未确认时创建的
      const [existingTx] = await pool.query(
        `SELECT id, status FROM transactions
         WHERE user_id = ? AND fund_code = ? AND type = 'buy' AND transaction_date = ?
         AND note = ?
         LIMIT 1`,
        [plan.user_id, plan.fund_code, today, `auto_plan:${plan.id}`]
      );
      if (existingTx && existingTx.length > 0) {
        if (existingTx[0].status === 'confirmed') {
          // 已确认的交易 → 真正重复，跳过
          logger.info(`[Plan#${plan.id}] 今日已有已确认的定投交易记录(id=${existingTx[0].id})，跳过防重复`);
          const nextDate = await calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
          await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });
          logger.info(`[Plan#${plan.id}] 下次执行日期已更新: ${nextDate}`);
          skipCount++;
          continue;
        } else {
          // pending 交易 → 上次净值未确认创建的，尝试结算
          logger.info(`[Plan#${plan.id}] 今日有 pending 定投交易(id=${existingTx[0].id})，尝试结算`);
          try {
            const history = await globalCache.getOrFetch(
              `history_${plan.fund_code}_1d_${today}`, // 定投结算历史净值缓存（eastmoney/lsjz）
              () => fundService.getHistoryNetValues(plan.fund_code, today, today),
              { type: 'history_recent' } // 近期历史净值缓存
            );
            const confirmedNav = history && history.length > 0
              ? (parseFloat(history[0].netValue) || parseFloat(history[0].nav) || 0)
              : 0;

            if (confirmedNav > 0) {
              // 净值已确认 → 结算 pending 交易
              const actualShares = Math.round((planAmount / confirmedNav) * 10000) / 10000;
              logger.info(`[Plan#${plan.id}] pending 结算计算: amount=¥${planAmount}, nav=${confirmedNav}, actualShares=${actualShares.toFixed(4)}`);

              // 更新持仓
              const holding = await Holding.findByUserAndFund(plan.user_id, plan.fund_code);
              if (holding) {
                const oldShares = parseFloat(holding.shares);
                const oldCostPrice = parseFloat(holding.cost_price);
                const totalShares = oldShares + actualShares;
                const newCostPrice = totalShares ? (oldShares * oldCostPrice + planAmount) / totalShares : 0;
                logger.info(`[Plan#${plan.id}] pending 结算加仓: oldShares=${oldShares.toFixed(4)}, newShares=${totalShares.toFixed(4)}, oldCost=${oldCostPrice.toFixed(4)}, newCost=${newCostPrice.toFixed(4)}`);
                await Holding.update(holding.id, plan.user_id, {
                  shares: totalShares,
                  cost_price: Math.round(newCostPrice * 10000) / 10000
                });
              } else {
                logger.info(`[Plan#${plan.id}] pending 结算新建持仓: shares=${actualShares.toFixed(4)}, costPrice=${confirmedNav}, totalCost=${planAmount}`);
                await Holding.create({
                  userId: plan.user_id,
                  fundCode: plan.fund_code,
                  shares: actualShares,
                  costPrice: confirmedNav,
                  totalCost: planAmount
                });
              }

              // 更新交易为 confirmed
              await Transaction.updateToConfirmed(existingTx[0].id, plan.user_id, {
                shares: actualShares,
                price: confirmedNav,
                amount: planAmount
              });

              logger.info(`[Plan#${plan.id}] pending 交易已结算: txId=${existingTx[0].id}, actualShares=${actualShares.toFixed(4)}, nav=${confirmedNav}`);
            } else {
              logger.info(`[Plan#${plan.id}] 净值仍未确认 (today=${today})，pending 交易继续等待`);
            }
          } catch (e) {
            logger.error(`[Plan#${plan.id}] 结算 pending 交易失败: ${e.message}`, e.stack);
          }

          // 无论是否结算成功，都更新 next_run_date
          const nextDate = await calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
          await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });
          logger.info(`[Plan#${plan.id}] 下次执行日期已更新: ${nextDate}`);
          continue;
        }
      }

      let netValue = 0;
      let netValueSource = 'unknown';

      try {
        // ★ 核心策略：优先使用今日确认净值
        logger.info(`[Plan#${plan.id}] 查询今日(${today})确认净值...`);
        const history = await globalCache.getOrFetch(
          `history_${plan.fund_code}_1d_${today}`, // 定投结算历史净值缓存（eastmoney/lsjz）
          () => fundService.getHistoryNetValues(plan.fund_code, today, today),
          { type: 'history_recent' } // 近期历史净值缓存
        );

        if (history && history.length > 0) {
          // 今日确认净值已发布 → 使用它
          netValue = parseFloat(history[0].netValue) || parseFloat(history[0].nav) || 0;
          netValueSource = `confirmed(${today})`;
          logger.info(`[Plan#${plan.id}] 今日确认净值已发布: nav=${netValue}`);
        } else {
          // 今日确认净值未发布 → 判断是否为交易日
          logger.info(`[Plan#${plan.id}] 今日确认净值尚未发布，判断是否为交易日...`);

          // 获取实时估值：有实时估值说明是交易日（盘中或收盘后），可以创建 pending
          let isTradingDay = false;
          try {
            const realTime = await fundService.getRealTimeValue(plan.fund_code);
            if (realTime && realTime.netValue > 0) {
              isTradingDay = true; // 有实时估值 → 交易日
              logger.info(`[Plan#${plan.id}] 实时估值可用 (netValue=${realTime.netValue})，判定为交易日`);
            } else {
              logger.info(`[Plan#${plan.id}] 实时估值不可用，判定为非交易日`);
            }
          } catch (e) {
            logger.warn(`[Plan#${plan.id}] 实时估值获取失败: ${e.message}`);
          }

          if (!isTradingDay) {
            // 无实时估值 → 非交易日（周末/节假日），不创建 pending，等待下次调度
            logger.info(`[Plan#${plan.id}] 非交易日（无实时估值），跳过不创建 pending，等待下次调度`);
            // 不更新 next_run_date，下次调度会再次拾取
            pendingCount++;
            continue;
          }

          // 创建 pending 交易记录，只记录金额，等净值确认后结算时再计算份额
          await Transaction.create({
            userId: plan.user_id,
            fundCode: plan.fund_code,
            type: 'buy',
            shares: 0,
            price: 0,
            amount: planAmount,
            fee: 0,
            transactionDate: today,
            note: `auto_plan:${plan.id}`,
            status: 'pending'
          });

          logger.info(`[Plan#${plan.id}] pending 交易已创建 (金额=¥${planAmount})`);

          // 更新下次执行日期
          const nextDate = await calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
          await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });
          logger.info(`[Plan#${plan.id}] 下次执行日期: ${nextDate}`);
          logger.info(`◀── Plan#${plan.id} pending 订单已创建`);
          pendingCount++;
          continue;
        }
      } catch (error) {
        logger.error(`[Plan#${plan.id}] 净值查询失败: ${error.message}`, error.stack);
        skipCount++;
        continue;
      }

      // 安全检查：净值必须有效
      if (netValue <= 0 || isNaN(netValue)) {
        logger.error(`[Plan#${plan.id}] 净值异常: nav=${netValue}, 跳过`);
        skipCount++;
        continue;
      }

      // 计算份额（基于确认净值）
      const shares = Math.round((planAmount / netValue) * 10000) / 10000;  // 保留4位小数

      logger.info(`[Plan#${plan.id}] 定投计算: amount=¥${planAmount} ÷ nav=${netValue}(${netValueSource}) = ${shares.toFixed(4)}份`);

      const holding = await Holding.findByUserAndFund(plan.user_id, plan.fund_code);

      if (holding) {
        // 已有持仓 → 加仓（加权平均成本）
        const oldShares = parseFloat(holding.shares);
        const oldCostPrice = parseFloat(holding.cost_price);
        const totalShares = oldShares + shares;
        const newCostPrice = totalShares ? (oldShares * oldCostPrice + planAmount) / totalShares : 0;

        logger.info(`[Plan#${plan.id}] 加仓: ${oldShares.toFixed(4)}→${totalShares.toFixed(4)}份, 成本价: ${oldCostPrice.toFixed(4)}→${(Math.round(newCostPrice * 10000) / 10000).toFixed(4)}`);

        await Holding.update(holding.id, plan.user_id, {
          shares: totalShares,
          cost_price: Math.round(newCostPrice * 10000) / 10000
        });
      } else {
        // 无持仓 → 新建（使用确认净值作为成本价）
        logger.info(`[Plan#${plan.id}] 新建持仓: ${shares.toFixed(4)}份, 成本价=${netValue}`);
        await Holding.create({
          userId: plan.user_id,
          fundCode: plan.fund_code,
          shares: shares,
          costPrice: netValue
        });
      }

      // 创建交易记录
      await Transaction.create({
        userId: plan.user_id,
        fundCode: plan.fund_code,
        type: 'buy',
        shares: shares,
        price: netValue,
        amount: planAmount,
        fee: 0,
        transactionDate: today,
        note: `auto_plan:${plan.id}`
      });

      logger.info(`[Plan#${plan.id}] 交易记录已创建 (buy, ¥${planAmount})`);

      // 计算下次执行日期
      const nextDate = await calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
      await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });

      logger.info(`[Plan#${plan.id}] 下次执行日期: ${nextDate} (freq=${plan.frequency}, dayOfWeek=${planDayOfWeek ?? '-'}, dayOfMonth=${planDayOfMonth ?? '-'})`);
      logger.info(`◀── Plan#${plan.id} 执行成功`);
      successCount++;

    } catch (err) {
      logger.error(`◀── Plan#${plan.id} 执行失败: ${err.message}`, err.stack);
      failCount++;
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info(`===== 定投调度完成 | 成功=${successCount} 跳过=${skipCount} 失败=${failCount} 待确认=${pendingCount} | 耗时=${elapsed}ms =====`);
  if (pendingCount > 0) {
    logger.info(`${pendingCount}个计划已创建 pending 交易订单，等待净值确认后自动结算`);
  }

  return { success: successCount, skipped: skipCount, failed: failCount, pending: pendingCount };
}

async function calcNextRunDate(today, frequency, dayOfWeek, dayOfMonth) {
  const d = new Date(today);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly': {
      if (dayOfWeek != null) {
        // 计算下一个指定周几
        const target = dayOfWeek; // 1=周一 ... 7=周日 (ISO)
        const current = d.getDay() || 7; // 将周日0转为7
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
        // 计算下个月指定几号
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

  // 调用 holidayService 确保日期为交易日（跳过周末和法定节假日）
  // 非交易日无净值，创建 pending 也无意义，因此顺延到下一个交易日
  // 使用 ensureTradingDay 而非 nextTradingDay：若计算出的日期已是交易日则直接返回当天
  const dateStr = normalizeDateStr(d);
  const result = await holidayService.ensureTradingDay(dateStr);
  if (result !== dateStr) {
    logger.info(`calcNextRunDate: rawDate=${dateStr} 非交易日，顺延到 ${result} (freq=${frequency}, dayOfWeek=${dayOfWeek ?? '-'}, dayOfMonth=${dayOfMonth ?? '-'})`);
  }
  return result;
}

module.exports = { executeDuePlans };
