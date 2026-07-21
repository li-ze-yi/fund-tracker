const pool = require('../config/database');

const UserSetting = {
  async findByUserId(userId) {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    const row = rows[0] || null;
    if (row) {
      // 解析 JSON 字段
      try {
        row.valuation_overrides = row.valuation_overrides ? JSON.parse(row.valuation_overrides) : {};
      } catch {
        row.valuation_overrides = {};
      }
    }
    return row;
  },

  async upsert(userId, refreshFrequency, valuationMethod, valuationOverrides) {
    const overridesJson = valuationOverrides ? JSON.stringify(valuationOverrides) : null;
    await pool.query(
      `INSERT INTO user_settings (user_id, refresh_frequency, valuation_method, valuation_overrides) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE refresh_frequency = VALUES(refresh_frequency), valuation_method = VALUES(valuation_method), valuation_overrides = VALUES(valuation_overrides)`,
      [userId, refreshFrequency || 30, valuationMethod || 'tencent', overridesJson]
    );
  },

  async updateValuationMethod(userId, method) {
    await pool.query(
      `INSERT INTO user_settings (user_id, valuation_method) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valuation_method = VALUES(valuation_method)`,
      [userId, method]
    );
  },

  async updateFundOverride(userId, fundCode, method) {
    // 先读取当前 overrides
    const current = await this.findByUserId(userId);
    const overrides = (current && current.valuation_overrides) ? current.valuation_overrides : {};

    if (method === null || method === '') {
      // 删除单个基金的覆盖设置，恢复全局默认
      delete overrides[fundCode];
    } else {
      overrides[fundCode] = method;
    }

    await pool.query(
      `INSERT INTO user_settings (user_id, valuation_overrides) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valuation_overrides = VALUES(valuation_overrides)`,
      [userId, JSON.stringify(overrides)]
    );
    return overrides;
  },
};

module.exports = UserSetting;