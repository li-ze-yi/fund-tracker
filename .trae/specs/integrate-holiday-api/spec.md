# 集成第三方节假日 API Spec

## Why
当前 `transactionController` 的 `nextBusinessDay` 和 `ensureBusinessDay` 仅判断周末（`getDay() === 0 || === 6`），不处理法定节假日。导致国庆/春节等假期买入的 pending 订单 navDate 指向假期，订单永远无法结算，最终被 30 天清除逻辑误删（用户资金"消失"）。

采用 timor.tech 节假日 API 查询法定节假日。核心逻辑 `isTradingDay = !isWeekend && !isHoliday` 正确处理所有场景：**周末一律非交易日（包括调休补班日，因为 A 股调休补班日不开市），法定节假日非交易日，其余为交易日**。调休补班日是周末，被 `isWeekend` 短路排除，API 对调休日的标记不影响结果。

## What Changes
- 新增 `server/services/holidayService.js`：调用 timor.tech API 查询节假日，内存缓存 24h
- 提供 `isHoliday`、`isTradingDay`、`nextTradingDay`、`ensureTradingDay` 方法
- 重构 `transactionController.nextBusinessDay` 和 `ensureBusinessDay` 改为调用 holidayService
- 复用 holidayService 优化 `planService` 中定投调度的周末顺延逻辑
- 降级策略：API 不可用时回退到现有周末判断逻辑，记录告警日志

