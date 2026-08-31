# 修复新购基金后误判休市 + 持仓/详情收益不一致 Spec

## Why

用户反馈两个问题（验证阶段又发现第三个）：

1. **新购纳斯达克（QDII）基金后所有基金短暂变「休市」**：`checkMarketStatus` 抽样前 3 只持仓的实时数据推导全局开市/休市状态。纳斯达克（QDII）基金的确认净值日期（`date-only` 格式，如 `2026-08-24`）合法滞后 A 股 1-2 天，被 `isDateOnly` 陈旧判定逻辑误判为「数据过期」（`dayDiff > maxNormalDiff`），导致**全局**市场状态翻转为 `market_closed`，所有基金短暂显示「休市」（配合 `market_status` 缓存 15s TTL，表现为「短暂」）。

2. **持仓界面与基金详情界面当日收益/累计收益不一致**：持仓列表走 `holdingService.calculateHoldingMetrics`，基金详情走 `fundController.getByCode`，两套独立计算逻辑。盘中估算时详情页用 `realTime.gainPercent`（API 确认涨跌幅，通常为昨日）计算当日收益，而持仓页用 `estimatedChange`（今日盘中估算涨跌幅）；且持仓金额基准不同（`realTime.netValue` vs 解析出的 `confirmedNav`），导致两边 `daily_profit`/`accumulated_profit` 结果不一致。详情页内部也存在口径不一：展示的涨幅是 `estimatedChange`，而计算的当日收益却基于 `gainPercent`。

3. **补录历史购买后累计收益显示 0**：新购基金选择过去日期（如 21 日）走 confirmed 流程时，`getConfirmedNavByDate` 会把**买入日历史净值**写入 `confirmed_nav_{code}` 缓存（语义本应为「最新确认净值」）。`resolveConfirmedNav` ① 缓存命中直接返回该值，导致市值被钉在买入日净值（≈买入成本）→ `accumulated_profit ≈ 0`，直到缓存过期（盘中 `history_recent` TTL 最长 30 分钟）才恢复正常。实测：006479 最新净值 08-24 (7.9007)、买入 21 日 (7.9775)，修复前 `ap=0`，修复后 `ap=-96.27`。

## What Changes

- `server/services/holdingService.js` — `checkMarketStatus`：以 `holidayService.isTradingDay(今天)` 为全局开市/休市判定的权威信号（与 `enrichHoldingsWithRealTimeData` 内 `isFullDayClosed`、`routes/market.js /status` 的口径一致）；移除「date-only 确认净值陈旧 → 全局休市」的误判。单只基金的真实陈旧/休市仍由 `getFundMarketStatus` 按单只处理。
- `server/controllers/fundController.js` — `getByCode`：有持仓的用户分支复用 `holdingService.calculateHoldingMetrics`（该函数已导出），传入与持仓列表一致的数据源（`resolveConfirmedNav` 解析的确认净值、`yesterdayNav`、今日交易份额、`isPendingPurchase`、`effectiveMarketStatus`），使详情页当日收益/累计收益/持仓金额/估算涨幅/净值/更新状态与持仓列表完全一致。
- `server/services/settlementService.js` — `getConfirmedNavByDate` 增加 `options.skipCacheWrite` 参数（默认 false，其余调用点保持原写回逻辑）；三个「用户任选日期」入口均传 `{ skipCacheWrite: true }`：新购基金（`holdingController.purchase`）、加仓（`transactionController.buy`）、卖出（`transactionController.sell`）——解析到历史买入/卖出日净值后**不写回** `confirmed_nav_{code}` 缓存，避免历史净值污染「最新确认净值」缓存导致市值被钉在买入日、累计收益≈0。
- 不涉及前端改动，不涉及数据库 schema 变更。

## Impact

- Affected code:
  - `server/services/holdingService.js` — `checkMarketStatus`（L63-L195）
  - `server/controllers/fundController.js` — `getByCode`（L42-L266）
  - `server/services/settlementService.js` — `getConfirmedNavByDate`（L148-L180）
  - `server/controllers/holdingController.js` — `purchase`（L317-L326）
  - `server/controllers/transactionController.js` — `buy`（L57-L59）、`sell`（L140-L142）
