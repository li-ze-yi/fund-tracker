const pool = require('../config/database');

const Group = {
  async findByUserId(userId) {
    const [rows] = await pool.query('SELECT * FROM `groups` WHERE user_id = ? ORDER BY created_at ASC', [userId]);
    return rows;
  },

  async create(userId, name) {
    const [result] = await pool.query(
      'INSERT INTO `groups` (user_id, name) VALUES (?, ?)',
      [userId, name]
    );
    return result.insertId;
  },

  async update(id, userId, name) {
    await pool.query('UPDATE `groups` SET name = ? WHERE id = ? AND user_id = ?', [name, id, userId]);
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM `groups` WHERE id = ? AND user_id = ?', [id, userId]);
  }
};

module.exports = Group;