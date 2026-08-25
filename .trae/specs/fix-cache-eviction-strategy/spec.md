# 修复缓存清理机制 Spec

## Why
当前 GlobalCache 存在两个问题：
1. `evictOldest(50)` 仅按写入时间排序，不区分过期和未过期，可能误删仍在有效期的数据，同时过期条目因写入较新而残留
2. 手动 `cache.get()` + TTL 检查路径（holdingService / fundController / fundService）发现过期后只跳过不删除，产生僵尸条目占用内存

## What Changes
- 修改 `evictOldest(count)` 为优先删除过期条目，不足时再按 LRU 淘汰未过期条目
- 修改手动 `cache.get()` + TTL 检查路径，过期时删除条目而非仅跳过

## Impact
- Affected code: `server/services/globalCache.js`（`evictOldest` 方法）、`server/services/holdingService.js`（手动缓存检查）、`server/controllers/fundController.js`（手动缓存检查）、`server/services/fundService.js`（手动缓存检查）

## MODIFIED Requirements

### Requirement: evictOldest 淘汰策略
系统 SHALL 在缓存满时优先删除过期条目，不足时再按写入时间淘汰未过期条目。

- 淘汰逻辑（按顺序执行）：
  1. 遍历所有条目，删除 `age > ttl` 的过期条目（ttl 按 `value.type` 调用 `getTTL(type)` 获取）
  2. 如果删除过期条目后仍需淘汰（即 `count - 已删除数 > 0`），再按 `timestamp` 从旧到新淘汰未过期条目
- 中文注释标注两阶段淘汰策略

#### Scenario: 存在过期条目时优先删除
- **WHEN** 缓存满 500 条，其中 30 条已过期
- **AND** 需要淘汰 50 条
- **THEN** 先删除 30 条过期条目，再按写入时间淘汰 20 条最旧的未过期条目

#### Scenario: 不存在过期条目时按 LRU 淘汰
- **WHEN** 缓存满 500 条，全部未过期
- **AND** 需要淘汰 50 条
- **THEN** 直接按写入时间淘汰 50 条最旧的条目

#### Scenario: 过期条目多于需淘汰数
- **WHEN** 缓存满 500 条，其中 80 条已过期
- **AND** 需要淘汰 50 条
- **THEN** 删除 50 条过期条目（按写入时间从旧到新），不淘汰任何未过期条目

### Requirement: 手动缓存检查路径删除过期条目
系统 SHALL 在手动 `cache.get()` + TTL 检查路径中发现过期时删除条目。

- 修改位置：
  - `holdingService.js`（2 处：realtime 缓存检查、3 天历史净值检查）
  - `fundController.js`（1 处：走势图缓存检查）
  - `fundService.js`（1 处：单只股票行情缓存检查）
- 修改逻辑：`age >= ttl` 时增加 `globalCache.cache.delete(cacheKey)` 再继续请求

#### Scenario: 手动检查发现过期时删除
- **WHEN** 手动 `cache.get(key)` 返回条目，但 `age >= ttl`
- **THEN** 删除该条目（`globalCache.cache.delete(key)`），不再留僵尸条目
