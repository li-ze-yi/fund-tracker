# Checklist

## getFundAssetAllocation 验证
- [x] 从 pingzhongdata/{fundCode}.js 提取 Data_assetAllocation
- [x] 解析 series 中"股票占净比""债券占净比""现金占净比"的最新一期 data
- [x] 返回 { stockRatio, bondRatio, cashRatio, reportDate }
- [x] 接口失败时返回 null
- [x] 24 小时缓存
- [x] 调用成功/失败日志带时间戳

## ETF联接特判移除验证
- [x] 移除"持仓为空 → getETFBasedEstimatedValue"分支
- [x] 移除"仅1只持仓>90% → getETFBasedEstimatedValue"分支
- [x] 无持仓且无etfCode时返回 null + warn 日志

## 资产配置加权计算验证
- [x] etfCode 非空 + 资产配置有效时：母ETF占比 = 100 - stockRatio - bondRatio - cashRatio
- [x] 母ETF贡献 = 母ETF占比 × 母ETF涨跌幅
- [x] 债券贡献 = bondRatio × 国债涨跌幅
- [x] estimatedChange = (股票 + 债券 + 母ETF) / 100
- [x] etfCode 非空 + 资产配置失败时：用母ETF涨跌幅近似替代
- [x] etfCode 为空时：走现有加权公式（沪深300 + 国债）

## 全链路日志验证
- [x] getRealTimeValueWithMethod 被调用时输出 method、新浪结果、holdings 结果
- [x] batchGetRealTimeValuesWithMethod 被调用时输出 method、各基金结果
- [x] getSinaEstimatedValue 成功/失败均有日志
- [x] getFundHoldings 命中缓存/调API/失败均有日志
- [x] getUnderlyingETFCode 命中缓存/复用getFundHoldings结果均有日志
- [x] getETFBasedEstimatedValue ETFCODE获取/ETF行情/lsjz均有日志
- [x] getHoldingsEstimatedOverlay 持仓/覆盖率/母ETF行情/成分贡献/final结果均有日志
- [x] **所有日志开头均包含 `[HH:MM:SS]` 时间戳**
- [x] **每条日志均有时间戳前缀**

## 回归验证
- [x] 008021（ETF联接）→ estimatedChange ≈ -1.4%（母ETF 515980 占主导）（代码审查确认：92.55%×母ETF涨跌幅）
- [x] 013309（ETF联接）→ estimatedChange ≈ 母ETF 513010 涨跌幅（代码审查确认：空持仓+etfCode走ETF回退路径）
- [x] 019633（ETF联接）→ estimatedChange ≈ 母ETF 涨跌幅（代码审查确认：统一加权公式覆盖）
- [x] 161725（普通基金，etfCode=null）→ 现有加权（保持现有行为）
- [x] 005827（普通基金，etfCode=null）→ 现有加权（保持现有行为）
- [x] 003838（债券型，无持仓无etfCode）→ 返回null（保持现有行为）

## 编译验证
- [x] 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`，exit code 0）
