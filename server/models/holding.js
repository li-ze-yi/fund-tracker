const pool = require('../config/database');

const Holding = {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT h.id, h.user_id, h.fund_code, h.group_id, h.shares, h.cost_price,
              h.confirmed_nav, h.confirmed_nav_date, h.total_cost, h.created_at, h.updated_at,
              f.name as fund_name, f.type as fund_type
       FROM holdings h
       JOIN funds f ON h.fund_code = f.code
       WHERE h.user_id = ?
       ORDER BY h.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async findByUserAndFund(userId, fundCode) {
    const [rows] = await pool.query(
      'SELECT * FROM holdings WHERE user_id = ? AND fund_code = ?',
      [userId, fundCode]
    );
    return rows[0] || null;
  },

  async create({ userId, fundCode, shares, costPrice, groupId, confirmedNav, confirmedNavDate, totalCost }) {
    const [result] = await pool.query(
      `INSERT INTO holdings (user_id, fund_code, shares, cost_price, group_id, confirmed_nav, confirmed_nav_date, total_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, fundCode, shares, costPrice, groupId || null, confirmedNav || null, confirmedNavDate || null, totalCost || 0]
    );
    return result.insertId;
  },

  async update(id, userId, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      const columnMap = {
        shares: 'shares',
        cost_price: 'cost_price',
        costPrice: 'cost_price',
        group_id: 'group_id',
        groupId: 'group_id',
        confirmed_nav: 'confirmed_nav',
        confirmedNav: 'confirmed_nav',
        confirmed_nav_date: 'confirmed_nav_date',
        confirmedNavDate: 'confirmed_nav_date',
        total_cost: 'total_cost',
        totalCost: 'total_cost'
      };
      const col = columnMap[key] || key;
      fields.push(`${col} = ?`);
      values.push(val);
    }
    values.push(id, userId);
    await pool.query(`UPDATE holdings SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM holdings WHERE id = ? AND user_id = ?', [id, userId]);
  },

  async findByGroupId(groupId, userId) {
    const [rows] = await pool.query(
      'SELECT * FROM holdings WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    return rows;
  }
};

module.exports = Holding;
