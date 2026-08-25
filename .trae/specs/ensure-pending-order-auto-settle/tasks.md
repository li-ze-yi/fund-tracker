# Tasks

- [x] Task 1: 抽取 pending 订单结算逻辑为独立服务方法
  - [x] SubTask 1.1: 在 `dailyProfitService.js` 中将 `_settlePendingTransactions` 的核心逻辑抽取为可独立调用的方法（或新建 `pendingSettleService.js`）
  - [x] SubTask 1.2: 确保新方法不依赖日收益记录状态，直接扫描 `Transaction.findPendingByUserId` 的所有用户
  - [x] SubTask 1.3: 抽取"查询所有有 pending 订单的用户"的查询方法到 `transaction.js` model（如 `findAllPendingUsers`）

- [x] Task 2: 新增独立的 pending 订单结算兜底任务
  - [x] SubTask 2.1: 在 `server/app.js` 中新增 cron 任务，调度时间设为每天 23:50（略早于日收益兜底任务的 23:55，避免并发）
  - [x] SubTask 2.2: cron 任务调用新抽取的独立结算方法，扫描所有用户的 pending 订单并尝试结算
  - [x] SubTask 2.3: 添加日志：记录扫描的用户数、pending 订单数、成功结算数、跳过数（净值未发布）

- [x] Task 3: 实现清除超过 30 天未结算的 pending 订单功能
  - [x] SubTask 3.1: 在 `server/models/transaction.js` 中新增 `deleteStalePending(days = 30)` 方法，物理删除 `status = 'pending' AND created_at < NOW() - INTERVAL 30 DAY` 的交易记录
  - [x] SubTask 3.2: `deleteStalePending` 返回被删除的订单详情（订单 ID、用户 ID、基金代码、金额、份额、navDate、创建时间），供日志记录
  - [x] SubTask 3.3: 在独立结算任务（23:50）中，先尝试结算所有 pending 订单，再调用 `deleteStalePending(30)` 清除剩余的异常订单
  - [x] SubTask 3.4: 记录详细日志：每个被清除的订单的完整信息（订单 ID、用户 ID、基金代码、金额、份额、navDate、创建时间、删除时间）

- [x] Task 4: 验证周末买入的 navDate 顺延和结算时机
  - [x] SubTask 4.1: 确认 `transactionController.buy` 中 `nextBusinessDay` + `ensureBusinessDay` 对周六买入的处理结果为下周一
  - [x] SubTask 4.2: 确认 `settlePendingAsync` 在净值未发布时（`confirmedNav = 0`）保持 pending，不报错
  - [x] SubTask 4.3: 确认独立结算任务能处理周末买入产生的 pending 订单（navDate 为周一，周一 23:50 触发结算）

- [x] Task 5: 确认现有结算触发点不受影响
  - [x] SubTask 5.1: 确认 `holdingController.list` 中的 `settlePendingAsync` 仍正常工作
  - [x] SubTask 5.2: 确认 `dailyProfitService.backfillDailyProfit` 中的 `_settlePendingTransactions` 仍正常工作
  - [x] SubTask 5.3: 确认定投调度 `executeDuePlans` 中对定投 pending 订单的结算逻辑不受影响

- [x] Task 6: 修复并发重复结算风险（新增）
  - [x] SubTask 6.1: `Transaction.updateToConfirmed` 添加 `AND status = 'pending'` 乐观锁条件
  - [x] SubTask 6.2: `pendingSettleService.settlePendingOrders` 调整顺序：先 updateToConfirmed 获取锁，返回 false 则跳过持仓更新

# Task Dependencies
- Task 2 依赖 Task 1（需要独立的服务方法才能调用）
- Task 3 依赖 Task 2（清除逻辑在独立结算任务中执行，且需先结算再清除）
- Task 4 和 Task 5 可与 Task 1 并行（验证现有逻辑）
- Task 6 在 Task 1-3 完成后发现并发风险并修复
