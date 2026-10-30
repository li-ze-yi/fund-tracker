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
    // 防御：refreshFrequency 仅接受 5-300 整数，非法值回退 30（控制器已做 400 校验，这里兜底其他调用方）
    const freqNum = Number(refreshFrequency);
    const safeFrequency = Number.isInteger(freqNum) && freqNum >= 5 && freqNum <= 300 ? freqNum : 30;
    let overridesJson;
    let effectiveMethod = valuationMethod;
    if (valuationOverrides === undefined || valuationMethod === undefined) {
      // 未传估值覆盖/估值方法时保留库中已有值（区别于显式传 null 意图清空）
      // 避免仅更新刷新频率时误清空单基金覆盖或重置全局估值方法
      const existing = await this.findByUserId(userId);
      if (valuationOverrides === undefined) {
        overridesJson = existing && existing.valuation_overrides ? JSON.stringify(existing.valuation_overrides) : null;
      } else {
        overridesJson = valuationOverrides ? JSON.stringify(valuationOverrides) : null;
      }
      if (valuationMethod === undefined) {
        effectiveMethod = existing && existing.valuation_method ? existing.valuation_method : 'holdings';
      }
    } else {
      overridesJson = valuationOverrides ? JSON.stringify(valuationOverrides) : null;
    }
    await pool.query(
      `INSERT INTO user_settings (user_id, refresh_frequency, valuation_method, valuation_overrides) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE refresh_frequency = VALUES(refresh_frequency), valuation_method = VALUES(valuation_method), valuation_overrides = VALUES(valuation_overrides)`,
      [userId, safeFrequency, effectiveMethod || 'holdings', overridesJson]
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