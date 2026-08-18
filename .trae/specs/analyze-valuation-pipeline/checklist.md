# Checklist

## fundService.js 改动验证
- [x] getFundgzEstimatedValue 已注释，标注原因"实测总返回null"
- [x] getTencentValue 已注释，标注原因"死代码"
- [x] getHoldingsEstimatedValue 已注释，标注原因"死代码"
- [x] batchGetFundgzEstimatedValues 已注释
- [x] getHoldingsEstimatedOverlay 无持仓时调用 getETFBasedEstimatedValue 而非 getSinaEstimatedValue
- [x] getHoldingsEstimatedOverlay 覆盖率不足时返回 null 而非回退新浪
- [x] getRealTimeValueWithMethod 不再调用 fundgz
- [x] getRealTimeValueWithMethod sina 模式失败时不回退到 holdings
- [x] getRealTimeValueWithMethod holdings 模式失败时不回退到 sina
- [x] batchGetRealTimeValuesWithMethod 去掉 mobapi.estimatedValue 优先逻辑
- [x] batchGetRealTimeValuesWithMethod sina/holdings 不互相回退
- [x] module.exports 中移除已注释函数的导出
- [x] require('./services/fundService') 不报错

## fundController.js 改动验证
- [x] getByCode：estimatedChange 为 null 时显示前一天确认净值
- [x] getByCode：estimatedChange 为 null 时 estimated_change = gainPercent（前一天涨幅）
- [x] getByCode：返回结果包含 update_time（前一天日期）
- [x] batchGetInfo：同样处理估算失败的情况

## holdingService.js 改动验证
- [x] calculateHoldingMetrics：estValue 为 null 时用 confirmed netValue 计算市值

## 功能验证
- [x] 019633（ETF联接）holdings 模式返回 etf_linkage 估值
- [x] 019633 sina 模式失败时返回 null（不回退到 holdings）
- [x] 161725（有持仓）holdings 模式返回 holdings 估值
- [x] 005827（无持仓非ETF联接）holdings 模式返回 null
- [x] 005827 估算失败时显示前一天数据+日期
