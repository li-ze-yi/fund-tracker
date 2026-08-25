# 统计页顶部控件排版调整 Spec

## Why
当前统计页顶部控件分散且布局不统一：chart 模式下「柱状图/表格切换」和「周期选择器」各占一整行（block），date_table 模式下粒度选择器单独一行、金额/收益率切换藏在日历头部右侧、日期导航也在头部。控件分散导致视觉层次混乱、空间浪费，用户需要在不同位置寻找相关控件。

## What Changes
- **统一两种模式为两行布局**，第一行并排放置切换控件（不再使用 block 整行）：
  - chart 模式第一行：柱状图/表格切换 + 周期选择器（日/月/年），两个控件并排
  - date_table 模式第一行：柱状图/表格切换 + 粒度选择器（日/月/年）+ 金额/收益率切换，三个控件并排
  - date_table 模式第二行：日期切换（‹ 月份/年份标题 ›）居中显示
- **移除日历头部内的日期导航与金额/收益率切换**：三个粒度视图（day/month/year）头部原有的 ‹ 标题 › 导航和右侧切换控件全部移出，日期导航作为独立的第二行居中显示，金额/收益率切换提升到第一行
- **统一控件样式**：取消 `block` 属性，改用 `size="middle"` 或 `small"`，控件之间用 gap 间距并排居中
- **移动端响应式**：金额/收益率切换在移动端显示「¥」「%」图标，柱状图/表格切换显示简短文字或图标，粒度/周期选择器显示「日」「月」「年」单字

