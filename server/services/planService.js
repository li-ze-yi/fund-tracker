const InvestmentPlan = require('../models/investmentPlan');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('./fundService');
const pool = require('../config/database');

async function executeDuePlans() {
  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[PlanService] 🚀 定投计划调度开始 | 日期: ${today} | 时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`${'='.repeat(60)}`);

  const plans = await InvestmentPlan.findActiveDueToday();
  console.log(`[PlanService] 📋 查询到 ${plans.length} 个到期定投计划 (status=active AND next_run_date<=${today})`);

  if (plans.length === 0) {
    console.log(`[PlanService] ⏭️ 无到期计划，跳过执行`);
    console.log(`${'='.repeat(60)}\n`);
    return { success: 0, skipped: 0, failed: 0, pending: 0 };
  }

  // 打印所有到期计划摘要
  plans.forEach((p, i) => {
    console.log(`[PlanService]   ${i + 1}. Plan#${p.id} | user=${p.user_id} | fund=${p.fund_code} | freq=${p.frequency} | amount=¥${p.amount} | dayOfWeek=${p.day_of_week ?? '-'} | dayOfMonth=${p.day_of_month ?? '-'} | nextRun=${p.next_run_date}`);
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

      console.log(`\n[PlanService] ──▶ 开始处理 Plan#${plan.id} (fund=${plan.fund_code}, freq=${plan.frequency}, amount=¥${planAmount})`);

      // ★ 防重复执行：检查今天是否已有该计划的自动定投交易记录
      const [existingTx] = await pool.query(
        `SELECT id FROM transactions
         WHERE user_id = ? AND fund_code = ? AND type = 'buy' AND transaction_date = ?
         AND note = ?
         LIMIT 1`,
        [plan.user_id, plan.fund_code, today, `auto_plan:${plan.id}`]
      );
      if (existingTx && existingTx.length > 0) {
        console.log(`[PlanService]   [Plan#${plan.id}] ⏭️ 今日已有自动定投交易记录(id=${existingTx[0].id})，跳过防重复`);
        // 已执行过，更新 next_run_date 避免下次再拾取
        const nextDate = calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
        await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });
        console.log(`[PlanService]   [Plan#${plan.id}] 📅 下次执行日期已更新: ${nextDate}`);
        skipCount++;
        continue;
      }

      let netValue = 0;
      let netValueSource = 'unknown';

      try {
        // ★ 核心策略：只使用今日确认净值，不降级用旧净值
        console.log(`[PlanService]   [Plan#${plan.id}] 查询今日(${today})确认净值...`);
        const history = await fundService.getHistoryNetValues(plan.fund_code, today, today);

        if (history && history.length > 0) {
          // 今日确认净值已发布 → 使用它
          netValue = parseFloat(history[0].netValue) || parseFloat(history[0].nav) || 0;
          netValueSource = `confirmed(${today})`;
          console.log(`[PlanService]   [Plan#${plan.id}] ✅ 今日确认净值已发布: ${netValue}`);
        } else {
          // 今日确认净值未发布 → 跳过本次执行，等待下次调度重试
          console.warn(`[PlanService]   [Plan#${plan.id}] ⏳ 今日确认净值尚未发布，跳过本次执行（等待下次调度重试）`);
          console.warn(`[PlanService]   [Plan#${plan.id}] 提示: 净值通常在18:00-20:00间确认，调度器将自动重试`);
          pendingCount++;
          continue;  // 不更新 next_run_date，下次调度会再次拾取
        }
      } catch (error) {
        console.error(`[PlanService]   [Plan#${plan.id}] ❌ 净值查询失败: ${error.message}`);
        skipCount++;
        continue;
      }

      // 安全检查：净值必须有效
      if (netValue <= 0 || isNaN(netValue)) {
        console.error(`[PlanService]   [Plan#${plan.id}] ❌ 净值异常: ${netValue}, 跳过`);
        skipCount++;
        continue;
      }

      // 计算份额（基于确认净值）
      const shares = Math.round((planAmount / netValue) * 10000) / 10000;  // 保留4位小数

      console.log(`[PlanService]   [Plan#${plan.id}] 📊 定投计算: amount=¥${planAmount} ÷ nav=${netValue}(${netValueSource}) = ${shares.toFixed(4)}份`);

      const holding = await Holding.findByUserAndFund(plan.user_id, plan.fund_code);

      if (holding) {
        // 已有持仓 → 加仓（加权平均成本）
        const oldShares = parseFloat(holding.shares);
        const oldCostPrice = parseFloat(holding.cost_price);
        const totalShares = oldShares + shares;
        const newCostPrice = totalShares ? (oldShares * oldCostPrice + planAmount) / totalShares : 0;

        await Holding.update(holding.id, plan.user_id, {
          shares: totalShares,
          cost_price: Math.round(newCostPrice * 10000) / 10000
        });

        console.log(`[PlanService]   [Plan#${plan.id}] 📈 加仓: ${oldShares}→${totalShares.toFixed(4)}份, 成本价: ${oldCostPrice}→${(Math.round(newCostPrice * 10000) / 10000).toFixed(4)}`);
      } else {
        // 无持仓 → 新建（使用确认净值作为成本价）
        await Holding.create({
          userId: plan.user_id,
          fundCode: plan.fund_code,
          shares: shares,
          costPrice: netValue
        });

        console.log(`[PlanService]   [Plan#${plan.id}] 🆕 新建持仓: ${shares.toFixed(4)}份, 成本价=${netValue}`);
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

      console.log(`[PlanService]   [Plan#${plan.id}] 📝 交易记录已创建 (buy, ¥${planAmount})`);

      // 计算下次执行日期
      const nextDate = calcNextRunDate(new Date(), plan.frequency, planDayOfWeek, planDayOfMonth);
      await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });

      console.log(`[PlanService]   [Plan#${plan.id}] 📅 下次执行日期: ${nextDate} (freq=${plan.frequency}, dayOfWeek=${planDayOfWeek ?? '-'}, dayOfMonth=${planDayOfMonth ?? '-'})`);
      console.log(`[PlanService] ◀── Plan#${plan.id} 执行成功 ✅`);
      successCount++;

    } catch (err) {
      console.error(`[PlanService] ◀── Plan#${plan.id} 执行失败 ❌: ${err.message}`);
      failCount++;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[PlanService] 🏁 定投调度完成 | 成功=${successCount} 跳过=${skipCount} 失败=${failCount} 待确认=${pendingCount} | 耗时=${elapsed}ms`);
  if (pendingCount > 0) {
    console.log(`[PlanService] 💡 ${pendingCount}个计划因净值未确认而跳过，下次调度将自动重试`);
  }
  console.log(`${'='.repeat(60)}\n`);

  return { success: successCount, skipped: skipCount, failed: failCount, pending: pendingCount };
}

function calcNextRunDate(today, frequency, dayOfWeek, dayOfMonth) {
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
  return d.toISOString().slice(0, 10);
}

module.exports = { executeDuePlans };
