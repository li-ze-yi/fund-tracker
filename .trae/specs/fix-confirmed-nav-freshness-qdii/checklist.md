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

- [x] `enrichHoldingsWithRealTimeData` 与 `calculateAndSaveDailyProfitFromConfirmedNav` 的 `isConfirmed` 对 QDII 放宽（最新净值日距今天 ≤2 天）
- [x] QDII 每日盈亏按最新两条确认净值差计算（`yesterdayShares × (todayNav − yesterdayNav)`）
- [x] 净值日去重：`fundsDetails` 记录 `nav_date`；QDII 净值停滞（美股节假日）时按上次 `nav_date` 跳过防重复
- [x] 去重仅作用于 `isQDII`，A 股保持原逻辑（每天按当天净值覆盖重算，不受影响）
- [x] 隔离验证三场景：QDII 参与（profit=10）/ 净值停滞去重跳过 / 净值推进正常计入，全部符合
- [x] `npm test`（7/7）通过；`node --check` 各改动文件通过；服务启动无报错
