# 确认净值新鲜度交易日锚点校验 + QDII/海外基金适配 Spec

## Why

围绕"确认净值新鲜度判定"与"QDII/海外基金适配"发现的多类问题：

1. **盘中 DB 确认净值最多 4 天误差**：`resolveConfirmedNav` 盘中/休市分支（无历史数据时）用固定启发式"DB 日期距今天 ≤ 4 天视为新鲜"。若 DB 存的是用户任选历史买入日/未自愈的旧确认净值，盘中估算与持仓金额会基于 4 天前的旧净值作为基准，产生最多 4 天误差。

2. **长假兜底拉取拉不到节前最后交易日净值**：确认净值 API 兜底用固定 3 天历史窗口（`today-3 ~ today`）。长假进行中（今天处于假期）时窗口内全是节假日，`getHistoryNetValues` 返回空（实测 005827/161725 春节/国庆均 0 条），导致 `resolveConfirmedNav` 返回 `source=none`，基金详情/自选列表显示无净值。

3. **节假日 API 限流导致锚点回溯不可靠**：timor.tech 节假日 API 连续请求即 429 限流（实测第 4 个请求触发）。长假回溯最近交易日需连续查询多个工作日，大概率限流 → 假期工作日被降级误判为交易日 → 锚点算错（偏晚），锚点感知窗口失效。

4. **QDII/海外基金确认净值滞后被误判不新鲜**：纳斯达克/标普/恒生等 QDII 与跨境 ETF 的确认净值日期合法滞后 A 股 1-2 天（实测纳指基金最新净值 08-25，A 股 08-26）。交易日锚点校验要求 `dbNavDate === 中国最近交易日`，QDII 恒不满足 → 频繁判不新鲜、循环走兜底拉取，兜底失败时显示无净值。

5. **QDII 从不计入每日收益**：日收益两条路径（`calculateAndSaveDailyProfit` 的 `is_confirmed` 与 23:55 兜底直算 `isConfirmed`）均以 `latestHistoryDate === today` 判定"已确认"，QDII 最新净值日期永不等于今天 → 恒判"未确认" → 从不参与每日收益统计。

6. **QDII 盘中被误判"已确认"（回归）**：为让 QDII 参与日收益，曾将 `enrichHoldingsWithRealTimeData` 的 `isConfirmed` 放宽为"最新净值日距今天 ≤2 天视为已确认"，但该变量同时驱动 `update_status`（`resolveUpdateStatus`：isConfirmed → 'confirmed'）与 `daily_profit` 分支 → 盘中 QDII（今天净值未公布）被误显示为"已确认"。需将"盘中展示确认"（严格）与"日收益参与判定"（放宽）分离。

7. **QDII 盘后恒为"待确认"**：严格 `isConfirmed = latestHistoryDate === today` 对 QDII 恒假（净值日期永远滞后 1 天）→ 即使晚间净值已公布（最新净值日期推进到昨天）也永远显示 `pending_confirm`，与"净值已更新"的展示不一致。

8. **新购 QDII 估算基准误用买入日净值**：QDII 盘中 DB 新鲜度窗口 `[anchor−2, anchor]` 过宽，新购/加仓补录写入的"买入日净值"（滞后 2 天，如 08-25 vs 锚点 08-27）被判新鲜 → `resolveConfirmedNav` 第②步采用并写回缓存 → 盘中估算基准用买入日净值而非最新确认净值（实测 7.9504 vs 7.9526）。

9. **节假日 API cache stampede 导致 429 刷屏**：年度节假日缓存（`holiday_year_2026`）过期/服务重启 → 缓存 miss 时，并发接口路径（如 `enrichHoldingsWithRealTimeData` 对每只基金调 `getLatestTradingDayAnchor`）**并发 10+ 个** `isTradingDay/isHoliday` → 同时发起年度接口请求 → timor.tech 429。失败时缓存没写入 → 后续并发继续 miss → 每次调用链都触发一波 429 刷屏（日志里一秒内几十条 WARN）。

