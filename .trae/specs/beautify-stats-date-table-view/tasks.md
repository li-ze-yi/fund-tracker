# Tasks

- [x] Task 1: 创建新代码分支 `feature/stats-date-table-view`
  - [x] SubTask 1.1: 在 `main` 分支基础上创建并切换到新分支
  - [x] SubTask 1.2: 验证工作区干净，无未提交改动影响新分支

- [x] Task 2: 扩展后端 `/stats/daily` 接口支持按年月查询
  - [x] SubTask 2.1: 修改 [server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js) 的 `daily` 方法，解析 `req.query.year` 与 `req.query.month`；当两个参数同时存在时按月份范围查询，否则保持最近 30 天逻辑
  - [x] SubTask 2.2: 返回字段保持 `{ date, profit, return_rate }` 不变，向后兼容
  - [x] SubTask 2.3: 在 [server/routes/stats.js](file:///d:/fundtracker/server/routes/stats.js) 中确认路由已支持 query 透传（无需新增路由）

- [x] Task 3: 扩展前端 statsService 支持按月请求
  - [x] SubTask 3.1: 修改 [web/src/services/statsService.ts](file:///d:/fundtracker/web/src/services/statsService.ts) 的 `getDailyStats` 方法，接受可选参数 `{ year, month }` 并拼接 query string

- [x] Task 4: 美化统计概览卡片
  - [x] SubTask 4.1: 在 [web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx) 中将 6 个指标项改为对称网格（2 列移动端 / 3 列桌面端），每项独立子卡片背景 + 圆角
  - [x] SubTask 4.2: 升级卡片渐变背景与阴影，遵循设计系统 `--shadow-md` 与 `--accent-gold-dim` 变量
  - [x] SubTask 4.3: 数值统一使用 `--font-mono`、`letter-spacing: -0.02em`、`+/-` 前缀
  - [x] SubTask 4.4: 验证浅色/深色主题下视觉一致

- [x] Task 5: 新增"视图模式"切换控件
  - [x] SubTask 5.1: 在 StatsPage 顶部周期选择器上方新增 `Segmented` 视图模式控件，选项 `chart` / `date_table`
  - [x] SubTask 5.2: 新增 `viewMode` state，默认 `chart`
  - [x] SubTask 5.3: `date_table` 模式下隐藏周期选择器与明细表，仅渲染日历网格

- [x] Task 6: 实现日期表格（日历网格）视图组件
  - [x] SubTask 6.1: 新增内部组件 `DateTableView`（与 StatsPage 同文件，避免文件膨胀），接收 `data: { date, profit, return_rate }[]` 与 `hideAmount` props
  - [x] SubTask 6.2: 渲染月份切换头部（上一月 / 下一月 / 当前月份标题 / 返回本月按钮）
  - [x] SubTask 6.3: 渲染 7 列（周一~周日）× 5~6 行的网格，日期对齐到正确星期列，非本月日期留空白单元格
  - [x] SubTask 6.4: 单元格颜色按收益幅度分 4 档（<0.5%、0.5%-1%、1%-2%、>2%）使用 `--gain` / `--loss` 渐变透明度
  - [x] SubTask 6.5: 单元格悬停/点击显示 Ant Design `Tooltip` 或 `Popover`，内容含日期、收益金额（受 hideAmount 影响）、收益率
  - [x] SubTask 6.6: 移动端单元格最小 36px 宽，桌面端 44px；极窄屏幕支持横向滚动

- [x] Task 7: 接入日期表格数据加载逻辑
  - [x] SubTask 7.1: StatsPage 维护 `currentMonth` state（`{ year, month }`），默认当前月
  - [x] SubTask 7.2: 切换到 `date_table` 模式或切换月份时调用 `statsService.getDailyStats({ year, month })`
  - [x] SubTask 7.3: 加载中显示 `Skeleton`，无数据显示空状态文案"该月暂无收益数据"
  - [x] SubTask 7.4: 隐藏金额开关联动：`hideAmount` 传入 `DateTableView`，影响单元格数值与 tooltip 金额显示

- [x] Task 8: 响应式与主题适配验证
  - [x] SubTask 8.1: 移动端（≤768px）验证日历网格不溢出、单元格可点击、tooltip 不遮挡
  - [x] SubTask 8.2: 桌面端验证 3 列概览卡片与日历网格布局
  - [x] SubTask 8.3: 浅色/深色主题切换后颜色块对比度符合 WCAG AA

- [x] Task 9: 动态字号（根据数字位数自动调整）
  - [x] SubTask 9.1: 在 DateTableView 内新增 `getDynamicFontSize(value, baseSize, isMobile)` 函数，五档缩放（<100/<1k/<10k/<100k/>=100k）
  - [x] SubTask 9.2: 应用到日视图单元格收益数字（基础 11，桌面 +2）
  - [x] SubTask 9.3: 应用到月视图月份格子的收益金额（基础 13）与收益率（基础 10）
  - [x] SubTask 9.4: 应用到年视图年份格子的收益金额与收益率

- [x] Task 10: 金额/收益率切换功能
  - [x] SubTask 10.1: 在 DateTableView 内新增 `showReturnRate` state，默认 false
  - [x] SubTask 10.2: 在粒度切换旁新增「金额 / 收益率」Segmented 控件
  - [x] SubTask 10.3: 日视图单元格根据开关切换显示金额或收益率百分比
  - [x] SubTask 10.4: 月/年视图主副数字根据开关互换
  - [x] SubTask 10.5: Tooltip 始终显示完整信息，不受开关影响

- [x] Task 11: 移动端概览卡片美化
  - [x] SubTask 11.1: 移动端网格改为 3 列、gap 6px
  - [x] SubTask 11.2: 卡片 padding 减至 8px 6px 6px、min-height 58px、border-radius 8px
  - [x] SubTask 11.3: label 字号 9px、value 字号 clamp(11px, 3vw, 14px) 允许换行
  - [x] SubTask 11.4: 桌面端 fontSize 在移动端 Math.min(item.fontSize, 16)

- [x] Task 12: 粒度选择器改为 日/月/年 三档 + 年视图实现
  - [x] SubTask 12.1: `CalendarGranularity` 类型扩展为 `'day' | 'month' | 'year'`
  - [x] SubTask 12.2: DateTableViewProps 新增 `yearlyData` 字段
  - [x] SubTask 12.3: 新增 `yearlyMap` 与 `years` 范围（当前年 ±3，共 7 年）
  - [x] SubTask 12.4: 渲染年视图网格（3 列），含年份、收益金额（动态字号）、收益率
  - [x] SubTask 12.5: 年视图头部按 7 年步进翻页，当前年金色描边
  - [x] SubTask 12.6: 点击某年 → `onYearChange(y); onGranularityChange('month')` 跳到月视图
  - [x] SubTask 12.7: 点击某月 → `onGranularityChange('day')` 跳到日视图
  - [x] SubTask 12.8: StatsPage 新增 `calendarYearlyData` state 与 useEffect 加载分支
  - [x] SubTask 12.9: 后端 `/stats/monthly` 接口支持 `?year=YYYY` 参数
  - [x] SubTask 12.10: 前端 `statsService.getMonthlyStats` 支持可选 `{ year }` 参数

# Task Dependencies
- Task 2 → Task 3（前端 service 依赖后端接口扩展）
- Task 3 → Task 7（日期表格数据加载依赖 service 方法）
- Task 5 → Task 6（视图模式控件决定何时渲染日历网格）
- Task 6 → Task 7（日历组件需要数据加载逻辑）
- Task 4、Task 5 可与 Task 2 并行（前后端解耦）
- Task 8 依赖 Task 4~7 全部完成
