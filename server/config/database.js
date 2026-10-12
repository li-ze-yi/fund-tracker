const mysql = require('mysql2/promise');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Database');

// 池上限支持环境变量覆盖：多实例部署（PM2 多进程 / K8s 多副本）时总连接数 =
// 实例数 × connectionLimit，默认 MySQL max_connections=151，每实例应按副本数分配
// （如 4 副本取 25），避免连接风暴打爆 MySQL。
const CONNECTION_LIMIT = parseInt(process.env.MYSQL_CONNECTION_LIMIT, 10) || 100;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: CONNECTION_LIMIT,
  connectTimeout: 10000,  // 10秒连接超时，避免无限期挂起
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,  // 10秒后开始发送心跳
  waitForConnections: true,
  queueLimit: 0,
  maxIdle: 10,
  idleTimeout: 600000,  // 10分钟
  timezone: '+08:00',  // ★ 固化连接时区为北京时间（UTC+8），与 app.js 的 process.env.TZ 保持一致
});

// 添加连接池错误处理
// 注意：不要在事件处理器中访问 pool.pool._config，会导致 mysql2/promise 连接静默挂起
let connectionCount = 0;
pool.on('connection', () => {
  connectionCount++;
  if (connectionCount <= 3) {
    logger.info(`MySQL 连接建立 (${connectionCount}/${CONNECTION_LIMIT})`);
  }
});

pool.on('error', (err) => {
  logger.error(`MySQL 连接池错误: ${err.message}`, err.stack);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
    logger.warn('MySQL 连接丢失，将自动重连...');
  }
});

// 说明：不再包装 pool.query 做"连接类错误自动重试"。
// ECONNRESET/EPIPE 可能发生在语句已成功执行之后（仅响应丢失），对 INSERT/UPDATE
// 这类非幂等语句盲目重试会造成双倍落账（资金账务风险）。连接类错误应让调用方
// 的业务级错误处理/事务回滚来兜底；mysql2 池本身会在下次 getConnection 时重建连接。

// 挂载连接上限到池对象，供健康检查等场景只读引用（避免事件回调中访问 pool.pool._config）
pool.CONNECTION_LIMIT = CONNECTION_LIMIT;

module.exports = pool;