10. **节假日缓存 type 与 TTL 不匹配**：之前节假日缓存（年度表 + 单日结果）复用 `history_chart` type（24h TTL）。年度节假日全年固定不变，单日判定确定后也全年不变，24h TTL 过短会导致不必要的过期刷新；且与走势图缓存共用 type，cleanup 按 type 批量清理时互相干扰。

## What Changes

- `server/services/holdingService.js`：
  - 新增 `getLatestTradingDayAnchor(today)`：从今天前一天起回溯最近交易日（`holidayService.isTradingDay` 跳过周末/节假日），作为"最新确认净值应属日期"的权威锚点。
  - 新增 `getHistoryFallbackStartDate(today)`：兜底拉取起始日期 = `min(锚点 − 1, 今天 − 15)`。取更早者保证必然覆盖真实锚点（最长节假日连休约 10 天 < 15 天），且不依赖逐日节假日 API（免疫 timor 429 限流）。
  - 新增并导出 `isQdiiFundType(type)`：`/QDII|海外/` 匹配 `funds.type`，覆盖 `QDII-*`（10 种）与 `指数型-海外股票`（纳指/标普/恒生/日经/油气等跨境 ETF）。
  - `resolveConfirmedNav` 盘中分支：以最近交易日为锚点——A 股要求 `dbNavDate === anchor`（严格相等）；QDII 允许 `dbNavDate ∈ [anchor−1, anchor]`（正常滞后 1 天；**不得放宽到 [anchor−2, anchor]**，否则新购补录的买入日净值会被误判新鲜）；交易日历不可用时回退原 4 天窗口。
  - 第④步同步拉取兜底：`startDate` 改用 `getHistoryFallbackStartDate`（锚点 + 15 天兜底），替换固定 3 天窗口。
  - 全天休市定向修复：同样改用 `getHistoryFallbackStartDate`。
  - `enrichHoldingsWithRealTimeData`：批量查基金类型构建 `fundTypeMap`，`isConfirmed` 判定细化为——A 股严格 `latestHistoryDate === today`；QDII 盘中（<15 点）未确认、盘后（≥15 点）且最新净值日期 = 昨天视为已确认（`isQDII && hour ≥ 15 && latestHistoryDate === 昨天`）。`isQDII` 复用传给 `resolveConfirmedNav`。
- `server/controllers/fundController.js`：
  - `getByCode` 两处（休市/开市分支）与 `batchGetInfo` 两处：`resolveConfirmedNav` 传入 `{ isQDII: isQdiiFundType(fund.type) }`。
  - `batchGetInfo` 批量历史兜底：`startDate` 改用 `getHistoryFallbackStartDate`（锚点 + 15 天），替换 `today-3`。
- `server/services/dailyProfitService.js`（兜底直算 `calculateAndSaveDailyProfitFromConfirmedNav`）：
  - 批量查基金类型识别 QDII；`isConfirmed` 判定与展示"盘后已确认"口径一致——A 股 `latestHistoryDate === today`、QDII `latestHistoryDate === yesterday`（不再使用 ≤2 天放宽，美股节假日净值停滞时不参与）。
  - **净值日去重（仅 QDII）**：读取最近一条日收益记录中各基金已计入的 `nav_date`，QDII 最新净值日期未推进（美股节假日净值停滞）时跳过，防止重复计入同一净值差。
  - `fundsDetails` 记录 `nav_date`（本次计入的最新净值日），供下次去重。
  - 去重仅作用于 `isQDII`，A 股保持原逻辑（每天按当天净值覆盖重算，不受影响）。
