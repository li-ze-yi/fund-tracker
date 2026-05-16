const pool = require('../config/database');

const Feedback = {
  async create({ userId, content, screenshotUrl }) {
    const [result] = await pool.query(
      'INSERT INTO feedbacks (user_id, content, screenshot_url) VALUES (?, ?, ?)',
      [userId, content, screenshotUrl || null]
    );
    return result.insertId;
  },

  async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }
};

module.exports = Feedback;