## Impact
- Affected specs:
  - [ensure-pending-order-auto-settle](file:///d:/fundtracker/.trae/specs/ensure-pending-order-auto-settle/spec.md) — 修复后假期买入的 pending 订单 navDate 指向真实交易日
- Affected code:
  - [server/services/holidayService.js](file:///d:/fundtracker/server/services/holidayService.js)（新建）— 节假日服务
  - [server/controllers/transactionController.js](file:///d:/fundtracker/server/controllers/transactionController.js) — 重构 nextBusinessDay / ensureBusinessDay
  - [server/services/planService.js](file:///d:/fundtracker/server/services/planService.js) — 定投调度的日期顺延
  - [server/services/globalCache.js](file:///d:/fundtracker/server/services/globalCache.js) — 复用 getOrFetch，无修改

## ADDED Requirements

### Requirement: 节假日查询服务
系统 SHALL 提供 `holidayService` 模块，通过 timor.tech API 查询指定日期的节假日状态，并支持缓存和降级。

#### 数据源
- **URL**: `http://timor.tech/api/holiday/info/{date}`
- **date 格式**: `YYYY-MM-DD`（如 `2026-10-01`）
- **请求方式**: GET，无需鉴权
- **超时设置**: 3000ms（超过则放弃，回退周末判断）
- **响应示例**:
```json
{
  "code": 0,
  "holiday": {
    "holiday": true,
    "name": "国庆节",
    "wage": 3,
    "date": "2026-10-01",
    "rest": 1
  }
}
```
- **`holiday.holiday` 字段说明**:
  - `true` → 休息日（含法定节假日和普通周末）
  - `false` → 上班日（含调休补班日）

#### 核心判定逻辑
```
isTradingDay(date):
  if isWeekend(date):          // 周六或周日（getDay() === 0 || === 6）
    return false               // 周末一律非交易日（调休补班日股市也不开市，被此处短路排除）
  if isHoliday(date):          // API 查询 holiday.holiday === true
    return false               // 法定节假日非交易日
  return true                  // 工作日且非节假日 → 交易日
```

**关键说明**：调休补班日（如国庆调休周六上班）API 返回 `holiday=false`，但由于该日是周末，`isWeekend` 短路返回 `false`（非交易日），API 返回值不影响结果。这正好符合 A 股市场"调休补班日不开市"的规则。

#### Scenario: 查询工作日
- **WHEN** 调用 `holidayService.isTradingDay("2026-10-08")`（国庆后首个工作日，周四）
- **THEN** `isWeekend` 返回 false
- **AND** API 返回 `holiday.holiday = false`（上班日）
- **AND** `isTradingDay` 返回 `true`

#### Scenario: 查询法定节假日
- **WHEN** 调用 `holidayService.isTradingDay("2026-10-01")`（国庆节，周四）
- **THEN** `isWeekend` 返回 false
- **AND** API 返回 `holiday.holiday = true`（国庆节休息）
- **AND** `isTradingDay` 返回 `false`

#### Scenario: 查询调休补班日（周六但政府部门上班）
- **WHEN** 调用 `holidayService.isTradingDay("2026-02-14")`（假设春节调休周六上班）
- **THEN** `isWeekend` 返回 true（周六）
- **AND** 短路返回 `false`（非交易日），不查询 API
- **AND** 符合 A 股"调休补班日不开市"规则

#### Scenario: 查询普通周末
- **WHEN** 调用 `holidayService.isTradingDay("2026-08-09")`（周日）
- **THEN** `isWeekend` 返回 true
- **AND** 短路返回 `false`（非交易日），不查询 API

### Requirement: 节假日数据缓存
系统 SHALL 使用 `globalCache.getOrFetch` 对单日节假日查询结果缓存 24h，避免重复调用 API。

#### Scenario: 首次查询某日期
- **WHEN** 首次调用 `isHoliday("2026-10-01")`
- **THEN** 调用 timor.tech API 获取结果
- **AND** 将结果以 `holiday_2026-10-01` 为 key 缓存 24h

#### Scenario: 24h 内重复查询
- **WHEN** 24h 内再次调用 `isHoliday("2026-10-01")`
- **THEN** 直接返回缓存结果，不调用 API

#### Scenario: 周末不查询 API
- **WHEN** 调用 `isTradingDay("2026-08-09")`（周日）
- **THEN** `isWeekend` 短路返回 false
- **AND** 不调用 API，不写入缓存

### Requirement: API 不可用时的降级策略
系统 SHALL 在 timor.tech API 不可用时，回退到周末判断逻辑，保证买入流程不阻断。

#### Scenario: API 调用超时
- **WHEN** 调用 timor.tech API 超过 3 秒未响应
- **THEN** 放弃 API 调用，`isHoliday` 回退返回 `false`（视为非节假日）
- **AND** `isTradingDay` 退化为 `!isWeekend(date)`（仅周末判断）
- **AND** 记录告警日志：`[HolidayService] API 调用失败，回退周末判断: ${dateStr}, error: ${error.message}`
- **AND** 不缓存降级结果（下次查询仍尝试 API）

#### Scenario: API 返回非 200 状态码
- **WHEN** timor.tech API 返回 403/429/500 等错误状态码
- **THEN** 回退到周末判断逻辑
- **AND** 记录告警日志

#### Scenario: API 返回异常 JSON
- **WHEN** API 返回的 JSON 缺少 `holiday` 字段或格式异常
- **THEN** 回退到周末判断逻辑
- **AND** 记录告警日志

### Requirement: 交易日顺延工具方法
系统 SHALL 提供 `nextTradingDay` 和 `ensureTradingDay` 方法，正确处理周末和节假日。

#### Scenario: nextTradingDay 从工作日顺延
- **WHEN** 调用 `nextTradingDay("2026-10-08")`（周四）
- **THEN** 返回 `"2026-10-09"`（周五）

#### Scenario: nextTradingDay 跨越周末
- **WHEN** 调用 `nextTradingDay("2026-10-09")`（周五）
- **THEN** 返回 `"2026-10-12"`（下周一，跳过周末）

#### Scenario: nextTradingDay 跨越国庆假期
- **WHEN** 调用 `nextTradingDay("2026-09-30")`（国庆前一天，周三）
- **THEN** 返回 `"2026-10-08"`（跳过 10/1-10/2 假期、10/3-10/4 周末、10/5-10/7 假期）

#### Scenario: ensureTradingDay 工作日不变
- **WHEN** 调用 `ensureTradingDay("2026-10-08")`（工作日）
- **THEN** 返回 `"2026-10-08"`

#### Scenario: ensureTradingDay 节假日顺延
- **WHEN** 调用 `ensureTradingDay("2026-10-01")`（国庆节）
- **THEN** 返回 `"2026-10-08"`（顺延到国庆后首个工作日）

## MODIFIED Requirements

### Requirement: 交易订单的 navDate 计算
[原有逻辑]：`transactionController.nextBusinessDay` 和 `ensureBusinessDay` 仅判断周末。

[修改后]：改为调用 `holidayService.nextTradingDay` 和 `holidayService.ensureTradingDay`，正确处理法定节假日。

#### Scenario: 国庆假期内买入（after3pm=false）
- **WHEN** 用户在 2026-10-01（国庆节，周四）发起买入
- **AND** after3pm = false
- **THEN** navDate = `ensureTradingDay("2026-10-01")` = `"2026-10-08"`

#### Scenario: 国庆假期内买入（after3pm=true）
- **WHEN** 用户在 2026-10-01 发起买入
- **AND** after3pm = true
- **THEN** navDate = `ensureTradingDay(nextTradingDay("2026-10-01"))` = `ensureTradingDay("2026-10-08")` = `"2026-10-08"`

#### Scenario: 国庆假期前一天下午 3 点后买入
- **WHEN** 用户在 2026-09-30（国庆前一天，周三）after3pm=true 买入
- **THEN** navDate = `ensureTradingDay(nextTradingDay("2026-09-30"))` = `ensureTradingDay("2026-10-08")` = `"2026-10-08"`

#### Scenario: 春节调休补班日买入
- **WHEN** 用户在 2026-02-14（假设春节调休周六上班）买入
- **AND** after3pm = false
- **THEN** navDate = `ensureTradingDay("2026-02-14")` → 顺延到下一个交易日（因为调休补班日周六，isWeekend 短路返回非交易日）

### Requirement: 定投调度的执行日期顺延
[原有逻辑]：`planService.js` line 307-308 的 nextBusinessDay 仅跳过周末。

[修改后]：改为调用 `holidayService.nextTradingDay`，确保定投执行日落在真实交易日。

#### Scenario: 定投计划在国庆假期内触发
- **WHEN** 定投计划 scheduled_day 为 5，触发日期计算落在 2026-10-05（国庆假期内）
- **THEN** 顺延到 `nextTradingDay("2026-10-05")` = `"2026-10-08"`
- **AND** 在 2026-10-08 创建 pending 订单
