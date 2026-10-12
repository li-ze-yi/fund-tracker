# 后端管理接口查看全部缓存信息 Spec

## Why
当前后端管理接口 `/api/admin/cache/stats` 只能读取进程内 `globalCache.cache`（内存 Map）条目。
在生产多实例部署中缓存后端是 Redis 时，`getOrFetch/set` 只写 Redis、内存 Map 基本为空，
导致管理接口看到的是**空的缓存列表**，无法查看真实的全部缓存信息。

## What Changes
- 在 `GlobalCache` 增加按当前激活后端（Redis 或内存）枚举全部有效缓存条目的能力，并返回统一元数据（key、type、age、TTL、剩余时间、是否过期）。
- 因缓存数据 key 无统一前缀，Redis 模式通过 `SCAN` 配合"值形状识别"过滤内部键（`gc:stats:*` 统计、`sf:*` 单飞锁、BullMQ `bull:*` 等），仅取值为 `{data, timestamp, type}` 对象的条目。
- 增强单键操作：`cacheCheck` 与单键 `cacheClear` 在 Redis 模式下同样作用于 Redis 后端（而非仅内存）。
- 重构 `adminController` 的 `cacheStats` / `cacheCheck` / `cacheClear`，统一走新增的 GlobalCache 方法。
- **命中/未命中等统计信息持续可见**：`cacheStats` 的 `stats` 始终返回跨实例聚合的 `hits/misses/evictions/totalRequests/forcedRefreshes/hitRate` 与 `recentMisses`（沿用既有 `getStats()`，Redis 模式读 Redis 全局计数，无 Redis 回退本实例），并新增按缓存类型的条目数分布 `typeBreakdown`。
- **断连计数自动补回**：Redis 由不可用翻转为可用（ready）时，把断连期间本地累积的计数增量通过 `INCRBY` 合并回 Redis，避免故障窗口的请求量在全球统计中被永久低估。

**BREAKING**：`cacheStats` 响应中的 `entries` 来源从"仅内存"改为"当前激活后端"，在 Redis 多实例模式下将开始返回真实条目（此前为空数组）。

## Impact
- Affected specs: 管理后台缓存诊断能力
- Affected code:
  - `server/services/globalCache.js`（新增 `listEntries`、`peekEntry`、`delete`、`_mergeLocalStatsToRedis`，`_syncedStats` 快照；ready 合并断连计数）
  - `server/controllers/adminController.js`（`cacheStats`、`cacheCheck`、`cacheClear` 改用新方法）
  - 不变：`server/routes/admin.js`（路由/权限已存在，无需改动）

## ADDED Requirements
### Requirement: 断连期间本地计数合并回 Redis
系统 SHALL 在 Redis 由不可用翻转为可用时，将断连期间本地累积的统计计数增量合并回 Redis 全局计数器。

#### Scenario: Redis 恢复后计数补回且不重复累加
- **WHEN** Redis 断连期间发生了若干命中/未命中/请求事件（仅本地 `this.stats` 累加），随后 Redis 恢复并触发 ready
- **THEN** 系统通过 `INCRBY` 把"断连期间新增"的计数合并到 `gc:stats:*`，且**不**把正常运行期已直接 `INCR` 到 Redis 的计数重复累加

#### Scenario: 正常运行期计数不漂移
- **WHEN** Redis 处于可用状态，每次统计事件发生
- **THEN** 本地计数与 Redis 计数同步递增，已同步快照与本地对齐，为后续断连增量计算提供精确基准

#### Scenario: 合并失败的回滚
- **WHEN** 合并 `INCRBY` 写入 Redis 失败
- **THEN** 已同步快照回滚到合并前值，保证该部分增量在下次 ready 时仍会被重新推送，不丢失

### Requirement: 全后端缓存枚举
系统 SHALL 提供按当前激活缓存后端枚举全部有效缓存条目的能力。

#### Scenario: Redis 模式下查看全部缓存
- **WHEN** 管理员调用 `GET /api/admin/cache/stats`，且 `REDIS_URL` 已配置并连接就绪
- **THEN** 响应 `entries` 返回 Redis 中全部有效缓存条目（经 `SCAN` 枚举，过滤内部键与 BullMQ 等非缓存数据），每条含 `key/type/ageSeconds/ttlSeconds/remainingSeconds/expired`，并正确显示各条目的剩余 TTL

#### Scenario: 内存模式（无 Redis）查看全部缓存
- **WHEN** 未配置 Redis 或 Redis 不可用，调用 `GET /api/admin/cache/stats`
- **THEN** `entries` 返回内存 Map 中全部缓存条目，行为与现状一致（不做回归）

#### Scenario: 结果有界，避免大扫描拖垮
- **WHEN** Redis 中缓存条目数量极大
- **THEN** 枚举结果默认有界（如最多返回 200 条），并可通过 `limit` 查询参数调整；扫描不阻塞请求主路径

#### Scenario: 命中/未命中统计与未命中明细可见
- **WHEN** 管理员调用 `GET /api/admin/cache/stats`（无论 Redis 或内存模式）
- **THEN** 响应 `stats` 返回 `hits/misses/evictions/totalRequests/forcedRefreshes/hitRate` 及 `recentMisses`（Redis 模式为跨实例聚合、全局未命中明细；无 Redis 为本实例计数），保证缓存健康状况持续可观测

### Requirement: 单键缓存诊断与清理作用于当前后端
系统 SHALL 使单键查询与清理在 Redis 模式下作用于 Redis 后端。

#### Scenario: Redis 模式下按 key 探测缓存
- **WHEN** 调用 `GET /api/admin/cache/check?key=...`，且该 key 存在于 Redis
- **THEN** 返回命中详情（type、age、TTL、剩余时间），而非当前仅查内存导致的"未命中"

#### Scenario: Redis 模式下按 key 清理缓存
- **WHEN** 调用 `POST /api/admin/cache/clear` 且携带单个 key，该 key 存在于 Redis
- **THEN** 该 key 从 Redis 中被删除，并返回清理成功

## MODIFIED Requirements
### Requirement: 缓存统计接口 entries 与统计保持一致（adminController.cacheStats）
- `cacheStats` 中 `entries` 列表改由新增的 `GlobalCache.listEntries()` 生成（按当前激活后端枚举）。
- `stats` 部分保持现有跨实例聚合逻辑不变（`globalCache.getStats()`），继续返回命中/未命中/淘汰/请求数/强制刷新/hitRate 及 `recentMisses`。
- 支持可选 `keyword` 过滤（对 key 做子串匹配），帮助管理员快速定位缓存键。

### Requirement: 按缓存类型分布的可观测性（typeBreakdown）
- `cacheStats` 基于枚举得到的条目按 `type` 聚合计数，返回 `typeBreakdown: { type: count }`，便于管理员一眼看出各类型缓存（realtime/history_recent/fund_info 等）的规模分布。

### Requirement: 缓存类型枚举与 TTL 口径一致（globalCache.getTTL）
- 枚举条目使用与现有读写一致的 `getTTL(type)` 计算 TTL；Redis 模式下建议读取 Redis 的剩余 `PTTL` 作为 `remainingSeconds`（候选；若实现复杂度高可回退为按 `timestamp+TTL` 估算）。

## REMOVED Requirements
无。