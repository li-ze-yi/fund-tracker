# 确认净值新鲜度交易日锚点校验 + QDII/海外基金适配 Spec

## Why

围绕"确认净值新鲜度判定"与"QDII/海外基金适配"发现的四类问题：

1. **盘中 DB 确认净值最多 4 天误差**：`resolveConfirmedNav` 盘中/休市分支（无历史数据时）用固定启发式"DB 日期距今天 ≤ 4 天视为新鲜"。若 DB 存的是用户任选历史买入日/未自愈的旧确认净值，盘中估算与持仓金额会基于 4 天前的旧净值作为基准，产生最多 4 天误差。

2. **长假兜底拉取拉不到节前最后交易日净值**：确认净值 API 兜底用固定 3 天历史窗口（`today-3 ~ today`）。长假进行中（今天处于假期）时窗口内全是节假日，`getHistoryNetValues` 返回空（实测 005827/161725 春节/国庆均 0 条），导致 `resolveConfirmedNav` 返回 `source=none`，基金详情/自选列表显示无净值。

3. **节假日 API 限流导致锚点回溯不可靠**：timor.tech 节假日 API 连续请求即 429 限流（实测第 4 个请求触发）。长假回溯最近交易日需连续查询多个工作日，大概率限流 → 假期工作日被降级误判为交易日 → 锚点算错（偏晚），锚点感知窗口失效。

4. **QDII/海外基金确认净值滞后被误判不新鲜**：纳斯达克/标普/恒生等 QDII 与跨境 ETF 的确认净值日期合法滞后 A 股 1-2 天（实测纳指基金最新净值 08-25，A 股 08-26）。交易日锚点校验要求 `dbNavDate === 中国最近交易日`，QDII 恒不满足 → 频繁判不新鲜、循环走兜底拉取，兜底失败时显示无净值。

5. **QDII 从不计入每日收益**：日收益两条路径（`calculateAndSaveDailyProfit` 的 `is_confirmed` 与 23:55 兜底直算 `isConfirmed`）均以 `latestHistoryDate === today` 判定"已确认"，QDII 最新净值日期永不等于今天 → 恒判"未确认" → 从不参与每日收益统计。

## What Changes

- `server/services/holdingService.js`：
  - 新增 `getLatestTradingDayAnchor(today)`：从今天前一天起回溯最近交易日（`holidayService.isTradingDay` 跳过周末/节假日），作为"最新确认净值应属日期"的权威锚点。
  - 新增 `getHistoryFallbackStartDate(today)`：兜底拉取起始日期 = `min(锚点 − 1, 今天 − 15)`。取更早者保证必然覆盖真实锚点（最长节假日连休约 10 天 < 15 天），且不依赖逐日节假日 API（免疫 timor 429 限流）。
  - 新增并导出 `isQdiiFundType(type)`：`/QDII|海外/` 匹配 `funds.type`，覆盖 `QDII-*`（10 种）与 `指数型-海外股票`（纳指/标普/恒生/日经/油气等跨境 ETF）。
  - `resolveConfirmedNav` 盘中分支：以最近交易日为锚点——A 股要求 `dbNavDate === anchor`（严格相等）；QDII 允许 `dbNavDate ∈ [anchor−2, anchor]`（合法滞后 1-2 天）；交易日历不可用时回退原 4 天窗口。
  - 第④步同步拉取兜底：`startDate` 改用 `getHistoryFallbackStartDate`（锚点 + 15 天兜底），替换固定 3 天窗口。
  - 全天休市定向修复：同样改用 `getHistoryFallbackStartDate`。
  - `enrichHoldingsWithRealTimeData`：批量查基金类型构建 `fundTypeMap`，循环内 `isConfirmed` 对 QDII 放宽（最新净值日距今天 ≤2 天视为已确认），并复用 `isQDII` 传给 `resolveConfirmedNav`。
- `server/controllers/fundController.js`：
  - `getByCode` 两处（休市/开市分支）与 `batchGetInfo` 两处：`resolveConfirmedNav` 传入 `{ isQDII: isQdiiFundType(fund.type) }`。
  - `batchGetInfo` 批量历史兜底：`startDate` 改用 `getHistoryFallbackStartDate`（锚点 + 15 天），替换 `today-3`。
- `server/services/dailyProfitService.js`（兜底直算 `calculateAndSaveDailyProfitFromConfirmedNav`）：
  - 批量查基金类型识别 QDII；`isConfirmed` 对 QDII 放宽（最新净值日距今天 ≤2 天视为已确认）。
  - **净值日去重（仅 QDII）**：读取最近一条日收益记录中各基金已计入的 `nav_date`，QDII 最新净值日期未推进（美股节假日净值停滞）时跳过，防止重复计入同一净值差。
  - `fundsDetails` 记录 `nav_date`（本次计入的最新净值日），供下次去重。
  - 去重仅作用于 `isQDII`，A 股保持原逻辑（每天按当天净值覆盖重算，不受影响）。
- 不涉及前端改动，不涉及数据库 schema 变更。

## Impact

