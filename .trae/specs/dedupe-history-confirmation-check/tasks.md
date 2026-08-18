# Tasks

- [x] Task 1: 确认 `holdingService` 返回字段包含 `isConfirmed`
  - [x] SubTask 1.1: 检查 `holdingService.enrichHoldingsWithRealTimeData` 返回结果中 `calculateHoldingMetrics` 是否设置了 `isConfirmed` 字段
  - [x] SubTask 1.2: 若未设置或字段名不一致，在 `calculateHoldingMetrics` 返回对象中补充 `isConfirmed` 字段（基于 `latestHistoryDate === today` 判断）

- [x] Task 2: 重写 `dailyProfitService.calculateAndSaveDailyProfit` 主流程
  - [x] SubTask 2.1: 移除 `await this.checkConfirmedFunds(holdingsWithRealTimeData, today)` 调用
  - [x] SubTask 2.2: 改为 `const confirmedFunds = holdingsWithRealTimeData.filter(h => h.isConfirmed)` 和 `const unconfirmedFunds = holdingsWithRealTimeData.filter(h => !h.isConfirmed)`
  - [x] SubTask 2.3: 对 `isConfirmed` 为 `undefined/null` 的基金打印警告日志并按未确认处理
  - [x] SubTask 2.4: 保持后续 `calculateFromConfirmedFundsOnly` 与保存逻辑不变

- [x] Task 3: 删除 `dailyProfitService.checkConfirmedFunds` 方法
  - [x] SubTask 3.1: 删除 `checkConfirmedFunds` 方法整体实现
  - [x] SubTask 3.2: 检查 `dailyProfitService` 中是否还有其他地方引用 `checkConfirmedFunds`，若有则一并清理
  - [x] SubTask 3.3: 检查 `dailyProfitService` 模块顶部对 `fundService.getHistoryNetValues` 的 import 是否仍被其他方法使用，若仅 `checkConfirmedFunds` 使用则一并移除

- [x] Task 4: 修改 `dailyProfitService.backfillDailyProfit` 兜底任务
  - [x] SubTask 4.1: 检查 `backfillDailyProfit` 当前实现是否调用 `checkConfirmedFunds` 或独立请求 1 天历史数据
  - [x] SubTask 4.2: 若是，改为调用 `holdingService.enrichHoldingsWithRealTimeData` 获取含 `isConfirmed` 的持仓列表后，传入 `calculateAndSaveDailyProfit`
  - [x] SubTask 4.3: 若 `backfillDailyProfit` 当前已是调用 `enrichHoldingsWithRealTimeData` 后传入 `calculateAndSaveDailyProfit`，则仅需验证 Task 2 的修改不影响兜底任务流程

- [x] Task 5: 验证 `planService` 不受影响
  - [x] SubTask 5.1: 确认 `planService` 中 `history_{code}_1d_{today}` 查询逻辑保持独立，不引用 `dailyProfitService.checkConfirmedFunds`
  - [x] SubTask 5.2: 确认 `planService` 在定投结算场景仍能独立查询当日确认净值

- [x] Task 6: 编译与运行时验证
  - [x] SubTask 6.1: 运行 `node --check` 语法检查（项目为纯 JS，无 TypeScript 编译），确认无新增编译错误
  - [x] SubTask 6.2: 启动服务成功（端口 3001），确认 require 链路无错误，`dailyProfitService` 模块加载正常
  - [x] SubTask 6.3: 代码层面验证日志格式 `已确认: X/Y` 和 `待确认: {codes} (不参与计算)` 保持不变（Grep 确认行 85、91、151）

# Task Dependencies
- Task 2 依赖 Task 1（需先确认 `isConfirmed` 字段存在）
- Task 3 可与 Task 2 并行（删除方法与重写主流程无依赖）
- Task 4 依赖 Task 2 和 Task 3（兜底任务依赖新的 `calculateAndSaveDailyProfit` 入口）
- Task 5 可与 Task 2/3/4 并行（独立验证 `planService`）
- Task 6 依赖 Task 1~5 全部完成
