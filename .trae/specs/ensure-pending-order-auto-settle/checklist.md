# Checklist

- [x] 新增的独立结算服务方法已实现，不依赖日收益记录状态
- [x] 新增 `findAllPendingUsers`（或同等查询）到 transaction model，能查询所有有 pending 订单的用户
- [x] `server/app.js` 新增 23:50 cron 任务，调用独立结算方法扫描所有用户的 pending 订单
- [x] 独立结算任务对"当天已记录日收益"的用户也能结算其 pending 订单（核心修复点）
- [x] 独立结算任务的日志包含：扫描用户数、pending 订单数、成功结算数、跳过数
- [x] 周六买入（after3pm=false）的 navDate 为下周一
- [x] 周六买入（after3pm=true）的 navDate 为下周一
- [x] pending 订单在 navDate 确认净值未发布时保持 pending，不报错
- [x] pending 订单在 navDate 确认净值发布后被成功结算（买入：计算份额；卖出：计算金额、扣减份额、记录盈亏）
- [x] `holdingController.list` 中的 `settlePendingAsync` 仍正常工作
- [x] `dailyProfitService.backfillDailyProfit` 中的 `_settlePendingTransactions` 仍正常工作
- [x] 定投调度 `executeDuePlans` 中对定投 pending 订单的结算逻辑不受影响
- [x] 独立结算任务与日收益兜底任务（23:55）时间错开，避免并发问题

# 清除长时间未结算订单验证

- [x] `transaction.js` model 新增 `deleteStalePending(30)` 方法，物理删除超过 30 天的 pending 订单
- [x] `deleteStalePending` 返回被删除的订单详情（用于日志记录）
- [x] 独立结算任务（23:50）执行顺序：先结算 → 后清除（避免误删可结算的订单）
- [x] 被清除的订单记录详细日志：订单 ID、用户 ID、基金代码、金额、份额、navDate、创建时间、删除时间
- [x] 未超过 30 天的 pending 订单不被清除，仅尝试结算
- [x] 超过 30 天但 navDate 净值已发布的 pending 订单会被先结算（不会被清除）

# 日收益影响验证

- [x] 确认 `holdingService.js:400` 的 `yesterdayShares` 计算正确排除当天 confirmed 买入份额
- [x] 确认 `holdingService.js:209-213` 的 `todayTxSharesMap` 只查询 `status = 'confirmed'` 的交易
- [x] 验证当天买入 pending → 23:50 结算 → 23:55 计算日收益，结果与未结算时相同（当天买入份额不参与日收益）
- [x] 验证周六买入 → 周一结算 → 周一日收益计算不包含周一买入份额
- [x] 确认 `dailyGain` 基于 `yesterdayShares` 而非当前份额计算（[holdingService.js:440](file:///d:/fundtracker/server/services/holdingService.js#L440)）

# 并发安全验证

- [x] `Transaction.updateToConfirmed` 包含 `AND status = 'pending'` 乐观锁条件
- [x] `pendingSettleService.settlePendingOrders` 先调用 updateToConfirmed 获取锁，返回 false 则跳过持仓更新