- `server/services/holidayService.js`：
  - 新增年度节假日接口 `getHolidayYearData(year)` + `parseHolidayYear(year)`：一次请求 timor `year/{year}/` 返回整年节假日（键为 `MM-DD`，`holiday=true` 放假、`false` 调休补班）。
  - `isHoliday` 优先查年度缓存（含整年判定），年度接口不可用时回退原单日接口——长假回溯最近交易日不再逐日请求单日接口（免疫 timor 429 限流）。
  - `isTradingDay` 保持周末短路（A 股周末无论是否调休补班均不开市），年度表 `holiday: false`（补班）对股市判定无意义。
  - **并发去重（cache stampede 防御）**：新增模块级 `inflightYearPromises` / `inflightHolidayPromises` Map，同一 year 的年度接口请求在飞时后续并发合并到同一个 promise；同一 dateStr 的 isHoliday 请求同理。
  - **429 失败标记**：新增 `failedYearTimestamps` Map + 5min TTL，年度接口 429/网络失败后 5 分钟内跳过该 year 的年度请求（避免反复炸 API）。
  - **独立缓存 type**：从复用 `history_chart` 解耦——`holiday_year`（30 天 TTL，年度表全年固定不变）、`holiday_day`（3 天 TTL，单日结果年度失败时回退写入，作为冗余覆盖）。
- `server/services/globalCache.js`：
  - `getTTL` switch 新增 `holiday_year` 和 `holiday_day` 两个 case。
- 不涉及前端改动，不涉及数据库 schema 变更。

## Impact

- Affected code:
  - `server/services/holdingService.js` — `getLatestTradingDayAnchor` / `getHistoryFallbackStartDate` / `isQdiiFundType`（新增）、`resolveConfirmedNav`（盘中分支与第④步）、`enrichHoldingsWithRealTimeData`（isConfirmed 盘中严格/盘后按最新）
  - `server/controllers/fundController.js` — `getByCode`（L79/L249）、`batchGetInfo`（L320/L429/L445）
  - `server/services/dailyProfitService.js` — `calculateAndSaveDailyProfitFromConfirmedNav`
  - `server/services/holidayService.js` — `getHolidayYearData` / `parseHolidayYear`（新增）、`isHoliday`（年度缓存优先）
- Affected specs: `prioritize-db-confirmed-nav-intraday`（确认净值链）、`reduce-intraday-history-api`（历史缓存）、`fix-market-status-and-metrics-consistency`（净值/收益口径）
- 行为边界：
  - 交易日历 API 不可用时锚点回退 4 天窗口、兜底回退 15 天窗口（fail-safe）。
  - QDII 判定依赖 `funds.type`（来自 fundcode_search.js 同步）；type 缺失/未知时降级为严格校验（安全默认）。
  - 港股通基金（type=`指数型-股票` 等）净值当天确认不滞后，正确排除在 QDII 宽松之外，走 A 股严格路径。

---

## ADDED Requirements

### Requirement: 确认净值新鲜度以最近交易日为锚点

`resolveConfirmedNav` 盘中/休市分支（无历史数据）SHALL 以"最近交易日"（`getLatestTradingDayAnchor`，从今天前一天回溯、跳过周末/节假日）为权威锚点校验 DB 确认净值新鲜度，替代固定 4 天启发式窗口。A 股要求 `dbNavDate === anchor`；QDII（`isQdiiFundType`）允许 `dbNavDate ∈ [anchor−1, anchor]`（正常滞后 1 天）。交易日历 API 不可用时回退原 4 天窗口（兼容网络故障）。

#### Scenario: 普通交易日盘中

- **WHEN** 交易日盘中（今天 08-26），A 股基金 DB 确认净值日期 = 昨天 08-25（最新确认日）
- **THEN** 锚点 = 08-25，`dbNavDate === anchor` → 判新鲜，采用 DB 值（source=db），零额外请求

#### Scenario: 周末/节假日

- **WHEN** 周末或长假中，DB 确认净值日期 = 节前最后交易日
- **THEN** 锚点回溯到节前最后交易日，`dbNavDate === anchor` → 判新鲜，零请求

#### Scenario: DB 确认净值滞后（2-4 天内）

- **WHEN** DB 确认净值日期滞后于最近交易日 1-4 天（如用户任选历史日期买入写入旧值）
- **THEN** A 股判不新鲜 → 走 API 兜底链拉取最新并自愈回写 DB；QDII 滞后 ≤1 天判新鲜、滞后 >1 天判不新鲜

#### Scenario: QDII 滞后 1 天（交易日锚点校验）

