# 盘中卖出基金当日收益统计完整流程 Spec

## Why
盘中全部卖出基金后，该基金当天的收益从未被统计到日收益记录中。根本原因有两点：
1. **兜底任务未结算 pending 订单**：`dailyProfitService.backfillDailyProfit`（23:55 运行）直接读取持仓数据计算日收益，没有先结算 pending 卖出订单。如果用户盘中卖出后未再打开 App，pending 订单未被结算，持仓 shares 仍>0，但 `market_closed` 场景下 `daily_profit=0`，收益丢失。
2. **market_closed 早返回阻断收益计算**：即使 pending 订单已结算（shares=0, sold_date=今天），晚上净值确认后 `calculateHoldingMetrics` 在 `market_closed` 分支直接返回 `daily_profit=0`，未对已清仓卖出当天的基金按确认净值补算收益。

## 设计原则
- 完整流程：盘中卖出挂起 pending → 净值确认后结算订单 → 结算后统计当日收益
- 兜底任务（23:55）在计算日收益前，先结算该用户的所有 pending 订单，确保持仓数据已更新
- 已清仓卖出当天（shares=0 && sold_date=今天）且净值已确认时，即使 `market_closed` 也按"卖出份额 × 确认涨跌幅"补算当日收益
- 卖出第二天起（sold_date < today）返回 `sold_out`，不再参与当日收益统计
- 不影响正常持仓的日收益统计逻辑

## What Changes
- `server/services/dailyProfitService.js` 的 `backfillDailyProfit`：在 `Holding.findByUserId` 之前，先调用结算逻辑处理该用户的所有 pending 交易订单（复用 `transactionController.settlePending` 或 `holdingController.settlePendingAsync` 的核心逻辑）
- `server/services/holdingService.js` 的 `calculateHoldingMetrics`：`market_closed` 早返回前增加例外——已清仓卖出当天（`shares==0 && sold_date==today && isConfirmed && confirmedNav>0`）时跳过早返回，继续走已确认收益计算逻辑（`yesterdayShares = todayTxShares.sell`，`dailyGain = yesterdayShares * confirmedNav * gainPercent / (100 + gainPercent)`）

## Impact
- Affected specs: `keep-sold-out-holding-display`（卖出当天行为延伸——不仅展示，还要参与日收益统计）、`fix-today-buy-estimate-zero`（todayTxShares.sell 计算逻辑复用）
- Affected code:
  - `server/services/dailyProfitService.js` — `backfillDailyProfit` 增加 pending 订单结算前置步骤
  - `server/services/holdingService.js` — `calculateHoldingMetrics` 的 `market_closed` 分支前置条件
- 无 schema 变更，无 BREAKING

## 实施约束
- **必须在新的代码分支中执行本方案**：实现开始前先从当前主干（main/master）创建新分支（建议命名 `feat/include-sold-out-fund-in-daily-profit`），所有改动在该分支上完成，验证通过后再合并回主干。避免直接在主干上改动，便于回滚与审查。

---

## ADDED Requirements

### Requirement: 兜底任务先结算 pending 订单再计算日收益
`dailyProfitService.backfillDailyProfit` SHALL 在为每个用户计算日收益前，先结算该用户的所有 pending 交易订单，确保持仓数据反映最新结算状态。

#### Scenario: 用户盘中卖出后未打开 App，兜底任务运行
- **WHEN** 用户在交易日盘中 10:00 全部卖出基金 A（创建 pending 卖出订单，持仓 shares 未变）
- **AND** 用户当天未再打开 App（pending 订单未结算）
- **AND** 晚上 23:55 兜底任务运行
- **THEN** 兜底任务先结算该用户的 pending 卖出订单（获取今日确认净值，更新持仓 shares=0, sold_date=今天, total_return=实现盈亏）
- **AND** 然后基于结算后的持仓数据计算日收益
- **AND** 已清仓基金 A 的当日收益被纳入日收益记录

#### Scenario: 兜底任务无 pending 订单
- **WHEN** 兜底任务运行时用户无 pending 订单（已全部结算）
- **THEN** 直接读取持仓数据计算日收益（行为不变）

