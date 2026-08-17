# 估值数据源重构 Spec

## Why
实测发现 fundmobapi GSZ 和 fundgz 接口在交易时段也返回 null（天天基金官方估值已不提供盘中数据），当前代码保留了这些无效调用和多层数据源相互回退逻辑，造成浪费和混乱。需要清理为两个清晰的数据源（新浪、持仓穿透），数据源之间不互相回退，估算失败时显示前一天数据并标注日期。

## What Changes
- 注释掉所有不可用的接口（fundgz、腾讯、旧版持仓法、ETF场内独立调用），标注原因
- 整合为两个数据源：**新浪**（`getSinaEstimatedValue`）和**持仓穿透**（`getHoldingsEstimatedOverlay` + 整合 ETF联接估值）
- 数据源之间不互相回退：新浪失败返回 null，持仓穿透失败返回 null
- `getHoldingsEstimatedOverlay` 内部去掉回退到新浪的逻辑，改为整合 ETF联接估值
- 简化 `getRealTimeValueWithMethod` 和 `batchGetRealTimeValuesWithMethod`：根据 method 选择单一数据源
- 盘中估算失败时（estimatedChange 为 null）：显示前一天的确认净值和涨幅，并标注日期

## Impact
- Affected code: `server/services/fundService.js`、`server/controllers/fundController.js`、`server/services/holdingService.js`
- **BREAKING**: 移除多层数据源回退链，新浪模式不再回退到持仓穿透，持仓穿透模式不再回退到新浪
- **BREAKING**: fundmobapi 不再用于获取盘中估算（GSZ），仅保留用于确认净值

---

## ADDED Requirements

### Requirement: 两个独立数据源
系统 SHALL 提供两个互不回退的盘中估算数据源：
- **新浪**：`getSinaEstimatedValue`，从新浪财经获取盘中估值
- **持仓穿透**：`getHoldingsEstimatedOverlay`，通过持仓股票加权计算；对 ETF联接基金通过母ETF行情估算

#### Scenario: 新浪数据源失败
- **WHEN** 用户选择"新浪"数据源
- **AND** 新浪接口返回 null（被封禁或无数据）
- **THEN** 估算值返回 null
- **AND** 不回退到持仓穿透法

#### Scenario: 持仓穿透数据源失败
- **WHEN** 用户选择"持仓穿透"数据源
- **AND** 基金无持仓数据且非ETF联接基金
- **THEN** 估算值返回 null
- **AND** 不回退到新浪

#### Scenario: ETF联接基金使用持仓穿透
- **WHEN** 用户选择"持仓穿透"数据源
- **AND** 基金为 ETF联接基金（如 019633）
- **THEN** 通过母ETF实时行情获取涨跌幅作为估算
- **AND** estimationMethod 为 'etf_linkage'

### Requirement: 估算失败时显示前一天数据
系统 SHALL 在盘中估算失败时（estimatedChange 为 null），显示前一天的确认净值和涨幅，并标注日期。

#### Scenario: 盘中估算失败
- **WHEN** 当前为交易时段
- **AND** 所选数据源返回 estimatedChange = null
- **THEN** net_value 显示前一天的确认净值
- **AND** estimated_change 显示前一天的涨幅（gainPercent）
- **AND** 返回结果中包含日期标识（如 update_time 为前一天日期）
- **AND** update_status 标记为 'pending_confirm' 或 'no_estimate'

---

## MODIFIED Requirements

### Requirement: 持仓穿透法（整合ETF联接估值）
`getHoldingsEstimatedOverlay` SHALL 整合以下逻辑，不再回退到新浪：
1. 获取基金持仓股票
2. 如果有持仓且覆盖率≥30%：加权计算涨跌幅
3. 如果无持仓：尝试 ETF联接基金估值（`getETFBasedEstimatedValue`）
4. 如果以上都失败：返回 null

### Requirement: 批量接口简化
`batchGetRealTimeValuesWithMethod` SHALL 简化为：
1. 用 fundmobapi 批量获取确认净值（NAV, NAVCHGRT）— 不再使用 GSZ
2. 根据 method 批量获取盘中估算：
   - sina 模式：`batchGetSinaEstimatedValues`
   - holdings 模式：并行调用 `getHoldingsEstimatedOverlay`
3. 不互相回退

---

## REMOVED Requirements

### Requirement: fundgz 估值走势接口
**Reason**: 实测（2026-07-23 交易时段）总返回 null，天天基金已不再提供盘中估值数据
**Migration**: 注释掉 `getFundgzEstimatedValue` 及其所有调用

### Requirement: fundmobapi GSZ 优先逻辑
**Reason**: 实测 GSZ 在交易时段也为 null，`mobapi?.estimatedValue ? mobapi : estimated` 永远走 else 分支
**Migration**: 移除 GSZ 优先判断，fundmobapi 仅保留用于确认净值

### Requirement: 腾讯基金接口和旧版持仓法
**Reason**: 死代码，仅互相调用，未导出
**Migration**: 注释掉 `getTencentValue`、`getHoldingsEstimatedValue`

### Requirement: 数据源多层相互回退
**Reason**: 用户要求不同数据源不互相回退，失败时显示前一天数据
**Migration**: 移除 `getHoldingsEstimatedOverlay` 中回退到 `getSinaEstimatedValue` 的逻辑；移除 `getRealTimeValueWithMethod` 中的多层回退链

### Requirement: getETFRealtimeQuote 独立调用
**Reason**: 整合到持仓穿透法内部，不再独立调用
**Migration**: 仅保留为 `getETFBasedEstimatedValue` 的内部依赖
