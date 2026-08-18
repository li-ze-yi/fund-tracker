# Tasks

- [x] Task 1: 数据库 schema 变更
  - [x] SubTask 1.1: 在 `doc/init_db.sql` 的 `holdings` 表定义中，`total_return` 列之后新增 `sold_date DATE DEFAULT NULL COMMENT '全部卖出日期'`
  - [x] SubTask 1.2: 新增 `doc/migrate_holdings_add_sold_date.sql` 迁移脚本

- [x] Task 2: 更新 Holding model
  - [x] SubTask 2.1: 在 `server/models/holding.js` 的 `findByUserId` SELECT 中新增 `h.sold_date, h.total_return` 字段
  - [x] SubTask 2.2: 在 `Holding.update` 的 `columnMap` 中新增 `soldDate: 'sold_date'` 和 `totalReturn: 'total_return'` 映射

- [x] Task 3: 修改卖出结算逻辑（3 处）保留持仓 + 累加实现盈亏
  - [x] SubTask 3.1: `server/controllers/transactionController.js` 的 `sell` 方法
  - [x] SubTask 3.2: `server/controllers/transactionController.js` 的 `settlePending` 方法卖出分支
  - [x] SubTask 3.3: `server/controllers/holdingController.js` 的 `settlePendingAsync` 方法卖出分支

- [x] Task 4: 修改买入逻辑清空 sold_date/total_return（3 处）
  - [x] SubTask 4.1: `server/controllers/transactionController.js` 的 `buy` 方法
  - [x] SubTask 4.2: `server/controllers/transactionController.js` 的 `settlePending` 买入分支
  - [x] SubTask 4.3: `server/controllers/holdingController.js` 的 `settlePendingAsync` 买入分支

- [x] Task 5: 修改 holdingController.create 允许重新添加已清仓基金
  - [x] SubTask 5.1: existing.shares==0 时不报错，改为更新现有持仓

- [x] Task 6: 持仓列表包含所有持仓（不过滤已清仓基金）
  - [x] SubTask 6.1: `server/controllers/holdingController.js` 的 `list` 方法不过滤

- [x] Task 7: holdingService.calculateHoldingMetrics 支持 sold_out 状态
  - [x] SubTask 7.1: shares==0 且 sold_date<today 时返回 sold_out；卖出当天走正常逻辑（使用本地时间格式化避免时区偏移）

- [x] Task 8: 前端 FundListItem 新增 sold_out 状态展示
  - [x] SubTask 8.1: sold_out case 灰色"已清仓"徽章
  - [x] SubTask 8.2: sold_out 状态下数值列正确展示

- [x] Task 9: 前端类型定义更新
  - [x] SubTask 9.1: PortfolioPage 和 FundListItem 的 update_status 类型包含 'sold_out'

- [x] Task 10: 验证修复效果
  - [x] SubTask 10.1: 执行迁移 SQL，重启后端
  - [x] SubTask 10.2: 全部卖出当天持仓列表显示该基金但不显示"已清仓"徽章（update_status=pending_confirm）
  - [x] SubTask 10.3: 修改 DB 将 sold_date 改为昨天 → 持仓列表显示该基金，update_status=sold_out
  - [x] SubTask 10.4: 通过 BuyModal 重新买入已清仓基金 → sold_date 清空，恢复正常持仓
  - [x] SubTask 10.5: 通过 AddHoldingModal 重新添加已清仓基金 → sold_date 清空，恢复正常持仓

# Task Dependencies
- Task 1 → Task 2（model 依赖列存在）
- Task 2 → Task 3/4/5/6/7（依赖 model 字段映射）
- Task 3/4/5 独立可并行
- Task 6 依赖 Task 2
- Task 7 依赖 Task 2
- Task 8/9 前端独立，可与后端并行
- Task 10 依赖 Task 1-9 全部完成
