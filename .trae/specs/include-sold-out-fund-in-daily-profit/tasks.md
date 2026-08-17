# Tasks

- [x] Task 0: 创建新代码分支
  - [x] SubTask 0.1: 从当前主干（main/master）创建新分支 `feat/include-sold-out-fund-in-daily-profit`
  - [x] SubTask 0.2: 切换到该分支后所有后续改动均在此分支上进行

- [x] Task 1: 兜底任务增加 pending 订单结算前置步骤
  - [x] SubTask 1.1: 在 `server/services/dailyProfitService.js` 的 `backfillDailyProfit` 中，为每个待补算用户在 `Holding.findByUserId` 之前，先调用结算逻辑处理 pending 交易订单
  - [x] SubTask 1.2: 结算逻辑复用方式：将 `holdingController.settlePendingAsync` 的核心结算流程抽离为可复用函数（或在 dailyProfitService 中引入 transactionController 的结算方法），或直接在 backfillDailyProfit 中内联调用 `Transaction.findPendingByUserId` + 逐笔结算（获取确认净值 → 更新持仓 → 更新交易状态）
  - [x] SubTask 1.3: 结算完成后再执行原有的 `Holding.findByUserId` + `enrichHoldingsWithRealTimeData` + `calculateAndSaveDailyProfit` 流程

- [x] Task 2: 修改 calculateHoldingMetrics 的 market_closed 分支前置条件
  - [x] SubTask 2.1: 在 `server/services/holdingService.js` 的 `calculateHoldingMetrics` 中，复用已有的 `fmtDate` 逻辑计算 `soldDateStr`（本地日期）和 `todayStr`
  - [x] SubTask 2.2: 在 `market_closed` 早返回（约 line 472）前增加例外判断：当 `shares === 0 && holding.sold_date && soldDateStr === todayStr && isConfirmed && confirmedNav > 0` 时，跳过早返回，继续走后续已确认收益计算逻辑
  - [x] SubTask 2.3: 确认后续计算逻辑正确处理 shares=0：
    - `yesterdayShares = max(0, 0 - 0 + todayTxShares.sell) = todayTxShares.sell`
    - `dailyGain` 走 isConfirmed 分支（line 432）计算非0值
    - `marketValue = 0`，`update_status = 'confirmed'`，`is_confirmed = true`

- [x] Task 3: 验证补算结果
  - [x] SubTask 3.1: 构造"盘中全部卖出"场景（pending 卖出订单，持仓 shares 未变）
  - [x] SubTask 3.2: 触发 `backfillDailyProfit`，验证先结算 pending 订单（shares=0, sold_date=今天），再计算日收益
  - [x] SubTask 3.3: 验证 `daily_profits` 表当天记录的 `profit` 包含已清仓基金收益（非0）
  - [x] SubTask 3.4: 验证 `details.funds` 包含已清仓基金，`daily_profit` 非0
  - [x] SubTask 3.5: 验证卖出第二天（sold_date < today）返回 `sold_out`，不参与统计
  - [x] SubTask 3.6: 验证正常持仓（shares>0）的日收益统计不受影响

# Task Dependencies
- Task 0 必须最先完成（所有后续任务在新分支上进行）
- Task 1 和 Task 2 独立可并行（在 Task 0 完成后）
- Task 3 依赖 Task 1 + Task 2 完成
