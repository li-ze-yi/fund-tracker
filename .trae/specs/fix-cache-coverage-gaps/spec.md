# 修复缓存覆盖缺口 Spec

## Why
当前 GlobalCache 存在两类问题：1) 股票行情、ETF 行情、planService/dailyProfitService 中的历史净值查询完全未接入缓存，每次直接请求外部 API；2) 已接入缓存的代码中存在缓存键不一致、TTL 类型错配问题。

## What Changes
- 为 `getStocksRealtime`（腾讯 qt.gtimg.cn）和 `getETFRealtimeQuote`（东方财富 push2/腾讯/新浪）接入 GlobalCache
- 在 `globalCache.getTTL()` 中新增 `stock_quote` 和 `etf_quote` 两种缓存类型，TTL 与 `realtime` 一致
- 为 `planService`、`dailyProfitService` 和 `fundController.getNavHistory`（走势图）中的 `getHistoryNetValues`（eastmoney/lsjz）接入 GlobalCache
- 统一 `realtime` 缓存键格式为 `realtime_{code}_{method}`，修复 `holdingController` 和 `imageImportController` 的缓存键
- 将 30 天历史净值缓存类型从 `history_recent` 改为 `history_older`
- 将指数分时数据缓存类型从 `history_recent` 改为 `realtime`

## Impact
- Affected specs: 无（新 spec）
- Affected code: `server/services/globalCache.js`, `server/services/fundService.js`, `server/controllers/holdingController.js`, `server/controllers/imageImportController.js`, `server/controllers/fundController.js`, `server/services/planService.js`, `server/services/dailyProfitService.js`, `server/routes/indices.js`

## ADDED Requirements

### Requirement: 股票实时行情缓存
系统 SHALL 对 `getStocksRealtime` 的返回结果进行缓存。

- 外部 API：腾讯 `qt.gtimg.cn`（`getStocksRealtimeBatch`）
- 缓存键：`stock_quotes_{sorted_hash}`（股票代码列表排序后的唯一标识）
- 缓存类型：`stock_quote`（// 股票实时行情缓存）
- TTL：与 `realtime` 相同（动态：盘中 28s / 盘后 30min~2h / 周末 12h）

#### Scenario: 盘中持仓估值刷新
- **WHEN** 持仓穿透法估值需要获取多只股票实时行情
- **THEN** 优先从 GlobalCache 读取，命中则直接返回，未命中则请求腾讯 qt.gtimg.cn 后写入缓存

#### Scenario: 跨基金共享
- **WHEN** 多只基金持有相同股票组合
- **THEN** 同一批股票行情可被多次估值计算复用，不重复请求外部 API

### Requirement: ETF 实时行情缓存
系统 SHALL 对 `getETFRealtimeQuote` 的返回结果进行缓存。

- 外部 API：东方财富 push2（主）→ 腾讯 qt.gtimg.cn（备）→ 新浪 hq.sinajs.cn（备）
- 缓存键：`etf_quote_{code}`
- 缓存类型：`etf_quote`（// ETF实时行情缓存）
- TTL：与 `realtime` 相同（动态）

#### Scenario: ETF 联接基金估值
- **WHEN** ETF 联接基金（如 019633）需要获取母 ETF（如 159516）实时行情
- **THEN** 优先从 GlobalCache 读取，命中则直接返回，未命中则请求外部 API 后写入缓存

#### Scenario: 同一 ETF 被多次引用
- **WHEN** 同一只母 ETF 被多只联接基金引用
- **THEN** 仅首次请求外部 API，后续复用缓存

### Requirement: 定投和日收益服务接入缓存
系统 SHALL 为 `planService` 和 `dailyProfitService` 中的 `getHistoryNetValues` 调用接入 GlobalCache。

- 外部 API：东方财富 `api.fund.eastmoney.com/f10/lsjz`
- 缓存键：`history_{code}_1d_{today}`
- 缓存类型：`history_recent`（// 近期历史净值缓存）
- TTL：动态（盘中 30min / 盘后黄金窗口 5min / 周末 12h）

#### Scenario: 定投结算检查当日净值
- **WHEN** `planService` 检查基金当日净值是否已确认
- **THEN** 优先从 GlobalCache 读取，命中则直接返回，未命中则请求 eastmoney/lsjz 后写入缓存

### Requirement: 基金详情页走势图历史净值缓存
系统 SHALL 为 `fundController.getNavHistory` 中的 `getHistoryNetValues` 调用接入 GlobalCache。

