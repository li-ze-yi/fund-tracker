# 统计页默认表格视图与基金收益明细 Spec

## Why
当前统计页面默认进入 `chart`（图表）模式，但用户更习惯先看日历表格（`date_table`）模式。同时日历以周一为起始列，用户希望改为周日起始（7123456 顺序）。此外，日历表格仅展示每日/每月/每年的聚合收益，无法查看该周期内每只基金的具体贡献，用户希望在日历下方点击某个日期/月份/年份后展示每只基金的收益或收益率明细。

## What Changes
- **默认视图改为表格**：`viewMode` 初始值从 `'chart'` 改为 `'date_table'`，用户进入统计页直接看到日历表格。
- **日历表头重排为周日起始**： weekday 列从 `['一','二','三','四','五','六','日']` 改为 `['日','一','二','三','四','五','六']`，同步调整 `firstDayOfWeek` 计算（`getDay()` 直接作为偏移量，不再 `+6` 取模）。
- **日历单元格可选中**：点击任意日/月/年单元格选中该周期（金色描边高亮），选中状态独立于"今天"高亮。原有的点击月/年单元格下钻导航（month→day、year→month）移除，用户通过顶部粒度选择器切换层级。
- **新增零收益灰色档**：日历单元格颜色编码从「盈利红/亏损绿/无数据中性灰」三态扩展为四态，新增「有记录但收益为零」的灰色档，与「完全无数据」的空单元格区分。
- **新增基金收益明细区域**：在日历表格下方（仅 `date_table` 模式）渲染基金明细列表，展示当前选中周期的每只基金收益/收益率，跟随 `showReturnRate`（金额/收益率）与 `hideAmount`（隐藏金额）开关。
- **新增后端接口 `/stats/fund-breakdown`**：从 `daily_profits.details` JSON 中聚合每只基金在指定周期的收益数据。

