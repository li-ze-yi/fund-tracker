# Tasks

## Task 1: 确认净值新鲜度以交易日锚点为权威校验

- [x] SubTask 1.1: 在 `server/services/holdingService.js` 新增 `getLatestTradingDayAnchor(todayStr)`（从今天前一天回溯最近交易日，跳过周末/节假日，最多回溯 30 天）与 `subDays(dateStr, n)` 本地日期回退工具
- [x] SubTask 1.2: 修改 `resolveConfirmedNav` 盘中/休市分支（无历史数据）——以锚点替代固定 4 天窗口：
  - A 股：`dbFresh = dbNavDate === anchor`
  - QDII（`options.isQDII`）：`dbFresh = dbNavDate ≤ anchor 且 (anchor − dbNavDate) ≤ 2 天`
  - 锚点不可用（交易日历 API 失败）→ 回退原 4 天窗口
- [x] SubTask 1.3: 隔离验证（stub holidayService/fundService/Holding，真实调用 `resolveConfirmedNav`）：DB date=08-25、锚点=08-26 时，A 股 source=none（判不新鲜走兜底）、QDII source=db（判新鲜）

## Task 2: 兜底拉取窗口锚点感知 + 15 天兜底

- [x] SubTask 2.1: 新增 `getHistoryFallbackStartDate(todayStr)`：`startDate = min(锚点 − 1, 今天 − 15)`，基于 todayStr 计算 15 天前（避免 Date.now() 与 todayStr 不一致导致 min 失效）
- [x] SubTask 2.2: 替换三处固定 3 天窗口：
  - `resolveConfirmedNav` 第④步同步拉取兜底
  - `enrichHoldingsWithRealTimeData` 全天休市定向修复（source=none 时）
  - `fundController.batchGetInfo` 批量历史兜底（`fallbackStartDate`）
- [x] SubTask 2.3: 真实 API 回归验证（005827/161725）：
  - 原 3 天窗口：春节中（2025-02-02）0 条、国庆中（2025-10-05）0 条
  - 15 天窗口：拉到节前最后交易日净值（01-27 / 09-30），普通交易日/周末也正常
- [x] SubTask 2.4: 验证 timor 429 限流免疫：回溯被限流误判（春节 01-31 等被降级为交易日）时，15 天兜底窗口仍覆盖真实锚点（`min` 取更早者）

## Task 3: QDII/海外基金识别

- [x] SubTask 3.1: 新增并导出 `isQdiiFundType(type)`：`/QDII|海外/` 匹配 `funds.type`
- [x] SubTask 3.2: 全量扫描 27650 只基金（fundcode_search.js）验证覆盖：
  - 名称含强海外词（纳指/标普500/日经/美股/欧股/中概/海外等）且非港股通的基金，判定 true 漏网 = 0
  - A 股类型（混合型-偏股/指数型-股票/股票型等）不误伤；港股通基金（净值当天确认）正确判定 false
- [x] SubTask 3.3: 在调用链传入 `isQDII`：
  - `fundController.getByCode` 休市/开市两处（`fund.type`）
  - `fundController.batchGetInfo` 两处（`fundMap[code].type`）
  - `holdingService.enrichHoldingsWithRealTimeData`（`Fund.findByCodes` 批量查类型，失败降级严格校验）

## Task 4: QDII 参与每日收益 + 净值日去重

- [x] SubTask 4.1: `enrichHoldingsWithRealTimeData` 的 `isConfirmed` 对 QDII 放宽（最新净值日距今天 ≤2 天），复用 `isQDII` 变量传给 `resolveConfirmedNav`
- [x] SubTask 4.2: `dailyProfitService.calculateAndSaveDailyProfitFromConfirmedNav`：
  - `Fund.findByCodes` 批量查类型构建 `fundTypeMap`
  - `isConfirmed` 对 QDII 放宽（≤2 天）
  - 读取最近一条日收益记录构建 `prevNavDateMap`（各基金已计入的 nav_date）
  - 净值日去重：仅 `isQDII` 且最新净值日未推进（`latestHistoryDate ≤ prevNavDate`）时跳过防重复
  - `fundsDetails` 记录 `nav_date`
- [x] SubTask 4.3: 隔离验证（stub 依赖，真实调用兜底直算）三场景：
  - 无上次记录：QDII 参与（profit=10）、A 股滞后 1 天不参与
  - 上次 nav_date=08-25 且净值停滞：QDII 去重跳过
  - 上次 nav_date=08-24 且净值推进到 08-25：正常计入 profit=10
- [x] SubTask 4.4: 去重限定 `isQDII`，确认 A 股不受影响（保持每天按当天净值覆盖重算的原行为）
- [x] SubTask 4.5: `npm test`（7/7）、`node --check` 各改动文件、服务启动验证通过
- [x] SubTask 4.6: QDII 日收益参与判定统一为 `latestHistoryDate === yesterday`（与展示"盘后已确认"口径完全一致），移除 ≤2 天放宽——美股节假日/净值停滞时（≠昨天）不参与
- [x] SubTask 4.7: 隔离验证（today=2026-08-28）三场景：QDII=昨天+A股=今天 均参与 / QDII=前天 不参与 / QDII=昨天+A股=昨天（QDII参与、A股严格不参与），全部符合
- [x] SubTask 4.8: 确认盘中路径（`calculateAndSaveDailyProfit` 按 is_confirmed 分组）不误判：QDII 盘中（<15 点）is_confirmed=false 不参与；盘后（≥15 点）最新净值日=昨天才参与