- Affected specs: `new-purchase-flow-analysis`（持仓指标计算链路）、`analyze-valuation-pipeline`、`fix-holdings-no-data`（估值链路）
- 下游影响面：`checkMarketStatus` 还被 `batchGetInfo`（L379）与 `dailyProfitService.isTradingDay`（L38）调用，改动需保证这两处行为一致（工作日开市、周末/节假日休市）；`getConfirmedNavByDate` 其余调用点（pending 订单自动结算、日收益计算）不传 `skipCacheWrite`，写回行为与修复前一致（pending 订单 navDate ≥ 今天，风险低），仅用户任选日期的三个入口跳过写回（结算正确性不依赖该写回）。

---

## ADDED Requirements

### Requirement: 全局市场状态以交易日历为准

`checkMarketStatus` SHALL 以 `holidayService.isTradingDay(今天)` 作为全局开市/休市的判定依据：工作日 → `isMarketOpen: true`；周末/法定节假日 → `isMarketOpen: false`。不再因抽样基金中某只基金的确认净值日期（`date-only`）陈旧而将全局市场判定为休市。

#### Scenario: 工作日新购纳斯达克基金后刷新持仓

- **WHEN** 今天是工作日（`isTradingDay=true`），持仓列表中包含新购的纳斯达克基金，其确认净值日期为 1-2 天前（date-only 格式，如 `2026-08-24`）
- **THEN** `checkMarketStatus` 返回 `isMarketOpen: true`（全局开市）
- **AND** 所有基金不再短暂变为 `market_closed`（休市）
- **AND** 单只基金（如纳斯达克基金本身）是否休市仍由 `getFundMarketStatus` 按该基金自身实时数据判定，不影响其他基金

#### Scenario: 周末/法定节假日

- **WHEN** 今天是周末或法定节假日（`isTradingDay=false`）
- **THEN** `checkMarketStatus` 返回 `isMarketOpen: false`，所有基金显示「休市」（与既有行为一致）

#### Scenario: 交易日盘中/盘后

- **WHEN** 今天是交易日，基金确认净值尚未公布（date-only 确认净值日期为昨天）
- **THEN** `checkMarketStatus` 返回 `isMarketOpen: true`
- **AND** 各基金状态由 `resolveUpdateStatus` 按 `estimating`/`pending_confirm`/`no_estimate` 等正常判定，不显示「休市」

### Requirement: 节假日接口失败时回退抽样检测（去除 date-only 误判）

当 `holidayService.isTradingDay` 抛错/不可用时，`checkMarketStatus` SHALL 回退到抽样检测作为兜底；抽样检测 SHALL 只依据「含时间戳的实时估值广泛陈旧」或「抽样数据全部为空且非交易时段」判定全局休市，不得因某只基金的 date-only 确认净值日期陈旧而判定全局休市。

#### Scenario: 节假日接口异常

- **WHEN** `isTradingDay` 调用抛出异常（网络/上游故障）
- **AND** 抽样基金中包含确认净值日期陈旧的纳斯达克基金（date-only）
- **THEN** 全局市场状态不得因该基金判定为休市（fail-safe 保持开市或仅按实时估值陈旧判定）
- **AND** 不阻塞持仓/详情接口返回

### Requirement: 基金详情复用持仓指标计算

`getByCode` 在有持仓的用户分支 SHALL 复用 `holdingService.calculateHoldingMetrics` 计算持仓指标（`market_value`/`daily_profit`/`accumulated_profit`/`estimated_change`/`net_value`/`update_status`/`data_source`/`is_fresh`/`day_of_week`/`is_confirmed`），传入数据与持仓列表保持一致：解析出的确认净值（`resolveConfirmedNav`，缓存→DB→API）、`yesterdayNav`（3d 历史）、今日交易份额（`transaction_date=今天 AND status='confirmed'`）、`isPendingPurchase`（存在 pending 买入且 `confirmed_nav` 为空）、`effectiveMarketStatus`（`getFundMarketStatus(realTime, marketStatus)`）。

