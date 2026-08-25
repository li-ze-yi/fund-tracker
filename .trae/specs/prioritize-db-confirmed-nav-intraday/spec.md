# 盘中估算优先使用数据库确认净值 Spec

## Why
盘中估算当前每次都依赖外部 API（fundmobapi）返回的基准确认净值，且 23:55 日收益兜底不回写确认净值，导致 `holdings.confirmed_nav` 可能长期陈旧（用户多日不打开 App 时尤其明显）。本方案确立"**缓存 → 数据库 → API**"的确认净值三级来源优先级，并用日收益兜底保证 DB 值新鲜，从而减少对外部 API 的依赖、保证持仓确认净值始终最新，让盘中估算基准与展示值一致。

## What Changes
- **日收益兜底回写确认净值**：在 `dailyProfitService.calculateAndSaveDailyProfitFromConfirmedNav`（23:55 兜底）中，当某基金确认净值可获取且比库中更新时，将 `confirmed_nav` / `confirmed_nav_date` 回写 `holdings` 表（幂等）。
- **确认净值三级来源解析（缓存 → DB → API）**：新增统一解析逻辑，读取某基金确认净值的顺序为：①缓存 → ②数据库（新鲜） → ③API；从 DB/API 取到**新鲜确认净值**时写入缓存，供后续命中。
- **盘中估算与展示以解析出的确认净值为基准**：盘中交易时段，估算净值以三级解析得到的确认净值为基准 × (1 + 实时涨跌幅)；确认净值缺失或不新鲜时回退原逻辑。
- 均为最小改动，不新增配置项、不改破坏性 API 签名。

## Impact
- Affected specs: 估算数据源选择、确认净值同步、缓存策略、持仓展示
- Affected code:
  - `server/services/dailyProfitService.js`（回写逻辑）
  - `server/services/globalCache.js`（如需新增缓存键/类型，默认最小化）
  - `server/services/holdingService.js`（确认净值解析与盘中估算基准）
  - 可能少量涉及 `server/services/fundService.js`（如需调整基准传入），默认不改动

## ADDED Requirements

### Requirement: 日收益兜底回写确认净值
在 23:55 日收益兜底（`calculateAndSaveDailyProfitFromConfirmedNav`）逐基金处理中，系统 SHALL 将已获取的确认净值及其日期回写到 `holdings` 表。

#### Scenario: 确认净值已公布且比库中更新
- **WHEN** 兜底处理某用户，某基金 `isConfirmed === true`，`todayNav > 0`，且 `holdings.confirmed_nav_date` 为 `null` 或早于 `latestHistoryDate`
- **THEN** 以 `confirmed_nav = todayNav`、`confirmed_nav_date = latestHistoryDate` 更新该持仓记录，并输出 INFO 日志

#### Scenario: 净值未公布或无需更新
- **WHEN** `todayNav <= 0`，或 `holdings.confirmed_nav_date` 已等于/晚于 `latestHistoryDate`
- **THEN** 不写库，保持原有行为（幂等）

### Requirement: 确认净值三级来源解析（缓存 → 数据库 → API）
系统 SHALL 按"缓存 → 数据库 → API"的优先级解析某基金的最新确认净值，并将从数据库或 API 获得的**新鲜**确认净值写入缓存。

#### Scenario: 缓存命中
- **WHEN** 某基金确认净值的缓存键命中且未过期
- **THEN** 直接使用缓存值，不再访问数据库或 API

#### Scenario: 缓存未命中但数据库值新鲜
- **WHEN** 缓存未命中，且 `holdings.confirmed_nav > 0`，且 `confirmed_nav_date` 等于最近确认交易日（`historyData[0].date`）
- **THEN** 使用数据库值，并将其写入缓存（后续读取命中缓存）

#### Scenario: 缓存未命中且数据库值不新鲜/缺失
- **WHEN** 缓存未命中，且数据库值缺失（占位持仓 `confirmed_nav <= 0`）或日期不等于最近确认交易日
- **THEN** 通过 API（mobapi/lsjz）获取确认净值，并将其写入缓存

### Requirement: 盘中估算以解析出的确认净值为基准
盘中交易时段，系统 SHALL 以三级解析得到的确认净值为基准计算估算净值。

#### Scenario: 确认净值可用
- **WHEN** 交易时段盘中，某基金实时涨跌幅 `estimatedChange` 可用，且解析得到确认净值 `baseNav > 0`
- **THEN** 展示估算净值 = `baseNav × (1 + estimatedChange / 100)`

#### Scenario: 确认净值不可用
- **WHEN** 盘中，解析后确认净值不可用（`baseNav <= 0`）
- **THEN** 回退原逻辑（使用 API 返回的 `estimatedValue` / `netValue`）

## REMOVED Requirements
（无）
