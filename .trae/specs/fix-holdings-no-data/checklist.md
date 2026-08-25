# Checklist

## confirmedNav 参数复用验证
- [x] getHoldingsEstimatedOverlay 函数签名接收第二个参数 confirmedNav
- [x] 传入 confirmedNav 为正数时，跳过 lsjz API 调用，直接用 confirmedNav 计算 estimatedValue
- [x] 未传入 confirmedNav 时，保持现有 lsjz 调用逻辑
- [x] getRealTimeValueWithMethod 在 holdings 模式传递 confirmed.netValue
- [x] getRealTimeValueWithMethod 在 auto 模式回退时传递 confirmed.netValue
- [x] batchGetRealTimeValuesWithMethod 在 holdings 模式传递 mobapiMap[code].netValue
- [x] batchGetRealTimeValuesWithMethod 在 auto 模式回退时传递 mobapiMap[code].netValue

## 估算涨跌幅独立返回验证
- [x] 持仓行情加权计算成功但 lsjz 失败时，返回 { estimatedValue: null, estimatedChange: <值>, ... } 而非 null
- [x] 持仓为空且非ETF联接基金时，仍返回 null（保持现有行为）
- [x] ETF联接基金估值失败时，仍返回 null（保持现有行为）

## 诊断日志验证
- [x] getFundHoldings API 失败时输出 `[holdings][warn] {fundCode} fundf10 API 失败: {message}`
- [x] getFundHoldings 无 tbody 时输出 `[holdings][warn] {fundCode} 响应无 tbody...`
- [x] getFundHoldings 持仓为空时输出 `[holdings][warn] {fundCode} 持仓解析为空`
- [x] getHoldingsEstimatedOverlay 持仓获取后输出持仓数量、覆盖率、报告期
- [x] getHoldingsEstimatedOverlay 行情获取后输出成功数/总数
- [x] getHoldingsEstimatedOverlay 估算成功输出 method、change、coverage
- [x] getHoldingsEstimatedOverlay 估算失败输出原因

## 回归验证
- [x] 161725（招商中证白酒，纯A股高覆盖）holdings 模式返回估值，跳过 lsjz 调用（代码审查确认：confirmedNav 传入时直接计算，不调用 lsjz）
- [x] 005827（易方达蓝筹精选，含港股）holdings 模式返回估值（保持修复后行为，持仓穿透逻辑未变）
- [x] 019633（ETF联接，无持仓）返回 etf_linkage 估值（保持现有行为，空持仓走 ETF 回退逻辑未变）
- [x] 014558（偏股混合，低覆盖）返回 holdings 估值（保持修复后行为，加权计算逻辑未变）
- [x] 003838（债券型基金）返回 null（无股票持仓，保持现有行为，空持仓且非ETF返回null）
- [x] 批量接口 holdings 模式下多只基金不出现冗余 lsjz 调用（mobapiMap netValue 已传入）

## 编译验证
- [x] 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`，exit code 0）
