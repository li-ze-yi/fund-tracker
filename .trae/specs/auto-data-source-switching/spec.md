# 自动数据源切换 Spec

## Why
当前数据源切换功能只有两个固定选项（新浪/持仓穿透），用户选了一个后，如果某只基金在该源不可用（如新浪在阿里云被封禁、持仓穿透法对无持仓基金返回null），就直接显示估算失败。需要一个"自动"选项，先按默认源尝试，失败后自动回退到另一个源，提升估值的可用性。

## What Changes
- 新增 `auto` 数据源选项，作为数据源切换的第三个选项
- 后端 `getRealTimeValueWithMethod` 和 `batchGetRealTimeValuesWithMethod` 在 method 为 `auto` 时：先尝试默认源（sina），失败后自动回退到 holdings（反之亦然）
- 默认数据源：`auto` 模式下优先尝试新浪（sina），失败后回退到持仓穿透（holdings）
- 前端设置页 `SettingsPage.tsx` Segmented 组件新增"自动"选项
- 前端详情页 `FundDetailPage.tsx` 数据源下拉框新增"自动"选项
- 前端 `settingService.ts` 类型定义 `ValuationMethod` 新增 `'auto'`
- 后端 `settingController.js` 校验白名单新增 `'auto'`
- 后端 `fundController.js` 的 `getUserValuationMethod` 兼容 `auto`（无需特殊处理，透传即可）
- 前端设置页提示文字在 `auto` 状态下显示说明

## Impact
- Affected specs: `analyze-valuation-pipeline`（估值管线）、`frontend-no-estimate-display`（no_estimate 状态触发条件变化：auto 模式下两个源都失败才进入 no_estimate）
- Affected code:
  - `server/services/fundService.js` — `getRealTimeValueWithMethod`、`batchGetRealTimeValuesWithMethod`
  - `server/controllers/settingController.js` — 校验白名单
  - `web/src/services/settingService.ts` — 类型定义
  - `web/src/pages/settings/SettingsPage.tsx` — Segmented 选项
  - `web/src/pages/fund/FundDetailPage.tsx` — 数据源下拉框

---

## ADDED Requirements

### Requirement: 自动数据源切换
系统 SHALL 提供 `auto` 数据源选项，在该模式下先尝试默认数据源（新浪），失败后自动回退到另一个数据源（持仓穿透）。

#### Scenario: 新浪可用时使用新浪
- **WHEN** 用户选择 `auto` 数据源
- **AND** 新浪接口对某基金返回有效估值
- **THEN** 使用新浪的估值结果
- **AND** `estimationMethod` 为 `sina` 相关值

#### Scenario: 新浪失败时回退到持仓穿透
- **WHEN** 用户选择 `auto` 数据源
- **AND** 新浪接口对该基金返回 null 或失败（如新浪被封禁、基金不在新浪覆盖范围）
- **THEN** 自动尝试持仓穿透法（含ETF联接基金估值）
- **AND** 如果持仓穿透成功，使用其估值结果，`estimationMethod` 为 `holdings`/`etf_linkage`
- **AND** 如果持仓穿透也失败，进入 `no_estimate` 状态

#### Scenario: 批量接口自动回退
- **WHEN** 批量获取多只基金数据，method 为 `auto`
- **THEN** 先批量调用新浪获取所有基金的估值
- **AND** 对新浪返回 null 的基金，逐个调用持仓穿透法回退
- **AND** 合并结果时保留每个基金实际使用的数据源标识

---

## MODIFIED Requirements

### Requirement: 数据源选项
数据源切换功能 SHALL 提供三个选项：`auto`（自动）、`sina`（新浪财经）、`holdings`（持仓穿透）。

#### Scenario: 前端设置页显示三个选项
- **WHEN** 用户打开设置页
- **THEN** Segmented 组件显示"自动"、"新浪财经"、"持仓穿透"三个选项

#### Scenario: 后端校验接受 auto
- **WHEN** 前端提交 `method: 'auto'` 到 `/settings/valuation-method`
- **THEN** 后端校验通过并保存

### Requirement: 前端类型定义
`ValuationMethod` 类型 SHALL 包含 `'auto'`：
```typescript
export type ValuationMethod = 'auto' | 'sina' | 'holdings';
```
