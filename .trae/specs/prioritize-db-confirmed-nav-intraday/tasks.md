# Tasks

- [ ] Task 1: 日收益兜底回写确认净值到 holdings
  - 在 `server/services/dailyProfitService.js` 的 `calculateAndSaveDailyProfitFromConfirmedNav` 逐基金循环内（确认基金分支），新增回写逻辑：
    - 当 `todayNav > 0` 时，规范化 `holdings.confirmed_nav_date`（`toISOString().slice(0,10)`，与 holdingService 一致），若其为 `null` 或早于 `latestHistoryDate`，调用 `Holding.update(holding.id, holding.user_id, { confirmedNav: todayNav, confirmedNavDate: latestHistoryDate })`。
    - 用 `.catch()` 包裹写库，单条失败不中断整体收益计算，并输出 INFO 日志（含 fundCode 与日期）。
  - 验证：确认 `holdings` 表该基金 `confirmed_nav`/`confirmed_nav_date` 被正确更新；净值未公布时不写库；重复运行不覆盖更新的值（幂等）。

- [ ] Task 2: 实现确认净值三级来源解析（缓存 → 数据库 → API）并写回缓存
  - 新增/复用确认净值解析逻辑（建议置于 `server/services/holdingService.js` 或 `fundService.js`），按优先级解析某基金确认净值：
    1. 先查缓存（如 `globalCache.checkCache('confirmed_nav_{code}', 合适type)`），命中即返回（不再访问 DB/API）。
    2. 缓存未命中 → 用该持仓的 `holdings.confirmed_nav > 0` 且 `confirmed_nav_date`（规范化后）等于最近确认交易日（`historyData[0].date`）判定新鲜；新鲜则返回 DB 值并 `globalCache.set` 写回缓存。
    3. 否则走 API（mobapi/lsjz，可复用 `batchGetFundmobapiInfo` 结果），取到后 `globalCache.set` 写回缓存。
  - 验证：缓存命中时不再触发 DB/API 查询；从 DB 取到新鲜值后缓存被写入，再次读取命中缓存；占位持仓（`confirmed_nav <= 0`）走 API。

- [ ] Task 3: 盘中估算与展示以解析出的确认净值为基准
  - 在持仓展示链路中，将 Task 2 解析出的确认净值作为盘中估算基准：
    - 判断盘中（`marketStatus.isMarketOpen === true`）且 `realTimeData.estimatedChange` 可用。
    - 解析得到 `baseNav > 0` 时，用 `estimatedValue = baseNav × (1 + estimatedChange / 100)` 作为展示估算净值，并输出 INFO 日志。
    - `baseNav <= 0` 时保持原值（回退 API 的 `estimatedValue` / `netValue`）。
  - 验证：盘中且基准可用时展示值为基准计算；基准不可用时回退原逻辑；不改变非盘中行为。

# Task Dependencies
- Task 2、Task 3 依赖 Task 1 保证 DB `confirmed_nav` 新鲜度（尤其对多日未打开 App 的用户）。
- Task 3 依赖 Task 2 提供的解析函数；Task 1 与 Task 2 相互独立可并行实现，统一在验证阶段联动确认。
