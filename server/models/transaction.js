const pool = require('../config/database');

const Transaction = {
  async create({ userId, fundCode, type, shares, price, amount, fee, transactionDate, note, status }) {
    const [result] = await pool.query(
      `INSERT INTO transactions (user_id, fund_code, type, shares, price, amount, fee, transaction_date, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, fundCode, type, shares, price, amount, fee || 0, transactionDate, note || null, status || 'confirmed']
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

  async findPendingByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT t.*, f.name as fund_name
       FROM transactions t
       JOIN funds f ON t.fund_code = f.code
       WHERE t.user_id = ? AND t.status = 'pending'
       ORDER BY t.transaction_date ASC, t.created_at ASC`,
      [userId]
    );
    return rows;
  },

  async updateToConfirmed(id, userId, { shares, price, amount }) {
    const [result] = await pool.query(
      `UPDATE transactions SET status = 'confirmed', shares = ?, price = ?, amount = ? WHERE id = ? AND user_id = ?`,
      [shares, price, amount, id, userId]
    );
    return result.affectedRows > 0;
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
