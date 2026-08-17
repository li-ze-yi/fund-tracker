# Tasks

- [x] Task 1: 修改 getHoldingsEstimatedOverlay 接收 confirmedNav 参数
  - 函数签名改为 `getHoldingsEstimatedOverlay(fundCode, confirmedNav)`
  - 当 confirmedNav 为正数时，跳过 lsjz 调用，直接用 `confirmedNav × (1 + estimatedChange/100)` 计算 estimatedValue
  - 当 confirmedNav 无效时，保持现有 lsjz 调用逻辑
  - **关键**：当 lsjz 调用失败/返回空但 estimatedChange 已计算成功时，返回 `{ estimatedValue: null, estimatedChange, estimationMethod: 'holdings', ... }` 而非 null
  - 验证：模拟 lsjz 失败场景，函数仍返回 estimatedChange

- [x] Task 2: 修改 getRealTimeValueWithMethod 传递确认净值
  - 第886-920行：`getRealTimeValue` 返回的 `confirmed.netValue` 传给 `getHoldingsEstimatedOverlay`
  - holdings 模式：`getHoldingsEstimatedOverlay(fundCode, confirmed?.netValue)`
  - auto 模式回退：`getHoldingsEstimatedOverlay(fundCode, confirmed?.netValue)`
  - 验证：日志中不再出现持仓穿透模式下的冗余 lsjz 调用

- [x] Task 3: 修改 batchGetRealTimeValuesWithMethod 传递确认净值
  - 第1185-1210行：将 `mobapiMap[code].netValue` 传给 `getHoldingsEstimatedOverlay`
  - holdings 模式并行调用：`getHoldingsEstimatedOverlay(code, mobapiMap[code]?.netValue)`
  - auto 模式回退：`getHoldingsEstimatedOverlay(code, mobapiMap[code]?.netValue)`
  - 验证：批量接口不再冗余调用 lsjz

- [x] Task 4: getFundHoldings 增加诊断日志
  - API 请求 catch 块：`console.warn('[holdings][warn] {fundCode} fundf10 API 失败: {e.message}')`
  - 无 tbody 匹配时：`console.warn('[holdings][warn] {fundCode} 响应无 tbody（可能无持仓或页面结构变化）')`
  - 解析后持仓为空时：`console.warn('[holdings][warn] {fundCode} 持仓解析为空')`
  - 验证：基金无持仓时日志可见 warn 信息

- [x] Task 5: getHoldingsEstimatedOverlay 增加过程日志
  - 持仓获取后：`[holdings] {fundCode} 持仓: {count}只, 覆盖率={ratio}%, 报告期={reportDate}`
  - 行情获取后：`[holdings] {fundCode} 行情: {successCount}/{total}只成功`
  - 估算成功：`[holdings] {fundCode} 估值成功: method={method}, change={change}%, coverage={coverage}%`
  - 估算失败：`[holdings][warn] {fundCode} 估算失败: {原因}`
  - 验证：日志完整呈现估算链路

- [x] Task 6: 端到端验证
  - **持仓有效基金**（如 161725）：holdings 模式返回 estimatedChange 和 estimatedValue，日志显示跳过 lsjz
  - **ETF联接基金**（如 019633）：返回 etf_linkage 估值（保持现有行为）
  - **低覆盖基金**（如 014558）：返回 holdings 估值（保持现有行为）
  - **模拟 lsjz 失败**：confirmedNav 未传入且 lsjz 超时 → estimatedValue 为 null 但 estimatedChange 有值
  - **批量接口**：多只基金批量获取，holdings 模式下不出现冗余 lsjz 调用
  - 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`）

# Task Dependencies
- Task 2、3 依赖 Task 1（先支持 confirmedNav 参数，再传参）
- Task 4、5 独立（日志增强，可并行）
- Task 6 依赖 Task 1-5 全部完成
