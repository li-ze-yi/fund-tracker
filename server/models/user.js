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
    const [rows] = await pool.query('SELECT id, username, created_at FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }
};

module.exports = User;