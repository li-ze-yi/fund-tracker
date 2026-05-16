const pool = require('../config/database');

const Fund = {
  async search(keyword) {
    const like = `%${keyword}%`;
    const [rows] = await pool.query(
      'SELECT * FROM funds WHERE code LIKE ? OR name LIKE ? LIMIT 20',
      [like, like]
    );
    return rows;
  },

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM funds WHERE code = ?', [code]);
    return rows[0] || null;
  },

  async getAll(offset = 0, limit = 50) {
    const [rows] = await pool.query('SELECT * FROM funds LIMIT ? OFFSET ?', [limit, offset]);
    return rows;
  }
};

module.exports = Fund;