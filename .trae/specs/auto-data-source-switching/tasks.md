# Tasks

- [x] Task 1: 后端 fundService.js 实现 auto 模式回退逻辑（单基金接口）
  - 修改 `getRealTimeValueWithMethod(fundCode, method)`
  - 当 `method === 'auto'` 时：先尝试新浪（sina），返回 null 则尝试持仓穿透（holdings）
  - 保持 `method === 'sina'` 和 `method === 'holdings'` 的现有行为不变（不回退）
  - 验证：`getRealTimeValueWithMethod('019633', 'auto')` 返回 etf_linkage 估值（因开发环境新浪可用，但若新浪对019633无估值则回退持仓穿透→ETF联接）

- [x] Task 2: 后端 fundService.js 实现 auto 模式回退逻辑（批量接口）
  - 修改 `batchGetRealTimeValuesWithMethod(fundCodes, method)`
  - 当 `method === 'auto'` 时：先批量调用新浪，对新浪返回 null 的基金逐个调用持仓穿透法
  - 验证：批量请求含 019633 时，019633 的 estimationMethod 为 etf_linkage

- [x] Task 3: 后端 settingController.js 校验白名单新增 'auto'
  - `updateValuationMethod` 的 `validMethods` 改为 `['auto', 'sina', 'holdings']`
  - `setFundOverride` 的 `validMethods` 改为 `['auto', 'sina', 'holdings', '']`
  - 验证：POST `/settings/valuation-method` body `{method:'auto'}` 返回 200

- [x] Task 4: 前端 settingService.ts 类型定义新增 'auto'
  - `ValuationMethod` 类型改为 `'auto' | 'sina' | 'holdings'`
  - 验证：TypeScript 编译通过

- [x] Task 5: 前端 SettingsPage.tsx Segmented 新增"自动"选项
  - Segmented options 数组头部新增 `{ label: '自动', value: 'auto', icon: <AimOutlined /> }`（或合适的图标）
  - 提示文字在 `auto` 状态下显示："自动选择数据源（默认新浪，不可用时回退持仓穿透）"
  - 导入新图标（如 `AimOutlined` from `@ant-design/icons`）
  - 验证：设置页显示三个选项，选中"自动"时提示文字正确

- [x] Task 6: 前端 FundDetailPage.tsx 数据源下拉框新增"自动"选项
  - 找到数据源切换的 Dropdown/Select 组件
  - options 新增"自动"选项
  - 验证：详情页数据源下拉框显示三个选项

# Task Dependencies
- Task 2 依赖 Task 1（共享回退逻辑思路）
- Task 5、6 依赖 Task 4（类型定义）
- Task 3 独立（后端校验）
- Task 1、2 可并行（都是 fundService.js，但函数不同，建议串行避免冲突）