## Task 5: QDII 盘中/盘后状态判定细化 + 新购估算基准窗口收窄

- [x] SubTask 5.1: `enrichHoldingsWithRealTimeData` 的 `isConfirmed` 恢复严格（A 股 `=== today`），移除 QDII ≤2 天统一放宽——修复盘中 QDII 被误判"已确认"（update_status=confirmed）的回归
- [x] SubTask 5.2: QDII 盘中/盘后细化：`isConfirmed = latestHistoryDate === today || (isQDII && hour ≥ 15 && latestHistoryDate === subDays(today, 1))`——盘中估算中、盘后按最新净值判已确认
- [x] SubTask 5.3: `resolveConfirmedNav` QDII 盘中 DB 新鲜度窗口从 `[anchor−2, anchor]` 收窄为 `[anchor−1, anchor]`——防新购/加仓补录的买入日净值被误判新鲜
- [x] SubTask 5.4: 隔离验证 isConfirmed 判定表达式 6 场景（A 股严格 / QDII 盘中 / QDII 盘后按最新 / 净值停滞）全部正确
- [x] SubTask 5.5: 真实数据验证新购 QDII（006479 新购 08-24→navDate 08-25）：修复后估算基准=08-26 最新确认净值（7.9526）而非买入日 08-25（7.9504）

## Task 6: 年度节假日接口（免疫 timor 429 限流）

- [x] SubTask 6.1: `holidayService` 新增 `getHolidayYearData(year)` + `parseHolidayYear`：调用 timor `year/{year}/` 一次拉整年（键 `MM-DD`，`holiday=true/false`），缓存 24h
- [x] SubTask 6.2: `isHoliday` 优先年度缓存判定，年度接口不可用（返回 null）回退原单日接口
- [x] SubTask 6.3: 真实验证 9 天长假回溯（国庆 10-01~10-09）：仅 1 次年接口、0 次单日请求（原第 4 个请求即 429）；9 组节假日判定全部正确
- [x] SubTask 6.4: 确认 `isTradingDay` 保持周末短路（A 股周末无论是否调休补班均不开市），补班信息对股市判定无意义
- [x] SubTask 6.5: 外部调用点审计（15 处）全部通过 isTradingDay/nextTradingDay/ensureTradingDay → isHoliday → 年度缓存，无绕过
- [x] SubTask 6.6: `npm test`（7/7）通过

# Task Dependencies

- Task 1、Task 2、Task 3 有先后依赖：Task 1 锚点校验依赖 Task 3 的 QDII 识别（`options.isQDII`）；Task 2 兜底窗口依赖 Task 1 的锚点回溯
- Task 4 依赖 Task 3（`isQdiiFundType`）与 Task 1 的口径（QDII 滞后 ≤2 天），实现顺序在 Task 1/3 之后
- Task 5 修正 Task 1/4 的 QDII 口径（展示 isConfirmed 与日收益参与判定分离、DB 新鲜度窗口收窄），验证阶段发现后补充实施
- Task 6 独立于 Task 1-5（日历数据源增强），全部调用点自动受益
- 各 Task 验证独立执行（隔离脚本 stub 外部依赖，不污染真实数据）

## Task 7: 节假日接口并发去重 + 独立 TTL

**Status**: ✅ done

**SubTasks**:
- [x] inflightYearPromises Map：getHolidayYearData 并发合并（缓存 miss 后查 inflight，请求完 finally 删除）
- [x] inflightHolidayPromises Map：isHoliday 并发合并（缓存 hit fast path 不合并；miss 后查 inflight，finally 删除）
- [x] ailedYearTimestamps Map + FAILURE_CACHE_TTL_MS = 5min：年度接口 catch 里 set，请求前检查，成功时 delete
- [x] 失败降级路径保留：年度跳过 → 单日 fallback → 单日也失败 → 降级为非节假日（周末短路仍生效）
- [x] globalCache.getTTL 新增 holiday_year（30 天）+ holiday_day（3 天）
- [x] holidayService 常量从 HOLIDAY_CACHE_TYPE = 'history_chart' 拆分为 HOLIDAY_YEAR_CACHE_TYPE / HOLIDAY_DAY_CACHE_TYPE
- [x] 
ode --check + 
pm test（7/7）通过
- [x] 真实场景验证：10 并发 API 调用次数从 20+（每只基金年度+单日）降到 2（年度 1 + 单日 1）；429 后再调 5 次年度 API 调用次数 = 0
- [x] 提交并推送： 25ab48（并发去重）、163e6e6（独立 TTL 30d/24h）、9669d1（holiday_day 3 天）

---

- Task 7 独立于 Task 1-6（日历数据源进一步增强），解决 cache stampede 与缓存 type 耦合问题