## Impact
- Affected specs: [fix-stats-monthly-rate-and-sync](file:///d:/fundtracker/.trae/specs/fix-stats-monthly-rate-and-sync/spec.md)（覆盖其切换按钮位置的 ADDED Requirement）
- Affected code: [web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx)（DateTableView 头部布局 + 顶部控件区域 + chart 模式周期选择器）

## ADDED Requirements

### Requirement: 顶部控件两行布局
系统 SHALL 将统计页顶部控件统一重组为两行布局，第一行并排放置切换控件（取消 block 整行），第二行居中放置日期导航（仅 date_table 模式）。

#### Scenario: chart 模式第一行布局
- **WHEN** 用户在 chart 模式查看统计页
- **THEN** 第一行并排显示两个 Segmented 控件：左侧为「柱状图 / 表格」模式切换，右侧为周期选择器（日 / 月 / 年）；两个控件整体居中，使用 gap 间距分隔

#### Scenario: date_table 模式第一行布局
- **WHEN** 用户在 date_table 模式查看统计页
- **THEN** 第一行并排显示三个 Segmented 控件：左侧为「柱状图 / 表格」模式切换，中间为粒度选择器（日 / 月 / 年），右侧为「金额 / 收益率」切换；三个控件整体居中

#### Scenario: date_table 模式第二行布局
- **WHEN** 用户在 date_table 模式查看统计页
- **THEN** 第二行居中显示日期切换控件（‹ 月份/年份标题 ›），与当前粒度视图对应（day 显示月份、month 显示年份、year 显示年份范围）

#### Scenario: chart 模式无第二行
- **WHEN** 用户在 chart 模式查看统计页
- **THEN** 不显示第二行日期导航（chart 模式为聚合图表，无需日期切换）

#### Scenario: 移动端图标化
- **WHEN** 用户在移动端查看统计页
- **THEN** 柱状图/表格切换显示 Ant Design 图标（BarChartOutlined / CalendarOutlined）；金额/收益率切换显示图标（DollarOutlined / PercentageOutlined）；粒度/周期选择器显示「日」「月」「年」单字；多个控件在移动端用 small size 紧凑显示，不换行

### Requirement: 第一行控件组合背景容器与视觉样式
系统 SHALL 为第一行控件提供组合背景容器，每个 Segmented 控件有独立背景与明显间隔，选中项使用强调色高亮。

#### Scenario: 组合背景容器
- **WHEN** 用户查看统计页第一行控件
- **THEN** 整个第一行被一个圆角 16px 的组合背景容器包裹，背景使用 `rgba(148, 163, 184, 0.18)`（浅色主题）或 `rgba(148, 163, 184, 0.1)`（深色主题），形成明显的视觉分组

#### Scenario: 组件间隔与独立背景
- **WHEN** 多个 Segmented 控件并排显示在组合容器内
- **THEN** 桌面端控件之间用 `justify-content: space-between` 实现左/中/右均匀分布，间隔 24px；移动端同样用 space-between 分布，间隔 6px；每个 Segmented 控件有自己的 `var(--bg-elevated)` 背景与 12px 圆角

#### Scenario: 桌面端控件尺寸与分布
- **WHEN** 用户在桌面端查看统计页
- **THEN** Segmented 控件使用 `size="large"`；三个控件靠左/居中/靠右分布（space-between）

#### Scenario: 移动端控件分布
- **WHEN** 用户在移动端查看统计页
- **THEN** 三个控件使用 space-between 靠左/居中/靠右分布（与桌面端一致），不居中堆叠

#### Scenario: 金额/收益率切换在两种模式都生效
- **WHEN** 用户在 chart 模式或 date_table 模式下点击金额/收益率切换
- **THEN** chart 模式下：选择"金额"显示收益金额柱状图 + 收益率折线（双 Y 轴），明细表格显示收益金额 + 累计收益列；选择"收益率"显示收益率柱状图（单 Y 轴百分比），明细表格只显示收益率列
- **AND** date_table 模式下：日历单元格在金额/收益率之间切换显示

#### Scenario: 表格模式月/年视图只显示单一指标
- **WHEN** 用户在 date_table 模式查看月视图（12 月网格）或年视图（多年年度网格）
- **THEN** 每个单元格只显示一个指标：选择"金额"时显示收益金额，选择"收益率"时显示收益率；不同时显示金额和收益率（移除副文本）
- **AND** Tooltip 中仍同时显示收益金额和收益率以便查看完整信息

#### Scenario: 移动端控件缩宽
- **WHEN** 用户在移动端查看统计页
- **THEN** Segmented 控件使用 `size="small"`，item padding 缩至 4px、min-width 32px（宽度最小化），但 min-height 保持 28px（高度不变），图标字号 14px，确保三个控件不换行

#### Scenario: 容器最大宽度限制
- **WHEN** 用户在宽屏桌面端查看统计页
- **THEN** 第一行控件容器有 `maxWidth: 680px` 限制并居中显示，避免控件间距在超宽屏下过大

#### Scenario: 日期表格最大宽度限制
- **WHEN** 用户在桌面端查看日期表格模式
- **THEN** 日期表格卡片有 `maxWidth: 720px` 限制并居中显示，避免在宽屏下表格过大

#### Scenario: 选中项强调色
- **WHEN** 某个 Segmented 选项被选中
- **THEN** 选中项使用 `var(--accent-gold)` 金色背景 + 白色文字 + `0 2px 6px rgba(212, 160, 23, 0.25)` 阴影高亮

#### Scenario: 图标居中
- **WHEN** Segmented 选项包含图标
- **THEN** 图标与文字在选项内水平垂直居中对齐（`display: inline-flex; align-items: center; justify-content: center`）

### Requirement: 日历头部移除日期导航与切换控件
系统 SHALL 移除三个粒度视图（day/month/year）日历头部内的日期导航（‹ 标题 ›）和金额/收益率切换控件。

#### Scenario: 日历头部精简
- **WHEN** 用户在 date_table 模式查看任意粒度视图
- **THEN** 日历原头部位置不再渲染任何控件，日期导航（‹ 标题 ›）提升到顶部第二行居中显示，金额/收益率切换提升到第一行；返回本月/今年按钮仍紧邻第二行标题

## MODIFIED Requirements

### Requirement: 金额/收益率切换按钮位置与响应式
金额/收益率切换控件 SHALL 放置在顶部第一行与柱状图/表格切换、粒度选择器并排显示（仅 date_table 模式），不再位于日历头部右侧。移动端显示「¥」「%」图标，桌面端显示「金额」「收益率」文字。

### Requirement: chart 模式周期选择器布局
chart 模式的周期选择器（日/月/年）SHALL 与柱状图/表格切换并排显示在第一行，不再单独占一整行（取消 block）。

## REMOVED Requirements
无删除项。
