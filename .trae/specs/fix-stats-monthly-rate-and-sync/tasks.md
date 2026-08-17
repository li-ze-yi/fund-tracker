# Tasks

- [x] Task 1: 修复后端 `/stats/monthly` 收益率算法
  - [x] SubTask 1.1: 修改 [server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js) 的 `monthly` 方法，SQL 查询中将 `AVG(return_rate) as avg_return_rate` 改为基于 `SUM(profit) / AVG(total_investment) * 100` 计算
  - [x] SubTask 1.2: 结果映射中 `return_rate` 直接使用 SQL 计算结果，保留 2 位小数，移除 `* 10000 / 100` 的错误放大
  - [x] SubTask 1.3: 处理 `AVG(total_investment)` 为 0 或 NULL 的边界情况（返回 0）

- [x] Task 2: 修复后端 `/stats/yearly` 收益率算法
  - [x] SubTask 2.1: 修改 [server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js) 的 `yearly` 方法，SQL 查询中将 `AVG(return_rate) as avg_return_rate` 改为基于 `SUM(profit) / AVG(total_investment) * 100` 计算
  - [x] SubTask 2.2: 结果映射中 `return_rate` 直接使用 SQL 计算结果，保留 2 位小数
  - [x] SubTask 2.3: 处理 `AVG(total_investment)` 为 0 或 NULL 的边界情况

- [x] Task 3: 调整金额/收益率切换按钮位置与响应式
  - [x] SubTask 3.1: 在 [web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx) 的 DateTableView 中，将金额/收益率 Segmented 从粒度选择器旁移除，改为放置在日历卡片右上角（与月份切换头部同一行，右对齐）
  - [x] SubTask 3.2: 桌面端 Segmented 选项显示文字「金额」「收益率」
  - [x] SubTask 3.3: 移动端 Segmented 选项仅显示图标「¥」「%」，通过 CSS @media 或 isMobile 条件渲染实现
  - [x] SubTask 3.4: 调整粒度选择器为单独一行居中显示

- [x] Task 4: 实现顶部概览卡片与日历视图联动
  - [x] SubTask 4.1: 在 StatsPage 中新增 `calendarSummary` state，存储日历视图的聚合数据
  - [x] SubTask 4.2: 新增 `calculateCalendarSummary(data, granularity)` 函数，根据粒度计算 6 个指标（总收益、平均收益率、盈利概率、最大盈利、最大亏损、数据条数）
  - [x] SubTask 4.3: 在日历数据加载的 useEffect 中，数据加载完成后调用 `calculateCalendarSummary` 更新 `calendarSummary`
  - [x] SubTask 4.4: date_table 模式下，概览卡片使用 `calendarSummary` 渲染；chart 模式下保持使用 `summary`（现有逻辑）
  - [x] SubTask 4.5: 日历数据加载中时，概览卡片显示 Skeleton 加载状态
  - [x] SubTask 4.6: label 文案根据粒度动态调整：「总日/月/年收益」、「最大单日/月/年盈利/亏损」、「数据条数」单位为「天/月/年」

# Task Dependencies
- Task 1、Task 2 可并行（独立的后端方法修改）
- Task 3、Task 4 可并行（前端独立改动）
- Task 4 依赖日历数据加载逻辑（已存在）
