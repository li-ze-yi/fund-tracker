# ETF联接基金加权估值修复 Spec

## Why
用户反馈 008021 基金估值不对。实测根因：008021 是 ETF 联接基金（ETFCODE=515980），fundmobapi 返回 10 只股票持仓但总占比仅 0.09%，而母 ETF 占比约 92.55%。当前 `getHoldingsEstimatedOverlay` 将所有非股票部分统一用国债涨跌幅填补：`bondWeight = 100 - totalStockRatio = 99.91%`，导致估值严重失真（应 ≈ -1.54%，实际 ≈ 0%）。

## What Changes
- 新增 `getFundAssetAllocation` 函数，从 `https://fund.eastmoney.com/pingzhongdata/{fundCode}.js` 提取 `Data_assetAllocation` 最新一期的各资产占比
- 移除 `getHoldingsEstimatedOverlay` 中所有 ETF 联接特判分支（持仓为空→ETF估值、仅1只>90%→ETF估值），统一走加权计算
- 加权公式引入资产配置数据：股票/债券各自使用对应占比和涨跌幅，ETF 联接基金剩余仓位用母ETF涨跌幅
- **所有调用链路加入带时间戳的日志**，便于诊断

## Impact
- Affected specs: `switch-holdings-to-mobapi`、`fix-production-data-source`、`analyze-valuation-pipeline`
- Affected code: `server/services/fundService.js` — 新增 `getFundAssetAllocation`，修改 `getHoldingsEstimatedOverlay`、`getRealTimeValueWithMethod`、`batchGetRealTimeValuesWithMethod`、`getSinaEstimatedValue`、`getTencentValue`
- **非 BREAKING**：所有基金统一走加权计算，普通基金行为不变

---

## ADDED Requirements

### Requirement: getFundAssetAllocation 获取资产配置
系统 SHALL 提供 `getFundAssetAllocation(fundCode)` 函数，从 `pingzhongdata/{fundCode}.js` 提取最新一期资产配置占比。

#### Scenario: 正常获取
- **WHEN** 调用 getFundAssetAllocation("008021")
- **AND** pingzhongdata 接口返回正常
- **THEN** 解析 Data_assetAllocation 的 series 中最后一条 data
- **AND** 返回 `{ stockRatio: 0.13, bondRatio: 2.48, cashRatio: 4.84, reportDate: "2026-06-30" }`

#### Scenario: 接口失败
- **WHEN** pingzhongdata 接口超时/返回空/JS解析失败
- **THEN** 返回 null
- **AND** 不影响后续估值计算

### Requirement: 资产配置缓存
`getFundAssetAllocation` 的结果 SHALL 缓存 24 小时（该数据按季度更新，不需要高频刷新）。

### Requirement: 全链路带时间戳日志
估值管道中的所有关键步骤 SHALL 输出带时间戳的日志，格式为 `[HH:MM:SS]`，便于诊断问题。

#### 日志覆盖节点
- `getRealTimeValueWithMethod` / `batchGetRealTimeValuesWithMethod`：进入函数、选择 method、各数据源结果
- `getSinaEstimatedValue`：调用接口、成功/失败
- `getTencentValue`：调用接口、成功/失败
- `getFundHoldings`：调用 fundmobapi、命中缓存、失败
- `getFundAssetAllocation`：调用 pingzhongdata、命中缓存、失败
- `getHoldingsEstimatedOverlay`：持仓数量、覆盖率、母ETF行情、各成分贡献值、最终结果
- `getUnderlyingETFCode`/`getETFBasedEstimatedValue`：ETFCODE 获取结果、ETF 行情结果

---

## MODIFIED Requirements

### Requirement: getHoldingsEstimatedOverlay 统一加权公式
移除所有 ETF 联接特判分支，统一使用资产配置占比进行加权计算。

**数据来源优先级**：
1. 持仓股票涨跌幅 → 通过 getStocksRealtime 获取（不变）
2. 母ETF涨跌幅 → 通过 getETFRealtimeQuote 获取（etfCode 非空时）
3. 债券涨跌幅 → 通过 getBondBenchmarkChange 获取（不变）
4. 沪深300涨跌幅 → 通过 getBenchmarkChange 获取（用于缺失股票填补，不变）

**加权公式**：
```
股票贡献 = coveredContribution + missingContribution  （现有逻辑，不变）
债券贡献 = 债券占净比 × 国债涨跌幅                  （新：使用官方债券占比）
母ETF贡献 = (100 - 股票占净比 - 债券占净比 - 现金占净比) × 母ETF涨跌幅  （新：etfCode非空时）
现金贡献 ≈ 0                                          （新：官方现金占比，忽略涨跌幅）

estimatedChange = (股票贡献 + 债券贡献 + 母ETF贡献) / 100
```

**普通基金（etfCode 为空）保持现有行为**：
```
estimatedChange = (coveredContribution + missingContribution + bondWeight × bondBenchmarkChange) / 100
其中 bondWeight = 100 - totalStockRatio
```

#### Scenario: 008021 ETF联接基金加权计算
- **WHEN** fundCode = "008021"
- **AND** getFundHoldings 返回 etfCode="515980", holdings=10只, totalStockRatio=0.09
- **AND** getFundAssetAllocation 返回 stockRatio=0.13, bondRatio=2.48, cashRatio=4.84
- **THEN** 计算母ETF占比 = 100 - 0.13 - 2.48 - 4.84 = 92.55
- **AND** 获取母ETF 515980 实时涨跌幅（-1.5443%）
- **AND** 母ETF贡献 = 92.55 × (-1.5443) = -142.9
- **AND** 个股贡献 ≈ 0.09 × 加权涨跌幅（≈0，占比太低）
- **AND** 债券贡献 = 2.48 × 国债涨跌幅（≈0）
- **AND** estimatedChange ≈ (-142.9) / 100 ≈ -1.43%（接近新浪真实值 -1.5443%）

#### Scenario: 013309 ETF联接基金无个股持仓
- **WHEN** fundCode = "013309"
- **AND** getFundHoldings 返回 etfCode="513010", holdings=[], totalStockRatio=0
- **AND** getFundAssetAllocation 返回 stockRatio=0, bondRatio=..., cashRatio=...
- **THEN** 母ETF占比 = 100 - 0 - bondRatio - cashRatio ≈ 93%
- **AND** 母ETF贡献占主导（≈100%），estimatedChange ≈ 母ETF涨跌幅
- **AND** estimationMethod = 'holdings'

#### Scenario: 161725 普通基金（保持现有行为）
- **WHEN** fundCode = "161725"
- **AND** getFundHoldings 返回 etfCode=null
- **THEN** 不走 ETF 部分，走现有加权公式
- **AND** estimatedChange = (coveredContribution + missingContribution + bondContribution) / 100
- **AND** 保持现有行为

#### Scenario: 资产配置接口失败（回退）
- **WHEN** getFundAssetAllocation 返回 null
- **THEN** 对于 etfCode 非空的基金，用 母ETF涨跌幅 × 100% 作为估值（近似值）
- **AND** 输出 warn 日志（带时间戳）
- **AND** 对于 etfCode 为空的基金，保持现有逻辑

### Requirement: 日志格式规范
所有新增/修改的诊断日志 SHALL 使用统一前缀和时间戳格式：
```
console.log(`[${getTimestamp()}] [holdings] ${fundCode} ...`)
console.warn(`[${getTimestamp()}] [holdings][warn] ${fundCode} ...`)
```
其中 getTimestamp() 返回 `HH:MM:SS` 格式字符串。
日志必须覆盖进入函数、关键步骤结果、异常捕获、最终返回值。
