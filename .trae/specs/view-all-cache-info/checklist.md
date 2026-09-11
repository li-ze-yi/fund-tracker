# 验证清单

- [x] 内存模式下 `listEntries` 返回全部缓存条目，字段口径与旧逻辑一致（key/type/ageSeconds/ttlSeconds/remainingSeconds/expired）
- [x] Redis 模式下 `listEntries` 通过 `SCAN` 枚举 Redis 真实条目，并能排除 `gc:stats:*`、`sf:*`、BullMQ 等内部键
- [x] `listEntries` 支持 `limit` 有界返回与 `keyword` 过滤
- [x] Redis 模式下 `cacheStats` 接口的 `entries` 不再为空（能索引真实缓存条目）
- [x] `cacheStats` 的 `stats` 持续返回 hits/misses/evictions/totalRequests/forcedRefreshes/hitRate 与 recentMisses（Redis 跨实例聚合/无 Redis 本实例）
- [x] `cacheStats` 新增 `typeBreakdown`，按条目类型给出数量分布
- [x] `peekEntry` 在 Redis 可用时命中 Redis 键并返回正确剩余 TTL 与过期状态
- [x] `delete(key)` 在 Redis 模式下能从 Redis 删除指定键
- [x] `cacheCheck` / `cacheClear` 接口在 Redis 模式下单键探测与清理行为正确
- [x] 无 Redis（内存）路径无回归：`cacheStats` `entries`、`cacheCheck`、`cacheClear` 行为与改动前一致
- [x] `ready` 时将断连期间本地计数增量 `INCRBY` 合并回 Redis，且不重复累加正常运行期已写入的计数
- [x] 正常运行期本地计数 / Redis 计数 / 已同步快照三者对齐，无漂移
- [x] `clear()` 重置统计时同步重置已同步快照，避免历史差值被误推