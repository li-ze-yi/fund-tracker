# 修复月度收益率与统计联动 Spec

## Why
当前统计页面存在三个问题：
1. **月度收益率计算错误**：`/stats/monthly` 接口使用 `AVG(return_rate) * 10000 / 100` 计算月度收益率，但 `daily_profits.return_rate` 字段已是百分比形式（如 1.23 表示 1.23%），导致结果被放大 100 倍（显示为 123%）。同时简单平均日收益率不能真实反映月度收益，应基于月度总收益与平均投入计算。
2. **金额/收益率切换按钮位置不佳**：当前切换按钮与粒度选择器并排居中，视觉层次混乱；移动端文字标签占用空间过多。
3. **日期切换与顶部统计脱节**：date_table 模式下切换月份/年份时，顶部概览卡片仍显示全局聚合数据，未与当前日历视图联动。

## What Changes
- **修复月度收益率算法**：`/stats/monthly` 接口改用 `SUM(profit) / AVG(total_investment) * 100` 计算真实月度收益率，替代当前的 `AVG(return_rate) * 100`；同步修复 `/stats/yearly` 接口的收益率算法保持一致。
- **调整金额/收益率切换按钮位置**：将切换控件从粒度选择器旁移到日期表格卡片的右上角（绝对定位或 flex 右对齐）；移动端仅显示图标（¥ / %），桌面端显示「金额 / 收益率」文字。
- **顶部概览卡片与日历联动**：date_table 模式下，顶部 6 个概览指标基于当前日历视图的数据重新计算：
  - `day` 粒度：基于当前月份的日维度数据计算（总日收益、平均收益率、盈利概率、最大盈利/亏损、数据条数）
  - `month` 粒度：基于当前年份的月度数据计算
  - `year` 粒度：基于全部年度数据计算
  - 切换月份/年份时自动重新计算并更新概览卡片
  - `chart` 模式下保持现有行为不变（基于周期选择器的全局数据）

## Impact
- Affected specs: [beautify-stats-date-table-view](file:///d:/fundtracker/.trae/specs/beautify-stats-date-table-view/spec.md)（修正并扩展其引入的收益率计算与切换控件）
- Affected code:
  - 后端：[server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js)（monthly 与 yearly 方法收益率算法）
  - 前端：[web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx)（DateTableView 切换按钮位置、概览卡片联动计算）

## ADDED Requirements

### Requirement: 真实月度收益率计算
系统 SHALL 使用月度总收益与平均总投入计算月度收益率，而非简单平均日收益率。

#### Scenario: 月度收益率计算
- **WHEN** 后端计算某月收益率
- **THEN** 公式为 `月度收益率 = (SUM(profit) / AVG(total_investment)) * 100`，保留 2 位小数；若 `AVG(total_investment)` 为 0 或 NULL，返回 0

#### Scenario: 年度收益率计算
- **WHEN** 后端计算某年收益率
- **THEN** 公式为 `年度收益率 = (SUM(profit) / AVG(total_investment)) * 100`，保留 2 位小数；若 `AVG(total_investment)` 为 0 或 NULL，返回 0

### Requirement: 金额/收益率切换按钮位置与响应式
系统 SHALL 将金额/收益率切换控件放置在日期表格卡片的右上角，并在移动端使用图标替代文字。

#### Scenario: 桌面端显示
- **WHEN** 用户在桌面端查看日期表格
- **THEN** 金额/收益率切换控件显示在表格右上角，选项为「金额」和「收益率」文字标签

#### Scenario: 移动端显示
- **WHEN** 用户在移动端查看日期表格
- **THEN** 金额/收益率切换控件仅显示图标（¥ 代表金额，% 代表收益率），不显示文字，节省空间

### Requirement: 顶部概览卡片与日历视图联动
系统 SHALL 在 date_table 模式下，根据当前日历视图的数据重新计算顶部概览卡片的 6 个指标。

#### Scenario: day 粒度联动
- **WHEN** 用户在 date_table 模式选择「日」粒度并切换到某月
- **THEN** 顶部概览卡片基于该月的日维度数据计算：总收益（该月所有日收益之和）、平均收益率（该月日收益率的算术平均）、盈利概率（该月盈利天数占比）、最大单日盈利、最大单日亏损、数据条数（该月有数据的天数）

#### Scenario: month 粒度联动
- **WHEN** 用户切换到「月」粒度并查看某年
- **THEN** 顶部概览卡片基于该年的月度数据计算：总收益（该年所有月收益之和）、平均收益率（该年月度收益率的算术平均）、盈利概率（该年盈利月数占比）、最大单月盈利、最大单月亏损、数据条数（该年有数据的月数，单位「月」）

#### Scenario: year 粒度联动
- **WHEN** 用户切换到「年」粒度
- **THEN** 顶部概览卡片基于全部年度数据计算：总收益（所有年收益之和）、平均收益率（所有年度收益率的算术平均）、盈利概率（盈利年数占比）、最大单年盈利、最大单年亏损、数据条数（有数据的年数，单位「年」）

#### Scenario: chart 模式不受影响
- **WHEN** 用户在 chart 模式下切换周期（日/月/年）
- **THEN** 顶部概览卡片保持现有行为，基于 `/stats/daily`、`/stats/monthly`、`/stats/yearly` 接口返回的全局数据计算，不与日历视图联动

#### Scenario: 加载中状态
- **WHEN** 日历数据正在加载
- **THEN** 顶部概览卡片显示 Skeleton 加载状态，避免显示旧数据

## MODIFIED Requirements

### Requirement: 月度收益统计接口
`/stats/monthly` 接口返回的 `return_rate` 字段 SHALL 为真实月度收益率（基于月度总收益与平均总投入计算），而非简单平均日收益率乘以 100。

### Requirement: 年度收益统计接口
`/stats/yearly` 接口返回的 `return_rate` 字段 SHALL 为真实年度收益率（基于年度总收益与平均总投入计算），而非简单平均日收益率乘以 100。

## REMOVED Requirements
无删除项。