- **WHEN** QDII（如纳指基金 006479）DB 确认净值日期为 08-25，中国最近交易日为 08-26（滞后 1 天）
- **THEN** `isQDII=true` → 08-25 ∈ [08-25, 08-26] → 判新鲜，采用 DB 值（不再循环走兜底）

#### Scenario: 新购 QDII 估算基准用最新净值（窗口收窄防误判）

- **WHEN** 用户新购 QDII 选历史日期 08-24（15:00 后顺延 navDate=08-25），`holding.confirmed_nav` 写入 08-25 买入日净值，而真实最新确认净值为 08-26
- **THEN** QDII 窗口 `[anchor−1, anchor]`（锚点=08-27）不含 08-25 → 判不新鲜 → 走 API 拉最新（08-26 7.9526）并自愈回写 DB
- **AND** 盘中估算基准 = 最新确认净值（08-26）而非买入日净值（08-25 7.9504），估值数据正确

### Requirement: 兜底拉取窗口锚点感知 + 15 天兜底

确认净值 API 兜底拉取的起始日期 SHALL 由 `getHistoryFallbackStartDate` 计算：`startDate = min(锚点 − 1, 今天 − 15)`。取更早者保证必然覆盖真实锚点（最长节假日连休约 10 天），且 15 天兜底不依赖逐日节假日 API（免疫 timor 429 限流）。应用于 `resolveConfirmedNav` 第④步、全天休市定向修复、`batchGetInfo` 批量兜底。

#### Scenario: 长假进行中（春节/国庆）

- **WHEN** 今天处于春节/国庆长假中（2025-02-02 / 2025-10-05），需拉取节前最后交易日（01-27 / 09-30）净值
- **THEN** 原 3 天窗口返回空（实测 0 条）；`getHistoryFallbackStartDate` 返回 15 天窗口（2025-01-18 / 2025-09-20），能拉到节前最后交易日净值（实测 005827/161725 均拉到）

#### Scenario: 节假日 API 限流

- **WHEN** 回溯最近交易日时 timor.tech API 429 限流（连续请求第 4 次触发），部分假期工作日被降级误判为交易日
- **THEN** 即使锚点算错（偏晚），15 天兜底窗口仍覆盖真实锚点（`min` 取更早者），拉取不失败（免疫 429）

### Requirement: QDII/海外基金识别

新增并导出 `isQdiiFundType(type)`：`type` 含 `QDII` 或 `海外` 判定为 QDII/海外基金。覆盖 `QDII-*`（QDII-普通股票/混合偏股/纯债/商品/REITs/FOF 等）与 `指数型-海外股票`（纳指/标普/恒生/日经/油气等跨境 ETF）。A 股类型（股票型/混合型-偏股/指数型-股票/债券型-* 等）不含这些词，不得误伤。type 缺失/未知时判定 false（严格校验，安全默认）。

#### Scenario: 全量基金库覆盖验证

- **WHEN** 全量扫描 27650 只基金（fundcode_search.js），筛出名称含强海外词（纳指/标普500/日经/美股/欧股/中概/海外等）且非港股通的基金
- **THEN** `isQdiiFundType` 判定为 true 的漏网数 = 0（100% 覆盖真实滞后海外基金）
- **AND** 港股通基金（恒生/港股通/沪港深，净值当天确认不滞后）正确判定 false（不需宽松）

### Requirement: 年度节假日接口（一次拉全年缓存，免疫 429）

`holidayService` SHALL 优先使用 timor.tech 年度接口（`year/{year}/`，一次返回整年节假日）并缓存 24h；`isHoliday` 先查年度缓存（键 `MM-DD`，`holiday=true` 放假、`false` 调休补班、不在表中=普通工作日），年度接口不可用时回退原单日接口。所有外部入口（`isTradingDay` / `nextTradingDay` / `ensureTradingDay`）最终汇聚到 `isHoliday`，自动受益于年度缓存——长假回溯最近交易日不再逐日请求单日接口（实测 9 天回溯仅 1 次年接口、0 次单日请求）。

#### Scenario: 长假回溯不触发 429

