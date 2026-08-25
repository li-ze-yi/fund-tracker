# 优化股票实时行情缓存为单只缓存 Spec

## Why
当前 `getStocksRealtime` 按"股票组合"（sorted join）作为缓存键，多只基金持有部分相同股票时无法复用行情缓存，导致重复请求腾讯 qt.gtimg.cn API。改为每只股票单独缓存后，跨基金共享股票行情数据，减少外部 API 调用。

## What Changes
- 将 `getStocksRealtime` 的缓存策略从"组合缓存"改为"单只缓存"
- 缓存键从 `stock_quotes_{sorted.join(',')}` 改为 `stock_quote_{code}`
- 逐只检查缓存命中，仅对未命中的股票批量请求外部 API
- 批量请求返回后逐只写入缓存

## Impact
- Affected specs: `fix-cache-coverage-gaps`（Task 3 的 `getStocksRealtime` 缓存接入）
- Affected code: `server/services/fundService.js`（`getStocksRealtime` 函数）

## MODIFIED Requirements

### Requirement: 股票实时行情缓存策略
系统 SHALL 为 `getStocksRealtime` 中的股票行情数据接入 GlobalCache，采用**单只股票独立缓存**策略，而非组合缓存。

- 外部 API：腾讯 `qt.gtimg.cn`
- 缓存键：`stock_quote_{code}`（// 每只股票独立缓存，跨基金共享）
- 缓存类型：`stock_quote`（// 已有类型，动态 TTL：盘中 28s / 盘后 30min~2h / 周末 12h）
- 缓存逻辑：
  1. 逐只检查缓存 `stock_quote_{code}` 是否命中
  2. 收集所有未命中的股票代码
  3. 对未命中的股票调用 `getStocksRealtimeBatch` 批量请求（保留原有分批逻辑，BATCH_SIZE=50）
  4. 批量请求返回后，逐只写入缓存 `globalCache.set('stock_quote_{code}', quote, 'stock_quote')`
  5. 合并缓存命中数据和新请求数据，返回完整结果
- 调用逻辑日志（console.log，前缀 `[getStocksRealtime]`）：
  - 缓存检查后：`共{N}只: 缓存命中{X}只, 需请求{Y}只`
  - 全部命中时：`全部命中缓存，跳过外部API请求`
  - 请求外部 API 前：`请求腾讯qt.gtimg.cn: {codes} (分{N}批)`
  - 请求完成后：`完成: 请求{Y}只, 成功获取{X}只, 失败{Z}只`

#### Scenario: 跨基金复用股票行情缓存
- **WHEN** 基金 A 持有 [000001, 000002, 000003]，基金 B 持有 [000002, 000003, 000004]
- **AND** 基金 A 已请求过行情，缓存中有 000001、000002、000003
- **THEN** 基金 B 请求时，000002 和 000003 命中缓存，仅请求 000004

#### Scenario: 全部命中缓存
- **WHEN** 请求的股票全部在缓存中且未过期
- **THEN** 不请求任何外部 API，直接返回缓存数据

#### Scenario: 全部未命中
- **WHEN** 请求的股票均不在缓存中
- **THEN** 批量请求外部 API，逐只写入缓存后返回

#### Scenario: 部分命中部分未命中
- **WHEN** 请求 [000001, 000002, 000003]，其中 000001 命中，000002 和 000003 未命中
- **THEN** 仅对 000002 和 000003 调用 `getStocksRealtimeBatch`，合并缓存数据和新数据返回
