const pool = require('../config/database');

const DailyProfit = {
  async findByUserIdAndDate(userId, date) {
    const [rows] = await pool.query(
      'SELECT * FROM daily_profits WHERE user_id = ? AND date = ?',
      [userId, date]
    );
    return rows[0] || null;
  },

  async findLatestByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM daily_profits WHERE user_id = ? ORDER BY date DESC LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async findYesterdayByUserId(userId) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const [rows] = await pool.query(
      'SELECT * FROM daily_profits WHERE user_id = ? AND date = ?',
      [userId, dateStr]
    );
    return rows[0] || null;
  },

  async upsert(data) {
    const {
      userId,
      date,
      profit,
      returnRate,
      totalInvestment,
      marketValue,
      details
    } = data;

    const [result] = await pool.query(
      `INSERT INTO daily_profits (user_id, date, profit, return_rate, total_investment, market_value, details, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         profit = ?,
         return_rate = ?,
         total_investment = ?,
         market_value = ?,
         details = ?,
         updated_at = NOW()`,
      [
        userId, date, profit, returnRate, totalInvestment, marketValue,
        JSON.stringify(details),
        profit, returnRate, totalInvestment, marketValue,
        JSON.stringify(details)
      ]
    );

    return result;
  },

  async findByDateRange(userId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM daily_profits
       WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );
    return rows;
  }
};

module.exports = DailyProfit;
