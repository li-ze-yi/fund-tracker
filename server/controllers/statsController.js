const pool = require('../config/database');

/**
 * 获取用户总投入成本
 */
async function getTotalInvestment(userId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(shares * cost_price), 0) as total_cost FROM holdings WHERE user_id = ?`,
    [userId]
  );
  return parseFloat(rows[0].total_cost) || 0;
}

/**
 * 日收益统计
 * 返回格式: [{ date, profit, return_rate }]
 */
exports.daily = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 从 daily_profits 表查询真实数据
    const [rows] = await pool.query(
      `SELECT DATE(date) as date,
              profit,
              return_rate
       FROM daily_profits
       WHERE user_id = ?
         AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ORDER BY date ASC`,
      [userId]
    );

    if (rows && rows.length > 0) {
      const result = rows.map(row => ({
        date: row.date instanceof Date
          ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
          : String(row.date).slice(0, 10),
        profit: parseFloat(row.profit),
        return_rate: parseFloat(row.return_rate)
      }));
      return res.json(result);
    }

    // 无数据时返回空数组（不生成随机数据）
    return res.json([]);
  } catch (err) {
    next(err);
  }
};

/**
 * 月收益统计
 * 返回格式: [{ month, profit, return_rate, accumulated_profit }]
 */
exports.monthly = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 从 daily_profits 表聚合月度数据
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') as month,
              SUM(profit) as profit,
              AVG(return_rate) as avg_return_rate
       FROM daily_profits
       WHERE user_id = ?
         AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC`,
      [userId]
    );

    if (rows && rows.length > 0) {
      let accumulatedProfit = 0;
      const result = rows.map(row => {
        const profit = parseFloat(row.profit);
        accumulatedProfit += profit;
        return {
          month: row.month,
          profit: Math.round(profit * 100) / 100,
          return_rate: Math.round(parseFloat(row.avg_return_rate) * 10000) / 100,
          accumulated_profit: Math.round(accumulatedProfit * 100) / 100
        };
      });
      return res.json(result);
    }

    // 无数据时返回空数组
    return res.json([]);
  } catch (err) {
    next(err);
  }
};

/**
 * 年收益统计
 * 返回格式: [{ year, profit, return_rate, accumulated_profit }]
 */
exports.yearly = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 从 daily_profits 表聚合年度数据
    const [rows] = await pool.query(
      `SELECT YEAR(date) as year,
              SUM(profit) as profit,
              AVG(return_rate) as avg_return_rate
       FROM daily_profits
       WHERE user_id = ?
       GROUP BY YEAR(date)
       ORDER BY year ASC`,
      [userId]
    );

    if (rows && rows.length > 0) {
      let accumulatedProfit = 0;
      const result = rows.map(row => {
        const profit = parseFloat(row.profit);
        accumulatedProfit += profit;
        return {
          year: row.year.toString(),
          profit: Math.round(profit * 100) / 100,
          return_rate: Math.round(parseFloat(row.avg_return_rate) * 10000) / 100,
          accumulated_profit: Math.round(accumulatedProfit * 100) / 100
        };
      });
      return res.json(result);
    }

    // 无数据时返回空数组
    return res.json([]);
  } catch (err) {
    next(err);
  }
};