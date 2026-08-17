# 挂起订单自动结算机制规范化 Spec

## Why
当前挂起（pending）订单的自动结算机制存在边界缺陷：兜底任务 `backfillDailyProfit` 依赖"用户当天未记录日收益"作为触发条件，导致用户当天打开过 App（触发日收益记录）但 pending 订单因净值未发布而未结算时，23:55 兜底任务会跳过该用户，pending 订单无法被结算。需要将 pending 订单结算与日收益记录解耦，确保挂起订单在净值确认后一定能被结算，无论用户是否打开过 App。

## What Changes
- 新增独立的 pending 订单结算兜底任务，与日收益兜底任务解耦
- 兜底任务扫描所有用户的 pending 订单（不依赖日收益记录状态），尝试结算
- 兜底任务同时清除超过 30 天未结算的 pending 订单（直接删除交易记录，记录详细日志）
- 保留现有的结算触发点：用户查看持仓时触发、日收益兜底任务前置触发
- 明确周末/节假日买入的 navDate 顺延规则和结算时机
- 明确"净值未发布则保持 pending"的语义，避免提前结算

## Impact
- Affected specs: 无（新增规范化）
- Affected code:
  - [server/app.js](file:///d:/fundtracker/server/app.js) — 新增独立的 pending 结算 cron 任务（23:50）
  - [server/services/dailyProfitService.js](file:///d:/fundtracker/server/services/dailyProfitService.js) — `_settlePendingTransactions` 抽取为独立可复用方法
  - [server/models/transaction.js](file:///d:/fundtracker/server/models/transaction.js) — 新增 `deleteStalePending` 方法（删除超过 30 天的 pending 订单）
  - [server/controllers/holdingController.js](file:///d:/fundtracker/server/controllers/holdingController.js) — `settlePendingAsync` 保持不变
  - [server/controllers/transactionController.js](file:///d:/fundtracker/server/controllers/transactionController.js) — 周末顺延逻辑保持不变

## ADDED Requirements

### Requirement: 独立的挂起订单结算兜底任务
系统 SHALL 提供一个独立的定时任务，专门扫描并结算所有用户的 pending 订单，不依赖日收益记录状态。

#### Scenario: 用户当天未打开 App，pending 订单净值已确认
- **WHEN** 当天 23:50 独立结算任务触发
- **AND** 用户有 pending 订单
- **AND** 该 pending 订单的 navDate 已有确认净值
- **THEN** 系统自动结算该 pending 订单（更新交易状态为 confirmed，更新持仓份额/成本）
- **AND** 无论用户当天是否打开过 App、是否已记录日收益

#### Scenario: 用户当天打开过 App 但 pending 订单净值未发布
- **WHEN** 用户早上 9 点打开 App 查看持仓
- **AND** pending 订单的 navDate 确认净值尚未发布（18:00-20:00 才发布）
- **AND** `settlePendingAsync` 因 `confirmedNav = 0` 跳过结算
- **AND** 用户的其他基金已记录当天日收益
- **WHEN** 当天 23:50 独立结算任务触发
- **THEN** 系统重新尝试结算该 pending 订单（此时净值已发布）
- **AND** 成功结算，不受"用户已记录日收益"影响

#### Scenario: pending 订单净值仍未发布
- **WHEN** 独立结算任务触发
- **AND** pending 订单的 navDate 确认净值仍未发布（如节假日顺延）
- **THEN** 保持 pending 状态，等待下次结算任务或用户查看持仓时再次尝试

### Requirement: 周末/节假日买入的 navDate 顺延规则
系统 SHALL 将周末/节假日买入的 navDate 顺延到下一个工作日，确保 pending 订单关联到有效的交易日。

#### Scenario: 周六买入（无论是否下午 3 点后）
- **WHEN** 用户在周六发起买入
- **AND** after3pm = false
- **THEN** navDate = 下周一（`ensureBusinessDay(周六)` 顺延）
- **WHEN** 用户在周六发起买入
- **AND** after3pm = true
- **THEN** navDate = 下周一（`nextBusinessDay(周六)` = 周日 → `ensureBusinessDay(周日)` = 周一）

#### Scenario: 周六买入的结算时机
- **WHEN** 用户周六买入，navDate = 下周一
- **THEN** 周一 18:00-20:00 基金公司发布周一确认净值后
- **AND** 周一 23:50 独立结算任务触发时自动结算
- **OR** 用户下次打开 App 查看持仓时自动结算

### Requirement: 清除长时间未结算的 pending 订单
系统 SHALL 在独立结算兜底任务（每天 23:50）中，清除超过 30 天未结算的 pending 订单，避免异常订单堆积。

#### Scenario: 清除超过 30 天的 pending 订单
- **WHEN** 独立结算任务（23:50）触发
- **AND** 存在 pending 订单，其 `created_at` 距今超过 30 天
- **THEN** 系统直接删除该交易记录（物理删除）
- **AND** 记录详细日志：订单 ID、用户 ID、基金代码、金额、份额、navDate、创建时间、删除时间

#### Scenario: 未超过 30 天的 pending 订单保留
- **WHEN** 独立结算任务（23:50）触发
- **AND** 存在 pending 订单，其 `created_at` 距今未超过 30 天
- **THEN** 尝试结算（净值已发布则结算，未发布则保持 pending）
- **AND** 不清除该订单

#### Scenario: 执行顺序（先结算后清除）
- **WHEN** 独立结算任务（23:50）触发
- **THEN** 先尝试结算所有 pending 订单（净值已发布的会被结算）
- **AND** 再清除剩余超过 30 天的 pending 订单（净值仍未发布的异常订单）

### Requirement: 结算触发点
系统 SHALL 在以下时机触发 pending 订单结算，确保多重保障：

1. **用户查看持仓时**：`holdingController.list` 异步调用 `settlePendingAsync`（不阻塞主流程）
2. **日收益兜底任务前置**：`backfillDailyProfit` 对每个待补算用户先调用 `_settlePendingTransactions`
3. **独立结算兜底任务**：每天 23:50 扫描所有 pending 订单（新增，与日收益兜底任务 23:55 解耦，避免并发），并清除超过 30 天的异常订单

#### Scenario: 多重触发保证最终结算
- **WHEN** pending 订单的 navDate 确认净值已发布
- **THEN** 无论用户是否打开 App，独立结算任务会在当天 23:50 结算
- **AND** 若用户更早打开 App，则更早结算

## MODIFIED Requirements

### Requirement: 日收益兜底任务的前置结算逻辑
[原有逻辑]：`backfillDailyProfit` 对每个"当天未记录日收益"的用户先调用 `_settlePendingTransactions`。

[修改后]：保留原有逻辑（用于保证卖出订单结算后再计算收益），但不再作为 pending 订单的唯一兜底机制。新增的独立结算任务负责覆盖所有 pending 订单，包括"当天已记录日收益"用户的 pending 订单。

## 日收益影响分析（重要结论）

### 结算时机不影响日收益计算准确性

系统通过 `yesterdayShares` 机制确保**当天买入的份额不参与当天日收益计算**，因此提前结算（23:50）与同步结算（23:55）的日收益计算结果完全相同。

#### 核心机制（[holdingService.js:400](file:///d:/fundtracker/server/services/holdingService.js#L400)）
```javascript
// 昨日份额 = 当前份额 - 今日 confirmed 买入 + 今日 confirmed 卖出
const yesterdayShares = Math.max(0, shares - (todayTxShares.buy || 0) + (todayTxShares.sell || 0));
// 日收益基于昨日份额计算（非当前份额）
dailyGain = yesterdayShares * (confirmedNav - yesterdayNav);
```

#### `todayTxShares` 查询条件（[holdingService.js:209-213](file:///d:/fundtracker/server/services/holdingService.js#L209-L213)）
只查询 `transaction_date = today AND status = 'confirmed'` 的交易。pending 订单不参与计算。

#### Scenario: 当天买入 pending，当天结算
- **WHEN** 用户当天买入基金 A（无确认净值 → pending，持仓份额不变）
- **AND** 23:50 独立结算任务结算该 pending 订单（持仓份额增加，status → confirmed）
- **AND** 23:55 日收益兜底任务计算日收益
- **THEN** `todayTxSharesMap` 查询到该 confirmed 交易（包含 todayTxShares.buy）
- **AND** `yesterdayShares` = 结算后份额 - todayTxShares.buy = 原份额
- **AND** `dailyGain` = 原份额 × (今日净值 - 昨日净值)
- **AND** 当天买入的份额不参与日收益计算（正确行为）

#### Scenario: 当天买入 pending，未结算
- **WHEN** 用户当天买入基金 A（pending，持仓份额不变）
- **AND** 23:55 日收益兜底任务计算日收益（pending 未结算）
- **THEN** `todayTxSharesMap` 查询不到该交易（status = 'pending'）
- **AND** `yesterdayShares` = 原份额（持仓份额未变）
- **AND** `dailyGain` = 原份额 × (今日净值 - 昨日净值)
- **AND** 结果与结算后完全相同

### 周末买入的日收益影响
- 周六买入 → navDate 顺延到周一 → 周一结算
- 周一结算后，该交易 `transaction_date = 周一`，`status = confirmed`
- 周一日收益计算时，`todayTxSharesMap` 查询到该交易（`transaction_date = 周一`）
- `yesterdayShares` 扣除周一买入份额 → 周一买入的份额不参与周一的日收益计算
- **正确行为**：周一买入的份额成本 = 周一净值，不应产生周一的日收益