- **WHEN** 长假中回溯最近交易日（连续判定 10-01~10-09 多个日期）
- **THEN** 首次触发拉取年度缓存（1 次请求），其余日期全部走缓存
- **AND** 不再逐日请求单日接口（原第 4 个请求即 429），锚点回溯稳定正确

#### Scenario: 年度接口不可用回退单日

- **WHEN** 年度接口超时/异常（`getHolidayYearData` 返回 null）
- **THEN** `isHoliday` 回退原单日接口逐日查询，行为与修复前一致

#### Scenario: 周末补班不影响股市判定

- **WHEN** 周末为调休补班日（年度表 `holiday: false`，如 2026-01-04 周日补班）
- **THEN** `isTradingDay` 保持周末短路 → 判非交易日（A 股周末无论是否补班均不开市），补班信息对股市判定无意义

### Requirement: QDII 盘中/盘后状态判定细化

`enrichHoldingsWithRealTimeData` 的 `isConfirmed` SHALL 区分盘中与盘后：A 股严格 `latestHistoryDate === today`；QDII 盘中（<15 点，今天净值未公布）判未确认（显示估算中/待确认，**不得误判已确认**），盘后（≥15 点）且最新净值日期 = 昨天（晚间净值已公布，滞后 1 天）判已确认。该 `isConfirmed` 驱动 `update_status` 与 `daily_profit` 分支；QDII 的"日收益参与判定"（≤2 天放宽）仅在 `dailyProfitService` 兜底直算处生效，两者分离。

#### Scenario: QDII 盘中不误判已确认

- **WHEN** 交易时段（14 点）查看 QDII 持仓，最新净值日期 = 昨天（今天净值未公布）
- **THEN** `isConfirmed=false` → `update_status='estimating'`（估算中）、`is_confirmed=false`，不显示"已确认"

#### Scenario: QDII 盘后按最新净值判已确认

- **WHEN** 盘后（20 点）查看 QDII 持仓，最新净值日期已推进到昨天（晚间净值已公布）
- **THEN** `isConfirmed=true` → `update_status='confirmed'`，避免净值滞后导致永远"待确认"

#### Scenario: QDII 盘后净值未推进仍待确认

- **WHEN** 盘后查看 QDII 持仓，最新净值日期未推进（仍为前天，美股节假日净值停滞）
- **THEN** `isConfirmed=false` → `update_status='pending_confirm'`（待确认）

### Requirement: QDII 参与每日收益（确认口径与展示一致）

日收益统计 SHALL 允许 QDII/海外基金参与，确认判定与展示"盘后已确认"口径完全一致：A 股要求 `latestHistoryDate === today`；QDII 要求 `latestHistoryDate === yesterday`（今晚已公布最新确认净值，正常滞后 1 天）。**不使用 ≤2 天放宽**——美股节假日/净值停滞时最新净值日 ≠ 昨天，今天确无新增确认收益，不参与。每日盈亏按最新两条确认净值差计算并计入当天记录。净值日去重（`nav_date`）仅对 QDII 生效，作为防御性冗余保留（改为 =昨天 判定后正常场景不再触发）。

#### Scenario: QDII 参与兜底直算

- **WHEN** 23:55 兜底直算，QDII 最新净值日 = 昨天（今晚已公布），A 股最新净值日 = 今天
- **THEN** QDII 判已确认参与，`dailyProfit = 份额 × (最新净值 − 前一净值)` 计入当天记录；A 股同步参与（严格判定）

#### Scenario: QDII 净值停滞不参与（美股节假日）

- **WHEN** 美股节假日（A 股开市），QDII 最新净值日期未推进（= 前天，≠ 昨天，今天无新确认净值）
- **THEN** QDII 不参与当天日收益（合理：确无新增确认收益），A 股正常参与

#### Scenario: QDII 与 A 股口径分离

- **WHEN** QDII 最新净值日 = 昨天、A 股最新净值日 = 昨天（A 股今天净值未公布）
- **THEN** QDII 参与（=昨天）、A 股不参与（严格 =今天），两口径互不干扰

