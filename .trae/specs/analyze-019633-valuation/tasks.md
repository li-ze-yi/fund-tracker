# Tasks

- [x] Task 1: 验证 spec.md 中 019633 计算链路与代码一致
  - 阅读 `server/services/fundService.js` 中 `getHoldingsEstimatedOverlay`、`getFundAssetAllocation`、`getUnderlyingETFCode` 函数
  - 对照 spec.md 中 Step 1-8 的描述，确认代码逻辑一致
  - 确认公式、变量名、数据来源与代码匹配

- [x] Task 2: 验证 019633 资产配置实际数值
  - 调用 `https://fund.eastmoney.com/pingzhongdata/019633.js` 获取 `Data_assetAllocation`
  - 提取最新一期 stockRatio、bondRatio、cashRatio
  - 计算 etfWeight = 100 - stockRatio - bondRatio - cashRatio
  - 与 spec.md 中示例数值对比，更新如有差异

- [x] Task 3: 验证母ETF 159516（半导体设备ETF国泰）实时行情获取逻辑
  - 阅读 `getETFRealtimeQuote` 函数实现（主：腾讯 qt.gtimg.cn，备：新浪 hq.sinajs.cn）
  - 确认 159516 前缀为 `sz`（15/16 开头 → sz）
  - 确认涨跌幅字段为 `fields[32]`（腾讯）或 `(price - prevClose) / prevClose * 100`（新浪）
  - 与 spec.md 中 `estimatedChange` 字段描述一致

# Task Dependencies
- Task 1 无依赖，可独立执行
- Task 2 无依赖，可独立执行
- Task 3 无依赖，可独立执行