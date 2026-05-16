const pool = require('../config/database');

const UserSetting = {
  async findByUserId(userId) {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    return rows[0] || null;
  },

  async upsert(userId, refreshFrequency) {
    await pool.query(
      `INSERT INTO user_settings (user_id, refresh_frequency) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE refresh_frequency = VALUES(refresh_frequency)`,
      [userId, refreshFrequency || 30]
    );
  }
};

module.exports = UserSetting;