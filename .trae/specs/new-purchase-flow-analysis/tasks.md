# Tasks

- [x] 梳理添加持仓（create）的完整流程：净值获取 → 份额计算 → 交易记录生成
- [x] 梳理新购基金（purchase）的完整流程：NAV日期计算 → 净值查询 → confirmed/pending分支
- [x] 梳理自动结算（settlePendingAsync）的流程：pending交易 → 净值查询 → 持仓更新
- [x] 梳理持仓指标计算（calculateHoldingMetrics）：yesterdayShares、displayNav、dailyGain、cumulativeReturn
- [x] 梳理前端显示逻辑（FundListItem）：各状态标签、数值显示规则
- [x] 验证 fix-today-buy-estimate-zero 修复后的交易日期对齐逻辑
- [x] 分析持仓金额稳定性问题并修复（displayNav 恢复 confirmedNav 优先）
- [x] 分析 8 种新购基金场景（盘中/盘后 × 4种购买组合）的合理性