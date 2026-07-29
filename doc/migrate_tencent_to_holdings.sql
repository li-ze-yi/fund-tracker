-- 一次性迁移：将已废弃的 'tencent' 估值数据源统一更新为 'holdings'（持仓穿透）
-- 同时处理 NULL 值，确保所有存量用户使用合法的数据源
UPDATE user_settings SET valuation_method = 'holdings' WHERE valuation_method = 'tencent' OR valuation_method IS NULL;
