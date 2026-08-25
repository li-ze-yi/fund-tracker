# Tasks

- [x] Task 1: 提升 showReturnRate state 到 StatsPage 主组件
  - [x] SubTask 1.1: 将 showReturnRate state 从 DateTableView 内部提升到 StatsPage 主组件
  - [x] SubTask 1.2: 将 showReturnRate 和 setShowReturnRate 作为 prop 传入 DateTableView
  - [x] SubTask 1.3: 移除 DateTableView 内部的 showReturnRate useState，改用 props

- [x] Task 2: 移除日历头部日期导航与金额/收益率切换，提升到顶部
  - [x] SubTask 2.1: 在 DateTableView 的 day 粒度视图中，移除原头部（‹ 月份标题 › + 右侧金额/收益率切换）
  - [x] SubTask 2.2: 在 month 粒度视图中移除原头部（‹ 年份标题 › + 右侧切换）
  - [x] SubTask 2.3: 在 year 粒度视图中移除原头部（‹ 年份范围 › + 右侧切换）
  - [x] SubTask 2.4: 移除 DateTableView 内部原有的粒度选择器（已提升到第一行）
  - [x] SubTask 2.5: 在 DateTableView 顶部新增独立的日期导航行（第二行），居中显示 ‹ 当前粒度对应的标题 ›，含返回本月/今年按钮

- [x] Task 3: 构建第一行控件并排布局（统一两种模式）
  - [x] SubTask 3.1: 在 StatsPage 主组件顶部（概览卡片下方、内容区上方）构建第一行容器（flex, justify-content: center, gap: 8px, flex-wrap: wrap）
  - [x] SubTask 3.2: 第一行放置「柱状图/表格切换」Segmented（取消 block，size 调整为 middle 或 small）
  - [x] SubTask 3.3: chart 模式下：第一行并排显示柱状图/表格切换 + 周期选择器（日/月/年），取消周期选择器原有的 block 和单独行
  - [x] SubTask 3.4: date_table 模式下：第一行并排显示柱状图/表格切换 + 粒度选择器（日/月/年）+ 金额/收益率切换
  - [x] SubTask 3.5: 移除原有的视图模式切换 block 容器（stats-segmented-wrapper with block）和 chart 模式的周期选择器 block 容器

- [x] Task 4: 移动端响应式适配
  - [x] SubTask 4.1: 柱状图/表格切换移动端显示简短文字（如「图表」「表格」）或图标（📊 / 📅）
  - [x] SubTask 4.2: 金额/收益率切换移动端显示「¥」「%」（已有 amountRateOptions，保持）
  - [x] SubTask 4.3: 粒度/周期选择器移动端显示「日」「月」「年」单字
  - [x] SubTask 4.4: 移动端多个控件可换行（flex-wrap: wrap）或缩小 size 以适应窄屏

# Task Dependencies
- Task 1 → Task 3（顶部第一行需要 showReturnRate 在主组件中才能控制金额/收益率切换）
- Task 2、Task 3 可并行（独立布局改动）
- Task 4 依赖 Task 2、Task 3 完成
