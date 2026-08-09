const express = require('express');
const router = express.Router();
const quotes = require('../services/quotes');
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

module.exports = router;
