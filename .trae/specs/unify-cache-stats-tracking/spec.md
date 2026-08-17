# 统一缓存统计口径 Spec

## Why
当前 `GlobalCache.stats` 只在 `getOrFetch` 路径更新，存在三类统计盲区：
1. 手动 `cache.get()` + TTL 检查路径（持仓主流程、走势图、股票行情）完全不计入 `hits`/`misses`/`totalRequests`，导致日志中显示的命中率严重低估实际效果（用户查看 10 只基金持仓时，21 次实际缓存查询只有 1 次被统计）
2. `getOrFetch` 的 `forceRefresh` 路径只增加 `totalRequests`，不增加 `hits` 也不增加 `misses`，导致 `hits + misses ≠ totalRequests`，命中率计算失真
3. `evictOldest()` 容量淘汰不更新 `evictions`，与 `cleanup()` 的过期清理行为不一致

## What Changes
- 新增 `GlobalCache.checkCache(key, type)` 方法，统一封装"手动 get + TTL 检查 + 过期删除 + 统计更新"逻辑
- 重构 4 处手动 `cache.get()` 路径改用 `checkCache`：`holdingService`（2 处）、`fundController`（1 处）、`fundService`（1 处）
- `stats` 新增 `forcedRefreshes` 字段，`getOrFetch` 的 `forceRefresh` 路径增加该计数
- `evictOldest()` 在删除条目时累加 `evictions` 计数
- `getStats()` 输出 `forcedRefreshes` 字段
- `adminController` 的调试用 `cache.get()` **保持不变**（管理后台非生产主路径，不参与统计）

## Impact
- Affected specs: `fix-cache-eviction-strategy`（`evictOldest` 行为调整）、`fix-cache-coverage-gaps`（手动路径接入缓存的部分，统计口径随之统一）
- Affected code:
  - `server/services/globalCache.js`（新增 `checkCache` 方法、修改 `getOrFetch`、`evictOldest`、`getStats`、`stats` 初始化、`clear`）
  - `server/services/holdingService.js`（2 处手动 `cache.get` 改为 `checkCache`）
  - `server/controllers/fundController.js`（1 处手动 `cache.get` 改为 `checkCache`）
  - `server/services/fundService.js`（1 处手动 `cache.get` 改为 `checkCache`）

## ADDED Requirements

### Requirement: checkCache 统一查询方法
系统 SHALL 提供 `GlobalCache.checkCache(key, type)` 方法，封装手动路径的缓存查询逻辑并更新统计。

方法签名与行为：
```js
checkCache(key, type = 'realtime') {
  this.stats.totalRequests++;
  const cached = this.cache.get(key);
  if (cached) {
    const ttl = this.getTTL(type);
    const age = Date.now() - cached.timestamp;
    if (age < ttl) {
      this.stats.hits++;
      return { hit: true, data: cached.data };
    }
    // 过期，删除僵尸条目
    this.cache.delete(key);
    this.stats.evictions++;
  }
  this.stats.misses++;
  return { hit: false, data: null };
}
```

返回值：`{ hit: boolean, data: any | null }`
- `hit: true` 表示缓存命中且未过期，`data` 为缓存数据
- `hit: false` 表示未命中或已过期（已删除僵尸条目），`data` 为 `null`

统计更新：
- 每次调用 `totalRequests++`
- 命中且未过期：`hits++`
- 未命中：`misses++`
- 命中但已过期：`evictions++`（删除僵尸条目）+ `misses++`

#### Scenario: 缓存命中且未过期
- **WHEN** 调用 `checkCache(key, 'realtime')`，缓存中存在该 key 且 `age < ttl`
- **THEN** `totalRequests++`、`hits++`
- **AND** 返回 `{ hit: true, data: cached.data }`

#### Scenario: 缓存未命中
- **WHEN** 调用 `checkCache(key, 'realtime')`，缓存中不存在该 key
- **THEN** `totalRequests++`、`misses++`
- **AND** 返回 `{ hit: false, data: null }`

#### Scenario: 缓存命中但已过期
- **WHEN** 调用 `checkCache(key, 'realtime')`，缓存存在但 `age >= ttl`
- **THEN** 删除僵尸条目（`cache.delete(key)`）
- **AND** `totalRequests++`、`evictions++`、`misses++`
- **AND** 返回 `{ hit: false, data: null }`

### Requirement: 强制刷新统计字段
系统 SHALL 在 `stats` 中新增 `forcedRefreshes` 字段，统计 `getOrFetch` 的强制刷新次数。

- 初始值：`0`
- 更新位置：`getOrFetch` 中 `forceRefresh === true` 分支
- 更新时机：在 `totalRequests++` 之后、调用 `fetchFn()` 之前

