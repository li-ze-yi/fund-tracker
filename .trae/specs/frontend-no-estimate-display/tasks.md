# Tasks

- [x] Task 1: 更新 4 个前端文件的 update_status 类型定义
  - `FundListItem.tsx` 第22行：类型新增 `'no_estimate'`
  - `WatchlistPage.tsx` 第21行：类型新增 `'no_estimate'`
  - `PortfolioPage.tsx` 第28行：类型新增 `'no_estimate'`
  - `FundDetailPage.tsx`：fund 为 useState<any>，无需类型定义
  - 验证：TypeScript 编译不报错

- [x] Task 2: FundListItem 新增 no_estimate 状态徽章
  - 在 `renderUpdateIndicator` 的 switch-case 中，`case 'confirmed'` 之前新增 `case 'no_estimate'`
  - 显示灰色圆点 + "前一日"文字
  - 样式：color '#6B7280'，背景 'rgba(107, 114, 128, 0.1)'
  - 验证：no_estimate 状态显示"前一日"徽章而非"已确认"

- [x] Task 3: FundListItem 持仓模式（holding）no_estimate 展示
  - 估算涨幅列（col-chg）：在 no_estimate 状态下，涨幅数字下方追加灰色小字 `(MM-DD)`
  - 日期来源：从 `fund.update_time` 或 `fund.last_updated` 提取月日，格式化为 `(MM-DD)`
  - 4 个数值列（持仓金额/涨幅/当日收益/累计收益）正常显示，不置灰
  - 验证：持仓模式 no_estimate 时涨幅下方显示 `(07-22)` 样式日期

- [x] Task 4: FundListItem 自选模式（watchlist）no_estimate 展示
  - 净值显示 `--`（opacity 0.4 置灰）
  - 涨幅保留前一日数据
  - 状态徽章为"前一日"（Task 2 已实现）
  - 验证：自选模式 no_estimate 时净值显示 '--'

- [x] Task 5: FundDetailPage no_estimate 展示
  - 净值区域显示 `--`
  - 涨幅标签改为"前一日涨幅"
  - 当日收益显示 `--`
  - 涨幅值下方追加带括号的前一日日期 `(MM-DD)`
  - 验证：详情页 no_estimate 时净值 '--'，标签"前一日涨幅"，日期 `(07-22)`

# Task Dependencies
- Task 2、3、4 依赖 Task 1（先更新类型定义）
- Task 5 独立（FundDetailPage 单独处理）
- Task 3、4 可并行（都是 FundListItem 内部，可一起实现）
