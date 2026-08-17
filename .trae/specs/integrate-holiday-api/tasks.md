# Tasks

- [x] Task 1: 创建 holidayService 节假日服务模块
  - [x] SubTask 1.1: 新建 `server/services/holidayService.js`，引入 `globalCache` 和 `axios`（或项目现有 HTTP 客户端）
  - [x] SubTask 1.2: 实现 `fetchHolidayFromApi(dateStr)` 私有方法：调用 `http://timor.tech/api/holiday/info/{date}`，3 秒超时，解析 `response.holiday.holiday` 字段，返回 `{ isHoliday: boolean }`
  - [x] SubTask 1.3: 实现 `isHoliday(dateStr)` 公开方法：通过 `globalCache.getOrFetch('holiday_' + dateStr, 24h, fetchHolidayFromApi)` 获取结果；API 失败时回退返回 `false`（视为非节假日，退化为周末判断），记录告警日志，不缓存降级结果
  - [x] SubTask 1.4: 实现 `isWeekend(dateStr)` 辅助函数（new Date(dateStr + 'T00:00:00').getDay() === 0 || === 6）
  - [x] SubTask 1.5: 实现 `isTradingDay(dateStr)`：先判断 `isWeekend`（短路返回 false，不查询 API），非周末则查询 `!isHoliday`
  - [x] SubTask 1.6: 实现 `nextTradingDay(dateStr)`：日期 +1，循环跳过非交易日（`!isTradingDay`），最多 30 次防死循环
  - [x] SubTask 1.7: 实现 `ensureTradingDay(dateStr)`：若当前日期非交易日则顺延到下一个交易日（不 +1，从当前日期开始检查）

- [x] Task 2: 重构 transactionController 的日期顺延逻辑
  - [x] SubTask 2.1: 将 `nextBusinessDay` 改为调用 `holidayService.nextTradingDay`（改为 async 函数，保持函数名不变）
  - [x] SubTask 2.2: 将 `ensureBusinessDay` 改为调用 `holidayService.ensureTradingDay`（改为 async 函数，保持函数名不变）
  - [x] SubTask 2.3: 修改调用处（第 50 行 navDate 计算）添加 `await`
  - [x] SubTask 2.4: 检查 transactionController 中所有调用 nextBusinessDay/ensureBusinessDay 的位置，均添加 await（buy 第 50 行、sell 第 124 行）

- [x] Task 3: 优化 planService 定投调度的日期顺延
  - [x] SubTask 3.1: 阅读 `server/services/planService.js` line 307-308 附近的周末顺延逻辑
  - [x] SubTask 3.2: 将 planService 中的周末顺延逻辑改为调用 `holidayService.ensureTradingDay`（使用 ensureTradingDay 而非 nextTradingDay，保持"确保是交易日"语义）
  - [x] SubTask 3.3: 验证定投调度在国庆假期内的触发场景（scheduled_day 落在假期 → 顺延到假期后首个工作日）

- [x] Task 4: 验证节假日 API 响应解析和降级
  - [x] SubTask 4.1: 验证 `fetchHolidayFromApi` 正确解析 timor.tech 响应（`holiday.holiday === true` → 节假日）
  - [x] SubTask 4.2: 验证调休补班日（周六，API 返回 holiday=false）被 `isWeekend` 短路排除（不查询 API，直接返回非交易日）
  - [x] SubTask 4.3: 验证 API 超时（>3s）时回退周末判断，记录告警日志，不缓存降级结果
  - [x] SubTask 4.4: 验证 API 返回异常 JSON（缺少 holiday 字段）时回退周末判断
  - [x] SubTask 4.5: 验证 24h 缓存命中（首次调用 API，24h 内重复调用不触发 API）

# Task Dependencies
- Task 2 和 Task 3 依赖 Task 1（需要 holidayService 模块），可并行
- Task 4 依赖 Task 1-3 完成
