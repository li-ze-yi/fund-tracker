const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const UserSetting = require('../models/userSetting');
const Fund = require('../models/fund');
const fundService = require('../services/fundService');
const globalCache = require('../services/globalCache');

exports.dashboard = async (req, res, next) => {
  try {
    const [userStats, fundStats, transactionStats, holdingStats, holdingUserStats] = await Promise.all([
      (async () => {
        const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
        const [todayRows] = await pool.query(
          "SELECT COUNT(*) AS today_new FROM users WHERE DATE(created_at) = CURDATE()"
        );
        const [activeRows] = await pool.query(
          "SELECT COUNT(DISTINCT user_id) AS active_count FROM transactions WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
        );
        return {
          total: totalRows[0].total,
          todayNew: todayRows[0].today_new,
          activeCount: activeRows[0].active_count
        };
      })(),
      (async () => {
        const total = await Fund.count();
        const byType = await Fund.countByType();
        return { total, byType };
      })(),
      (async () => {
        const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM transactions');
        const [buyRows] = await pool.query("SELECT COUNT(*) AS buy_count FROM transactions WHERE type = 'buy'");
        const [sellRows] = await pool.query("SELECT COUNT(*) AS sell_count FROM transactions WHERE type = 'sell'");
        const [amountRows] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total_amount FROM transactions');
        return {
          total: totalRows[0].total,
          buyCount: buyRows[0].buy_count,
          sellCount: sellRows[0].sell_count,
          totalAmount: parseFloat(amountRows[0].total_amount)
        };
      })(),
      (async () => {
        const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM holdings');
        const [avgRows] = await pool.query(
          'SELECT COALESCE(AVG(cnt), 0) AS avg_per_user FROM (SELECT user_id, COUNT(*) AS cnt FROM holdings GROUP BY user_id) t'
        );
        return {
          total: totalRows[0].total,
          avgPerUser: parseFloat(avgRows[0].avg_per_user)
        };
      })(),
      (async () => {
        const [rows] = await pool.query(
          `SELECT h.fund_code, f.name AS fund_name, COUNT(DISTINCT h.user_id) AS user_count
           FROM holdings h
           LEFT JOIN funds f ON h.fund_code = f.code
           GROUP BY h.fund_code, f.name
           ORDER BY user_count DESC
           LIMIT 20`
        );
        return rows;
      })()
    ]);
    res.json({ userStats, fundStats, transactionStats, holdingStats, holdingUserStats });
  } catch (err) {
    next(err);
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    const result = await User.findAll({ page: Number(page), pageSize: Number(pageSize), keyword });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }
    await User.updateRole(id, role);
    res.json({ message: '角色更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username || username.trim() === '') {
      return res.status(400).json({ message: '用户名不能为空' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }
    const existing = await User.findByUsername(username);
    if (existing) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.create(username, hashedPassword);
    await UserSetting.upsert(userId, 30);
    await User.updateRole(userId, role);
    res.json({ message: '用户创建成功', id: userId });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
    res.json({ message: '密码重置成功' });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) {
      return res.status(400).json({ message: '不能删除自己' });
    }
    await User.deleteById(id);
    res.json({ message: '用户删除成功' });
  } catch (err) {
    next(err);
  }
};

exports.listFunds = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', type = '' } = req.query;
    const result = await Fund.findAll({ page: Number(page), pageSize: Number(pageSize), keyword, type });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.syncFunds = async (req, res, next) => {
  try {
    const funds = await fundService.getAllFunds();
    const values = funds
      .filter(f => f[0] && f[1])
      .map(f => [f[0], f[1], f[2] || '未知']);

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const flatValues = batch.flat();
      const [result] = await pool.query(
        `INSERT IGNORE INTO funds (code, name, type) VALUES ${placeholders}`,
        flatValues
      );
      inserted += result.affectedRows;
    }

    res.json({ total: values.length, inserted });
  } catch (err) {
    next(err);
  }
};

exports.deleteFund = async (req, res, next) => {
  try {
    const { code } = req.params;
    await Fund.deleteByCode(code);
    res.json({ message: '基金删除成功' });
  } catch (err) {
    next(err);
  }
};

exports.cacheStats = async (req, res, next) => {
  try {
    const stats = globalCache.getStats();
    const entries = [];
    for (const [key, value] of globalCache.cache.entries()) {
      const ttl = globalCache.getTTL(value.type);
      const age = Date.now() - value.timestamp;
      const remaining = Math.max(0, ttl - age);
      entries.push({
        key,
        type: value.type,
        ageSeconds: Math.round(age / 1000),
        ttlSeconds: Math.round(ttl / 1000),
        remainingSeconds: Math.round(remaining / 1000),
        expired: remaining <= 0,
      });
    }
    entries.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
    res.json({ stats, entries });
  } catch (err) {
    next(err);
  }
};

exports.cacheCheck = async (req, res, next) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ message: '请提供缓存key参数' });
    }
    const cached = globalCache.cache.get(key);
    if (!cached) {
      return res.json({ hit: false, key });
    }
    const ttl = globalCache.getTTL(cached.type);
    const age = Date.now() - cached.timestamp;
    const remaining = Math.max(0, ttl - age);
    res.json({
      hit: true,
      key,
      type: cached.type,
      ageSeconds: Math.round(age / 1000),
      ttlSeconds: Math.round(ttl / 1000),
      remainingSeconds: Math.round(remaining / 1000),
      expired: remaining <= 0,
    });
  } catch (err) {
    next(err);
  }
};

exports.cacheClear = async (req, res, next) => {
  try {
    const { key } = req.body;
    if (key) {
      globalCache.cache.delete(key);
      res.json({ message: `缓存key "${key}" 已清除` });
    } else {
      globalCache.clear();
      res.json({ message: '全部缓存已清除' });
    }
  } catch (err) {
    next(err);
  }
};
