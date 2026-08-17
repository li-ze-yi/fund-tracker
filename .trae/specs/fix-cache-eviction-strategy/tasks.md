# Tasks

- [x] Task 1: 修改 `evictOldest` 为两阶段淘汰策略（先过期后 LRU）
  - [x] 遍历所有条目，按 `value.type` 调用 `getTTL(type)` 判断是否过期，删除过期条目
  - [x] 如果删除过期条目后数量不足，再按 `timestamp` 从旧到新淘汰未过期条目
  - [x] 添加中文注释标注两阶段淘汰策略

- [x] Task 3: 修改手动缓存检查路径，过期时删除条目
  - [x] `holdingService.js` realtime 缓存检查（约 L254）：`age >= ttl` 时增加 `globalCache.cache.delete(cacheKey)`
  - [x] `holdingService.js` 3 天历史净值检查（约 L286）：同上
  - [x] `fundController.js` 走势图缓存检查（约 L458）：同上
  - [x] `fundService.js` 单只股票行情缓存检查（约 L464）：同上

# Task Dependencies
- Task 1、Task 3 互相独立，可并行执行
