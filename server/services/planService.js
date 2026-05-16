const InvestmentPlan = require('../models/investmentPlan');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('./fundService');

async function executeDuePlans() {
  const plans = await InvestmentPlan.findActiveDueToday();
  console.log(`[PlanService] 找到 ${plans.length} 个待执行定投计划`);

  for (const plan of plans) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      let netValue = 0;
      let netValueSource = 'unknown';

      // ✨ 修复v2.4.1: 定投计划必须使用确认净值（而非实时估值）
      // 原因：自动执行时无法保证在收盘后运行，盘中执行会用到不准确的实时估值
      try {
        // 策略1：查询今天的确认净值
        const history = await fundService.getHistoryNetValues(plan.fund_code, today, today);
        
        if (history && history.length > 0) {
          // 今天已有确认净值 → 使用它 ✅
          netValue = parseFloat(history[0].netValue) || parseFloat(history[0].nav) || 0;
          netValueSource = `confirmed(${today})`;
          console.log(`[PlanService] 基金 ${plan.fund_code} 使用今日确认净值: ${netValue}`);
        } else {
          // 策略2：今天未确认 → 查询最近一个交易日的确认净值
          const recentHistory = await fundService.getHistoryNetValues(
            plan.fund_code, 
            '2020-01-01', 
            today
          );
          
          if (recentHistory && recentHistory.length > 0) {
            const latestConfirmed = recentHistory[0];
            netValue = parseFloat(latestConfirmed.netValue) || parseFloat(latestConfirmed.nav) || 0;
            netValueSource = `confirmed(${latestConfirmed.date})`;
            console.log(`[PlanService] 基金 ${plan.fund_code} 使用最近确认净值: ${netValue} (${latestConfirmed.date})`);
          } else {
            // 策略3：完全无历史数据 → 跳过本次执行（不定投）
            console.warn(`[PlanService] ⚠️ 基金 ${plan.fund_code} 无任何历史净值数据，跳过定投执行`);
            continue;  // 跳过这只基金，继续下一只
          }
        }
      } catch (error) {
        // 查询失败 → 跳过执行（安全第一）
        console.error(`[PlanService] ❌ 获取基金 ${plan.fund_code} 净值失败:`, error.message);
        continue;  // 跳过，不强制用实时估值
      }

      // 安全检查：净值必须有效
      if (netValue <= 0 || isNaN(netValue)) {
        console.error(`[PlanService] ❌ 基金 ${plan.fund_code} 净值异常: ${netValue}, 跳过执行`);
        continue;
      }

      // 计算份额（基于确认净值）
      const shares = Math.round((plan.amount / netValue) * 10000) / 10000;  // 保留4位小数
      
      console.log(`[PlanService] 定投计算: fund=${plan.fund_code}, amount=¥${plan.amount}, nav=${netValue}(${netValueSource}), shares=${shares.toFixed(4)}份`);

      const holding = await Holding.findByUserAndFund(plan.user_id, plan.fund_code);

      if (holding) {
        // 已有持仓 → 加仓（加权平均成本）
        const oldShares = parseFloat(holding.shares);
        const oldCostPrice = parseFloat(holding.cost_price);
        const totalShares = oldShares + shares;
        const newCostPrice = totalShares ? (oldShares * oldCostPrice + plan.amount) / totalShares : 0;
        
        await Holding.update(holding.id, plan.user_id, {
          shares: totalShares,
          cost_price: Math.round(newCostPrice * 10000) / 10000  // 保留4位小数
        });
        
        console.log(`[PlanService] 加仓完成: oldShares=${oldShares}, newShares=${totalShares.toFixed(4)}, newCostPrice=${(Math.round(newCostPrice * 10000) / 10000).toFixed(4)}`);
      } else {
        // 无持仓 → 新建（使用确认净值作为成本价）
        await Holding.create({
          userId: plan.user_id,
          fundCode: plan.fund_code,
          shares: shares,
          costPrice: netValue  // ✅ 使用确认净值
        });
        
        console.log(`[PlanService] 新建持仓: shares=${shares.toFixed(4)}, costPrice=${netValue}`);
      }

      // 创建交易记录（使用确认净值作为成交价）
      await Transaction.create({
        userId: plan.user_id,
        fundCode: plan.fund_code,
        type: 'buy',
        shares: shares,
        price: netValue,  // ✅ 使用确认净值（不是实时估值）
        amount: plan.amount,
        fee: 0,
        transactionDate: today,
        metadata: JSON.stringify({ 
          netValueSource,           // 记录净值来源
          executionType: 'auto_plan', // 标记为自动执行
          planId: plan.id             // 关联定投计划ID
        })
      });

      // 计算下次执行日期
      const nextDate = calcNextRunDate(new Date(), plan.frequency);
      await InvestmentPlan.update(plan.id, plan.user_id, { next_run_date: nextDate });

      console.log(`[PlanService] ✅ 定投计划 ${plan.id} 执行成功 (净值来源: ${netValueSource})`);
      
    } catch (err) {
      console.error(`[PlanService] ❌ 定投计划 ${plan.id} 执行失败:`, err.message);
    }
  }
}

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

module.exports = { executeDuePlans };
