# Tasks

- [x] Task 1: 新增后端 `/stats/fund-breakdown` 接口
  - [x]SubTask 1.1: 在 [server/models/dailyProfit.js](file:///d:/fundtracker/server/models/dailyProfit.js) 新增 `findDetailsByDateRange(userId, startDate, endDate)` 方法，返回 `[{ date, details }]`（details 为已解析 JSON 或 null）
  - [x]SubTask 1.2: 在 [server/controllers/statsController.js](file:///d:/fundtracker/server/controllers/statsController.js) 新增 `fundBreakdown` 方法，解析 `req.query` 的 `date` / `year+month` / `year` 参数，调用 model 查询，聚合 `details.funds` 按 `fund_code` 汇总 `profit`（SUM daily_profit）、`return_rate`（profit / total_cost × 100）、`market_value`/`total_cost`/`fund_name`（取最后一条记录），按 `profit` 降序返回
  - [x]SubTask 1.3: 在 [server/routes/stats.js](file:///d:/fundtracker/server/routes/stats.js) 新增 `router.get('/fund-breakdown', ctrl.fundBreakdown)`
  - [x]SubTask 1.4: 处理 details 为 null 或 JSON 解析失败的降级（跳过该记录，不中断聚合）

- [x]Task 2: 前端 statsService 新增 `getFundBreakdown` 方法
  - [x]SubTask 2.1: 在 [web/src/services/statsService.ts](file:///d:/fundtracker/web/src/services/statsService.ts) 新增 `getFundBreakdown(params: { date?: string; year?: number; month?: number })`，根据参数拼接 query string 调用 `/stats/fund-breakdown`

- [x]Task 3: 修改默认视图模式与日历表头重排
  - [x]SubTask 3.1: 在 [web/src/pages/stats/StatsPage.tsx](file:///d:/fundtracker/web/src/pages/stats/StatsPage.tsx) 将 `viewMode` 初始值从 `'chart'` 改为 `'date_table'`
  - [x]SubTask 3.2: 将 `weekDays` 数组从 `['一','二','三','四','五','六','日']` 改为 `['日','一','二','三','四','五','六']`
  - [x]SubTask 3.3: 将 `firstDayOfWeek` 计算从 `(new Date(year, month - 1, 1).getDay() + 6) % 7` 改为 `new Date(year, month - 1, 1).getDay()`

- [x]Task 3.5: 新增零收益灰色档
  - [x]SubTask 3.5.1: 在 DateTableView 的 `getCellBg` 函数中新增零收益灰色返回值：`rgba(148, 163, 184, 0.25)`（浅色主题）/ `rgba(148, 163, 184, 0.18)`（深色主题）
  - [x]SubTask 3.5.2: 修改日视图单元格判断逻辑：`hasRecord = !!dayData`，`hasData = hasRecord && dayData.return_rate !== 0`，`isZero = hasRecord && dayData.return_rate === 0`；零收益时使用灰色背景 + `var(--text-secondary)` 文字
  - [x]SubTask 3.5.3: 对月视图和年视图单元格应用相同的零收益灰色逻辑
  - [x]SubTask 3.5.4: 更新图例区域，在「亏损」色块组与「无」色块之间新增「无收益」灰色色块

- [x]Task 4: 实现日历单元格选中交互
  - [x]SubTask 4.1: 在 StatsPage 新增 `selectedDay`（string | null）、`selectedMonth`（number | null）、`selectedYear`（number | null）state
  - [x]SubTask 4.2: 在 StatsPage 新增 `fundBreakdown`（any[]）和 `fundBreakdownLoading`（boolean）state
  - [x]SubTask 4.3: 粒度切换时（`handleGranularityChange`）重置选中：日→今天日期字符串、月→当前月数字、年→当前年数字
  - [x]SubTask 4.4: 进入 date_table 模式时初始化选中默认值（日→今天、月→当前月、年→当前年）
  - [x]SubTask 4.5: 新增 `handleSelectDay`、`handleSelectMonth`、`handleSelectYear` 回调，更新对应 state
  - [x]SubTask 4.6: 在 DateTableView Props 新增 `selectedDay`、`selectedMonth`、`selectedYear`、`fundBreakdown`、`fundBreakdownLoading`、`onSelectDay`、`onSelectMonth`、`onSelectYear`
  - [x]SubTask 4.7: 日视图单元格：有数据的单元格添加 `onClick={() => onSelectDay(dateStr)}`，选中时添加 `outline: 2px solid var(--accent-gold); outline-offset: 1px` 样式（与 today 的 inset boxShadow 叠加）
  - [x]SubTask 4.8: 月视图单元格：将原有 `onClick` 下钻导航替换为 `onClick={() => onSelectMonth(m)}`，选中时添加金色描边
  - [x]SubTask 4.9: 年视图单元格：将原有 `onClick` 下钻导航替换为 `onClick={() => onSelectYear(y)}`，选中时添加金色描边

- [x]Task 5: 新增 useEffect 加载基金明细数据
  - [x]SubTask 5.1: 新增 useEffect，依赖 `viewMode`、`calendarGranularity`、`selectedDay`、`selectedMonth`、`selectedYear`；仅当 `viewMode === 'date_table'` 时触发
  - [x]SubTask 5.2: 根据粒度构造 params（日→`{ date: selectedDay }`、月→`{ year: currentYear, month: selectedMonth }`、年→`{ year: selectedYear }`），调用 `statsService.getFundBreakdown(params)`
  - [x]SubTask 5.3: 成功时 `setFundBreakdown(data)`，失败时 `setFundBreakdown([])`，loading 状态用 `setFundBreakdownLoading` 控制

- [x]Task 6: 渲染基金收益明细区域
  - [x]SubTask 6.1: 在 DateTableView 的图例下方新增基金明细卡片，标题为「基金收益明细」+ 选中周期标签（日视图显示 selectedDay、月视图显示「{currentYear} 年 {selectedMonth} 月」、年视图显示「{selectedYear} 年」）
  - [x]SubTask 6.2: 加载中显示 Skeleton（3-5 行），无数据显示「该周期暂无基金明细数据」空状态
  - [x]SubTask 6.3: 有数据时渲染列表，每行：基金名称（主）+ 基金代码（副）+ 收益金额或收益率（根据 `showReturnRate` 切换）
  - [x]SubTask 6.4: 收益金额受 `hideAmount` 影响（隐藏时显示 `****`），收益率不受影响；红涨绿跌配色
  - [x]SubTask 6.5: 列表按收益金额（金额模式）或收益率（收益率模式）降序排列（前端排序，不重新请求后端）
  - [x]SubTask 6.6: 添加明细区域样式（与日历卡片视觉一致，移动端响应式适配）

- [x]Task 7: 验证与回归测试
  - [x]SubTask 7.1: 验证默认进入 date_table 模式，日历以周日起始，1 号对齐正确
  - [x]SubTask 7.2: 验证点击日/月/年单元格选中并加载基金明细，选中描边与今天高亮不冲突
  - [x]SubTask 7.3: 验证金额/收益率切换联动明细列表，hideAmount 生效
  - [x]SubTask 7.4: 验证粒度切换重置选中为默认值
  - [x]SubTask 7.5: 验证切回 chart 模式后行为无回归（图表 + 明细表正常）
  - [x]SubTask 7.6: 移动端验证明细列表布局不溢出

# Task Dependencies
- Task 1 → Task 2（前端 service 依赖后端接口）
- Task 2 → Task 5（数据加载依赖 service 方法）
- Task 3、Task 3.5 可独立并行（纯 UI 修改）
- Task 4 → Task 5（选中 state 触发明细加载）
- Task 5 → Task 6（明细区域渲染依赖数据 state）
- Task 7 依赖 Task 1-6 全部完成
