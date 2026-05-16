const pool = require('../config/database');

const Favorite = {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT fav.*, f.name as fund_name, f.code as fund_code
       FROM favorites fav
       JOIN funds f ON fav.fund_code = f.code
       WHERE fav.user_id = ?
       ORDER BY fav.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async add(userId, fundCode) {
    await pool.query(
      'INSERT IGNORE INTO favorites (user_id, fund_code) VALUES (?, ?)',
      [userId, fundCode]
    );
  },

  async remove(userId, fundCode) {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = ? AND fund_code = ?',
      [userId, fundCode]
    );
  },

  async isFavorited(userId, fundCode) {
    const [rows] = await pool.query(
      'SELECT 1 FROM favorites WHERE user_id = ? AND fund_code = ?',
      [userId, fundCode]
    );
    return rows.length > 0;
  }
};

module.exports = Favorite;