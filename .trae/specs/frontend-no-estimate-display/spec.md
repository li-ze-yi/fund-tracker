# 估算失败时前端展示简化 Spec

## Why
后端重构后新增了 `no_estimate` 状态（估算失败时显示前一天的确认净值和涨幅），但前端 4 个文件均未处理该状态：FundListItem 走 default 分支错误显示"已确认"，FundDetailPage 标签文字不准确，类型定义缺少 `no_estimate`。用户要求失败时只显示前一天的涨幅和日期，不显示净值，且要有清晰的视觉区分。

## What Changes
- 前端 4 个文件的 `update_status` 类型定义新增 `'no_estimate'`
- FundListItem 新增 `no_estimate` 状态徽章（灰色，显示"前一日"）
- **持仓首页（FundListItem holding 模式）**：估算涨幅列下方追加带括号的前一日日期，4 个数值列（持仓金额/涨幅/当日收益/累计收益）正常显示前一日数据，不置灰
- **自选页（FundListItem watchlist 模式）**：净值显示 `--`，涨幅保留，状态徽章为"前一日"
- **详情页（FundDetailPage）**：净值与当日收益显示 `--`，涨幅标签改为"前一日涨幅"，涨幅值下方追加带括号的前一日日期
- WatchlistPage 和 PortfolioPage 的类型定义同步更新

## Impact
- Affected code: `web/src/components/FundListItem.tsx`、`web/src/pages/fund/FundDetailPage.tsx`、`web/src/pages/watchlist/WatchlistPage.tsx`、`web/src/pages/portfolio/PortfolioPage.tsx`
- Affected specs: `analyze-valuation-pipeline`（后端已新增 no_estimate 状态，本 spec 完成前端对接）

---

## ADDED Requirements

### Requirement: no_estimate 状态徽章
FundListItem SHALL 在 `update_status === 'no_estimate'` 时显示灰色"前一日"徽章，与"已确认"/"估算中"等状态视觉区分。

#### Scenario: 估算失败时显示状态徽章
- **WHEN** 基金的 update_status 为 'no_estimate'
- **THEN** 显示灰色圆点 + "前一日"文字
- **AND** 颜色为灰色（#6B7280），背景为浅灰（rgba(107, 114, 128, 0.1)）

### Requirement: 持仓首页估算失败展示
持仓首页（FundListItem holding 模式）SHALL 在 `no_estimate` 状态下：
- 状态徽章为灰色"前一日"
- 4 个数值列（持仓金额/估算涨幅/当日收益/累计收益）正常显示前一日数据，不置灰
- **估算涨幅列下方追加带括号的前一日日期**（如 `(07-22)`），格式为 `(MM-DD)`

#### Scenario: 持仓列表项估算失败
- **WHEN** 持仓基金的 update_status 为 'no_estimate'
- **THEN** 估算涨幅列显示前一天的 estimated_change
- **AND** 涨幅数字下方追加灰色小字 `(MM-DD)`（从 update_time 提取月日）
- **AND** 持仓金额、当日收益、累计收益列正常显示
- **AND** 状态徽章为灰色"前一日"

### Requirement: 自选页估算失败展示
自选页（FundListItem watchlist 模式）SHALL 在 `no_estimate` 状态下：
- 净值显示 `--`
- 涨幅保留前一日数据
- 状态徽章为"前一日"

#### Scenario: 自选列表项估算失败
- **WHEN** 自选基金的 update_status 为 'no_estimate'
- **THEN** 净值显示 '--'
- **AND** 涨幅显示前一天的 estimated_change
- **AND** 状态徽章为灰色"前一日"

### Requirement: 详情页估算失败展示
FundDetailPage SHALL 在 `no_estimate` 状态下：
- 净值区域显示 `--`
- 涨幅标签改为"前一日涨幅"
- 涨幅值正常显示前一天的 estimated_change
- 当日收益正常显示（用前一日涨幅计算出的收益）
- 涨幅值下方追加带括号的前一日日期 `(MM-DD)`

#### Scenario: 详情页估算失败
- **WHEN** 基金的 update_status 为 'no_estimate'
- **THEN** 净值区域显示 '--'
- **AND** 涨幅标签为"前一日涨幅"
- **AND** 涨幅值显示前一天的 estimated_change
- **AND** 当日收益正常显示（基于前一日涨幅计算）
- **AND** 涨幅值下方追加灰色小字 `(MM-DD)`

---

## MODIFIED Requirements

### Requirement: update_status 类型定义
4 个前端文件的 `update_status` 类型 SHALL 包含 `'no_estimate'`：
```typescript
update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market' | 'no_estimate';
```

### Requirement: FundListItem 状态徽章 switch-case
FundListItem 的 `renderUpdateIndicator` SHALL 新增 `case 'no_estimate'` 分支，在 `case 'confirmed'` 之前处理，避免走 default。

---

## REMOVED Requirements

### Requirement: 估算失败时显示净值
**Reason**: 用户要求失败时只显示涨幅和日期，不显示净值
**Migration**: 持仓首页数值列正常显示（本就无净值列）；自选页净值显示 '--'；详情页净值显示 '--'
