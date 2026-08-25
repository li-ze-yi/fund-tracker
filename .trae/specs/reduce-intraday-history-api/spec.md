# 盘中减少 3d 历史 API 调用 Spec

## Why
盘中（9:00-15:00）`history_{code}_3d` 历史净值缓存 TTL 仅 30 分钟，持仓列表每次刷新/过期都会为每只基金重新请求一次 3d 历史 API。而盘中的确认净值数据是"静态"的——当日净值收盘后才公布，盘中 `historyData[0]` 恒为上一交易日确认净值，反复重拉纯属浪费。目标：**盘中将 3d 历史 API 调用降为 0**，让数据库确认净值（由 23:55 回写保证新鲜）成为盘中估算的本地基准；盘中若 DB 值不新鲜/缺失，回退 API 后同时写回缓存与数据库，实现 DB 自愈。

## What Changes
- **盘中跳过 3d 历史拉取**：`enrichHoldingsWithRealTimeData` 在交易时段（9:00-15:00）不再对 `history_{code}_3d` 发起 API 请求。
- **确认净值新鲜度改为日期启发式**：`resolveConfirmedNav` 在无历史数据（盘中）时，用 `confirmed_nav_date` 是否在最近几个自然日内判定新鲜，不再依赖 `historyData[0].date`。
- **盘中回退 API 时写回缓存与数据库**：盘中 DB 值不新鲜/缺失时，从 API 取到确认净值后，除写入 `confirmed_nav_{code}` 缓存外，**一并回写 `holdings.confirmed_nav` / `confirmed_nav_date`**（自愈，占位持仓除外）。
- **23:55 回写跳过占位持仓**：`dailyProfitService` 回写 `confirmed_nav` 时，跳过 `confirmed_nav === null` 的占位持仓，避免破坏占位识别、防止后续结算按加仓处理导致 `totalCost` 翻倍。
- 以上均为行为修改，不改 API 签名、不加配置项；**不改动 `history_recent` 的 TTL**。

## Impact
- Affected specs: 持仓展示链路（估算/确认状态/日收益）、确认净值同步、缓存策略
- Affected code:
  - `server/services/holdingService.js`（盘中跳过历史拉取、`resolveConfirmedNav` 日期启发式新鲜度 + 写回缓存与数据库）
  - `server/services/dailyProfitService.js`（回写跳过占位持仓）

## MODIFIED Requirements

### Requirement: 盘中跳过 3d 历史拉取
在 `enrichHoldingsWithRealTimeData` 中，系统 SHALL 在交易时段（本地 9:00-15:00）跳过对 `history_{code}_3d` 的 API 拉取。

#### Scenario: 盘中访问持仓
- **WHEN** 本地时间 9:00-15:00，用户刷新持仓列表
- **THEN** 不发起任何 `history_{code}_3d` API 请求；`historyDataMap` 仅使用已有缓存，未命中则留空

#### Scenario: 盘后访问持仓
- **WHEN** 本地时间不在 9:00-15:00
- **THEN** 保持原逻辑，正常拉取并缓存 3d 历史

### Requirement: 盘中确认净值新鲜度改为日期启发式
`resolveConfirmedNav` 在无历史数据（盘中跳过拉取）时，系统 SHALL 用日期启发式判定数据库确认净值是否新鲜，而非依赖 `historyData[0].date`。

#### Scenario: 盘中且数据库值新鲜
- **WHEN** 盘中，`holdings.confirmed_nav > 0`，且 `confirmed_nav_date` 为最近几个自然日内（覆盖周末/节假日，如不早于今天前 4 天）且早于今天
- **THEN** 以数据库值为确认净值基准（source=db），并写入 `confirmed_nav_{code}` 缓存

#### Scenario: 盘中且数据库值不新鲜/缺失（真实确认持仓）
- **WHEN** 盘中，非占位持仓（`confirmed_nav` 存在但日期超出最近几个自然日，或值缺失），回退 API 获取确认净值
- **THEN** 以 API 值为基准，写入 `confirmed_nav_{code}` 缓存，**并回写 `holdings.confirmed_nav` / `confirmed_nav_date`（自愈）**，输出 INFO 日志

#### Scenario: 盘中且数据库值为占位持仓
- **WHEN** 盘中，`holdings.confirmed_nav === null`（占位持仓，pending 买入未结算）
- **THEN** 从 API 取确认净值作为估算基准并写入缓存，但**不回写数据库**，保持占位状态

#### Scenario: 盘后有历史数据
- **WHEN** 盘后正常拉取到 3d 历史，`historyData[0].date` 可用
- **THEN** 保持现有逻辑（以 `historyData[0].date` 校验新鲜度）

### Requirement: 23:55 回写跳过占位持仓
`calculateAndSaveDailyProfitFromConfirmedNav` 的回写逻辑 SHALL 跳过 `confirmed_nav === null` 的占位持仓，只回写真实确认持仓。

#### Scenario: 占位持仓
- **WHEN** 兜底处理某基金，`holding.confirmed_nav === null`（占位持仓，pending 买入未结算）
- **THEN** 不写 `confirmed_nav`/`confirmed_nav_date`，保持占位状态

#### Scenario: 真实确认持仓
- **WHEN** 兜底处理某基金，`holding.confirmed_nav > 0`，`todayNav > 0`，且 `confirmed_nav_date` 为 `null` 或早于 `latestHistoryDate`
- **THEN** 以 `confirmed_nav = todayNav`、`confirmed_nav_date = latestHistoryDate` 更新该持仓（幂等）

## REMOVED Requirements
（无）
