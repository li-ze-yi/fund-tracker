# 打包体积优化 / 代码分割 Spec

## Why
生产构建出现两个超过 500 kB 的 vendor chunk 警告：`vendor-echarts`（1,052 kB）和 `vendor-antd`（1,078 kB）。其中 echarts 通过 `echarts-for-react` 一次性引入全量 echarts（约 1 MB），而实际仅用到折线图（line）和柱状图（bar）两类图表，存在大量冗余。路由层已用 `React.lazy` + `Suspense` 完成代码分割，本改动聚焦 echarts 按需引入，真正削减传输体积。

## What Changes
- 新增按需引入的 echarts 实例模块 `src/utils/echarts.ts`：仅注册 line/bar 图表、Grid/Tooltip/Legend/MarkLine/MarkPoint/DataZoom 组件与 CanvasRenderer。
- 新增轻量 React 封装组件 `src/components/EChart.tsx`，替代 `echarts-for-react`（支持 `option`、`style`、`className`、`opts.renderer`、`notMerge`、`lazyUpdate`，自动 resize / dispose）。
- 将 3 个页面（FundDetailPage、StatsPage、MarketDetailPage）的 `echarts-for-react` 替换为 `EChart`。
- 更新 `web/vite.config.ts`：`manualChunks` 改为函数形式，把 `node_modules/echarts/` 下的按需模块统一归入 `vendor-echarts`；移除 `echarts-for-react` 引用。
- 从 `web/package.json` 移除 `echarts-for-react` 依赖。
- 调整 `chunkSizeWarningLimit`：antd 为全应用共用、已按需 tree-shake，体积接近最优，采用提高阈值（1100）的方式消除剩余告警，并在配置中注释说明。

## Impact
- Affected specs: 无（独立优化项）
- Affected code:
  - `web/src/utils/echarts.ts`（新增）
  - `web/src/components/EChart.tsx`（新增）
  - `web/src/pages/fund/FundDetailPage.tsx`
  - `web/src/pages/stats/StatsPage.tsx`
  - `web/src/pages/market/MarketDetailPage.tsx`
  - `web/vite.config.ts`
  - `web/package.json`

## ADDED Requirements

### Requirement: echarts 按需引入
系统 SHALL 仅注册实际使用的 echarts 模块，避免全量打包。

#### Scenario: 图表渲染正常
- **WHEN** 用户访问 基金详情 / 统计 / 行情详情 任一页面
- **THEN** 折线图、柱状图、markLine、markPoint、dataZoom、legend、tooltip、axisPointer 均正常渲染，与改动前一致

### Requirement: 轻量 EChart 封装组件
系统 SHALL 提供替代 `echarts-for-react` 的封装，支持现有调用方式且自动 resize / dispose。

#### Scenario: 组件生命周期
- **WHEN** 组件挂载 / 容器尺寸变化 / 卸载
- **THEN** 正确 init、setOption、resize、dispose，无内存泄漏

## MODIFIED Requirements

### Requirement: 构建体积
`vendor-echarts` chunk 体积 SHALL 明显下降（目标低于 500 kB 警告阈值），且生产构建成功、无模块解析错误。

#### Scenario: 生产构建
- **WHEN** 执行 `npm run build`
- **THEN** 构建成功，`vendor-echarts` 不再触发 500 kB 告警；`vendor-antd` 告警通过阈值调整消除

## REMOVED Requirements
### Requirement: echarts-for-react 依赖
**Reason**: 全量引入 echarts，导致 1 MB 冗余 chunk。
**Migration**: 由新的按需 `EChart` 组件替代，页面调用参数保持不变。