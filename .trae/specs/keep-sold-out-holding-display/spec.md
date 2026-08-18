# 基金全部卖出后保留持仓展示 Spec

## Why
当前用户把某只基金全部卖出后，卖出结算时（`transactionController.sell` / `settlePending` / `holdingController.settlePendingAsync`）会执行 `Holding.delete` 物理删除持仓记录，导致用户在持仓列表中再也看不到这只基金及其最终盈亏。用户希望全部卖出后仍保留该基金信息，**卖出当天基金仍显示在持仓列表但不显示"已清仓"状态，第二天起才以"已清仓"状态展示**，累计收益保留为已实现盈亏。

## 设计原则
- 全部卖出时不删除持仓记录，改为 `shares=0` + `sold_date=今天` + `total_return=已实现盈亏`
- 卖出当天（`sold_date == today`）基金仍在持仓列表显示，但不显示"已清仓"状态徽章（走正常持仓逻辑）
- 第二天起（`sold_date < today`）以"已清仓"状态展示：份额/持仓金额/当日收益为 0，累计收益 = `total_return`，状态徽章为灰色"已清仓"
- 重新买入已清仓基金时清空 `sold_date` 和 `total_return`，恢复正常持仓

## What Changes
- `init_db.sql`：`holdings` 表新增 `sold_date DATE DEFAULT NULL COMMENT '全部卖出日期'`（`total_return` 列已存在，复用）
- 新增迁移 SQL：`doc/migrate_holdings_add_sold_date.sql`
- `server/models/holding.js`：
  - `findByUserId` 的 SELECT 新增 `h.sold_date, h.total_return`
  - `update` 的 `columnMap` 新增 `soldDate → sold_date`、`totalReturn → total_return`
- `server/controllers/transactionController.js` 的 `sell`（立即结算）：全部卖出时不再 `Holding.delete`，改为 `Holding.update` 设 `shares=0, totalCost=0, totalReturn=累计已实现盈亏, soldDate=today`；部分卖出时 `totalReturn` 累加本次实现盈亏
- `server/controllers/transactionController.js` 的 `settlePending`（卖出结算）：同上
- `server/controllers/holdingController.js` 的 `settlePendingAsync`（卖出结算）：同上
- `server/controllers/transactionController.js` 的 `buy` / `settlePending`（买入结算）/ `holdingController.settlePendingAsync`（买入结算）：买入更新持仓时无条件追加 `soldDate=NULL, totalReturn=0`（对正常持仓无害，因正常持仓 `sold_date` 本就为 NULL、`total_return` 本就为 0；对已清仓基金起到清空恢复作用）
- `server/controllers/holdingController.js` 的 `create`：当 `existing.shares == 0`（已清仓）时允许重新添加，更新现有持仓而非报错"该基金已在持仓中"
- `server/controllers/holdingController.js` 的 `list`：不过滤已清仓基金（持仓列表包含所有持仓），卖出当天是否显示"已清仓"由 `calculateHoldingMetrics` 按 `sold_date` 判断
- `server/services/holdingService.js` 的 `calculateHoldingMetrics`：`shares==0 且 sold_date < today` 时返回 `update_status='sold_out'`（`market_value=0, daily_profit=0, accumulated_profit=total_return, estimated_change=null, is_confirmed=false`）；卖出当天（`sold_date == today`）走正常持仓计算逻辑。日期比较使用本地时间格式化（`getFullYear/getMonth/getDate`），避免 mysql2 DATE→Date 对象的 UTC 时区偏移
- `web/src/components/FundListItem.tsx`：新增 `sold_out` 状态徽章（灰色圆点 + "已清仓"），`isSoldOut` 时估算涨幅显示 `--`、当日收益显示 dim 颜色 `¥0.00`、持仓金额显示 `¥0.00`、累计收益保留 `accumulated_profit`（正绿负红）
- `web/src/pages/portfolio/PortfolioPage.tsx`：`FundHolding.update_status` 类型新增 `'sold_out'`

