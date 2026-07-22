const mysql = require('mysql2/promise');

const CONNECTION_LIMIT = 10;

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
});

// 添加连接池错误处理
// 注意：不要在事件处理器中访问 pool.pool._config，会导致 mysql2/promise 连接静默挂起
let connectionCount = 0;
pool.on('connection', () => {
  connectionCount++;
  if (connectionCount <= 3) {
    console.log(`MySQL connection established (${connectionCount}/${CONNECTION_LIMIT})`);
  }
});

pool.on('error', (err) => {
  console.error('MySQL pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
    console.log('Connection lost, will reconnect...');
  }
});

// 添加带重试机制的查询函数（仅对连接类错误重试）
const RETRYABLE_ERRORS = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'];
const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  let retries = 3;
  let lastError;
  
  while (retries > 0) {
    try {
      return await originalQuery(...args);
    } catch (error) {
      lastError = error;
      const isRetryable = RETRYABLE_ERRORS.some(code => error.code === code || error.message?.includes(code));
      if (!isRetryable) {
        // 非连接类错误（语法错误、约束冲突等）直接抛出，不重试
        throw error;
      }
      retries--;
      console.warn(`MySQL query failed (${3 - retries}/3), retrying...`, error.message);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw lastError;
};

module.exports = pool;