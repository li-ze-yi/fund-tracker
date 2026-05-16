# 项目发现记录

## 数据库结构发现

### holdings 表结构
- 包含字段：user_id, fund_code, shares, cost_price 等
- 5个活跃用户持有不同数量的基金

### daily_profits 表结构
- 包含字段：user_id, date, profit, return_rate
- 目前只有 user_id=7 有完整30天数据

### transactions 表
- user_id=7: 21条交易记录
- user_id=2: 29条交易记录
- 其他用户交易记录较少

## 代码架构发现

### fundService.js 能力
- ✅ getRealTimeValue(fundCode) - 获取实时估值
- ✅ getHistoryNetValues(fundCode, start, end) - 获取历史净值
- ✅ getFundInfo(fundCode) - 获取基金信息
- ✅ getAllFunds() - 获取所有基金列表
- 已实现多接口容错机制（3个备用接口）

### statsController.js 当前实现
- 使用硬编码的净值乘数（第26-33行）
- 已实现日/月/年统计接口
- 支持从 daily_profits 表读取数据
- 无数据时使用模拟算法

### 数据库配置
- 使用环境变量配置（MYSQL_HOST, MYSQL_PORT等）
- 连接池已配置（最大10连接）
- 配置文件：server/config/database.js

## 技术约束

1. **基金API限制**：
   - 实时估值接口在工作日 9:30-15:00 可用
   - 历史净值接口支持分页查询
   - 需要设置合理的超时时间（8秒）

2. **性能考虑**：
   - 多用户批量计算时需要注意数据库连接池
   - 外部API调用需要并发控制
   - 缓存机制可减少重复请求

3. **数据一致性**：
   - UPSERT操作需要使用事务或ON DUPLICATE KEY UPDATE
   - 日收益计算依赖于前一天的市值数据