## Impact
- Affected code:
  - `doc/init_db.sql`、新增 `doc/migrate_holdings_add_sold_date.sql`
  - `server/models/holding.js`
  - `server/controllers/transactionController.js` — `sell`、`buy`、`settlePending`
  - `server/controllers/holdingController.js` — `create`、`list`、`settlePendingAsync`
  - `server/services/holdingService.js` — `calculateHoldingMetrics`
  - `web/src/components/FundListItem.tsx`、`web/src/pages/portfolio/PortfolioPage.tsx`
- Affected specs: `fix-today-buy-estimate-zero`（重新买入已清仓基金时清空 sold_date，与买入交易日期逻辑协同）、`frontend-no-estimate-display`（新增 sold_out 状态，与 no_estimate 状态并列）
- **BREAKING**: `holdings` 表 schema 变更（新增 `sold_date` 列），需执行迁移脚本（`doc/migrate_holdings_add_sold_date.sql`，已在生产库执行完毕）

---

## ADDED Requirements

### Requirement: 全部卖出保留持仓记录
当用户全部卖出某基金时，系统 SHALL 保留持仓记录（不物理删除），将 `shares` 设为 0、`total_cost` 设为 0、`sold_date` 设为卖出结算日（本地日期 YYYY-MM-DD）、`total_return` 设为累计已实现盈亏。

#### Scenario: 立即结算全部卖出
- **WHEN** 用户通过 SellModal 全部卖出，且当日确认净值已公布（立即结算）
- **THEN** 持仓记录的 `shares` 更新为 0
- **AND** `total_cost` 更新为 0
- **AND** `sold_date` 设为今天（YYYY-MM-DD）
- **AND** `total_return` 设为本次卖出实现盈亏（`actualAmount - oldTotalCost`）
- **AND** 不执行 `Holding.delete`
- **AND** 创建状态为 `confirmed` 的卖出交易记录

#### Scenario: 挂单结算全部卖出
- **WHEN** 用户全部卖出但当日确认净值未公布（pending 订单）
- **AND** 之后净值确认触发 `settlePending` 结算
- **THEN** 持仓记录的 `shares` 更新为 0
- **AND** `sold_date` 设为结算执行日（今天）
- **AND** `total_return` 设为本次卖出实现盈亏
- **AND** 不执行 `Holding.delete`

### Requirement: 部分卖出累加已实现盈亏
部分卖出时系统 SHALL 将本次实现盈亏（`actualAmount - costPerShare * sellShares`）累加到持仓的 `total_return` 字段，为最终全部卖出时的累计盈亏做准备。

#### Scenario: 部分卖出
- **WHEN** 用户卖出部分份额（卖出后 shares > 0）
- **THEN** `total_return` 累加本次实现盈亏（`actualAmount - costPerShare * sellShares`）
- **AND** `shares` 和 `total_cost` 按现有逻辑减少
- **AND** `sold_date` 保持 NULL

### Requirement: 卖出当天不显示已清仓状态
持仓列表接口（`GET /api/holdings`）SHALL 包含所有持仓记录（不过滤已清仓基金）。`holdingService.calculateHoldingMetrics` SHALL 在 `shares == 0 且 sold_date == 今天`时走正常持仓计算逻辑（不返回 `sold_out` 状态），仅在 `shares == 0 且 sold_date < 今天`时返回 `sold_out` 状态。

#### Scenario: 卖出当天查询持仓
- **WHEN** 用户在卖出结算当天请求持仓列表
- **AND** 存在 `shares=0, sold_date=今天` 的已清仓持仓
- **THEN** 响应中包含该持仓
- **AND** 该持仓的 `update_status` 为正常状态（estimating/pending_confirm/market_closed 等），不为 `sold_out`
- **AND** 该持仓不显示"已清仓"徽章

#### Scenario: 卖出第二天查询持仓
- **WHEN** 用户在卖出结算后的第二天请求持仓列表
- **AND** 存在 `shares=0, sold_date=昨天` 的已清仓持仓
- **THEN** 响应中包含该已清仓持仓
- **AND** 该持仓的 `update_status` 为 `sold_out`

### Requirement: 已清仓持仓指标计算
`holdingService.calculateHoldingMetrics` SHALL 在 `shares == 0 且 sold_date < 今天`时返回 `sold_out` 状态，不再请求实时数据参与计算。卖出当天（`sold_date == 今天`）走正常计算逻辑。

