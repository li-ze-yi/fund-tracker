# 持仓数据源切换到 fundmobapi Spec

## Why
日志显示大量基金（020900, 015790, 006503, 025793, 018957, 025209, 021528, 024239 等）持仓穿透法返回"持仓为空"。实测根因：当前 `getFundHoldings` 使用 fundf10 HTML 接口（`FundArchivesDatas.aspx?type=jjcc`），该接口对所有基金（含正常基金如 161725）均返回 `<tbody></tbody>` 空 tbody，天天基金已不再通过 HTML 表格提供持仓数据。而 fundmobapi 的 `FundMNInverstPosition` JSON 接口对同一批基金返回完整的 `fundStocks` 数组（前十大持仓，含 GPDM 代码、GPJC 名称、JZBL 占净值比例），覆盖率 50%-86%。需要将持仓数据源切换到 fundmobapi JSON 接口。

## 实测数据对比

| 基金代码 | 基金名称 | fundf10 HTML | fundmobapi JSON (fundStocks) |
|---------|---------|-------------|---------------------------|
| 020900 | 天弘中证全指通信设备指数C | tbody 空 | 10只, 总占比 69.67% |
| 006503 | 财通集成电路产业股票C | tbody 空 | 10只, 总占比 69.46% |
| 025793 | 东方阿尔法科技甄选混合C | tbody 空 | 10只, 总占比 65.82% |
| 015790 | 永赢高端装备智选混合发起C | tbody 空 | 10只, 总占比 51.01% |
| 018957 | (未知) | 514 限流 | 10只, 总占比 67.98% |
| 025209 | (未知) | 514 限流 | 10只, 总占比 60.05% |
| 021528 | (未知) | 514 限流 | 10只, 总占比 72.31% |
| 024239 | (未知) | 514 限流 | 10只, 总占比 17.85%（8只美股被过滤，有效2只2.75%）|
| 013309 | ETF联接基金 | content 空 | ETFCODE=513010, fundStocks 空 |
| 161725 | 招商中证白酒 | tbody 空（已改版）| 10只, 总占比 85.95% |
| 005827 | 易方达蓝筹精选 | tbody 空（已改版）| 10只, 总占比 38.95% |

## What Changes
- `getFundHoldings` 数据源从 fundf10 HTML 接口切换到 fundmobapi JSON 接口（`FundMNInverstPosition`）
- 解析 `fundStocks` 数组：GPDM → code, GPJC → name, JZBL → ratio
- `getFundHoldings` 返回结果新增 `etfCode` 字段（ETF联接基金的母ETF代码，非ETF联接基金为 null）
- `getUnderlyingETFCode` 复用 `getFundHoldings` 的缓存结果，避免重复 API 调用
- 移除 fundf10 HTML 兜底（实测该接口对所有基金均返回空 tbody，已无数据价值）

## Impact
- Affected specs: `fix-holdings-no-data`（持仓数据源切换后，持仓为空的基金大幅减少）、`fix-production-data-source`（getFundHoldings 实现重构，但接口签名不变）、`analyze-valuation-pipeline`
- Affected code: `server/services/fundService.js` — `getFundHoldings`、`getUnderlyingETFCode`、`getHoldingsEstimatedOverlay`
- **非 BREAKING**：`getFundHoldings` 返回值结构兼容（holdings/totalStockRatio/reportDate 不变，新增 etfCode 字段）

---

## ADDED Requirements

### Requirement: fundmobapi 作为持仓数据源
`getFundHoldings` SHALL 使用 fundmobapi 的 `FundMNInverstPosition` 接口获取基金持仓数据，解析 `fundStocks` 数组。

#### Scenario: 正常获取持仓
- **WHEN** 调用 getFundHoldings(fundCode)
- **AND** fundmobapi 返回 fundStocks 非空数组
- **THEN** 解析每条记录：code=GPDM, name=GPJC, ratio=parseFloat(JZBL)
- **AND** 过滤 code 不匹配 `/^\d{5,6}$/` 的记录（美股等字母代码）
- **AND** 过滤 ratio 为 NaN 或 <= 0 的记录
- **AND** 返回 { holdings, totalStockRatio, reportDate: null, etfCode }

#### Scenario: ETF联接基金持仓为空
- **WHEN** fundmobapi 返回 fundStocks 为空数组
- **AND** ETFCODE 字段非空
- **THEN** 返回 { holdings: [], totalStockRatio: 0, reportDate: null, etfCode: <ETFCODE> }
- **AND** getHoldingsEstimatedOverlay 利用 etfCode 直接走 ETF 联接估值

#### Scenario: fundmobapi 失败时返回空持仓
- **WHEN** fundmobapi 请求失败（网络错误/超时/非200）
- **THEN** 输出 warn 日志：`[holdings][warn] {fundCode} fundmobapi 持仓接口失败: {error}`
- **AND** 返回 { holdings: [], totalStockRatio: 0, reportDate: null, etfCode: null }

### Requirement: ETFCODE 字段复用
`getFundHoldings` 返回结果 SHALL 包含 `etfCode` 字段（来自 fundmobapi 的 ETFCODE），供 `getUnderlyingETFCode` 复用，避免重复 API 调用。

#### Scenario: getUnderlyingETFCode 复用缓存
- **WHEN** getUnderlyingETFCode(fundCode) 被调用
- **AND** getFundHoldings 缓存未过期（4小时内）
- **THEN** 直接返回缓存中的 etfCode
- **AND** 不发起 API 请求

#### Scenario: getHoldingsEstimatedOverlay 空持仓直走ETF估值
- **WHEN** getFundHoldings 返回空持仓
- **AND** etfCode 字段非空
- **THEN** getHoldingsEstimatedOverlay 直接调用 getETFBasedEstimatedValue（内部复用 etfCode）
- **AND** 不再重复调用 getUnderlyingETFCode 获取母ETF代码

---

## MODIFIED Requirements

### Requirement: getFundHoldings 返回值结构
`getFundHoldings` SHALL 返回 `{ holdings: Array, totalStockRatio: number, reportDate: string|null, etfCode: string|null }`，新增 etfCode 字段。

### Requirement: getStockPrefix 港股前缀（保持不变）
fundmobapi 的 fundStocks 中港股代码为 5 位数字（如 00700），与 fundf10 一致。`getStockPrefix` 继续按代码长度判断：5位 → hk, 6位以6开头 → sh, 其他 → sz。

#### Scenario: 港股持仓（005827 腾讯控股）
- **WHEN** fundmobapi 返回 fundStocks 包含 GPDM="00700"
- **THEN** 解析为 holdings[].code = "00700"
- **AND** getStockPrefix("00700") 返回 "hk"
- **AND** getStocksRealtime 使用 hk00700 前缀查询腾讯行情

---

## REMOVED Requirements

### Requirement: fundf10 HTML 接口兜底
**Reason**: 实测 fundf10 接口（`FundArchivesDatas.aspx?type=jjcc`）已改版，对所有基金（含 161725/005827 等正常基金）均返回空 `<tbody></tbody>`，不再提供持仓数据。兜底无数据价值。
**Migration**: 移除 fundf10 HTML 解析逻辑，fundmobapi 失败时直接返回空持仓并输出 warn 日志。
