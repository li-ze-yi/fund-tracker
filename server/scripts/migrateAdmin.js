require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../config/database');

async function migrate() {
  try {
    const [columns] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
    );
    if (columns.length === 0) {
      await pool.query(
        "ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user'"
      );
      console.log('已添加 role 字段');
    } else {
      console.log('role 字段已存在，跳过');
    }

    await pool.query(
      "UPDATE users SET role = 'admin' WHERE id = (SELECT min_id FROM (SELECT MIN(id) as min_id FROM users) t)"
    );
    console.log('迁移完成：第一个用户已设为管理员');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err.message);
    process.exit(1);
  }
}

migrate();
