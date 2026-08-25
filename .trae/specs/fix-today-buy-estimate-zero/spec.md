# 修复新买入基金估算收益为0 Spec

## Why
用户通过"添加持仓"（AddHoldingModal）、图片导入、数据导入三种方式新增基金持仓时，系统会创建一笔 `status='confirmed'` 且 `transaction_date=今天` 的买入交易记录。`holdingService.calculateHoldingMetrics` 在计算日收益时执行 `yesterdayShares = shares - todayBuyShares + todaySellShares`，由于这笔"今天确认"的交易被计入 `todayBuyShares`，导致 `yesterdayShares = 0`，进而所有日收益分支（已确认净值差/估算涨跌幅/回退涨幅）都因 `yesterdayShares` 或 `yesterdayMarketValue` 为 0 而得出 `daily_profit = 0`。

根因在于：添加持仓时用"最新已确认净值"（盘中为昨日收盘净值）计算份额，却把交易日期硬编码为今天。这导致份额按昨日净值计价却被当作"今日买入"排除在日收益之外，用户看到的当日估算收益恒为 0。

## What Changes
- `holdingController.js` 的 `create`：将初始化买入交易的 `transactionDate` 由 `new Date().toISOString().slice(0, 10)`（今天）改为 `confirmedNavDate || today`，与 BuyModal 流程（用 `navDate` 作交易日期）保持一致
- `imageImportController.js` 的图片导入单条持仓创建：同样将 `transactionDate` 改为 `confirmedNavDate || today`
- `importExportController.js` 的导入持仓创建：将 `transactionDate` 改为 `realTime.updateTime?.split(' ')[0] || today`（取实时数据日期部分）

## Impact
- Affected code:
  - `server/controllers/holdingController.js` — `create` 方法第 274 行附近
  - `server/controllers/imageImportController.js` — 单条持仓导入第 336 行附近
  - `server/controllers/importExportController.js` — 导入持仓第 71 行附近
- Affected specs: `fix-holdings-no-data`（持仓估值链路，本次只改交易日期，不影响估值计算本身）、`analyze-valuation-pipeline`
- 不涉及数据库 schema 变更，不涉及前端改动

---

## ADDED Requirements

### Requirement: 初始化买入交易日期对齐净值日期
通过"添加持仓/图片导入/数据导入"创建持仓时生成的初始买入交易，SHALL 使用计算份额时所采用的净值日期作为 `transaction_date`，而非固定使用今天。盘中（今日确认净值未公布）该日期为上一交易日，盘后（今日确认净值已公布）为今天。

#### Scenario: 盘中通过添加持仓新增基金
- **WHEN** 用户在交易时段（9:00-15:00）通过 AddHoldingModal 添加一只新基金
- **AND** 系统获取到的最新确认净值为昨日收盘净值（confirmedNavDate = 昨日）
- **THEN** 创建的初始买入交易 `transaction_date` 为昨日
- **AND** `transaction_status` 为 `confirmed`
- **AND** 后续查询持仓时 `todayTxShares.buy` 为 0（交易日期不等于今天）
- **AND** `yesterdayShares` 等于全部份额
- **AND** `daily_profit` 按当日涨跌幅正常计算，不再恒为 0

#### Scenario: 盘后通过添加持仓新增基金
- **WHEN** 用户在收盘后（今日确认净值已公布）通过 AddHoldingModal 添加一只新基金
- **AND** 系统获取到的最新确认净值为今日收盘净值（confirmedNavDate = 今天）
- **THEN** 创建的初始买入交易 `transaction_date` 为今天
- **AND** `yesterdayShares` 为 0
- **AND** `daily_profit` 为 0（按今日收盘净值买入，今日无收益，符合预期）

#### Scenario: 历史净值获取失败回退实时估值
- **WHEN** 添加持仓时历史净值接口失败
- **AND** 回退到实时估值获取净值（confirmedNavDate 为 null）
- **THEN** 初始买入交易 `transaction_date` 回退为今天
- **AND** 不阻塞持仓创建流程

### Requirement: 图片导入持仓交易日期对齐
图片导入创建持仓时生成的初始买入交易，SHALL 使用 `confirmedNavDate` 作为 `transaction_date`，回退今天。

#### Scenario: 图片导入新基金
- **WHEN** 用户通过图片导入添加一只新基金持仓
- **AND** 系统获取到的最新确认净值为 confirmedNavDate
- **THEN** 创建的初始买入交易 `transaction_date` 为 confirmedNavDate
- **AND** 盘中导入时 `daily_profit` 按当日涨跌幅正常计算

### Requirement: 数据导入持仓交易日期对齐
数据导入创建持仓时生成的初始买入交易，SHALL 使用实时数据的日期部分（`realTime.updateTime` 的日期前缀）作为 `transaction_date`，回退今天。

#### Scenario: 数据导入新基金
- **WHEN** 用户通过数据导入添加一只新基金持仓
- **AND** `getRealTimeValue` 返回的 `updateTime` 为 "2026-08-02"（昨日确认净值）
- **THEN** 创建的初始买入交易 `transaction_date` 为 "2026-08-02"
- **AND** `daily_profit` 按当日涨跌幅正常计算

#### Scenario: 数据导入实时估值含时间戳
- **WHEN** 数据导入时 `getRealTimeValue` 返回的 `updateTime` 为 "2026-08-03 14:30"（盘中实时估值）
- **THEN** 创建的初始买入交易 `transaction_date` 为 "2026-08-03"（取日期部分）

---

## MODIFIED Requirements

### Requirement: holdingController.create 初始交易记录
`holdingController.create` 在 `!totalReturn` 分支创建初始买入交易时，SHALL 使用 `confirmedNavDate || new Date().toISOString().slice(0, 10)` 作为 `transactionDate`，而非硬编码今天。

### Requirement: imageImportController 初始交易记录
`imageImportController` 创建持仓时的初始买入交易，SHALL 使用 `confirmedNavDate || new Date().toISOString().slice(0, 10)` 作为 `transactionDate`。

### Requirement: importExportController 导入交易记录
`importExportController` 导入持仓时的初始买入交易，SHALL 使用 `realTime.updateTime?.split(' ')[0] || new Date().toISOString().slice(0, 10)` 作为 `transactionDate`。

---

## REMOVED Requirements
无
