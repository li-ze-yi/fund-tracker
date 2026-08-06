require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../config/database');
const fundService = require('../services/fundService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SyncFunds');

async function sync() {
  logger.info('开始同步基金数据...');
  try {
    const funds = await fundService.getAllFunds();

    // 基金数据格式(东方财富fundcode_search.js): ["000001","拼音缩写","基金名称","基金类型","拼音全称"]
    const values = funds
      .filter(f => f[0] && f[2])
      .map(f => [f[0], f[2], f[3] || '未知']);

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const flatValues = batch.flat();

      const [result] = await pool.query(
        `INSERT INTO funds (code, name, type) VALUES ${placeholders} ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type)`,
        flatValues
      );
      inserted += result.affectedRows;
    }

    logger.info(`同步完成，共处理 ${values.length} 条，插入 ${inserted} 条`);
    process.exit(0);
  } catch (err) {
    logger.error(`同步失败: ${err.message}`, err.stack);
    process.exit(1);
  }
}

sync();