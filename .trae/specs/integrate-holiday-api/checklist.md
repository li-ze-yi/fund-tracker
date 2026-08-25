# Checklist

## holidayService 模块
- [x] `server/services/holidayService.js` 已创建
- [x] `fetchHolidayFromApi(dateStr)` 方法实现，调用 timor.tech API，超时 3 秒
- [x] `isHoliday(dateStr)` 方法实现，通过 globalCache.getOrFetch 缓存 24h
- [x] `isWeekend(dateStr)` 辅助函数（getDay() === 0 || === 6）
- [x] `isTradingDay(dateStr)` 方法实现（先 isWeekend 短路，非周末则查 !isHoliday）
- [x] `nextTradingDay(dateStr)` 方法实现（+1 后跳过非交易日，最多 30 次防死循环）
- [x] `ensureTradingDay(dateStr)` 方法实现（从当前日期开始跳过非交易日）
- [x] API 失败时回退返回 false（视为非节假日），记录告警日志，不缓存降级结果

## 核心逻辑正确性
- [x] 工作日（如 2026-10-08 周四）→ isTradingDay = true（isWeekend=false, API holiday=false）
- [x] 法定节假日（如 2026-10-01 国庆）→ isTradingDay = false（isWeekend=false, API holiday=true）
- [x] 调休补班日（周六上班）→ isTradingDay = false（isWeekend 短路，不查询 API）
- [x] 普通周末 → isTradingDay = false（isWeekend 短路，不查询 API）
- [x] nextTradingDay 跨越国庆假期（9/30 → 10/8）
- [x] nextTradingDay 跨越周末（周五 → 下周一）
- [x] ensureTradingDay 节假日顺延（10/1 → 10/8）
- [x] ensureTradingDay 工作日不变（10/8 → 10/8）

## 缓存机制
- [x] 缓存 key 格式为 `holiday_{YYYY-MM-DD}`
- [x] 缓存 TTL 为 24h
- [x] 24h 内重复查询不触发 API 调用
- [x] 周末查询不触发 API（isWeekend 短路）
- [x] 降级结果不缓存（API 失败后下次仍尝试 API）

## 降级策略验证
- [x] API 超时（>3s）时回退周末判断（isHoliday 返回 false），不抛错
- [x] API 返回 403/429/500 时回退周末判断，不抛错
- [x] API 返回异常 JSON 时回退周末判断，不抛错
- [x] 降级时记录告警日志：包含日期、错误信息
- [x] 降级时不阻断买入流程

## transactionController 重构
- [x] `nextBusinessDay` 改为调用 `holidayService.nextTradingDay`（async）
- [x] `ensureBusinessDay` 改为调用 `holidayService.ensureTradingDay`（async）
- [x] 调用处（第 62 行 navDate 计算）已添加 `await`
- [x] transactionController 中所有调用 nextBusinessDay/ensureBusinessDay 的位置均已添加 await

## 国庆假期场景验证
- [x] 10/1（国庆节，周四）after3pm=false → navDate = 10/8
- [x] 10/1 after3pm=true → navDate = 10/8
- [x] 10/7（假期最后一天，周三）after3pm=false → navDate = 10/8
- [x] 10/7 after3pm=true → navDate = 10/8
- [x] 9/30（国庆前一天，周三）after3pm=true → navDate = 10/8

## 春节调休补班日场景验证
- [x] 2/14（假设春节调休周六上班）after3pm=false → navDate 顺延到下一个交易日（周一）
- [x] 2/14 after3pm=true → navDate 顺延到下一个交易日

## planService 优化
- [x] 定投调度的 nextBusinessDay 改为调用 `holidayService.nextTradingDay`
- [x] 定投 scheduled_day 落在国庆假期 → 顺延到 10/8 创建 pending 订单

## 与现有系统兼容性
- [x] 不影响 `holdingService.checkMarketStatus` 的被动节假日检测逻辑（保持不变）
- [x] 不影响 `dailyProfitService` 的非交易日跳过逻辑（保持不变）
- [x] 不影响 `ensure-pending-order-auto-settle` 的结算和清除逻辑
- [x] 假期买入的 pending 订单 navDate 指向真实交易日，能被正常结算（不再挂死）
