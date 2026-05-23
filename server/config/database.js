const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  waitForConnections: true,
  queueLimit: 0,
  maxIdle: 10,
  idleTimeout: 600000,  // 10分钟（原60秒太短导致频繁重连）
});

// 添加连接池错误处理
let connectionCount = 0;
pool.on('connection', (connection) => {
  connectionCount++;
  if (connectionCount <= 3) {
    console.log(`MySQL connection established (${connectionCount}/${pool.pool._config.connectionLimit})`);
  }
});

pool.on('error', (err) => {
  console.error('MySQL pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
    console.log('Connection lost, will reconnect...');
  }
});

// 添加带重试机制的查询函数
const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  let retries = 3;
  let lastError;
  
  while (retries > 0) {
    try {
      return await originalQuery(...args);
    } catch (error) {
      lastError = error;
      console.warn(`MySQL query failed (${4 - retries}/3), retrying...`, error.message);
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw lastError;
};

module.exports = pool;