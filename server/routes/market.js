const express = require('express');
const router = express.Router();
const quotes = require('../services/quotes');
const holidayService = require('../services/holidayService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Market');

// GET /api/market/rotation —— 行业轮动仪表盘聚合数据
// 数据经 globalCache(type:'realtime') 缓存，刷新节奏与基金实时缓存一致（盘中 28s）
router.get('/rotation', async (req, res) => {
  try {
    const data = await quotes.getRotationData();
    res.json(data);
  } catch (e) {
    logger.error(`行业轮动数据异常: ${e.message}`);
    res.status(502).json({ error: 'Failed to fetch rotation data', message: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/market/status —— 多市场开市状态（前端据此决定轮询节奏）
// 所有时间均按服务器本地时间（北京时间）计算
// ═══════════════════════════════════════════

const pad2 = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 当前本地时间距午夜的分钟数（0-1439）
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// 港股交易时段判定（北京时间，仅做工作日判断，忽略港股自身节假日）
// 交易时段：09:30-12:00、13:00-16:00
function getHkStatus(now, today) {
  const min = minutesSinceMidnight(now);
  if (holidayService.isWeekend(today)) {
    return { isMarketOpen: false, reason: 'weekend' };
  }
  if ((min >= 570 && min < 720) || (min >= 780 && min < 960)) {
    return { isMarketOpen: true, reason: 'trading' };
  }
  if (min >= 720 && min < 780) {
    return { isMarketOpen: false, reason: 'lunch' };
  }
  return { isMarketOpen: false, reason: 'closed' };
}

// 美股交易时段判定（仅时间窗口，简化处理：忽略美股节假日与周末）
// 夏令时（约 4-10 月，month 3-9）北京时间 21:30-04:00；冬令时 22:30-05:00
// 隔夜窗口需跨日：前一天 21:30/22:30 开盘 → 次日 04:00/05:00 收盘
function getUsStatus(now) {
  const month = now.getMonth(); // 0-11
  const isDst = month >= 3 && month <= 9; // 粗略按月份近似夏令时
  const openMin = isDst ? 21 * 60 + 30 : 22 * 60 + 30; // 21:30 / 22:30
  const closeMin = isDst ? 4 * 60 : 5 * 60;             // 04:00 / 05:00（次日）
  const min = minutesSinceMidnight(now);
  // 当前分钟落在 [0, closeMin)（隔夜前段）或 [openMin, 1440)（隔夜后段）即为开市
  if (min < closeMin || min >= openMin) {
    return { isMarketOpen: true, reason: 'trading' };
  }
  return { isMarketOpen: false, reason: 'closed' };
}

router.get('/status', async (req, res) => {
  try {
    const now = new Date();
    const today = localDateStr(now);
    const min = minutesSinceMidnight(now);

    // A股：以 isTradingDay 为准（权威的全天休市信号），未开市时区分周末/法定节假日
    let aShare;
    const isTradingDay = await holidayService.isTradingDay(today);
    if (!isTradingDay) {
      aShare = {
        isMarketOpen: false,
        reason: holidayService.isWeekend(today) ? 'weekend' : 'holiday'
      };
    } else {
      // 交易时段：09:30-11:30、13:00-15:00
      if ((min >= 570 && min < 690) || (min >= 780 && min < 900)) {
        aShare = { isMarketOpen: true, reason: 'trading' };
      } else if (min >= 900 && min < 930) {
        // 收盘后窗口 15:00-15:30 → 视为开市（今日净值公布前的估算窗口）
        aShare = { isMarketOpen: true, reason: 'post_market' };
      } else if (min >= 690 && min < 780) {
        aShare = { isMarketOpen: false, reason: 'lunch' };
      } else {
        aShare = { isMarketOpen: false, reason: 'closed' };
      }
    }

    const hk = getHkStatus(now, today);
    const us = getUsStatus(now);

    // 任一市场开市（含 A股收盘后窗口）即视为整体开市
    const isMarketOpen = aShare.isMarketOpen || hk.isMarketOpen || us.isMarketOpen;

    // ISO 格式本地时间
    const updatedAt = `${today}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    logger.info(`市场状态: isMarketOpen=${isMarketOpen}, aShare=${aShare.reason}, hk=${hk.reason}, us=${us.reason}`);

    res.json({ isMarketOpen, markets: { aShare, hk, us }, updatedAt });
  } catch (e) {
    logger.error(`市场状态查询失败: ${e.message}`);
    res.status(500).json({ error: 'Failed to get market status', message: e.message });
  }
});

module.exports = router;
