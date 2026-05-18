const pool = require('../config/database');

const User = {
  async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  },

  async create(username, hashedPassword) {
    const [result] = await pool.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT id, username, role, created_at FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findAll({ page, pageSize, keyword }) {
    const offset = (page - 1) * pageSize;
    let where = '';
    const params = [];
    if (keyword) {
      where = 'WHERE u.username LIKE ?';
      params.push(`%${keyword}%`);
    }
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.role, u.created_at,
              (SELECT COUNT(*) FROM holdings WHERE user_id = u.id) AS holding_count
       FROM users u ${where}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    return { list: rows, total: countRows[0].total };
  },

  async updateRole(id, role) {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  },

  async deleteById(id) {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
  },

  async count() {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    return rows[0].total;
  }
};

module.exports = User;
