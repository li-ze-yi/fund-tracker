const pool = require('../config/database');

const Transaction = {
  async create({ userId, fundCode, type, shares, price, amount, fee, transactionDate, note }) {
    const [result] = await pool.query(
      `INSERT INTO transactions (user_id, fund_code, type, shares, price, amount, fee, transaction_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, fundCode, type, shares, price, amount, fee || 0, transactionDate, note || null]
    );
    return result.insertId;
  },

  async findByUserAndFund(userId, fundCode) {
    const [rows] = await pool.query(
      `SELECT t.*, f.name as fund_name
       FROM transactions t
       JOIN funds f ON t.fund_code = f.code
       WHERE t.user_id = ? AND t.fund_code = ?
       ORDER BY t.transaction_date DESC, t.created_at DESC`,
      [userId, fundCode]
    );
    return rows;
  },

  async findByUserId(userId, limit = 50) {
    const [rows] = await pool.query(
      `SELECT t.*, f.name as fund_name
       FROM transactions t
       JOIN funds f ON t.fund_code = f.code
       WHERE t.user_id = ?
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  async deleteById(id, userId) {
    const [result] = await pool.query(
      `DELETE FROM transactions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = Transaction;