- 外部 API：东方财富 `api.fund.eastmoney.com/f10/lsjz`
- 缓存键：`history_{code}_{startDate}_{endDate}`（// 走势图历史净值缓存，按日期范围区分）
- 缓存类型：`history_chart`（// 走势图专用，固定 24h TTL。不复用 `history_recent`，因为 cleanup() 按 type 取 TTL 清理，`history_recent` 黄金窗口仅 5 分钟，会导致走势图缓存被过早清理，24h 的 latestDate 判断失效）
- TTL 策略：**固定 24h + latestDate 三分支判断**
  - 默认 TTL：24h（// 历史净值一旦确认就固定不变）
  - 过期判断：缓存命中后，检查缓存数据中最新记录日期 `latestDate`：
    1. `latestDate` = 今天 → 数据完整，直接返回缓存（// 今天净值已确认）
    2. `latestDate` = 昨天 → 调用 `getHistoryNetValues(code, today, today)` 轻量查询今天是否已确认
       - 今天有记录 → 已确认，缓存过期 → 重新请求完整日期范围并更新缓存
       - 今天无记录 → 未确认 → 返回缓存（// 昨天数据仍是当前最新）
    3. `latestDate` < 昨天 → 缓存落后（// 至少缺了昨天的确认净值）→ 直接重新请求完整日期范围并更新缓存
  - 注意：跨天查询会因 `endDate` 变化生成不同缓存键，自动 miss 重取，无需特殊处理
  - 注意：不复用 `history_recent` 类型。虽然轻量查询和持仓页净值确认检测调用的是同一个接口，但 `globalCache.cleanup()` 按 type 取 TTL 清理过期条目，`history_recent` 黄金窗口仅 5 分钟 TTL，会导致走势图缓存在 7.5 分钟（5×1.5）后被删除，24h 的 latestDate 判断逻辑失效

#### Scenario: 缓存已包含今天净值，直接命中
- **WHEN** 走势图缓存中最新记录日期为今天
- **THEN** 直接返回缓存，不请求任何外部 API

#### Scenario: 缓存最新为昨天，今天净值已确认
- **WHEN** 缓存最新记录日期为昨天，且轻量查询发现今天净值已发布
- **THEN** 缓存过期，重新请求完整日期范围数据，写入缓存后返回

#### Scenario: 缓存最新为昨天，今天净值未确认
- **WHEN** 缓存最新记录日期为昨天，且轻量查询今天无数据
- **THEN** 直接返回缓存（昨天数据仍是当前最新），等待下次请求再检查

#### Scenario: 缓存落后，直接重取
- **WHEN** 缓存最新记录日期早于昨天（如缓存最新为 7/26，今天为 7/28）
- **THEN** 缓存落后，直接重新请求完整日期范围数据，写入缓存后返回

#### Scenario: 跨天查询自动 miss
- **WHEN** 昨天查看走势图（endDate=7/27），今天查看（endDate=7/28）
- **THEN** 缓存键不同（`history_{code}_{start}_2026-07-27` vs `history_{code}_{start}_2026-07-28`），自动 miss，重新请求获取含 7/27 确认净值的最新数据

## MODIFIED Requirements

### Requirement: 统一 realtime 缓存键格式
`holdingController` 和 `imageImportController` 中的 `realtime` 缓存键 SHALL 从 `realtime_{fundCode}` 改为 `realtime_{fundCode}_auto`，与 `holdingService` 中的 `realtime_{code}_{method}` 格式一致。

- 外部 API：东方财富 `getRealTimeValue`（lsjz + pingzhongdata + push2）
- 缓存键：`realtime_{code}_auto`（// 基金实时估值缓存，auto=自动选择数据源）
- 缓存类型：`realtime`（不变）

#### Scenario: holdingController 单基金查询
- **WHEN** `holdingController` 获取单只基金实时估值
- **THEN** 可与 `holdingService` 批量查询共享 `realtime_{code}_auto` 缓存，避免重复请求

### Requirement: 30 天历史净值 TTL 类型
`holdingController` 和 `imageImportController` 中 30 天历史净值的缓存类型 SHALL 从 `history_recent` 改为 `history_older`（72 小时 TTL）。

- 外部 API：东方财富 `api.fund.eastmoney.com/f10/lsjz`
- 缓存键：`history_{code}_30d_{today}`（不变）
- 缓存类型：`history_recent` → `history_older`（// 远期历史净值缓存，72h TTL）

#### Scenario: 获取 30 天历史净值
- **WHEN** 用户查看单只基金详情需要 30 天历史净值
- **THEN** 缓存 72 小时，因为 30 天前的数据已固定不变，无需频繁刷新

### Requirement: 指数分时数据 TTL 类型
`routes/indices.js` 中 `/indices/:code/intraday` 的缓存类型 SHALL 从 `history_recent` 改为 `realtime`。

- 外部 API：腾讯 `web.ifzq.gtimg.cn` 分时接口
- 缓存键：`indices:intraday:{code}:{date}`（不变）
- 缓存类型：`history_recent` → `realtime`（// 盘中实时数据缓存，28s 刷新）

#### Scenario: 盘中获取指数分时数据
- **WHEN** 用户查看指数分时图
- **THEN** 盘中 TTL 为 28 秒，保证分时数据及时刷新；盘后/周末自动延长 TTL

## REMOVED Requirements
无。