-- 查看transactions表结构
DESCRIBE transactions;

-- 查看最近的交易记录，检查日期格式
SELECT id, transaction_date, type, created_at 
FROM transactions 
ORDER BY created_at DESC 
LIMIT 10;