#### Scenario: 强制刷新被统计
- **WHEN** 调用 `getOrFetch(key, fetchFn, { forceRefresh: true })`
- **THEN** `totalRequests++`、`forcedRefreshes++`
- **AND** 不更新 `hits` 或 `misses`（强制刷新不读缓存，不属于命中或未命中）

## MODIFIED Requirements

### Requirement: 手动 cache.get 路径改用 checkCache
4 处手动 `globalCache.cache.get(key)` + TTL 检查路径 SHALL 改用 `globalCache.checkCache(key, type)`，统一统计口径。

修改位置与类型参数：

| 文件 | 行号 | 缓存类型 | 原逻辑 |
|------|------|---------|--------|
| `holdingService.js` | ~L254 | `realtime` | `cache.get(cacheKey)` + `getTTL('realtime')` + `cache.delete` |
| `holdingService.js` | ~L288 | `history_recent` | `cache.get(cacheKey)` + `getTTL('history_recent')` + `cache.delete` |
| `fundController.js` | ~L458 | `history_chart` | `cache.get(cacheKey)` + `getTTL('history_chart')` + `cache.delete` + latestDate 三分支判断 |
| `fundService.js` | ~L464 | `stock_quote` | `cache.get(cacheKey)` + `getTTL('stock_quote')` + `cache.delete` |

修改后调用方式：
```js
const result = globalCache.checkCache(cacheKey, '<type>');
if (result.hit) {
  // 使用 result.data
} else {
  // 加入 needFetch / 请求外部 API
}
```

#### Scenario: holdingService 批量 realtime 查询
- **WHEN** `enrichHoldingsWithRealTimeData` 遍历持仓基金检查 realtime 缓存
- **THEN** 调用 `checkCache(cacheKey, 'realtime')` 替代 `cache.get(cacheKey)`
- **AND** 命中时使用 `result.data`，未命中时加入 `needFetch` 列表

#### Scenario: holdingService 批量 3 天历史查询
- **WHEN** `enrichHoldingsWithRealTimeData` 遍历持仓基金检查 3 天历史缓存
- **THEN** 调用 `checkCache(cacheKey, 'history_recent')` 替代 `cache.get(cacheKey)`

#### Scenario: fundController 走势图缓存查询
- **WHEN** `getNavHistory` 检查走势图缓存
- **THEN** 调用 `checkCache(cacheKey, 'history_chart')` 替代 `cache.get(cacheKey)`
- **AND** 命中时仍执行 `latestDate` 三分支判断（today/yesterday/<yesterday）
- **AND** 未命中或已过期时走原有"重新请求完整日期范围"逻辑

#### Scenario: fundService 股票行情缓存查询
- **WHEN** `getStocksRealtime` 逐只检查股票行情缓存
- **THEN** 调用 `checkCache(cacheKey, 'stock_quote')` 替代 `cache.get(cacheKey)`

### Requirement: evictOldest 更新 evictions 统计
`evictOldest(count)` SHALL 在删除条目时累加 `evictions` 计数，与 `cleanup()` 行为一致。

修改逻辑：
- 阶段 1（删除过期条目）：每删除一个，`this.stats.evictions++`
- 阶段 2（LRU 淘汰未过期条目）：每删除一个，`this.stats.evictions++`

#### Scenario: evictOldest 删除条目时更新统计
- **WHEN** 缓存满 500 条，触发 `evictOldest(50)` 淘汰 50 条
- **THEN** `evictions` 累加 50
- **AND** 阶段 1 和阶段 2 的删除都计入

### Requirement: getStats 输出新字段
`getStats()` SHALL 在返回对象中包含 `forcedRefreshes` 字段。

修改后返回对象：
```js
{
  hits: number,
  misses: number,
  evictions: number,
  totalRequests: number,
  forcedRefreshes: number,  // ★ 新增
  hitRate: string,           // hits / totalRequests × 100%
  size: number,
  maxSize: number,
  tradingStatus: string,
  realtimeTTL: string
}
```

#### Scenario: getStats 返回完整统计
- **WHEN** 调用 `getStats()`
- **THEN** 返回对象包含 `forcedRefreshes` 字段
- **AND** `hitRate` 计算公式不变（`hits / totalRequests`），强制刷新计入 `totalRequests` 但不计入 `hits`/`misses`，因此会拉低命中率（符合预期：强制刷新本质上是绕过缓存）

### Requirement: stats 初始化与重置包含新字段
`GlobalCache` 构造函数和 `clear()` 方法 SHALL 在 `stats` 中包含 `forcedRefreshes` 字段。

- 构造函数初始化：`this.stats = { hits: 0, misses: 0, evictions: 0, totalRequests: 0, forcedRefreshes: 0 };`
- `clear()` 重置：`this.stats = { hits: 0, misses: 0, evictions: 0, totalRequests: 0, forcedRefreshes: 0 };`

## REMOVED Requirements

无。