## Impact
- Affected specs:
  - [beautify-stats-date-table-view](file:///d:/fundtracker/.trae/specs/beautify-stats-date-table-view/spec.md)（修改默认视图模式、日历起始列、单元格点击行为）
  - [rearrange-stats-controls-layout](file:///d:/fundtracker/.trae/specs/rearrange-stats-controls-layout/spec.md)（不影响控件布局，但点击行为变更）
- Affected code:
  - 前端：[web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx)（默认 viewMode、日历表头重排、单元格选中交互、基金明细区域）、[web/src/services/statsService.ts](file:///d:/fundtracker/web/src/services/statsService.ts)（新增 `getFundBreakdown` 方法）
  - 后端：[server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js)（新增 `fundBreakdown` 方法）、[server/routes/stats.js](file:///d:/fundtracker/server/routes/stats.js)（新增路由）、[server/models/dailyProfit.js](file:///d:/fundtracker/server/models/dailyProfit.js)（新增按日期范围查询并解析 details 的方法）

## ADDED Requirements

### Requirement: 默认进入表格视图
系统 SHALL 将统计页面的默认视图模式设为 `date_table`（日历表格），用户首次进入统计页直接看到日历表格而非图表。

#### Scenario: 首次进入统计页
- **WHEN** 用户首次进入统计页面
- **THEN** 页面默认显示 `date_table` 模式（日历表格视图），概览卡片展示当月统计，日历展示当前月份

### Requirement: 日历表头周日起始
系统 SHALL 将日历网格的表头列从周一起始改为周日起始，顺序为：日、一、二、三、四、五、六。

#### Scenario: 日历列顺序
- **WHEN** 用户在 `date_table` 模式查看日视图
- **THEN** 日历网格 7 列的表头依次为「日 一 二 三 四 五 六」，每月 1 号对齐到正确的星期列（周日为第 0 列）

#### Scenario: 日期对齐计算
- **WHEN** 渲染某月日历
- **THEN** `firstDayOfWeek` 使用 `new Date(year, month - 1, 1).getDay()` 直接作为偏移量（周日=0），不再加 6 取模

### Requirement: 零收益单元格灰色档
系统 SHALL 为日历单元格新增「有记录但收益为零」的灰色档，与「完全无数据」的空单元格视觉区分。单元格颜色编码扩展为四态。

#### Scenario: 零收益单元格
- **WHEN** 某日/月/年有 `daily_profits` 记录但 `return_rate === 0`（或 `profit === 0`）
- **THEN** 单元格背景使用灰色 `rgba(148, 163, 184, 0.25)`（浅色主题）或 `rgba(148, 163, 184, 0.18)`（深色主题），文字使用 `var(--text-secondary)`；单元格内不显示收益数字（或显示 `0`）

#### Scenario: 完全无数据单元格
- **WHEN** 某日/月/年无任何 `daily_profits` 记录
- **THEN** 单元格背景使用 `var(--bg-card)`（中性透明），不显示收益数字（保持现有行为）

#### Scenario: 判断逻辑变更
- **WHEN** 渲染日历单元格
- **THEN** `hasRecord = !!dayData`（有记录），`hasData = hasRecord && return_rate !== 0`（有非零收益），`isZero = hasRecord && return_rate === 0`（零收益）；三态分别对应红/绿渐变、灰色、空背景

#### Scenario: 图例新增灰色档
- **WHEN** 用户查看日历底部图例
- **THEN** 图例在「亏损」与「无」之间新增「无收益」灰色色块，顺序为：亏损■■■■ → 无收益■ → 无■ → 盈利■■■■

### Requirement: 日历单元格选中交互
系统 SHALL 允许用户点击任意日/月/年单元格来选中该周期，选中单元格以金色描边高亮显示，并在下方基金明细区域展示该周期的基金收益。

#### Scenario: 日视图选中某日
- **WHEN** 用户在日视图点击某日单元格
- **THEN** 该单元格被选中（金色 `outline` 描边），基金明细区域加载并展示该日的每只基金收益；默认选中当天

#### Scenario: 月视图选中某月
- **WHEN** 用户在月视图点击某月单元格
- **THEN** 该月份格子被选中（金色描边），基金明细区域展示该月的每只基金聚合收益；默认选中当前月（若当前年有数据）或第一个有数据的月份
- **AND** 不再触发下钻到日视图（原点击导航行为移除）

#### Scenario: 年视图选中某年
- **WHEN** 用户在年视图点击某年单元格
- **THEN** 该年份格子被选中（金色描边），基金明细区域展示该年的每只基金聚合收益；默认选中当前年
- **AND** 不再触发下钻到月视图（原点击导航行为移除）

#### Scenario: 选中与今天高亮区分
- **WHEN** 选中单元格恰好是今天
- **THEN** 同时显示选中描边（`outline: 2px solid var(--accent-gold); outline-offset: 1px`）和今天内边框（`inset 0 0 0 2px var(--accent-gold)`），两者视觉叠加不冲突

#### Scenario: 粒度切换时重置选中
- **WHEN** 用户通过顶部粒度选择器切换粒度（日/月/年）
- **THEN** 选中状态重置为当前粒度的默认值（日→今天、月→当前月、年→当前年），基金明细区域加载对应默认周期的数据

### Requirement: 基金收益明细区域
系统 SHALL 在日历表格下方（仅 `date_table` 模式）渲染基金收益明细列表，展示当前选中周期内每只基金的收益金额或收益率。

#### Scenario: 明细区域位置与标题
- **WHEN** 用户在 `date_table` 模式查看任意粒度视图
- **THEN** 日历图例下方渲染一个卡片，标题为「基金收益明细」+ 选中周期标签（如「2026-08-06」「2026 年 8 月」「2026 年」）

#### Scenario: 展示收益金额（默认）
- **WHEN** `showReturnRate` 为 false（金额模式）
- **THEN** 每只基金显示：基金名称（主文字）+ 基金代码（副文字）+ 收益金额（带 +/- 前缀，红涨绿跌，受 `hideAmount` 影响）；列表按收益金额降序排列

#### Scenario: 展示收益率
- **WHEN** `showReturnRate` 为 true（收益率模式）
- **THEN** 每只基金显示：基金名称 + 基金代码 + 收益率百分比（带 +/- 前缀，红涨绿跌，不受 `hideAmount` 影响）；列表按收益率降序排列

#### Scenario: 无数据
- **WHEN** 选中周期无基金明细数据（`details` 为空或该周期无 `daily_profits` 记录）
- **THEN** 明细区域显示空状态文案「该周期暂无基金明细数据」

#### Scenario: 加载中
- **WHEN** 基金明细数据正在请求
- **THEN** 明细区域显示 `Skeleton` 骨架屏（3-5 行）

#### Scenario: 金额/收益率切换联动
- **WHEN** 用户切换顶部金额/收益率控件
- **THEN** 基金明细列表立即切换显示内容（金额↔收益率），无需重新请求后端数据

### Requirement: 基金明细数据接口
系统 SHALL 提供 `/stats/fund-breakdown` 接口，从 `daily_profits.details` JSON 中聚合指定周期的每只基金收益数据。

#### Scenario: 按单日查询
- **WHEN** 客户端请求 `/stats/fund-breakdown?date=2026-08-06`
- **THEN** 后端查询该用户 `date = 2026-08-06` 的 `daily_profits` 记录，解析 `details.funds` 数组，返回每只基金的 `{ fund_code, fund_name, profit, return_rate, market_value, total_cost }`，按 `profit` 降序排列

#### Scenario: 按月查询
- **WHEN** 客户端请求 `/stats/fund-breakdown?year=2026&month=8`
- **THEN** 后端查询该用户在 2026-08-01 至 2026-08-31 之间所有 `daily_profits` 记录，逐条解析 `details.funds`，按 `fund_code` 聚合：`profit` = SUM(daily_profit)，`return_rate` = profit / total_cost × 100（`total_cost` 取该基金最后一条记录的值），`market_value` 取最后一条记录的值；结果按 `profit` 降序排列

#### Scenario: 按年查询
- **WHEN** 客户端请求 `/stats/fund-breakdown?year=2026`
- **THEN** 后端查询该用户在 2026-01-01 至 2026-12-31 之间所有 `daily_profits` 记录，聚合逻辑同月查询，结果按 `profit` 降序排列

#### Scenario: 无数据
- **WHEN** 指定周期无 `daily_profits` 记录
- **THEN** 返回空数组 `[]`

#### Scenario: details 为空或格式异常
- **WHEN** 某条记录的 `details` 为 null 或 JSON 解析失败
- **THEN** 跳过该记录，不影响其他记录的聚合

## MODIFIED Requirements

### Requirement: 统计页面默认视图模式
统计页面 `viewMode` 初始值 SHALL 为 `'date_table'`（原为 `'chart'`）。用户仍可通过顶部「图表/表格」切换控件切回 `chart` 模式。

### Requirement: 日历网格列顺序与日期对齐
日历网格 SHALL 以周日为起始列（第 0 列），表头为「日 一 二 三 四 五 六」。`firstDayOfWeek` 计算改为 `new Date(year, month - 1, 1).getDay()`（周日=0，直接用作偏移量）。

### Requirement: 日历单元格点击行为
日/月/年单元格的点击行为 SHALL 变更为「选中该周期用于基金明细展示」，不再触发粒度下钻导航（month→day、year→month 的原有导航移除）。用户通过顶部粒度选择器手动切换日/月/年层级。

### Requirement: DateTableView 组件 Props
`DateTableViewProps` SHALL 新增以下字段以支持选中与基金明细：
- `selectedDay: string | null` — 日视图选中的日期（YYYY-MM-DD）
- `selectedMonth: number | null` — 月视图选中的月份（1-12）
- `selectedYear: number | null` — 年视图选中的年份
- `fundBreakdown: FundBreakdownItem[]` — 基金明细数据数组
- `fundBreakdownLoading: boolean` — 基金明细加载状态
- `onSelectDay: (date: string) => void` — 点击日单元格回调
- `onSelectMonth: (month: number) => void` — 点击月单元格回调
- `onSelectYear: (year: number) => void` — 点击年单元格回调

## REMOVED Requirements
无删除项。原有的点击月/年单元格下钻导航行为被替换为选中行为，不属于删除而是修改。
