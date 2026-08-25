# Tasks

- [x] Task 1: 重构 `getStocksRealtime` 为单只股票独立缓存
  - [x] 移除现有的组合缓存逻辑（`stock_quotes_{sorted.join(',')}` + `globalCache.getOrFetch`）
  - [x] 逐只检查缓存 `stock_quote_{code}` 是否命中，命中的直接放入结果
  - [x] 收集未命中的股票代码
  - [x] 对未命中的股票调用 `getStocksRealtimeBatch` 批量请求（保留原有分批逻辑，BATCH_SIZE=50）
  - [x] 批量请求返回后，逐只写入缓存 `globalCache.set('stock_quote_{code}', quote, 'stock_quote')`
  - [x] 合并缓存命中数据和新请求数据，返回完整结果
  - [x] 中文注释标注外部 API 来源（腾讯 qt.gtimg.cn）和缓存策略说明
  - [x] 补充调用逻辑日志（前缀 `[getStocksRealtime]`）：缓存命中/未命中统计、全部命中跳过请求、请求 API 前的股票代码和批数、请求完成后成功/失败统计

# Task Dependencies
- 无外部依赖，Task 1 独立完成
