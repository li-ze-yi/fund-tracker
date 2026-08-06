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
    // ★ 乐观锁：只有 status='pending' 时才能更新为 confirmed，防止并发重复结算
    const [result] = await pool.query(
      `UPDATE transactions SET status = 'confirmed', shares = ?, price = ?, amount = ? WHERE id = ? AND user_id = ? AND status = 'pending'`,
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
  },

  /**
   * 查询所有有 pending 订单的用户（去重）
   * 用于独立结算兜底任务遍历所有 pending 订单的用户
   * @returns {Promise<Array<number>>} user_id 数组
   */
  async findAllPendingUsers() {
    const [rows] = await pool.query(
      `SELECT DISTINCT user_id FROM transactions WHERE status = 'pending'`
    );
    return rows.map(r => r.user_id);
  },

  /**
   * 物理删除超过指定天数未结算的 pending 订单
   * 用于清除长期异常堆积的 pending 订单（如净值长期未发布）
   * @param {number} days 阈值天数，默认 30 天
   * @returns {Promise<Array<object>>} 被删除的订单详情数组（含 id/user_id/fund_code/amount/shares/transaction_date/created_at）
   */
  async deleteStalePending(days = 30) {
    // 先查询待删除的订单详情，供日志记录
    const [pendingRows] = await pool.query(
      `SELECT id, user_id, fund_code, amount, shares, transaction_date, created_at
       FROM transactions
       WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY created_at ASC`,
      [days]
    );

    if (!pendingRows.length) return [];

    // 物理删除这些订单
    const ids = pendingRows.map(r => r.id);
    await pool.query(
      `DELETE FROM transactions WHERE id IN (?)`,
      [ids]
    );

    return pendingRows;
  }
};

module.exports = Transaction;
