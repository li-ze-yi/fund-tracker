# Checklist

## 后端改动验证
- [x] getRealTimeValueWithMethod 在 method='auto' 时先尝试新浪，失败回退持仓穿透
- [x] getRealTimeValueWithMethod 在 method='sina'/'holdings' 时保持原行为（不回退）
- [x] batchGetRealTimeValuesWithMethod 在 method='auto' 时批量新浪 + 逐个回退持仓穿透
- [x] settingController.js updateValuationMethod 的 validMethods 包含 'auto'
- [x] settingController.js setFundOverride 的 validMethods 包含 'auto'
- [x] 兼容旧数据：'tencent' 仍映射为 'sina'（在 get 接口中）

## 前端改动验证
- [x] settingService.ts 的 ValuationMethod 类型包含 'auto'
- [x] SettingsPage.tsx Segmented 显示"自动/新浪财经/持仓穿透"三个选项
- [x] SettingsPage.tsx 选中"自动"时提示文字说明回退逻辑
- [x] FundDetailPage.tsx 数据源下拉框显示三个选项（含"自动"）

## 端到端验证
- [x] 开发环境选择"自动"后，019633（ETF联接）能获取估值（estimationMethod 为 etf_linkage 或 sina）
- [x] 开发环境选择"自动"后，普通基金（如 161725）能获取估值
- [x] 切换数据源后前端提示"估值数据源切换成功"

## 编译验证
- [x] 前端 TypeScript 编译不报新错误
- [x] 后端 Node.js 语法检查通过（node -c fundService.js）