### Requirement: 已清仓卖出当天在 market_closed 场景补算收益
`holdingService.calculateHoldingMetrics` SHALL 在以下条件全部满足时，跳过 `market_closed` 早返回，继续走已确认收益计算逻辑：
1. `shares === 0`（已全部卖出）
2. `sold_date` 存在且等于今天（本地日期 YYYY-MM-DD）
3. `isConfirmed === true`（今日净值已确认）
4. `confirmedNav > 0`
5. `marketStatus.isMarketOpen === false`（盘后/兜底场景）

计算逻辑：
- `yesterdayShares = todayTxShares.sell`（卖出份额，即卖出前持有的份额）
- `dailyGain = yesterdayShares * confirmedNav * gainPercent / (100 + gainPercent)`（使用东方财富API除权涨幅）
- 若 `gainPercent` 不可用但 `yesterdayNav > 0`，回退 `dailyGain = yesterdayShares * (confirmedNav - yesterdayNav)`
- `market_value = 0`，`accumulated_profit = holding.total_return`
- `update_status = 'confirmed'`，`is_confirmed = true`

#### Scenario: 盘中全部卖出，晚上兜底任务结算后计算收益
- **WHEN** 兜底任务结算 pending 卖出订单后（shares=0, sold_date=今天）
- **AND** `market_closed`（23:55）
- **AND** 今日净值已确认（`isConfirmed=true`, `confirmedNav=0.5791`, `gainPercent=-0.87`）
- **AND** 卖出份额 sellShares=1711.74
- **THEN** `calculateHoldingMetrics` 不进入 `market_closed` 早返回
- **AND** `daily_profit = 1711.74 * 0.5791 * (-0.87) / (100 + (-0.87)) ≈ -8.70`
- **AND** `is_confirmed = true`
- **AND** `update_status = 'confirmed'`
- **AND** `dailyProfitService` 将该基金纳入当日日收益统计

#### Scenario: 卖出当天但今日净值未确认
- **WHEN** 盘中全部卖出后，今日净值尚未确认（`isConfirmed=false`）
- **AND** 兜底任务运行
- **THEN** 结算 pending 订单时净值未确认，订单保持 pending（不结算）
- **AND** 持仓 shares 仍>0，走 `market_closed` 早返回，`daily_profit=0`
- **AND** 不纳入日收益统计（等待净值确认后下次兜底/查询补算）

### Requirement: 卖出第二天起不再补算当日收益
`holdingService.calculateHoldingMetrics` SHALL 在 `shares==0 && sold_date < today` 时返回 `sold_out` 状态（`daily_profit=0, is_confirmed=false`），不参与当日日收益统计。卖出当天的收益仅在 `sold_date == today` 时补算。

#### Scenario: 卖出第二天查询
- **WHEN** 卖出结算后的第二天（`sold_date < today`）
- **THEN** 返回 `update_status='sold_out'`，`daily_profit=0`，`is_confirmed=false`
- **AND** 不纳入当日日收益统计

---

## MODIFIED Requirements

### Requirement: calculateHoldingMetrics 的 market_closed 分支
`market_closed` 早返回 SHALL 增加前置例外条件：当 `shares==0 && sold_date==today && isConfirmed && confirmedNav>0` 时，不进入 `market_closed` 早返回，继续走已确认收益计算逻辑。此例外确保已清仓基金卖出当天的收益在盘后/兜底场景下仍能被计算并纳入日收益统计。

### Requirement: backfillDailyProfit 兜底任务流程
`backfillDailyProfit` SHALL 在为每个待补算用户读取持仓数据前，先调用结算逻辑处理该用户的所有 pending 交易订单。结算逻辑复用 `holdingController.settlePendingAsync` 的核心流程：查询 pending 交易 → 获取确认净值 → 更新持仓份额/成本/sold_date → 更新交易状态为 confirmed。结算完成后再 `Holding.findByUserId` + `enrichHoldingsWithRealTimeData` + `calculateAndSaveDailyProfit`。

---

## REMOVED Requirements
（无）
