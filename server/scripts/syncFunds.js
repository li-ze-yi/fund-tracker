require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../config/database');
const fundService = require('../services/fundService');

async function sync() {
  console.log('开始同步基金数据...');
  try {
    const funds = await fundService.getAllFunds();

    // 基金数据格式: ["000001","基金名称","",...]
    const values = funds
      .filter(f => f[0] && f[1])
      .map(f => [f[0], f[1], f[2] || '未知']);

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const flatValues = batch.flat();

      const [result] = await pool.query(
        `INSERT IGNORE INTO funds (code, name, type) VALUES ${placeholders}`,
        flatValues
      );
      inserted += result.affectedRows;
    }

    console.log(`同步完成，共处理 ${values.length} 条，插入 ${inserted} 条`);
    process.exit(0);
  } catch (err) {
    console.error('同步失败:', err.message);
    process.exit(1);
  }
}

sync();