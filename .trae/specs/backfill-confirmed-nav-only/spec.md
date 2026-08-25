# 23:55 兜底任务改用确认净值直算 Spec

## Why
当前 23:55 兜底任务 (`backfillDailyProfit`) 复用了 `holdingService.enrichHoldingsWithRealTimeData(holdings, true)`，该方法会同时拉取新浪实时估值数据和 3 天历史净值。但在 23:55：
- A 股早已收盘（15:00），盘中实时估值已无意义，新浪接口返回的只是过时估算或昨日确认净值；
- 基金公司当日确认净值通常在 20:00–23:00 间已发布，历史净值接口（东方财富 lsjz）即可拿到；
- 仍调用新浪估值接口既浪费外部 API 配额，还可能命中已知 403 风险（新浪封云厂商 IP）。

更隐蔽的问题是：`calculateHoldingMetrics` 在 `!marketStatus.isMarketOpen` 分支会把 `daily_profit` 强制置 0（[holdingService.js:497](file:///d:/fundtracker/server/services/holdingService.js#L497)），导致兜底任务进入 [dailyProfitService.js:110-113](file:///d:/fundtracker/server/services/dailyProfitService.js#L110-L113) 的"全 0 跳过"分支，可能让本应记录的日收益漏算。

因此应让 23:55 兜底走一条"只拉历史确认净值、直算当日收益"的独立路径，绕开实时估值与 `enrichHoldingsWithRealTimeData`。

## What Changes
- 在 `dailyProfitService` 中新增 `calculateAndSaveDailyProfitFromConfirmedNav(userId, holdings)` 方法：仅调用 `fundService.batchGetHistoryNetValues` 拉取"近 3 天 → 今天"的确认净值，按 `今日确认净值 - 昨日确认净值` 直算每只基金当日收益，跳过新浪实时接口与 `enrichHoldingsWithRealTimeData`。
- `backfillDailyProfit()` 改为调用新方法，不再调用 `enrichHoldingsWithRealTimeData`。
- 交易日判断改用 `holidayService`（或既有 `isTradingDay` 的周末降级分支）判定，不依赖实时数据采样，避免 23:55 触发额外新浪请求。
- 复用现有 `_settlePendingTransactions`（已基于历史净值结算），保持"先结算 pending → 再算日收益"的顺序不变。
- 不改动 `enrichHoldingsWithRealTimeData` 与持仓页展示路径，避免影响盘中估值显示。

## Impact
- Affected specs: 无直接关联 spec（与 `include-sold-out-fund-in-daily-profit`、`ensure-pending-order-auto-settle` 在兜底任务上有交集，但本次只改数据获取路径）。
- Affected code:
  - [server/services/dailyProfitService.js](file:///d:/fundtracker/server/services/dailyProfitService.js) — 新增方法 + 改造 `backfillDailyProfit`
  - [server/services/fundService.js](file:///d:/fundtracker/server/services/fundService.js#L1363) — 复用 `batchGetHistoryNetValues`（只读，不改动）
  - [server/services/holidayService.js](file:///d:/fundtracker/server/services/holidayService.js) — 复用节假日判断（只读，不改动）

## ADDED Requirements
### Requirement: 兜底任务仅基于确认净值计算日收益
23:55 兜底任务 SHALL 仅通过历史净值接口（东方财富 lsjz）获取当日与昨日确认净值，并直接计算日收益，不得调用新浪实时估值接口或 `enrichHoldingsWithRealTimeData`。

#### Scenario: 当日确认净值已发布
- **WHEN** 23:55 触发兜底任务，且某基金当日确认净值已在历史净值接口中返回
- **THEN** 该基金 `daily_profit = yesterdayShares * (todayConfirmedNav - yesterdayConfirmedNav)`，`market_value = shares * todayConfirmedNav`
- **AND** 该基金被标记为 `is_confirmed = true` 参与统计

#### Scenario: 当日确认净值尚未发布
- **WHEN** 23:55 触发兜底任务，但某基金当日确认净值未在历史净值接口中出现（最新净值日期 < 今天）
- **THEN** 该基金被标记为 `is_confirmed = false`，不参与当日收益计算
- **AND** 不回退到实时估值，不调用新浪接口

#### Scenario: 非交易日跳过
- **WHEN** 23:55 触发兜底任务，且当天为周末或节假日
- **THEN** 任务直接返回，不发起任何外部 API 请求（历史净值接口也不调用）

#### Scenario: pending 订单先结算
- **WHEN** 用户存在 pending 交易订单
- **THEN** 兜底任务先调用 `_settlePendingTransactions` 结算（基于历史确认净值）
- **AND** 结算完成后再基于最新持仓计算日收益

### Requirement: 兜底任务不重复统计已记录用户
兜底任务 SHALL 保留"查 `daily_profits` 表今日已记录用户"的去重基础，但 SHALL 区分"完整记录"与"部分记录"：
- **完整记录**（现有记录 `details.summary.confirmed_funds >= details.summary.total_funds`，即计算时所有基金已确认）→ 跳过，不重复计算。
- **部分记录**（`confirmed_funds < total_funds`，即计算时有基金未确认）→ 重新调用新方法补算，用 `DailyProfit.upsert` 覆盖写入，把后续新确认的基金纳入当日收益。
- **无记录** → 调用新方法补算一次。

这样既避免对已完整的记录做冗余重算，又能让"早打开 App 时部分基金未确认"的用户在 23:55 拿到包含全部已确认基金的最终收益。`upsert` 保证不会产生重复记录，只会覆盖更新。

#### Scenario: 用户当日已打开过持仓页且全部基金已确认
- **WHEN** 用户当日已通过持仓页触发 `calculateAndSaveDailyProfit`，且当时所有持仓基金均已确认（`confirmed_funds >= total_funds`）
- **THEN** 23:55 兜底任务查询 `daily_profits WHERE date = today` 命中该用户
- **AND** 读取其 `details.summary` 判定为完整记录
- **AND** 该用户被跳过，不调用新方法，不产生冗余计算或覆盖

#### Scenario: 用户当日早打开过持仓页但部分基金尚未确认
- **WHEN** 用户当日 20:00 打开持仓页时 5 只基金中仅 2 只确认，`daily_profits` 写入记录 `confirmed_funds=2, total_funds=5`
- **AND** 21:00 后剩余 3 只基金净值确认
- **THEN** 23:55 兜底任务查询该用户记录，判定 `confirmed_funds(2) < total_funds(5)` 为部分记录
- **AND** 重新调用 `calculateAndSaveDailyProfitFromConfirmedNav`，基于当前已确认的全部基金重算
- **AND** `DailyProfit.upsert` 覆盖原记录，最终记录包含全部 5 只已确认基金的收益

#### Scenario: 用户当日未打开 App
- **WHEN** 用户当日未触发任何日收益计算，`daily_profits` 表无今日记录
- **THEN** 该用户进入待补算列表
- **AND** 兜底任务对该用户调用新方法补算一次

### Requirement: 收益计算不受"市场已收盘"置零影响
兜底任务的日收益计算 SHALL 独立于 `calculateHoldingMetrics` 的 `!marketStatus.isMarketOpen` 分支，避免因市场收盘判定导致 `daily_profit` 被强制置 0 而漏算。

#### Scenario: 23:55 当日确认净值存在
- **WHEN** 当前时间为 23:55，市场已收盘，但当日确认净值已发布
- **THEN** 日收益按确认净值差正常计算并写入 `daily_profits` 表
- **AND** 不触发"所有确认基金收益为 0，跳过"的早退分支

## MODIFIED Requirements
### Requirement: 兜底任务数据获取路径
原 `backfillDailyProfit` 通过 `enrichHoldingsWithRealTimeData(holdings, true)` 同时获取实时估值与历史净值；现改为只获取历史确认净值并直算收益，不再触发新浪批量实时接口。
