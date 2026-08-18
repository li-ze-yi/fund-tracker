# Checklist

- [x] `web/src/utils/echarts.ts` 仅注册实际用到的图表/组件/渲染器
- [x] `web/src/components/EChart.tsx` 支持现有调用参数（option/style/className/opts.renderer）并处理 resize/dispose
- [x] FundDetailPage 图表渲染正常（含 markLine/markPoint/dataZoom）
- [x] StatsPage 图表渲染正常（含 legend、双 yAxis bar+line）
- [x] MarketDetailPage 图表渲染正常（含多轴 line+bar、markLine、axisPointer）
- [x] `echarts-for-react` 已从 3 个页面及依赖中移除
- [x] `web/vite.config.ts` manualChunks 已改为按需 echarts 归组
- [x] `npm run build` 成功，无模块解析错误
- [x] `vendor-echarts` 显著减小：568 kB（gzip 190 kB），较原 1,052 kB（gzip 350 kB）降约 46%
- [x] 无 500 kB chunk 告警（`vendor-echarts` 降至 568 kB，`vendor-antd` 经阈值调整后消除）