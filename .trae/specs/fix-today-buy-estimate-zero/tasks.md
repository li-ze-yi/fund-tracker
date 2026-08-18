# Tasks

- [x] Task 1: 修复 holdingController.create 初始买入交易日期
  - [x] SubTask 1.1: 在 `server/controllers/holdingController.js` 的 `create` 方法中，将 `!totalReturn` 分支里的 `transactionDate: new Date().toISOString().slice(0, 10)` 改为 `transactionDate: confirmedNavDate || new Date().toISOString().slice(0, 10)`
  - [x] SubTask 1.2: 确认 `confirmedNavDate` 变量在该作用域内可用（由历史净值获取逻辑已赋值，可能为 null）
- [x] Task 2: 修复 imageImportController 图片导入交易日期
  - [x] SubTask 2.1: 在 `server/controllers/imageImportController.js` 创建交易记录处，将 `transactionDate: new Date().toISOString().slice(0, 10)` 改为 `transactionDate: confirmedNavDate || new Date().toISOString().slice(0, 10)`
  - [x] SubTask 2.2: 确认 `confirmedNavDate` 变量在该作用域内可用
- [x] Task 3: 修复 importExportController 数据导入交易日期
  - [x] SubTask 3.1: 在 `server/controllers/importExportController.js` 导入持仓创建交易处，将 `transactionDate: new Date().toISOString().slice(0, 10)` 改为 `transactionDate: (realTime?.updateTime?.split(' ')[0]) || new Date().toISOString().slice(0, 10)`
  - [x] SubTask 3.2: 确认 `realTime` 变量在该作用域内可用（由 `getRealTimeValue` 返回）
- [x] Task 4: 验证修复效果
  - [x] SubTask 4.1: 启动后端服务，盘中通过 AddHoldingModal 添加一只新基金，确认持仓列表中该基金 `daily_profit` 不为 0（按当日涨跌幅计算）
  - [x] SubTask 4.2: 确认 `todayTxShares.buy` 为 0（交易日期为昨日，不被今日交易查询命中）
  - [x] SubTask 4.3: 确认 `estimated_change`（涨跌幅）仍正常显示，未被本次改动影响

# Task Dependencies
- Task 4 依赖 Task 1/2/3 全部完成
- Task 1/2/3 之间无依赖，可并行修改
