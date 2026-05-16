const pool = require('../config/database');

const InvestmentPlan = {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT p.*, f.name as fund_name
       FROM investment_plans p
       JOIN funds f ON p.fund_code = f.code
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async create({ userId, fundCode, amount, frequency, dayOfWeek, dayOfMonth, nextRunDate }) {
    const [result] = await pool.query(
      `INSERT INTO investment_plans (user_id, fund_code, amount, frequency, day_of_week, day_of_month, status, next_run_date)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [userId, fundCode, amount, frequency, dayOfWeek || null, dayOfMonth || null, nextRunDate]
    );
    return result.insertId;
  },

  async update(id, userId, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(id, userId);
    await pool.query(`UPDATE investment_plans SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  },

  async updateStatus(id, userId, status) {
    await pool.query(
      'UPDATE investment_plans SET status = ? WHERE id = ? AND user_id = ?',
      [status, id, userId]
    );
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM investment_plans WHERE id = ? AND user_id = ?', [id, userId]);
  },

  async findActiveDueToday() {
    const [rows] = await pool.query(
      `SELECT * FROM investment_plans
       WHERE status = 'active' AND next_run_date <= CURDATE()`
    );
    return rows;
  }
};

module.exports = InvestmentPlan;