#### Scenario: 已清仓持仓指标（次日及以后）
- **WHEN** 持仓 `shares == 0` 且 `sold_date < 今天`
- **THEN** `update_status` 为 `sold_out`
- **AND** `market_value` 为 0
- **AND** `daily_profit` 为 0
- **AND** `accumulated_profit` 为 `holding.total_return`（已实现盈亏）
- **AND** `estimated_change` 为 null
- **AND** `net_value` 为 null
- **AND** `is_confirmed` 为 false（不参与日收益统计）
- **AND** `data_source` 为 `actual`

### Requirement: 重新买入已清仓基金
用户重新买入已清仓基金（`existing.shares == 0`）时，系统 SHALL 清空 `sold_date` 和 `total_return`，恢复正常持仓状态。

#### Scenario: 通过 BuyModal 重新买入已清仓基金
- **WHEN** 用户通过 BuyModal 买入一只 `shares == 0` 的已清仓基金
- **THEN** `sold_date` 设为 NULL
- **AND** `total_return` 设为 0
- **AND** `shares` 增加为新买入份额
- **AND** `cost_price` 和 `total_cost` 按加仓逻辑更新

#### Scenario: 通过 AddHoldingModal 重新添加已清仓基金
- **WHEN** 用户通过 AddHoldingModal 添加一只 `existing.shares == 0` 的已清仓基金
- **THEN** 不报错"该基金已在持仓中"
- **AND** 更新现有持仓记录（`shares`、`cost_price`、`total_cost`、`confirmed_nav`、`confirmed_nav_date`）
- **AND** `sold_date` 设为 NULL
- **AND** `total_return` 设为 0

### Requirement: 已清仓状态徽章前端展示
FundListItem SHALL 在 `update_status === 'sold_out'` 时显示灰色"已清仓"徽章，数值列（持仓金额/估算涨幅/当日收益/累计收益）显示对应值（0/null/0/total_return）。

#### Scenario: 持仓列表展示已清仓基金
- **WHEN** 持仓列表中某基金 `update_status` 为 `sold_out`
- **THEN** 显示灰色圆点 + "已清仓"文字徽章
- **AND** 持仓金额显示 `¥0.00`
- **AND** 估算涨幅显示 `--`
- **AND** 当日收益显示 `¥0.00`
- **AND** 累计收益显示 `total_return` 值（正绿负红）
- **AND** 净值显示 `--`

### Requirement: 存量数据迁移
系统 SHALL 提供一次性迁移脚本，为 `holdings` 表新增 `sold_date` 列。

#### Scenario: 执行迁移脚本
- **WHEN** 管理员执行 `doc/migrate_holdings_add_sold_date.sql`
- **THEN** `holdings` 表新增 `sold_date DATE DEFAULT NULL COMMENT '全部卖出日期'` 列
- **AND** 现有持仓记录的 `sold_date` 为 NULL（均为活跃持仓）

---

## MODIFIED Requirements

### Requirement: holdings 表 schema
`init_db.sql` 中 `holdings` 表 SHALL 新增 `sold_date DATE DEFAULT NULL COMMENT '全部卖出日期'` 列，位于 `total_return` 之后。`total_return` 列复用为累计已实现盈亏存储。

### Requirement: Holding.findByUserId 查询字段
`Holding.findByUserId` 的 SELECT SHALL 包含 `h.sold_date` 和 `h.total_return` 字段。

### Requirement: Holding.update 列映射
`Holding.update` 的 `columnMap` SHALL 支持 `soldDate → sold_date` 和 `totalReturn → total_return` 映射。

### Requirement: update_status 类型定义
前端 `FundListItem` 和 `PortfolioPage` 的 `update_status` 类型 SHALL 包含 `'sold_out'`：
```typescript
update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market' | 'no_estimate' | 'sold_out';
```

---

## REMOVED Requirements

### Requirement: 全部卖出时物理删除持仓
**Reason**: 用户要求保留已清仓基金信息用于展示最终盈亏
**Migration**: 全部卖出时改为 `shares=0 + sold_date + total_return`，不再调用 `Holding.delete`（手动删除接口 `holdingController.delete` 保留，用户可主动彻底删除）
