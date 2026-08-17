# Tasks

- [x] Task 1: 在 `dailyProfitService.js` 中新增 `calculateAndSaveDailyProfitFromConfirmedNav(userId, holdings)` 方法
  - [x] SubTask 1.1: 调用 `fundService.batchGetHistoryNetValues(fundCodes, threeDaysAgo, today)` 批量拉取历史净值，不调用新浪实时接口
  - [x] SubTask 1.2: 对每只基金判定 `is_confirmed`（最新净值日期 === 今天），未确认基金跳过且不回退估值
  - [x] SubTask 1.3: 对已确认基金直算 `daily_profit = yesterdayShares * (todayNav - yesterdayNav)`，`market_value = shares * todayNav`；`yesterdayShares` 复用现有"今日交易份额"查询逻辑（买入减、卖出加）
  - [x] SubTask 1.4: 累加 `totalDailyProfit`/`totalMarketValue`/`totalCost`，构建 `details`，调用 `DailyProfit.upsert` 写入（沿用现有 `buildDetails` 结构，`data_source: 'actual'`）
  - [x] SubTask 1.5: 保留 `lastUpdateCache` 最小间隔保护与"全 0 跳过"判定（但全 0 判定基于本次直算结果，不再受 `market_closed` 置零影响）

- [x] Task 2: 改造 `backfillDailyProfit()` 调用新方法
  - [x] SubTask 2.1: 改造去重过滤：查 `daily_profits WHERE date = today` 后，读取每条记录的 `details.summary.confirmed_funds` 与 `total_funds`；`confirmed_funds >= total_funds` 的完整记录用户跳过，`confirmed_funds < total_funds` 的部分记录用户纳入待补算（覆盖写入补全后续确认的基金），无记录用户照常补算
  - [x] SubTask 2.2: 将 per-user 循环内的 `holdingService.enrichHoldingsWithRealTimeData(holdings, true)` 替换为 `Holding.findByUserId` + `calculateAndSaveDailyProfitFromConfirmedNav`
  - [x] SubTask 2.3: 交易日判断改为不依赖实时数据采样的方式（周末降级 + `holidayService` 节假日判定），避免触发新浪请求
  - [x] SubTask 2.4: 保留"先 `_settlePendingTransactions` 再算收益"的顺序，结算后重新 `Holding.findByUserId` 拿最新持仓

- [x] Task 3: 验证与回归
  - [x] SubTask 3.1: 节点语法检查 `node -c server/services/dailyProfitService.js`
  - [x] SubTask 3.2: 模块加载验证 `node -e "require('./server/services/dailyProfitService')"`
  - [x] SubTask 3.3: 人工核对 23:55 兜底任务日志不再出现新浪批量请求，仅出现历史净值请求

# Task Dependencies
- Task 2 依赖 Task 1（新方法存在后才能调用）
- Task 3 依赖 Task 1、Task 2 完成
