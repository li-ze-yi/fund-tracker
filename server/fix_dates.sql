-- 修复历史错误数据的SQL脚本
-- 执行前请先备份数据库！

-- 1. 查看所有异常的transaction_date记录
SELECT id, fund_code, type, transaction_date, created_at 
FROM transactions 
WHERE transaction_date NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
ORDER BY created_at DESC;

-- 2. 如果发现错误的记录，可以根据created_at推断正确日期并更新
-- 例如：如果 created_at 是 '2026-05-12 01:19:20'，则 transaction_date 应该是 '2026-05-12'

-- 示例修复语句（请根据实际查询结果修改）:
-- UPDATE transactions 
-- SET transaction_date = DATE(created_at)
-- WHERE transaction_date NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
