const pool = require('../config/database');
const DailyProfit = require('../models/dailyProfit');

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
    const { year, month } = req.query;

    let rows;
    if (year && month) {
      // 按指定年月查询
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      // 计算月末
      const endOfMonth = new Date(Number(year), Number(month), 0);
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;
      [rows] = await pool.query(
        `SELECT DATE(date) as date,
                profit,
                return_rate
         FROM daily_profits
         WHERE user_id = ?
           AND date BETWEEN ? AND ?
         ORDER BY date ASC`,
        [userId, startDate, endDate]
      );
    } else {
      // 保持现有最近 30 天逻辑
      [rows] = await pool.query(
        `SELECT DATE(date) as date,
                profit,
                return_rate
         FROM daily_profits
         WHERE user_id = ?
           AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ORDER BY date ASC`,
        [userId]
      );
    }

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
    const { year } = req.query;

    let rows;
    if (year) {
      // 按指定年份查询所有月度数据
      [rows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m') as month,
                SUM(profit) as profit,
                CASE 
                  WHEN CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4)) > 0 
                  THEN (SUM(profit) / CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4))) * 100 
                  ELSE 0 
                END as monthly_return_rate
         FROM daily_profits
         WHERE user_id = ?
           AND YEAR(date) = ?
         GROUP BY DATE_FORMAT(date, '%Y-%m')
         ORDER BY month ASC`,
        [userId, Number(year)]
      );
    } else {
      // 保持现有最近 12 个月逻辑
      [rows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m') as month,
                SUM(profit) as profit,
                CASE 
                  WHEN CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4)) > 0 
                  THEN (SUM(profit) / CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4))) * 100 
                  ELSE 0 
                END as monthly_return_rate
         FROM daily_profits
         WHERE user_id = ?
           AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY DATE_FORMAT(date, '%Y-%m')
         ORDER BY month ASC`,
        [userId]
      );
    }

    if (rows && rows.length > 0) {
      let accumulatedProfit = 0;
      const result = rows.map(row => {
        const profit = parseFloat(row.profit);
        accumulatedProfit += profit;
        return {
          month: row.month,
          profit: Math.round(profit * 100) / 100,
          return_rate: Math.round(parseFloat(row.monthly_return_rate) * 100) / 100,
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
              CASE 
                WHEN CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4)) > 0 
                THEN (SUM(profit) / CAST(SUBSTRING_INDEX(GROUP_CONCAT(total_investment ORDER BY date ASC), ',', 1) AS DECIMAL(18,4))) * 100 
                ELSE 0 
              END as yearly_return_rate
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
          return_rate: Math.round(parseFloat(row.yearly_return_rate) * 100) / 100,
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
 * 基金收益明细
 * 从 daily_profits.details JSON 聚合每只基金在指定周期的收益
 * 返回格式: [{ fund_code, fund_name, profit, return_rate, market_value, total_cost }]
 */
exports.fundBreakdown = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { date, year, month } = req.query;

    let startDate, endDate;

    if (date) {
      // 按单日查询
      startDate = date;
      endDate = date;
    } else if (year && month) {
      // 按月查询
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endOfMonth = new Date(Number(year), Number(month), 0);
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;
    } else if (year) {
      // 按年查询
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    } else {
      return res.status(400).json({ error: '需要提供 date、year+month 或 year 参数' });
    }

    const rows = await DailyProfit.findDetailsByDateRange(userId, startDate, endDate);

    if (!rows || rows.length === 0) {
      return res.json([]);
    }

    // 按基金代码聚合
    const fundMap = new Map();

    for (const row of rows) {
      let details = row.details;
      // details 可能是字符串或已解析对象
      if (typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch {
          continue; // JSON 解析失败，跳过
        }
      }
      if (!details || !details.funds || !Array.isArray(details.funds)) {
        continue; // 无 funds 数据，跳过
      }

      for (const fund of details.funds) {
        const code = fund.fund_code;
        if (!code) continue;

        const dailyProfit = parseFloat(fund.daily_profit) || 0;

        if (!fundMap.has(code)) {
          fundMap.set(code, {
            fund_code: code,
            fund_name: fund.fund_name || '',
            profit: 0,
            market_value: parseFloat(fund.market_value) || 0,
            total_cost: parseFloat(fund.total_cost) || 0,
          });
        }

        const entry = fundMap.get(code);
        entry.profit += dailyProfit;
        // 取最后一条记录的值
        entry.fund_name = fund.fund_name || entry.fund_name;
        entry.market_value = parseFloat(fund.market_value) || entry.market_value;
        entry.total_cost = parseFloat(fund.total_cost) || entry.total_cost;
      }
    }

    // 计算收益率并格式化
    const result = Array.from(fundMap.values()).map(entry => {
      const profit = Math.round(entry.profit * 100) / 100;
      const totalCost = entry.total_cost;
      const returnRate = totalCost > 0
        ? Math.round((profit / totalCost) * 10000) / 100
        : 0;
      return {
        fund_code: entry.fund_code,
        fund_name: entry.fund_name,
        profit,
        return_rate: returnRate,
        market_value: Math.round(entry.market_value * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
      };
    });

    // 按 profit 降序排列
    result.sort((a, b) => b.profit - a.profit);

    return res.json(result);
  } catch (err) {
    next(err);
  }
};