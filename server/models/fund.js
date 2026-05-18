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
  },

  async findAll({ page, pageSize, keyword, type }) {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    if (keyword) {
      conditions.push('(f.code LIKE ? OR f.name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (type) {
      conditions.push('f.type = ?');
      params.push(type);
    }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT f.* FROM funds f ${where} ORDER BY f.code ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM funds f ${where}`, params);
    return { list: rows, total: countRows[0].total };
  },

  async deleteByCode(code) {
    await pool.query('DELETE FROM funds WHERE code = ?', [code]);
  },

  async count() {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM funds');
    return rows[0].total;
  },

  async countByType() {
    const [rows] = await pool.query('SELECT type, COUNT(*) AS count FROM funds GROUP BY type');
    return rows;
  }
};

module.exports = Fund;