#### Scenario: 盘中查看持仓基金详情

- **WHEN** 用户在交易时段打开某有持仓基金的详情页（`update_status=estimating`）
- **THEN** 详情页 `daily_profit` 与持仓列表一致（均基于盘中估算涨跌幅 `estimatedChange` 计算）
- **AND** 详情页 `accumulated_profit` 与持仓列表一致（基于相同的确认净值基准与今日买入调整）
- **AND** 详情页展示的涨幅（`estimated_change`）与计算当日收益的百分比口径一致（均用 `estimatedChange`）

#### Scenario: 详情页累计收益与持仓页一致

- **WHEN** 用户持有某基金，同时查看持仓列表与基金详情页
- **THEN** 两处 `market_value`/`daily_profit`/`accumulated_profit` 数值完全一致（同一计算函数、同一数据源）

#### Scenario: 无持仓/自选场景不受影响

- **WHEN** 用户未持有该基金（仅自选/搜索查看）或未登录
- **THEN** `getByCode` 的非持仓分支逻辑保持不变（净值/涨幅/更新状态按原路径返回，不计算持仓收益字段）

### Requirement: 用户任选日期入口不写回最新确认净值缓存

`getConfirmedNavByDate` SHALL 支持 `options.skipCacheWrite`（默认 false）；三个「用户任选日期」入口 SHALL 以 `{ skipCacheWrite: true }` 调用：新购基金（`holdingController.purchase`）、加仓（`transactionController.buy`）、卖出（`transactionController.sell`）。解析到历史买入/卖出日净值后**不写回** `confirmed_nav_{code}` 缓存。其余调用点（pending 订单自动结算、日收益计算，navDate ≥ 今天）不传该选项，写回逻辑与修复前一致。该缓存语义为「最新确认净值」，补录历史日期的历史净值 SHALL NOT 被写入，避免市值被钉在买入日成本导致累计收益≈0。

#### Scenario: 新购/加仓/卖出选择历史日期

- **WHEN** 用户通过新购基金、加仓或卖出入口选择过去日期（如 2026-08-21），走 confirmed 流程后立即查看持仓
- **AND** 该基金最新确认净值日期（如 2026-08-24）晚于买入/卖出日（2026-08-21）
- **THEN** `getConfirmedNavByDate(..., { skipCacheWrite: true })` 解析到 21 日净值并返回，但**不写回** `confirmed_nav` 缓存
- **AND** 持仓列表 `market_value` 基于最新确认净值（08-24）计算，而非买入/卖出日净值
- **AND** `accumulated_profit = market_value - total_cost` 显示真实盈亏（如 -96.27），不再为 0
- **AND** 基金详情页与持仓列表显示一致

#### Scenario: pending 结算等场景写回不受影响

- **WHEN** `getConfirmedNavByDate` 被 pending 订单自动结算（settlePendingAsync / pendingSettleService / 日收益）调用，未传 `skipCacheWrite`
- **THEN** 写回 `confirmed_nav` 缓存的行为与修复前一致（这些订单 navDate ≥ 今天，写回近期净值安全）
- **AND** 结算正确性不依赖写回（返回的 nav 值始终正确）

---

## MODIFIED Requirements

### Requirement: checkMarketStatus 全局休市判定收敛

原 `checkMarketStatus` 的「date-only 确认净值陈旧（`dayDiff > maxNormalDiff`）→ 全局 `market_closed`」逻辑 SHALL 被移除，全局开市/休市改以 `isTradingDay` 为权威信号；「含时间戳实时估值陈旧」的抽样兜底仅在 `isTradingDay` 不可用时保留。

### Requirement: getByCode 持仓收益计算收敛

原 `getByCode` 持仓分支中「`estimated_change` 展示 `estimatedChange` 但 `dailyGain` 计算用 `realTime.gainPercent`」的口径不一致 SHALL 被消除，统一为 `calculateHoldingMetrics` 的结果。

---

## REMOVED Requirements

无
