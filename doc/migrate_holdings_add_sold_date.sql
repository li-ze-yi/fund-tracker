-- ============================================================
-- 迁移脚本：holdings 表新增 sold_date 列
-- 用途：全部卖出后保留持仓记录，记录卖出日期用于"当天隐藏、次日展示已清仓"逻辑
-- 执行：mysql -u root -p real_time < doc/migrate_holdings_add_sold_date.sql
-- ============================================================

ALTER TABLE `holdings`
  ADD COLUMN `sold_date` date DEFAULT NULL COMMENT '全部卖出日期' AFTER `total_return`;
