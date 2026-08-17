# Tasks

- [x] Task 1: 新增按需 echarts 模块与 EChart 封装组件
  - [x] 1.1 创建 `web/src/utils/echarts.ts`：`import * as echarts from 'echarts/core'`，注册 `LineChart`、`BarChart`、`GridComponent`、`TooltipComponent`、`LegendComponent`、`MarkLineComponent`、`MarkPointComponent`、`DataZoomComponent`、`CanvasRenderer`，返回 `echarts` 实例
  - [x] 1.2 创建 `web/src/components/EChart.tsx`：props 支持 `option`、`style`、`className`、`opts.renderer`、`notMerge`、`lazyUpdate`；挂载时 `echarts.init` + `setOption`，监听容器尺寸变化 `resize`，卸载 `dispose`
- [x] Task 2: 替换 3 个页面的 echarts-for-react 为 EChart
  - [x] 2.1 `FundDetailPage.tsx` 替换 `<ReactECharts>` 为 `<EChart>`
  - [x] 2.2 `StatsPage.tsx` 替换 `<ReactECharts>` 为 `<EChart>`
  - [x] 2.3 `MarketDetailPage.tsx` 替换 `<ReactECharts>` 为 `<EChart>`
- [x] Task 3: 更新构建配置与依赖
  - [x] 3.1 `web/vite.config.ts`：`manualChunks` 改为函数形式，echarts 按需模块归入 `vendor-echarts`；移除 `echarts-for-react`
  - [x] 3.2 `web/package.json` 移除 `echarts-for-react`，执行 `npm install` 更新 lock
  - [x] 3.3 调整 `chunkSizeWarningLimit` 并注释说明 antd 情况
- [x] Task 4: 生产构建验证
  - [x] 4.1 执行 `npm run build`，确认成功、无模块解析错误
  - [x] 4.2 检查 `vendor-echarts` 体积低于 500 kB，`vendor-antd` 告警已消除

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 依赖 Task 2、Task 3