### Requirement: 年度节假日接口 inflight 去重

`getHolidayYearData(year)` SHALL 在同一 year 的请求在飞时，将后续并发调用合并到同一个 promise（`inflightYearPromises` Map），避免对 timor.tech 发起重复请求。

#### Scenario: 并发 10 次首次调用

- **WHEN** 10 个并发 `isTradingDay('2026-08-28')` 请求同时到达，且 `holiday_year_2026` 缓存 miss
- **THEN** 年度接口**只发 1 次**请求，10 个调用共享同一个 response（实测：年度 API 调用次数 = 1）

### Requirement: isHoliday inflight 去重 + 429 失败标记

`isHoliday(dateStr)` SHALL 对同一 dateStr 的请求做 inflight 合并（`inflightHolidayPromises` Map），确保年度接口失败回退单日时也只发 1 次请求。年度接口 429/网络失败后 SHALL 在 `failedYearTimestamps` 中记录时间戳，5 分钟内跳过该 year 的年度请求，直接走单日接口（若也失败则降级为非节假日）。

#### Scenario: 年度接口 429 后并发 10 次

- **WHEN** 年度接口 429 失败，10 个并发 `isTradingDay` 同时到达
- **THEN** 年度接口**只发 1 次**（之后 inflight 共享同一个失败 promise），单日接口**也只发 1 次**（isHoliday inflight 合并）

#### Scenario: 429 后 5 分钟内再调

- **WHEN** 年度接口 429 后 5 分钟内再次收到并发请求
- **THEN** 年度接口**完全跳过**（失败标记生效），单日接口走 inflight 合并只发 1 次，不再反复炸 API

### Requirement: 节假日缓存独立 TTL

节假日相关缓存 SHALL 使用独立缓存 type，从 `history_chart` 解耦：

- `holiday_year`（年度表）：**30 天 TTL**（全年固定不变，次年 1 月自然过期刷新）
- `holiday_day`（单日结果）：**3 天 TTL**（年度接口失败时回退写入，作为冗余覆盖）

#### Scenario: 年度表缓存过期刷新

- **WHEN** 2027 年 1 月 2 日首次调用 `isTradingDay`
- **THEN** `holiday_year_2026`（30 天 TTL 已过）miss → 自动拉取 `holiday_year_2027` 并存入（新 type，30 天 TTL）

---

## MODIFIED Requirements

### Requirement: resolveConfirmedNav 盘中分支新鲜度判定收敛

原"DB 日期距今天 ≤ 4 天视为新鲜"的启发式 SHALL 被"最近交易日锚点校验"替代（A 股严格相等、QDII 放宽 ≤1 天、日历不可用回退 4 天窗口），消除最多 4 天的旧净值误差。QDII 窗口不得放宽到 ≤2 天（否则新购/加仓补录的买入日净值被误判新鲜，估算基准用旧净值）。

### Requirement: 兜底拉取窗口扩大

原固定 3 天历史窗口 SHALL 被"锚点 + 15 天兜底"（`getHistoryFallbackStartDate`）替代，覆盖长假场景并免疫节假日 API 限流。

### Requirement: 每日收益 QDII 确认判定与展示口径一致

原 `isConfirmed = latestHistoryDate === today` 对 QDII 恒假导致其从不计入日收益 SHALL 被修正；且 QDII 判定 SHALL 与展示"盘后已确认"口径完全一致（`latestHistoryDate === yesterday`），不再使用 ≤2 天放宽——美股节假日/净值停滞时今天确无新增确认收益，不参与。净值日去重保留为防御性冗余。

### Requirement: QDII 展示 isConfirmed 与日收益参与判定分离

原将 QDII `isConfirmed` 统一放宽（≤2 天）导致盘中 QDII 被误判"已确认"（`update_status=confirmed`）SHALL 被修正：展示侧 `isConfirmed` 区分盘中/盘后（盘中未确认、盘后最新净值=昨天判确认），日收益参与判定（≤2 天）仅在 `dailyProfitService` 兜底直算处生效，两者分离互不污染。

---

## REMOVED Requirements

无
