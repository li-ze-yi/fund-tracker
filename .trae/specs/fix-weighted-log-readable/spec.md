# 加权贡献值日志可读性改进 Spec

## Why
日志 `贡献: 股票已覆盖=-143.07 缺失股票=0.00 债券=1.20` 中的数值是 Σ(持仓占比×涨跌幅) 的中间计算值，单位是 `%×%`，需要再 ÷100 才是最终对基金涨跌幅的影响。用户看到 -143.07 误以为数据异常。需要改日志格式，把 ÷100 后的归一化值也标出来，便于理解。

## What Changes
- 修改 [fundService.js](file:///d:/fundtracker/server/services/fundService.js) 中 `getHoldingsEstimatedOverlay` 的贡献值日志
- 新日志同时展示原始 Σ(占比×涨跌幅) 和 ÷100 后的归一化百分比值

## Impact
- Affected code: `server/services/fundService.js` — `getHoldingsEstimatedOverlay` 贡献值日志行

---

## MODIFIED Requirements

### Requirement: 贡献值日志格式
日志 SHALL 同时展示原始 Σ(占比×涨跌幅) 和 ÷100 归一化后的百分比值。

#### Scenario: 正常产出日志
- **WHEN** `getHoldingsEstimatedOverlay` 计算完各成分贡献
- **AND** estimatedChange 已计算得到
- **THEN** 日志输出如：`加权: Σ(占比×涨跌幅)=-143.07 (归一化≈-1.43%), 债券归一化=0.01%, 最终变化=-1.42%`
- **AND** 所有数值单位均为百分比
