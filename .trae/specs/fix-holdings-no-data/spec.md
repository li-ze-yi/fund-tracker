# 持仓穿透法无数据修复 Spec

## Why
用户反馈实时估值的持仓穿透数据源没有数据。根因：`getHoldingsEstimatedOverlay` 在成功计算 `estimatedChange`（持仓加权涨跌幅）后，依赖一次额外的 lsjz API 调用获取昨日净值来计算 `estimatedValue`；当该 lsjz 调用失败（超时/接口异常/返回空）时，整个函数 `return null`，丢弃已计算好的涨跌幅，导致持仓穿透"无数据"。同时 `getRealTimeValueWithMethod` 已经调用过 `getRealTimeValue` 拿到了确认净值（含昨日 NAV），却未传递给 `getHoldingsEstimatedOverlay` 复用，造成冗余调用和额外失败点。此外 `getFundHoldings` 失败时静默返回空数组无任何日志，难以定位问题。

## What Changes
- `getHoldingsEstimatedOverlay` 接收可选的 `confirmedNav` 参数（昨日确认净值），避免重复调用 lsjz 接口
- `getRealTimeValueWithMethod` 和 `batchGetRealTimeValuesWithMethod` 将已获取的确认净值传递给 `getHoldingsEstimatedOverlay`
- `getHoldingsEstimatedOverlay` 在 lsjz 调用失败/无昨日净值时，仍返回 `estimatedChange`（`estimatedValue` 为 null），不再整体返回 null
- `getFundHoldings` 增加 warn 级别日志：API 失败、HTML 解析无 tbody、持仓为空时分别记录
- `getHoldingsEstimatedOverlay` 增加关键节点日志：持仓数量、覆盖率、行情获取成功数、最终估算结果

## Impact
- Affected specs: `analyze-valuation-pipeline`（持仓穿透法返回值结构变化，estimatedValue 可为 null 而 estimatedChange 有值）、`fix-production-data-source`（复用已修复的覆盖率/ETF回退逻辑，新增传参）
- Affected code: `server/services/fundService.js` — `getHoldingsEstimatedOverlay`、`getRealTimeValueWithMethod`、`batchGetRealTimeValuesWithMethod`、`getFundHoldings`
- **BREAKING**: `getHoldingsEstimatedOverlay` 返回值 `estimatedValue` 可能为 null（之前整体返回 null），调用方需容忍此情况

---

## ADDED Requirements

### Requirement: 复用确认净值避免冗余 lsjz 调用
`getHoldingsEstimatedOverlay` SHALL 接收可选的 `confirmedNav` 参数（number），当传入时直接用于计算 `estimatedValue`，不再调用 lsjz 接口。

#### Scenario: 传入确认净值时跳过 lsjz 调用
- **WHEN** `getHoldingsEstimatedOverlay(fundCode, confirmedNav)` 被调用
- **AND** confirmedNav 为正数
- **AND** 持仓行情加权计算得到 estimatedChange
- **THEN** estimatedValue = confirmedNav × (1 + estimatedChange/100)
- **AND** 不发起 lsjz API 请求

#### Scenario: 未传入确认净值时回退 lsjz
- **WHEN** `getHoldingsEstimatedOverlay(fundCode)` 被调用（confirmedNav 为 undefined）
- **THEN** 保持现有行为，调用 lsjz 获取昨日净值

### Requirement: 估算涨跌幅独立返回
`getHoldingsEstimatedOverlay` SHALL 在持有加权涨跌幅计算成功但无法获取昨日净值时，返回包含 `estimatedChange` 的结果对象（`estimatedValue` 为 null），不再整体返回 null。

#### Scenario: 持仓有效但昨日净值获取失败
- **WHEN** 持仓行情加权计算成功（得到 estimatedChange）
- **AND** lsjz API 失败或返回空（无法获取昨日净值）
- **AND** 未传入 confirmedNav
- **THEN** 返回 `{ estimatedValue: null, estimatedChange: <计算值>, estimationMethod: 'holdings', estimationCoverage: <覆盖率>, ... }`
- **AND** 不返回 null

#### Scenario: 持仓为空且非ETF联接基金
- **WHEN** getFundHoldings 返回空持仓
- **AND** getETFBasedEstimatedValue 返回 null
- **THEN** 返回 null（保持现有行为）

### Requirement: 持仓数据获取诊断日志
`getFundHoldings` SHALL 在以下情况输出 warn 级别日志，包含 fundCode 和原因：
- API 请求失败（网络错误/超时）
- 响应无 tbody（HTML 结构变化或无持仓数据）
- 解析后持仓为空

#### Scenario: fundf10 API 超时
- **WHEN** fundf10.eastmoney.com 请求超时
- **THEN** 输出 `[holdings][warn] {fundCode} fundf10 API 失败: {error.message}`
- **AND** 返回 `{ holdings: [], totalStockRatio: 0, reportDate: null }`

#### Scenario: HTML 无 tbody
- **WHEN** API 返回成功但无 `<tbody>` 匹配
- **THEN** 输出 `[holdings][warn] {fundCode} 响应无 tbody（可能无持仓或页面结构变化）`
- **AND** 返回空持仓结果

### Requirement: 持仓穿透估算过程日志
`getHoldingsEstimatedOverlay` SHALL 输出关键节点日志，便于定位"无数据"原因：
- 持仓获取结果（数量、覆盖率、报告期）
- 行情获取结果（成功数/总数）
- 最终估算结果（estimatedChange、estimationMethod 或 null 原因）

#### Scenario: 估算成功日志
- **WHEN** getHoldingsEstimatedOverlay 成功返回估值
- **THEN** 输出 `[holdings] {fundCode} 估值成功: method={estimationMethod}, change={estimatedChange}%, coverage={coverage}%`

#### Scenario: 估算失败日志
- **WHEN** getHoldingsEstimatedOverlay 返回 null
- **THEN** 输出 `[holdings][warn] {fundCode} 估算失败: {失败原因}`

---

## MODIFIED Requirements

### Requirement: getRealTimeValueWithMethod 传参
`getRealTimeValueWithMethod` SHALL 将 `getRealTimeValue` 返回的确认净值传递给 `getHoldingsEstimatedOverlay`，避免冗余 lsjz 调用。

#### Scenario: holdings 模式传参
- **WHEN** method 为 'holdings'
- **AND** getRealTimeValue 成功返回 confirmed.netValue
- **THEN** 调用 `getHoldingsEstimatedOverlay(fundCode, confirmed.netValue)`

#### Scenario: auto 模式回退持仓穿透时传参
- **WHEN** method 为 'auto'
- **AND** 新浪估值失败，回退到持仓穿透
- **THEN** 调用 `getHoldingsEstimatedOverlay(fundCode, confirmed.netValue)`

### Requirement: batchGetRealTimeValuesWithMethod 传参
`batchGetRealTimeValuesWithMethod` SHALL 将 fundmobapi 批量获取的确认净值传递给 `getHoldingsEstimatedOverlay`。

#### Scenario: holdings 模式批量传参
- **WHEN** method 为 'holdings'
- **AND** batchGetFundmobapiInfo 返回各基金的 netValue
- **THEN** 并行调用 `getHoldingsEstimatedOverlay(code, mobapiMap[code].netValue)`

#### Scenario: auto 模式批量回退传参
- **WHEN** method 为 'auto'
- **AND** 新浪批量获取失败的基金回退持仓穿透
- **THEN** 调用 `getHoldingsEstimatedOverlay(code, mobapiMap[code].netValue)`
