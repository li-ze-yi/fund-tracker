-- ============================================================
-- 迁移脚本：users 表新增 last_active_at 列
-- 用途：记录用户最后活跃时间（登录/带令牌访问），用于后台"7天活跃用户"统计，
--       替代原先基于 transactions 交易行为的统计口径
-- 执行：mysql -u root -p real_time < doc/migrate_users_add_last_active_at.sql
-- ============================================================

ALTER TABLE `users`
  ADD COLUMN `last_active_at` datetime DEFAULT NULL COMMENT '最后活跃时间（登录或带令牌访问，每小时节流更新一次）' AFTER `updated_at`;

-- 历史数据回填：
--   有交易记录的用户 → 最后一次交易录入时间（录入交易必然在应用内操作）
--   无交易记录的用户 → 注册时间（注册即一次真实访问）
UPDATE `users` u
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS last_tx_at
  FROM `transactions`
  GROUP BY user_id
) t ON t.user_id = u.id
SET u.last_active_at = COALESCE(t.last_tx_at, u.created_at);
