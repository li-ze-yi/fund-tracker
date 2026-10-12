# Tasks

- [x] Task 1: 在 `server/services/globalCache.js` 增加全后端缓存枚举 `listEntries({ limit, keyword })`
  - [x] SubTask 1.1: 实现内存模式枚举（复用现有遍历逻辑，按 `remainingSeconds` 升序排序，支持 keyword 过滤、limit 截断）
  - [x] SubTask 1.2: 实现 Redis 模式枚举：`SCAN`（`MATCH *`，分批游标，`count` 提示）枚举 key，`PTTL` 取剩余时间，仅接受取值为合法 `{data,timestamp,type}` 对象的 key（排除 `gc:stats:*`、`sf:*`、BullMQ `bull:*` 等内部键），组装统一元数据，受 `limit` 有界
  - [x] SubTask 1.3: 析出一个内部辅助方法 `_buildEntryMeta(key, value, now)` 由两模式共用，保证字段口径一致（key/type/ageSeconds/ttlSeconds/remainingSeconds/expired）
  - [x] SubTask 1.4: 对 Redis 模式可读取 `PTTL`；若剩余 TTL 不可用则回退为按 `timestamp + getTTL(type)` 估算 remainingSeconds（不抛错，best-effort）
- [x] Task 2: 在 `server/services/globalCache.js` 增加单键操作落到当前后端
  - [x] SubTask 2.1: 新增 `peekEntry(key)`：Redis 可用时读 Redis（`GET` 解析），否则读内存 Map；命中且未过期返回元数据，否则返回 null
  - [x] SubTask 2.2: 新增 `delete(key)`：Redis 可用时 `DEL key`（best-effort 不抛错）+ 兼清内存 Map 该键；否则仅删内存 Map
- [x] Task 3: 重构 `server/controllers/adminController.js` 三个缓存接口
  - [x] SubTask 3.1: `cacheStats` 改用 `listEntries(req.query.limit, req.query.keyword)` 生成 `entries`，`stats` 保持 `getStats()` 不变（继续返回 hits/misses/evictions/totalRequests/forcedRefreshes/hitRate/recentMisses）
  - [x] SubTask 3.2: `cacheStats` 基于枚举得到的条目按 `type` 聚合新增 `typeBreakdown` 字段
  - [x] SubTask 3.3: `cacheCheck` 改用 `peekEntry(key)`（Redis/内存统一命中判断）
  - [x] SubTask 3.4: `cacheClear` 单 key 分支改用 `delete(key)`（作用于当前后端）；无 key 分支行为不变（`clearEntries`）
- [x] Task 4: 自测与验证
  - [x] SubTask 4.1: 用 Node 脚本/临时样例验证内存模式下 `listEntries/peekEntry/delete` 行为与旧逻辑一致
  - [x] SubTask 4.2: 在配置 Redis 后验证 `cacheStats` entries 能枚举 Redis 真实条目、`cacheCheck` 命中 Redis、`cacheClear` 删除 Redis 键（若本地无 Redis，以单测/静态走查为准并在说明中注明验证限制）
- [x] Task 5: 断连期间本地计数在 Redis 恢复后自动合并回 Redis（INCRBY）
  - [x] SubTask 5.1: 新增 `_syncedStats` 快照；`_bumpStats` 在 Redis 可用时使本地计数/Redis 计数/已同步快照三者对齐
  - [x] SubTask 5.2: `ready` 处理器改为调用 `_mergeLocalStatsToRedis()`（先合并再 `clearEntries`），仅 `INCRBY` 推送"断连期间新增"增量，避免重复累加
  - [x] SubTask 5.3: `_mergeLocalStatsToRedis` 失败时回滚已同步快照，保证下次 ready 重推这批增量
  - [x] SubTask 5.4: `clear()` 重置统计时同步重置 `_syncedStats`
  - [x] SubTask 5.5: 共享 Redis 实测：断连增量正确补回、多次合并不重复累加、正常运行期三者对齐

# Task Dependencies
- [Task 2] depends on [Task 1]（共用内部辅助/口径）
- [Task 3] depends on [Task 1, Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] 独立于 Task 1-4（对 `_bumpStats` / ready / clear() 的增强）