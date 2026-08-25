# 修复新用户默认估值数据源 Spec

## Why
新用户注册后添加基金持仓，看到的是前一日的估值数据而非实时估值，只有手动切换数据源后才正常。根因是 `authController.js` 创建用户时未传 `valuationMethod`，`userSetting.js` 的 `upsert` 兜底为已废弃的 `'tencent'`，DB schema 默认值也是 `'tencent'`。而 `fundService.js` 的 `batchGetRealTimeValuesWithMethod` 只识别 `'holdings'`/`'auto'` 两个显式分支，`'tencent'` 落入 `else` 分支（仅 Sina、无 fallback）；当 Sina 不可用（如云端 IP 被封）时，估值全部返回 null，前端回退显示前一日 `gainPercent`。切换数据源会通过 `updateValuationMethod` 写入合法值（`'auto'`/`'sina'`/`'holdings'`），bug 消失。

## 设计原则
- 新浪和持仓穿透两个数据源是隔离的，不相互回退调用
- 新用户默认使用 **持仓穿透（`'holdings'`）** 数据源，而非依赖跨源回退的 `'auto'`

## What Changes
- `authController.js`：注册时显式向 `UserSetting.upsert` 传入 `'holdings'`
- `userSetting.js`：`upsert` 的 `valuationMethod` 兜底值由 `'tencent'` 改为 `'holdings'`
- `init_db.sql`：`user_settings.valuation_method` 列默认值由 `'tencent'` 改为 `'holdings'`，同步更新注释
- `settingController.get`：修正注释（现有代码已将 `'tencent'` 映射为 `'holdings'`，但注释误写为"映射为 sina"），保留该映射作为存量数据的安全网
- 新增一次性迁移 SQL：将存量用户的 `valuation_method = 'tencent'` 更新为 `'holdings'`

## Impact
- Affected specs: `frontend-no-estimate-display`（修复后新用户不再误入 `no_estimate` 状态）、`auto-data-source-switching`（`auto` 选项保留，但不再是新用户默认值）
- Affected code:
  - `server/controllers/authController.js` — 新用户注册流程
  - `server/models/userSetting.js` — `upsert` 默认值
  - `server/controllers/settingController.js` — `get` 的注释修正
  - `doc/init_db.sql` — `user_settings` 表 schema 默认值
  - 新增 `doc/migrate_tencent_to_holdings.sql` — 存量数据迁移脚本

---

## ADDED Requirements

### Requirement: 存量用户数据迁移
系统 SHALL 提供一次性迁移脚本，将所有 `valuation_method = 'tencent'` 的存量用户更新为 `'holdings'`，避免历史数据继续触发 bug。

#### Scenario: 执行迁移脚本
- **WHEN** 管理员执行 `doc/migrate_tencent_to_holdings.sql`
- **THEN** `user_settings` 表中所有 `valuation_method = 'tencent'` 的行更新为 `'holdings'`
- **AND** `valuation_method IS NULL` 的行也更新为 `'holdings'`

---

## MODIFIED Requirements

### Requirement: 新用户默认估值数据源
新用户注册时 SHALL 默认使用 `'holdings'`（持仓穿透）数据源。新浪与持仓穿透两个数据源相互隔离，不发生跨源回退。

#### Scenario: 新用户注册后查看持仓
- **WHEN** 新用户注册成功并添加基金持仓
- **THEN** `user_settings.valuation_method` 为 `'holdings'`
- **AND** 估值请求走 `batchGetRealTimeValuesWithMethod` 的 `holdings` 分支（持仓穿透法）
- **AND** 实时估值正常显示，而非前一日数据

### Requirement: UserSetting.upsert 默认值
`UserSetting.upsert` 在未传入 `valuationMethod` 时 SHALL 兜底为 `'holdings'`，而非 `'tencent'`。

#### Scenario: upsert 未传 valuationMethod
- **WHEN** 调用 `UserSetting.upsert(userId, 30)` 未传第三个参数
- **THEN** 写入 DB 的 `valuation_method` 为 `'holdings'`

### Requirement: settingController.get 历史值兼容
`settingController.get` 读取设置时 SHALL 将历史值 `'tencent'` 映射为 `'holdings'`（现有代码已如此，仅需修正注释）。

#### Scenario: 历史用户读取设置
- **WHEN** 存量用户的 `valuation_method` 仍为 `'tencent'`（迁移前）
- **THEN** `settingController.get` 返回的 `valuationMethod` 为 `'holdings'`
- **AND** 前端设置页显示"持仓穿透"选项

### Requirement: DB Schema 默认值
`init_db.sql` 中 `user_settings.valuation_method` 列 SHALL 默认为 `'holdings'`，注释同步更新为 `auto=自动, sina=新浪财经, holdings=持仓穿透`。

---

## REMOVED Requirements

### Requirement: upsert 兜底为 'tencent'
**Reason**: `'tencent'` 是已废弃的旧值，`fundService` 不再识别该分支，导致新用户估值失败
**Migration**: 兜底值改为 `'holdings'`；存量 `'tencent'` 数据通过迁移脚本更新为 `'holdings'`
