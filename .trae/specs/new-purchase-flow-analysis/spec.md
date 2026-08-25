# 新购基金计算与显示逻辑分析 Spec

## Why

当用户通过不同方式新增基金持仓时，系统需要正确计算份额、成本、日收益和累计收益，并在前端正确展示。当前存在多种入口和流程，需要对完整的计算与显示链路进行梳理记录。

## 入口概览

新购基金有以下 4 种入口：

| 入口 | 接口 | 控制器方法 | 说明 |
|------|------|-----------|------|
| **添加持仓** | POST /api/holdings | [holdingController.create](file:///d:/fundtracker/server/controllers/holdingController.js#L224) | 用户输入持仓金额和累计收益，系统自动反算份额 |
| **新购基金** | POST /api/holdings/purchase | [holdingController.purchase](file:///d:/fundtracker/server/controllers/holdingController.js#L389) | 用户指定购买金额、日期和时间，系统按15:00分界确认净值日期 |
| **图片导入** | POST /api/holdings/import/image | `imageImportController` | 通过图片识别持仓信息并创建 |
| **数据导入** | POST /api/holdings/import | `importExportController` | 通过CSV/Excel导入持仓数据 |

## 核心计算逻辑

### 1. 添加持仓（create）- 手动输入

**输入**：持仓金额（当前市值）、累计收益（可选）、基金代码
**净值获取流程**：历史净值(30天) → 实时估值 → 失败返回400
**计算**：
```
份额 = 持仓金额 / 最新净值
投入成本 = 持仓金额 - 累计收益
成本单价 = 投入成本 / 份额
```
**交易记录**：当 `totalReturn = 0`（即累计收益未填写）时，生成一笔 `status='confirmed'` 的买入交易，`transactionDate` 使用 `confirmedNavDate || 今天`

### 2. 新购基金（purchase）- 指定购买日期

**输入**：购买金额、购买日期、是否15:00后、申购费率、基金代码
**核心流程**：
1. 计算 NAV 日期（[computeNavDate](file:///d:/fundtracker/server/controllers/holdingController.js#L216)）：15:00 分界 + 跳过节假日
   - `after3pm=false` → `holidayService.ensureTradingDay(purchaseDate)`（当日，顺延至交易日）
   - `after3pm=true` → `holidayService.nextTradingDay(purchaseDate)`（下一交易日）
2. 按 NAV 日期查询确认净值
3. 分支处理：
   - **confirmed 流程**（有确认净值）：新建/替换占位/加仓，交易状态 = `confirmed`
   - **pending 流程**（无确认净值且 NAV 日期 >= 今天）：创建占位持仓 + pending 交易
   - **异常**（NAV 日期 < 今天但无确认净值）：400 错误

**confirmed 流程计算**：
```
实际投资额 = 购买金额 - 买入费率
份额 = 实际投资额 / 确认净值
含费成本均价 = 购买金额 / 份额
```
交易记录 `transactionDate = navDate`，`status = 'confirmed'`

**pending 流程**：
- 占位持仓：`shares=0, costPrice=0, confirmedNav=null`
- pending 交易：`shares=0, price=0, status='pending'`
- 后续由 `settlePendingAsync` 自动结算

### 3. 自动结算（settlePendingAsync）

被 [holdingController.list](file:///d:/fundtracker/server/controllers/holdingController.js#L18) 和定时任务（23:50）调用，处理 `status='pending'` 的买入交易：
1. 按交易 `transaction_date` 查询确认净值
2. 有确认净值 → 计算实际份额 → 新建/替换占位持仓/加仓 → 更新交易为 confirmed
3. 无确认净值 → 跳过（等待下次）

## 持仓指标计算（calculateHoldingMetrics）

定义在 [holdingService.js - calculateHoldingMetrics](file:///d:/fundtracker/server/services/holdingService.js#L388)

### 份额计算
```
yesterdayShares = max(0, shares - todayTxShares.buy + todayTxShares.sell)
```
- `todayTxShares` 查询当日（按北京时间）所有 `status='confirmed'` 的交易并按 fund_code + type 聚合
- **关键**：如果初始买入交易的 `transactionDate` 等于今天，则 `todayTxShares.buy > 0`，导致 `yesterdayShares = 0`

### 净值优先级（displayNav）— 2026-08-11 修复后

```
1. 确认净值（今日/昨日）> 0 → 使用确认净值，持仓金额稳定
2. 盘中估算（hour >= 9 && estValue > 0 && estChange != null）→ 退而求其次
3. 实时接口净值（realTimeData.netValue）→ 最后回退
```

**修复说明**：取消 `isConfirmed` 作为第一分支的判断条件，改为直接用 `confirmedNav > 0`。盘中（今日净值未公布）时，`confirmedNav` 为昨日净值，持仓金额/累计收益全天稳定，不随估算值波动。

### 日收益计算（dailyGain）优先级
```
1. 已确认 + API除权涨幅 → yesterdayShares * confirmedNav * gainPercent / (100 + gainPercent)
2. 已确认 + 净值差 → yesterdayShares * (confirmedNav - yesterdayNav)
3. 已确认 + 无涨幅 → dailyGain = 0
4. 估算涨跌幅 → yesterdayMarketValue * estChange / (100 + estChange)
5. 回退API涨幅 → yesterdayMarketValue * gainPercent / (100 + gainPercent)
```

### 累计收益计算
```
cumulativeReturn = marketValue - totalCost
if (todayTxShares.buy > 0) {
  cumulativeReturn -= todayTxShares.buy * (displayNav - costPrice)
}
```
今日买入的部分在累计收益中扣除（避免将今日买入份额的浮盈计入累计收益）。

### 更新状态（update_status）判定

| 状态 | 条件 | 说明 |
|------|------|------|
| `pre_market` | hour < 9 | 盘前，所有收益清零 |
| `confirmed` | isConfirmed | 今日确认净值已公布 |
| `estimating` | 盘中 + 有估算数据 | 盘中实时估算 |
| `pending_confirm` | 盘后 + 有估算数据 | 收盘后等待正式净值 |
| `no_estimate` | 无估算数据 | 回退显示前一日数据 |
| `market_closed` | 非交易日 | 休市状态 |
| `sold_out` | shares=0 && sold_date < today | 已清仓 |
| `pending_purchase` | 有pending交易 && confirmed_nav=null | 待入库 |

## 前端显示逻辑

### FundListItem 组件

定义在 [FundListItem.tsx](file:///d:/fundtracker/web/src/components/FundListItem.tsx)

**占位持仓（pending_purchase）显示**：
- 涨幅：`--`（灰色）
- 市值：按估算净值计算（`shares * estValue`），但 `shares=0` 所以市值也为 0
- 日收益：`--`（灰色）
- 累计收益：正常显示（`marketValue - totalCost`，但市值=0 所以为负值，显示实际投入成本）
- 状态标签：紫色「待入库」

**新建持仓（confirmed 流程）显示**：
- 如果 `transactionDate = today`，则 `todayTxShares.buy > 0`，`yesterdayShares = 0`，日收益为 0
- 如果 `transactionDate = yesterday`（已修复），则 `todayTxShares.buy = 0`，`yesterdayShares = shares`，日收益正常计算

**状态标签**：
- 盘前：蓝色「待开市」
- 休市：灰色「休市(周X)」
- 估算中：红色「估算中」（脉冲动画）
- 待确认：橙色「待确认」
- 估算失败：灰色「前一日」
- 已确认：浅金色「已确认」
- 已清仓：灰色「已清仓」
- 待入库：紫色「待入库」

## 8 种场景综合分析

约定：今天 = 2026-08-11（周二，盘中），假设昨日 08-10 为正常交易日。

### navDate 计算

| # | 购买日期 | 时间 | navDate | 说明 |
|---|---------|------|---------|------|
| 1 | 昨天(08-10) | 15点前 | 08-10 | 当日确认，净值已有 |
| 2 | 昨天(08-10) | 15点后 | 08-11 | 下一交易日，今日净值未出→pending |
| 3 | 今天(08-11) | 15点前 | 08-11 | 当日确认，净值未出→pending |
| 4 | 今天(08-11) | 15点后 | 08-12 | 下一交易日，净值未出→pending |

### 盘中（今日净值未公布）场景

| # | 流程 | 持仓金额 | 估算涨幅 | 当日收益 | 状态 | 合理？ |
|---|------|---------|---------|---------|------|--------|
| 1 | confirmed (08-10净值已有) | `shares × nav_0810` 稳定 | estChange 变化 | 估算值变化 | 估算中 | ✅ |
| 2 | pending (08-11净值未出) | ¥0 | -- | -- | 待入库 | ✅ |
| 3 | pending (同场景2) | ¥0 | -- | -- | 待入库 | ✅ |
| 4 | pending (08-12是明天) | ¥0 | -- | -- | 待入库 | ✅ |

**场景1详解**：昨天15点前买入，navDate=08-10，已有确认净值→直接创建持仓
- `transactionDate=08-10`，`confirmedNav=nav_0810`
- `isConfirmed=false`（今日净值未出），`confirmedNav=nav_0810 > 0`
- `displayNav=confirmedNav=nav_0810` → **持仓金额稳定** ✅
- `yesterdayShares=shares`（交易日期=08-10≠今天）→ **日收益正常计算** ✅

### 盘后（今日确认净值已出）场景

| # | 流程 | 持仓金额 | 估算涨幅 | 当日收益 | 状态 | 合理？ |
|---|------|---------|---------|---------|------|--------|
| 1 | confirmed→异步更新为今日净值 | `shares × nav_0811` 稳定 | gainPercent 确认值 | `shares × (nav_0811 - nav_0810)` | 已确认 | ✅ |
| 2 | pending→settle自动结算 | `shares × nav_0811` 稳定 | gainPercent 确认值 | ¥0 (今日买入无收益) | 已确认 | ✅ |
| 3 | pending→settle自动结算 | 同上 | 同上 | ¥0 | 已确认 | ✅ |
| 4 | 仍pending (08-12明天) | ¥0 | -- | -- | 待入库 | ✅ |

**场景1详解**：昨天15点前买入，`transactionDate=08-10`
- 盘后历史净值更新→`latestHistoryDate=08-11=today`→`isConfirmed=true`
- `confirmedNav` 异步更新为 `nav_0811`
- `displayNav=nav_0811` → 持仓金额更新 ✅
- `yesterdayShares=shares`（08-10≠08-11）→ 日收益 = `shares × (nav_0811 - nav_0810)` ✅

**场景2/3详解**：盘中创建的pending订单，盘后由 `settlePendingAsync` 自动结算
- 查到 08-11 确认净值→计算份额→更新持仓和交易状态
- `transactionDate=08-11=today` → `todayTxShares.buy=shares`
- `yesterdayShares = shares - shares = 0` → **日收益=0** ✅（今日按收盘净值买入，无当日收益）

**场景4详解**：navDate=08-12（明天），即使盘后也无法获取明天净值
- 仍为 pending，`navDate(08-12) > today(08-11)` 不触发 400 错误
- 占位持仓 + pending 交易保留，等待明天净值公布后结算 ✅

## 持仓金额稳定性修复记录

### 问题描述
持仓界面中，持仓金额和累计收益在盘中估算时一直随刷新变化，此前它们是不变的。

### 根因分析（commit 8783d3b）
在 [calculateHoldingMetrics](file:///d:/fundtracker/server/services/holdingService.js#L463) 的 `displayNav` 选择逻辑中，增加了 `isConfirmed` 判断：
```
旧代码：confirmedNav > 0 → 使用确认净值（稳定）
新代码：isConfirmed && confirmedNav > 0 → 使用确认净值（稳定），否则→estValue（估算净值，波动）
```
导致盘中（今日净值未公布，`isConfirmed=false`）时，`displayNav` 使用实时估算净值，持仓金额和累计收益随之波动。

### 修复方案（2026-08-11）
将 `displayNav` 优先级恢复为 `confirmedNav > 0` 优先，不再判断 `isConfirmed`：
```
旧：isConfirmed && confirmedNav > 0 → estValue → confirmedNav → realTimeData.netValue
新：confirmedNav > 0 → estValue → realTimeData.netValue
```
- `displayNav` 以 `confirmedNav > 0` 为第一优先级，盘中 `confirmedNav` 为昨日净值→持仓金额/累计收益稳定
- `isConfirmed` 仍用于 `gainPercent` 和 `update_status` 判定→涨幅和日收益在盘中正常显示估算值，盘后切换为确认值
- 今日确认净值公布后，异步更新逻辑将 `confirmedNav` 替换为今日净值→持仓金额自动更新

### 影响范围
- 仅影响 `displayNav` 和 `marketValue` 的计算
- 新购基金各流程（pending_purchase、confirmed）均不受负面影响
- `yesterdayShares`、`dailyGain`、`gainPercent`、`update_status` 计算逻辑未改动

## 影响

- 自动结算流程：[server/services/holdingService.js](file:///d:/fundtracker/server/services/holdingService.js) — `settlePendingAsync`
- 持仓指标计算：[server/services/holdingService.js](file:///d:/fundtracker/server/services/holdingService.js) — `calculateHoldingMetrics`
- 批量数据获取：[server/services/holdingService.js](file:///d:/fundtracker/server/services/holdingService.js) — `enrichHoldingsWithRealTimeData`
- 添加持仓：[server/controllers/holdingController.js](file:///d:/fundtracker/server/controllers/holdingController.js) — `create`
- 新购基金：[server/controllers/holdingController.js](file:///d:/fundtracker/server/controllers/holdingController.js) — `purchase`
- 前端列表项：[web/src/components/FundListItem.tsx](file:///d:/fundtracker/web/src/components/FundListItem.tsx)