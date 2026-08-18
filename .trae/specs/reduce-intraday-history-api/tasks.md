# Tasks

- [ ] Task 1: 盘中跳过 3d 历史拉取
  - 在 `server/services/holdingService.js` 的 `enrichHoldingsWithRealTimeData` 历史拉取块（约 L355-L381）：
    - 计算 `isTradingHours`（本地 9:00-15:00，与 `calculateHoldingMetrics` 中一致）。
    - 交易时段（含 `forceRefresh`）跳过对 `history_{code}_3d` 的 API 请求：`historyNeedFetch` 置空，仅复用已有缓存（`historyDataMap` 用 `checkCache` 命中值，未命中留空）。
    - 输出 INFO 日志说明盘中跳过历史拉取。
  - 验证：交易时段日志中不出现 3d 历史拉取；盘后行为与原来一致。

- [ ] Task 2: 确认净值新鲜度改为日期启发式 + 回退 API 时写回缓存与数据库
  - 在 `server/services/holdingService.js` 的 `resolveConfirmedNav`（约 L209-L254）：
    - 当 `historyData` 为空/无 `latestHistoryDate`（盘中跳过拉取后的场景）时，DB 新鲜度改用日期启发式：`dbNav > 0` 且 `dbNavDate < today` 且 `today - dbNavDate <= 4`（覆盖周末/节假日）。
    - 命中则返回 DB 值（source='db'）并 `globalCache.set` 写回 `confirmed_nav_{code}`。
    - 未命中（不新鲜/缺失）走 API 兜底（`realTimeData.netValue` / lsjz）：
      - 写入 `confirmed_nav_{code}` 缓存；
      - **非占位持仓**（`holding.confirmed_nav !== null`）时，用 `Holding.update` 回写 `holdings.confirmed_nav` / `confirmed_nav_date`（自愈），`.catch` 保护并输出 INFO 日志；
      - 占位持仓（`confirmed_nav === null`）只写缓存、不回写数据库。
    - 有 `latestHistoryDate` 时保持现有 `dbNavDate === latestHistoryDate` 逻辑不变。
  - 验证：盘中 DB 值新鲜时命中 DB 且写入缓存；不新鲜/缺失（非占位）时回退 API 并写回缓存与数据库；占位持仓不回写数据库。

- [x] Task 3: 23:55 回写跳过占位持仓
  - 在 `server/services/dailyProfitService.js` 的回写块（约 L265-L282）：
    - 在回写条件前增加占位持仓守卫：`holding.confirmed_nav === null` 时跳过写库（保持占位状态），并输出 INFO 日志。
    - 其余真实确认持仓逻辑不变（幂等回写）。
  - 验证：占位持仓 `confirmed_nav` 保持 `null`；真实持仓仍正常回写。

# Task Dependencies
- Task 1 与 Task 2 需协同：Task 1 使盘中无 `historyData`，Task 2 使 `resolveConfirmedNav` 在该场景下正确解析 DB 基准并自愈。
- Task 3 相互独立，可与 Task 1/2 并行实现；统一在验证阶段联动确认。
