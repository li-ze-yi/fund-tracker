# Checklist

## 确认净值新鲜度交易日锚点校验

- [x] `getLatestTradingDayAnchor(today)`：从今天前一天回溯最近交易日（跳过周末/节假日），作为最新确认净值应属日期的权威锚点
- [x] `resolveConfirmedNav` 盘中分支：A 股要求 `dbNavDate === anchor`（严格相等）；QDII 允许 `dbNavDate ∈ [anchor−2, anchor]`；交易日历不可用时回退原 4 天窗口
- [x] 隔离验证：DB date=08-25、锚点=08-26 时，A 股判不新鲜（source=none）、QDII 判新鲜（source=db）
- [x] 正常持仓（DB 日期 = 最近交易日）周末/节假日零额外请求

## 兜底拉取窗口锚点感知 + 15 天兜底

- [x] `getHistoryFallbackStartDate(today)`：`startDate = min(锚点−1, 今天−15)`，基于传入 todayStr 计算（避免 Date.now() 与 todayStr 不一致）
- [x] 应用于三处：`resolveConfirmedNav` 第④步、全天休市定向修复、`fundController.batchGetInfo` 批量兜底
- [x] 真实 API 回归：普通交易日/普通周末/春节中/国庆中四场景均能拉到最近交易日净值（原 3 天窗口春节/国庆 0 条 → 15 天窗口拉到 01-27 / 09-30）
- [x] timor 429 限流场景：锚点被限流算错（偏晚）时 15 天兜底窗口仍覆盖真实锚点（免疫限流）

## QDII/海外基金识别

- [x] `isQdiiFundType(type)`：`/QDII|海外/` 匹配，覆盖 `QDII-*` 与 `指数型-海外股票`
- [x] 全量扫描 27650 只基金：名称含强海外词（纳指/标普500/日经/美股/欧股/中概/海外等）且非港股通的基金，判定 true 漏网 = 0
- [x] A 股类型（股票型/混合型-偏股/指数型-股票/债券型-* 等）不误伤；type 缺失/未知降级严格校验
- [x] 港股通基金（恒生/港股通/沪港深，净值当天确认不滞后）正确判定 false

## QDII 参与每日收益

- [x] `calculateAndSaveDailyProfitFromConfirmedNav` 的 `isConfirmed`：QDII 与展示"盘后已确认"口径一致（`latestHistoryDate === yesterday`），A 股严格 `=== today`
- [x] QDII 每日盈亏按最新两条确认净值差计算（`yesterdayShares × (todayNav − yesterdayNav)`）
- [x] 净值日去重：`fundsDetails` 记录 `nav_date`；QDII 净值停滞（美股节假日）时按上次 `nav_date` 跳过防重复
- [x] 去重仅作用于 `isQDII`，A 股保持原逻辑（每天按当天净值覆盖重算，不受影响）
- [x] 隔离验证三场景：QDII 参与（profit=10）/ 净值停滞去重跳过 / 净值推进正常计入，全部符合
- [x] QDII 日收益参与判定与展示口径统一：`latestHistoryDate === yesterday`（不再 ≤2 天放宽）——美股节假日净值停滞（≠昨天）时不参与
- [x] 隔离验证（today=2026-08-28）：QDII=昨天+A股=今天 均参与 / QDII=前天 不参与 / QDII=昨天+A股=昨天（QDII参与、A股严格不参与），全部符合
- [x] 盘中路径不误判：QDII 盘中（<15 点）is_confirmed=false 不参与日收益；盘后（≥15 点）最新净值日=昨天才参与
- [x] `npm test`（7/7）通过；`node --check` 各改动文件通过；服务启动无报错

## QDII 盘中/盘后状态判定

- [x] `enrichHoldingsWithRealTimeData` 的 `isConfirmed` 恢复严格（A 股 `=== today`），QDII 盘中不误判"已确认"
- [x] 隔离验证：QDII 盘中（isConfirmed=false）→ `update_status='estimating'`、`is_confirmed=false`；当天已公布（true）→ `confirmed`
- [x] QDII 盘后（≥15 点）最新净值日期=昨天 → `isConfirmed=true` → `update_status='confirmed'`（避免净值滞后永远"待确认"）
- [x] QDII 盘后最新净值未推进（美股节假日）→ `isConfirmed=false` → `pending_confirm`
- [x] 判定表达式 6 场景验证全部正确（A 股严格 / QDII 盘中不确认 / QDII 盘后按最新净值 / 净值停滞待确认）

## QDII 新购估算基准（窗口收窄）

- [x] QDII 盘中 DB 新鲜度窗口从 `[anchor−2, anchor]` 收窄为 `[anchor−1, anchor]`（防新购/加仓补录的买入日净值被误判新鲜）
- [x] 真实数据验证（006479）：新购 08-24（navDate=08-25）修复前基准=08-25(7.9504)，修复后基准=08-26(7.9526) 最新确认净值
- [x] 正常 QDII 持仓（基准日期=锚点−1）仍判新鲜，不增加 API 请求

## 年度节假日接口（免疫 429）

- [x] `getHolidayYearData(year)` / `parseHolidayYear` 新增：timor `year/{year}/` 一次拉整年（键 `MM-DD`），缓存 24h
- [x] `isHoliday` 优先年度缓存，年度不可用回退单日接口
- [x] 真实验证：9 天长假回溯（国庆 10-01~10-09）仅 1 次年接口、0 次单日请求（原第 4 个请求即 429）
- [x] 9 组节假日判定全部正确（元旦/春节/国庆放假、补班工作日、普通工作日）
- [x] `isTradingDay` 保持周末短路（A 股周末无论是否补班均不开市），补班信息对股市判定无意义
- [x] 外部调用点审计（15 处）：全部通过 isTradingDay/nextTradingDay/ensureTradingDay → isHoliday → 年度缓存，无绕过
- [x] `npm test`（7/7）通过
