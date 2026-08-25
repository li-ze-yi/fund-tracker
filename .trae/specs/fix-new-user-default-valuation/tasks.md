# Tasks

- [x] Task 1: 修复新用户默认估值数据源
  - [x] SubTask 1.1: 修改 `server/controllers/authController.js`，注册时显式向 `UserSetting.upsert` 传入 `'holdings'`（将 `UserSetting.upsert(userId, 30)` 改为 `UserSetting.upsert(userId, 30, 'holdings')`）
  - [x] SubTask 1.2: 修改 `server/models/userSetting.js` 的 `upsert`，将 `valuationMethod || 'tencent'` 兜底值改为 `valuationMethod || 'holdings'`
  - [x] 验证：新用户注册后 `user_settings.valuation_method` 为 `'holdings'`（authController.js:27 已显式传入 'holdings'，userSetting.js:23 兜底值为 'holdings'）

- [x] Task 2: 修复 DB Schema 默认值
  - [x] SubTask 2.1: 修改 `doc/init_db.sql` 中 `user_settings.valuation_method` 列默认值由 `'tencent'` 改为 `'holdings'`
  - [x] SubTask 2.2: 同步更新该列注释为 `auto=自动, sina=新浪财经, holdings=持仓穿透`

- [x] Task 3: 修正 settingController.get 注释
  - [x] SubTask 3.1: 修改 `server/controllers/settingController.js` 的 `get`，将注释修正为"兼容旧数据：将 'tencent' 映射为 'holdings'（腾讯接口已废弃，统一回退到持仓穿透）"，代码逻辑保持不变（已是 `holdings`）

- [x] Task 4: 新增存量数据迁移脚本
  - [x] SubTask 4.1: 新增 `doc/migrate_tencent_to_holdings.sql`，内容为 `UPDATE user_settings SET valuation_method = 'holdings' WHERE valuation_method = 'tencent' OR valuation_method IS NULL;`
  - [x] 验证：脚本内容正确，能将 `tencent`/NULL 更新为 `'holdings'`

# Task Dependencies
- Task 1、Task 2、Task 3 互相独立，可并行
- Task 4 独立，可并行
