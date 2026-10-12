const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const os = require('os');
const User = require('../models/user');
const UserSetting = require('../models/userSetting');
const Fund = require('../models/fund');
const fundService = require('../services/fundService');
const globalCache = require('../services/globalCache');
const { getMetrics } = require('../services/requestMetrics');

exports.dashboard = async (req, res, next) => {
  try {
    const [userStats, fundStats, transactionStats, holdingStats, holdingUserStats] = await Promise.all([
      (async () => {
        const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
        const [todayRows] = await pool.query(
          "SELECT COUNT(*) AS today_new FROM users WHERE DATE(created_at) = CURDATE()"
        );
        const [activeRows] = await pool.query(
          'SELECT COUNT(*) AS active_count FROM users WHERE last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
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
      .filter(f => f[0] && f[2])
      .map(f => [f[0], f[2], f[3] || '未知']);

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
      const flatValues = batch.flat();
      const [result] = await pool.query(
        `INSERT INTO funds (code, name, type) VALUES ${placeholders} ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type)`,
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
    // stats 保持跨实例聚合：Redis 模式读 Redis 全局计数 / 无 Redis 回退本实例
    const stats = await globalCache.getStats();
    // entries 按当前激活后端（Redis 或内存）枚举真实缓存条目
    const limit = parseInt(req.query.limit, 10) || 200;
    const keyword = (req.query.keyword || '').trim();
    const entries = await globalCache.listEntries({ limit, keyword });
    // Redis 多实例下 stats.size 原本只看本进程内存(恒为0)，这里覆盖为真实条目数，
    // 保证"缓存条目的数量"字段在 Redis 模式下也正确（原始字段名不变）。
    stats.size = await globalCache.countEntries();
    // 过期清理数量直接映射 Redis 自统计的 expired_keys（Redis 用 TTL 自删，应用侧无法精确累计）；
    // 附加 evictedKeys 供区分"内存淘汰"。非 Redis 模式保持应用侧 evictions 计数。
    const redisExpiry = await globalCache.getRedisExpiryStats();
    if (redisExpiry) {
      stats.evictions = redisExpiry.expiredKeys;
      stats.expiredKeys = redisExpiry.expiredKeys;
      stats.evictedKeys = redisExpiry.evictedKeys;
    }
    // 按缓存类型聚合条目数，便于观察各类型缓存规模
    const typeBreakdown = {};
    for (const e of entries) {
      typeBreakdown[e.type] = (typeBreakdown[e.type] || 0) + 1;
    }
    res.json({ stats, entries, typeBreakdown, recentMisses: stats.recentMisses || [] });
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
    const result = await globalCache.peekEntry(key);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.cacheClear = async (req, res, next) => {
  try {
    const { key } = req.body;
    if (key) {
      // 作用于当前激活后端（Redis 可用时同步删除 Redis 与本地镜像）
      await globalCache.delete(key);
      res.json({ message: `缓存key "${key}" 已清除` });
    } else {
      // 仅清除缓存条目列表，保留命中率等统计信息
      globalCache.clearEntries();
      res.json({ message: '全部缓存条目已清除（统计信息保留）' });
    }
  } catch (err) {
    next(err);
  }
};

// 反馈管理
exports.listFeedbacks = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const _page = parseInt(page) || 1;
    const _pageSize = parseInt(pageSize) || 20;
    const offset = (_page - 1) * _pageSize;

    let where = '';
    const params = [];
    if (keyword) {
      where = 'WHERE fb.content LIKE ? OR u.username LIKE ?';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM feedbacks fb LEFT JOIN users u ON fb.user_id = u.id ${where}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT fb.*, u.username FROM feedbacks fb LEFT JOIN users u ON fb.user_id = u.id ${where} ORDER BY fb.created_at DESC LIMIT ? OFFSET ?`,
      [...params, _pageSize, offset]
    );

    res.json({ list: rows, total });
  } catch (err) {
    next(err);
  }
};

exports.deleteFeedback = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM feedbacks WHERE id = ?', [req.params.id]);
    res.json({ message: '反馈已删除' });
  } catch (err) {
    next(err);
  }
};

// 数据库连接池健康检查（只读池内部状态；兼容 mysql2 v2 数组与 v3 Denque 队列）
exports.dbHealth = async (req, res, next) => {
  try {
    const inner = pool.pool || pool; // mysql2/promise 的底层池对象
    const len = (d) => (d && typeof d.length === 'number') ? d.length : 0;

    // 连接池水位
    const allConnections = len(inner._allConnections);
    const freeConnections = len(inner._freeConnections);
    const activeConnections = allConnections - freeConnections;
    // mysql2 v3 排队字段为 _connectionQueue；v2 为 _queue（只会有其一生效）
    const queueLen = Math.max(len(inner._connectionQueue), len(inner._queue));

    // 额外查询 MySQL 当前线程占用（验证是否真的占满）
    let mysqlThreads = null;
    try {
      const [rows] = await pool.query('SHOW STATUS LIKE "Threads_connected"');
      mysqlThreads = rows[0].Value;
    } catch (e) {
      // 不影响主响应，只丢警告
    }

    const configLimit = pool.CONNECTION_LIMIT || 0;

    res.json({
      connectionPool: {
        configuredLimit: configLimit,
        allConnections,
        freeConnections,
        activeConnections,
        queuedRequests: queueLen,
        // 水位百分比：当前活跃连接占比
        utilizationPercent: configLimit > 0 ? Math.round((activeConnections / configLimit) * 1000) / 10 : 0,
      },
      mysqlThreadsConnected: mysqlThreads ? parseInt(mysqlThreads, 10) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// 交易趋势：按日统计近 N 天的交易额、买入/卖出笔数
exports.transactionTrend = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    // 预计算起始日期（YYYY-MM-DD），避免 INTERVAL ? DAY 参数化不生效
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date,
              COALESCE(SUM(amount), 0) AS total_amount,
              SUM(type = 'buy') AS buy_count,
              SUM(type = 'sell') AS sell_count
       FROM transactions
       WHERE transaction_date >= ?
       GROUP BY DATE_FORMAT(transaction_date, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startDate]
    );
    // 补全无数据的日期（近 days 天）
    const map = new Map(rows.map((r) => [r.date, r]));
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const r = map.get(key);
      result.push({
        date: key,
        totalAmount: r ? parseFloat(r.total_amount) : 0,
        buyCount: r ? parseInt(r.buy_count, 10) : 0,
        sellCount: r ? parseInt(r.sell_count, 10) : 0,
      });
    }
    res.json({ days, list: result });
  } catch (err) {
    next(err);
  }
};

// 用户增长：按日统计近 N 天的新增用户数与累计用户数
exports.userGrowth = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS new_users
       FROM users
       WHERE created_at >= ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startDate]
    );
    // 先拿到 days 天前的累计基数
    const [baseRows] = await pool.query(
      'SELECT COUNT(*) AS base FROM users WHERE created_at < ?',
      [startDate]
    );
    let cumulative = parseInt(baseRows[0].base, 10) || 0;
    const map = new Map(rows.map((r) => [r.date, r.new_users]));
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const newUsers = map.get(key) ? parseInt(map.get(key), 10) : 0;
      cumulative += newUsers;
      result.push({ date: key, newUsers, cumulative });
    }
    res.json({ days, list: result });
  } catch (err) {
    next(err);
  }
};

// 每日活跃用户数（DAU）：按日统计近 N 天的独立登录用户数
exports.dailyActive = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(login_time, '%Y-%m-%d') AS date,
              COUNT(DISTINCT user_id) AS active_users
       FROM user_logins
       WHERE login_time >= ?
       GROUP BY DATE_FORMAT(login_time, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startDate]
    );
    const map = new Map(rows.map((r) => [r.date, r.active_users]));
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, activeUsers: map.get(key) ? parseInt(map.get(key), 10) : 0 });
    }
    res.json({ days, list: result });
  } catch (err) {
    next(err);
  }
};

// 系统监控：服务器信息 + API 统计 + Redis/MySQL 状态
exports.systemMetrics = async (req, res, next) => {
  try {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const serverInfo = {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      uptimeSeconds: Math.floor(process.uptime()),
      cpuCores: os.cpus().length,
      memory: {
        totalMB: Math.round(totalMem / 1024 / 1024),
        freeMB: Math.round(freeMem / 1024 / 1024),
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
      },
      processMemory: {
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      },
    };

    // Redis 状态
    let redisStatus = { enabled: false, available: false };
    try {
      redisStatus.enabled = globalCache._isRedis ? globalCache._isRedis() : false;
      redisStatus.available = globalCache._redisAvailable ? globalCache._redisAvailable() : false;
    } catch (e) {
      redisStatus.error = e.message;
    }

    // MySQL 状态（执行一次轻量查询）
    let mysqlStatus = { available: false };
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      mysqlStatus.available = rows[0].ok === 1;
    } catch (e) {
      mysqlStatus.error = e.message;
    }

    // API 统计（Redis 可用时为跨实例聚合值）
    const apiStats = await getMetrics();

    res.json({ serverInfo, redisStatus, mysqlStatus, apiStats });
  } catch (err) {
    next(err);
  }
};

