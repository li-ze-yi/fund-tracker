# 消除日收益服务重复请求历史净值 Spec

## Why
当前用户查看持仓时，`holdingService.enrichHoldingsWithRealTimeData` 已通过 3 天历史数据（`history_{code}_3d_{today}`）计算并返回了每只基金的 `isConfirmed` 状态，但 `dailyProfitService.checkConfirmedFunds` 又独立请求 1 天历史数据（`history_{code}_1d_{today}`）做相同判断。虽然 `history_recent` 缓存的 5 分钟黄金窗口能避免部分网络请求，但仍存在两套独立缓存键、两次缓存查询、以及缓存过期时对外部 API 的重复请求。

## What Changes
- `dailyProfitService.calculateAndSaveDailyProfit` SHALL 直接复用 `enrichedWithStatus` 中已计算的确认状态，不再调用 `checkConfirmedFunds` 重新请求 1 天历史数据
- 删除 `dailyProfitService.checkConfirmedFunds` 方法（不再被调用）
- 删除 `dailyProfitService` 中对 `fundService.getHistoryNetValues` 的依赖（仅用于 checkConfirmedFunds 的部分）
- `backfillDailyProfit`（兜底任务，无 enrichedHoldings 入参）SHALL 保留独立的 1 天历史数据查询逻辑，因为兜底场景没有持仓界面的预查询结果可复用
- 保留 `planService` 中的 1 天历史数据查询（定投结算场景独立，不经过持仓界面流程）

## Impact
- Affected specs: `fix-cache-coverage-gaps`（`dailyProfitService` 接入缓存的需求条目中，"用户查看持仓"场景不再请求 1 天历史；"23:55 兜底任务"场景仍需请求）
- Affected code:
  - `server/services/dailyProfitService.js`（删除 `checkConfirmedFunds`，重写 `calculateAndSaveDailyProfit` 主流程）
  - `server/services/holdingService.js`（需确认 `enrichedWithStatus` 返回字段中包含 `isConfirmed` 标志，若不包含则补充）
  - `server/controllers/holdingController.js`（无需改动，已透传 `enrichedWithStatus`）

## ADDED Requirements

### Requirement: 复用持仓界面的确认状态
`dailyProfitService.calculateAndSaveDailyProfit` SHALL 直接从入参 `enrichedWithStatus` 读取每只基金的确认状态，不重新请求历史净值接口。

- 数据来源：`enrichedWithStatus` 中由 `holdingService.calculateHoldingMetrics` 设置的 `isConfirmed` 字段
- 复用字段：`holding.isConfirmed`（boolean）
- 移除调用：不再调用 `this.checkConfirmedFunds(holdingsWithRealTimeData, today)`
- 分类逻辑：`confirmedFunds = holdings.filter(h => h.isConfirmed)`，`unconfirmedFunds = holdings.filter(h => !h.isConfirmed)`

#### Scenario: 用户查看持仓时触发日收益计算
- **WHEN** 用户打开持仓界面，`holdingController` 调用 `enrichHoldingsWithRealTimeData` 获取已包含 `isConfirmed` 的持仓列表
- **AND** 异步调用 `dailyProfitService.calculateAndSaveDailyProfit(userId, enrichedWithStatus)`
- **THEN** `dailyProfitService` 直接读取 `enrichedWithStatus[i].isConfirmed` 进行基金分类，不发起任何 `getHistoryNetValues` 调用
- **AND** 不再写入或读取 `history_{code}_1d_{today}` 缓存键（在用户查看持仓路径下）

#### Scenario: 确认状态字段缺失时的回退
- **WHEN** `enrichedWithStatus[i].isConfirmed` 为 `undefined` 或 `null`
- **THEN** 该基金视为未确认，归入 `unconfirmedFunds`，不参与当日收益计算
- **AND** 在日志中打印警告 `[DailyProfit] ⚠️ 基金 {code} 缺少 isConfirmed 字段，按未确认处理`

### Requirement: 兜底任务保留独立查询
`dailyProfitService.backfillDailyProfit` SHALL 保留独立的 1 天历史数据查询逻辑，因为兜底任务在 23:55 触发时，用户当日可能未打开过持仓界面，没有可复用的 `enrichedWithStatus`。

- 兜底任务流程：
  1. 查询每个持仓用户的持仓列表
  2. 调用 `holdingService.enrichHoldingsWithRealTimeData` 获取含 `isConfirmed` 的持仓（此时会触发 3 天历史数据查询并写入 `history_{code}_3d_{today}` 缓存）
  3. 复用上述结果调用 `calculateAndSaveDailyProfit`
- 因此兜底任务实际也会复用 `enrichHoldingsWithRealTimeData` 的结果，不再需要独立的 1 天历史查询

#### Scenario: 23:55 兜底任务执行
- **WHEN** cron 触发 `backfillDailyProfit`，针对当天未生成日收益记录的持仓用户
- **THEN** 对每个用户调用 `enrichHoldingsWithRealTimeData`（触发 3 天历史数据查询）
- **AND** 将结果传入 `calculateAndSaveDailyProfit`，复用 `isConfirmed` 字段
- **AND** 不再独立请求 1 天历史数据

## MODIFIED Requirements

### Requirement: calculateAndSaveDailyProfit 主流程
`calculateAndSaveDailyProfit(userId, holdingsWithRealTimeData)` SHALL 跳过 `checkConfirmedFunds` 步骤，直接从入参读取确认状态。

修改后的主流程：
1. 检查 `lastUpdateCache` 节流（不变）
2. 检查是否为交易日（`isTradingDay`，不变）
3. **修改**：直接从 `holdingsWithRealTimeData` 读取 `isConfirmed` 字段分类基金，移除 `checkConfirmedFunds` 调用
4. 检查确认基金收益数据有效性（不变）
5. `calculateFromConfirmedFundsOnly`（不变，仍使用 `fund.daily_profit`）
6. 计算收益率并保存到 `daily_profits` 表（不变）

#### Scenario: 主流程简化
- **WHEN** `calculateAndSaveDailyProfit` 被调用
- **THEN** 跳过 `checkConfirmedFunds` 步骤，直接从入参 `holdingsWithRealTimeData[i].isConfirmed` 分类
- **AND** 日志输出 `已确认: X/Y` 保持原格式不变

## REMOVED Requirements

### Requirement: dailyProfitService.checkConfirmedFunds 方法
**Reason**: 该方法独立请求 1 天历史数据做确认状态判断，与 `holdingService` 通过 3 天历史数据已计算的结果重复。复用入参的 `isConfirmed` 字段后，该方法不再被任何调用方使用。
**Migration**:
- 删除 `dailyProfitService.checkConfirmedFunds` 方法
- 删除该方法中使用的 `history_{code}_1d_{today}` 缓存键（仅在 dailyProfitService 用户查看持仓路径下）
- `planService` 仍保留自己的 `history_{code}_1d_{today}` 查询，不受影响
- `backfillDailyProfit` 改为调用 `enrichHoldingsWithRealTimeData` 后复用 `isConfirmed`，不再走 `checkConfirmedFunds`
