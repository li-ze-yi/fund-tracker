# Tasks

- [x] Task 1: 修改 `GlobalCache` 类新增 `checkCache` 方法并更新 stats
  - [x] SubTask 1.1: 在 `globalCache.js` 构造函数的 `this.stats` 初始化中新增 `forcedRefreshes: 0`
  - [x] SubTask 1.2: 新增 `checkCache(key, type = 'realtime')` 方法，返回 `{ hit, data }`，内部更新 `totalRequests`/`hits`/`misses`/`evictions`
  - [x] SubTask 1.3: 修改 `getOrFetch` 的 `forceRefresh` 分支，在 `totalRequests++` 后增加 `this.stats.forcedRefreshes++`
  - [x] SubTask 1.4: 修改 `evictOldest` 方法，阶段 1 和阶段 2 每删除一个条目都执行 `this.stats.evictions++`
  - [x] SubTask 1.5: 修改 `getStats` 返回对象，新增 `forcedRefreshes` 字段
  - [x] SubTask 1.6: 修改 `clear()` 方法的 `this.stats` 重置，新增 `forcedRefreshes: 0`

- [x] Task 2: 重构 `holdingService.js` 的 2 处手动 cache.get 路径
  - [x] SubTask 2.1: 修改 `enrichHoldingsWithRealTimeData` 中 realtime 批量检查（~L254），改用 `globalCache.checkCache(cacheKey, 'realtime')`，命中时使用 `result.data`，未命中时加入 `needFetch`
  - [x] SubTask 2.2: 修改 `enrichHoldingsWithRealTimeData` 中 3 天历史批量检查（~L288），改用 `globalCache.checkCache(cacheKey, 'history_recent')`

- [x] Task 3: 重构 `fundController.js` 的 1 处手动 cache.get 路径
  - [x] SubTask 3.1: 修改 `getNavHistory` 中走势图缓存检查（~L458），改用 `globalCache.checkCache(cacheKey, 'history_chart')`
  - [x] SubTask 3.2: 命中时仍保留 `latestDate` 三分支判断逻辑（today/yesterday/<yesterday）不变
  - [x] SubTask 3.3: 未命中或已过期时走原有"重新请求完整日期范围"逻辑不变

- [x] Task 4: 重构 `fundService.js` 的 1 处手动 cache.get 路径
  - [x] SubTask 4.1: 修改 `getStocksRealtime` 中股票行情缓存检查（~L464），改用 `globalCache.checkCache(cacheKey, 'stock_quote')`

- [x] Task 5: 验证与编译
  - [x] SubTask 5.1: 运行 `node --check` 对 4 个修改文件做语法检查
  - [x] SubTask 5.2: 启动服务，触发持仓查询，观察日志确认 `hitRate` 数值变化（应比修改前更接近真实命中率）
  - [x] SubTask 5.3: 观察日志确认 `forcedRefreshes` 字段在 `getStats` 输出中存在
  - [x] SubTask 5.4: 用 Grep 确认 4 处手动 `cache.get` 已全部改为 `checkCache`（`adminController` 除外）

# Task Dependencies
- Task 2/3/4 依赖 Task 1（需先有 `checkCache` 方法）
- Task 2/3/4 可并行（不同文件无依赖）
- Task 5 依赖 Task 1~4 全部完成