- Affected code:
  - `server/services/holdingService.js` — `getLatestTradingDayAnchor` / `getHistoryFallbackStartDate` / `isQdiiFundType`（新增）、`resolveConfirmedNav`（盘中分支与第④步）、`enrichHoldingsWithRealTimeData`（isConfirmed 放宽）
  - `server/controllers/fundController.js` — `getByCode`（L79/L249）、`batchGetInfo`（L320/L429/L445）
  - `server/services/dailyProfitService.js` — `calculateAndSaveDailyProfitFromConfirmedNav`
- Affected specs: `prioritize-db-confirmed-nav-intraday`（确认净值链）、`reduce-intraday-history-api`（历史缓存）、`fix-market-status-and-metrics-consistency`（净值/收益口径）
- 行为边界：
  - 交易日历 API 不可用时锚点回退 4 天窗口、兜底回退 15 天窗口（fail-safe）。
  - QDII 判定依赖 `funds.type`（来自 fundcode_search.js 同步）；type 缺失/未知时降级为严格校验（安全默认）。
  - 港股通基金（type=`指数型-股票` 等）净值当天确认不滞后，正确排除在 QDII 宽松之外，走 A 股严格路径。

---

## ADDED Requirements

### Requirement: 确认净值新鲜度以最近交易日为锚点

`resolveConfirmedNav` 盘中/休市分支（无历史数据）SHALL 以"最近交易日"（`getLatestTradingDayAnchor`，从今天前一天回溯、跳过周末/节假日）为权威锚点校验 DB 确认净值新鲜度，替代固定 4 天启发式窗口。A 股要求 `dbNavDate === anchor`；QDII（`isQdiiFundType`）允许 `dbNavDate ∈ [anchor−2, anchor]`（合法滞后 1-2 天）。交易日历 API 不可用时回退原 4 天窗口（兼容网络故障）。

#### Scenario: 普通交易日盘中

- **WHEN** 交易日盘中（今天 08-26），A 股基金 DB 确认净值日期 = 昨天 08-25（最新确认日）
- **THEN** 锚点 = 08-25，`dbNavDate === anchor` → 判新鲜，采用 DB 值（source=db），零额外请求

#### Scenario: 周末/节假日

- **WHEN** 周末或长假中，DB 确认净值日期 = 节前最后交易日
- **THEN** 锚点回溯到节前最后交易日，`dbNavDate === anchor` → 判新鲜，零请求

#### Scenario: DB 确认净值滞后（2-4 天内）

- **WHEN** DB 确认净值日期滞后于最近交易日 1-4 天（如用户任选历史日期买入写入旧值）
- **THEN** A 股判不新鲜 → 走 API 兜底链拉取最新并自愈回写 DB；QDII 滞后 ≤2 天判新鲜、滞后 >2 天判不新鲜

#### Scenario: QDII 滞后 1-2 天（交易日锚点校验）

- **WHEN** QDII（如纳指基金 006479）DB 确认净值日期为 08-25，中国最近交易日为 08-26（滞后 1 天）
- **THEN** `isQDII=true` → 08-25 ∈ [08-24, 08-26] → 判新鲜，采用 DB 值（不再循环走兜底）

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

### Requirement: QDII 参与每日收益（含净值日去重）

日收益统计 SHALL 允许 QDII/海外基金参与：最新净值日期距今天 ≤2 天视为已确认（A 股仍要求 `=== today`），每日盈亏按最新两条确认净值差计算并计入当天记录。QDII 净值停滞（美股节假日）时 SHALL 按"最近一次已计入的 `nav_date`"去重跳过，防止重复计入同一净值差。去重仅作用于 QDII，A 股保持原逻辑。

#### Scenario: QDII 参与兜底直算

- **WHEN** 23:55 兜底直算，QDII 最新净值日 = 今天−2（滞后 2 天），无上次记录
- **THEN** QDII 判已确认参与，`dailyProfit = 份额 × (最新净值 − 前一净值)`，计入当天记录（fundsDetails 含 `nav_date`）；A 股滞后 1 天不参与（严格判定）

#### Scenario: QDII 净值停滞去重（美股节假日）

- **WHEN** 美股节假日（A 股开市），QDII 最新净值日期未推进（等于上次已计入的 `nav_date`）
- **THEN** 该 QDII 被去重跳过，不重复计入同一净值差

#### Scenario: QDII 净值推进正常计入

- **WHEN** QDII 最新净值日期较上次已计入日期推进（如 08-24 → 08-25）
- **THEN** 正常计入，`dailyProfit = 100 × (1.5 − 1.4) = 10`，`nav_date` 更新为 08-25

---

## MODIFIED Requirements

### Requirement: resolveConfirmedNav 盘中分支新鲜度判定收敛

原"DB 日期距今天 ≤ 4 天视为新鲜"的启发式 SHALL 被"最近交易日锚点校验"替代（A 股严格相等、QDII 放宽 ≤2 天、日历不可用回退 4 天窗口），消除最多 4 天的旧净值误差。

### Requirement: 兜底拉取窗口扩大

原固定 3 天历史窗口 SHALL 被"锚点 + 15 天兜底"（`getHistoryFallbackStartDate`）替代，覆盖长假场景并免疫节假日 API 限流。

### Requirement: 每日收益 QDII 确认判定放宽

原 `isConfirmed = latestHistoryDate === today` 对 QDII 恒假导致其从不计入日收益 SHALL 被修正：QDII 最新净值日距今天 ≤2 天视为已确认参与，并配净值日去重。

---

## REMOVED Requirements

无
