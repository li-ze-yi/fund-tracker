# Tasks

- [x] Task 1: 在 GlobalCache 中新增 `stock_quote` 和 `etf_quote` 缓存类型
  - [x] 在 `getTTL()` 方法中新增 `stock_quote` 和 `etf_quote` case，TTL 复用 `getRealtimeTTL()`（动态：盘中 28s / 盘后 30min~2h / 周末 12h）
  - [x] 用中文注释标注字段含义：`case 'stock_quote': // 股票实时行情缓存`、`case 'etf_quote': // ETF实时行情缓存`

- [x] Task 2: 为 `getETFRealtimeQuote` 接入 GlobalCache
  - [x] 在函数入口处用 `globalCache.getOrFetch('etf_quote_{code}', ...)` 包裹现有的 push2 → 腾讯 → 新浪三级回退逻辑
  - [x] 缓存类型：`etf_quote`，缓存键：`etf_quote_{fundCode}`
  - [x] 中文注释标注外部 API 来源：push2（东方财富）、腾讯 qt.gtimg.cn、新浪 hq.sinajs.cn

- [x] Task 3: 为 `getStocksRealtime` 接入 GlobalCache
  - [x] 在函数入口处用 `globalCache.getOrFetch('stock_quotes_{hash}', ...)` 包裹现有的 `getStocksRealtimeBatch` 调用
  - [x] 缓存键：对 stockCodes 排序后拼接为标识（如 `stock_quotes_{sorted.join(',')}`）
  - [x] 缓存类型：`stock_quote`，中文注释标注外部 API 来源（腾讯 qt.gtimg.cn）

- [x] Task 4: 为 `planService` 和 `dailyProfitService` 接入缓存
  - [x] 在 `planService.js` 中，将 `getHistoryNetValues(fundCode, today, today)` 替换为 `globalCache.getOrFetch('history_{code}_1d_{today}', ...)`，类型 `history_recent`
  - [x] 在 `dailyProfitService.js` 的 `checkConfirmedFunds` 中同理替换
  - [x] 中文注释标注外部 API 来源（eastmoney/lsjz）

- [x] Task 5: 统一 `realtime` 缓存键格式
  - [x] 修改 `holdingController.js` 中 `realtimeCacheKey` 为 `realtime_{fundCode}_auto`，中文注释说明 `auto` 含义
  - [x] 修改 `imageImportController.js` 中 `realtimeCacheKey` 为 `realtime_{fundCode}_auto`

- [x] Task 6: 修复 30 天历史净值 TTL 类型
  - [x] 修改 `holdingController.js` 中 30 天历史缓存类型 `history_recent` → `history_older`，中文注释说明
  - [x] 修改 `imageImportController.js` 中 30 天历史缓存类型 `history_recent` → `history_older`

- [x] Task 7: 修复指数分时数据 TTL 类型
  - [x] 修改 `routes/indices.js` 中 `/indices/:code/intraday` 缓存类型 `history_recent` → `realtime`，中文注释说明

- [x] Task 8: 为基金详情页走势图 `getNavHistory` 接入缓存（latestDate 三分支判断）
  - [x] 在 `globalCache.js` 中新增 `history_chart` 类型，固定 24h TTL（不复用 `history_recent`：cleanup 按 type 取 TTL，`history_recent` 黄金窗口仅 5min 会导致走势图缓存被过早清理，24h 的 latestDate 判断失效）
  - [x] 在 `fundController.js` 的 `getNavHistory` 中实现缓存逻辑：
    - 缓存键：`history_{code}_{startDate}_{endDate}`（// 按日期范围区分，跨天自动 miss）
    - 缓存类型：`history_chart`（// 固定 24h TTL）
    - 缓存命中时，取缓存数据最新记录日期 `latestDate`（// 借鉴 getByCode L82-106）
    - `latestDate` = 今天 → 直接返回缓存（// 今天净值已确认，数据完整）
    - `latestDate` = 昨天 → 调用 `getHistoryNetValues(code, today, today)` 轻量查询（// 仅查1天，极小开销）
      - 今天有记录 → 已确认，缓存过期 → 重新请求完整日期范围，写入缓存
      - 今天无记录 → 未确认 → 返回缓存（// 昨天数据仍是当前最新）
    - `latestDate` < 昨天 → 缓存落后 → 直接重新请求完整日期范围，写入缓存（// 至少缺了昨天的确认净值）
  - [x] 中文注释标注判断逻辑和外部 API 来源（eastmoney/lsjz）

# Task Dependencies
- Task 2、Task 3 依赖 Task 1（需要先新增缓存类型）
- Task 4、Task 5、Task 6、Task 7、Task 8 各自独立，可并行执行
