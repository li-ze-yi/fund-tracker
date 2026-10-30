const router = require('express').Router();
const ctrl = require('../controllers/fundController');
const { optionalAuth } = require('../middlewares/auth');
const rateLimit = require('express-rate-limit');

// 匿名接口基础限流：60 次/分钟/IP（内存 store，防爬虫/恶意刷外部净值接口）
const anonLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// nav-history 匿名接口入参校验：代码与日期格式白名单，防拼接外部 API URL 的注入面
function validateNavHistory(req, res, next) {
  const { code, startDate, endDate } = req.query;
  if (!/^\d{6}$/.test(String(code || ''))) {
    return res.status(400).json({ message: '基金代码格式不正确（应为6位数字）' });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((startDate && !dateRe.test(startDate)) || (endDate && !dateRe.test(endDate))) {
    return res.status(400).json({ message: '日期格式不正确，应为 YYYY-MM-DD' });
  }
  if (startDate && endDate) {
    if (startDate > endDate) {
      return res.status(400).json({ message: '开始日期不能晚于结束日期' });
    }
    const spanDays = (new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(spanDays) || spanDays > 3 * 365) {
      return res.status(400).json({ message: '日期跨度不能超过 3 年' });
    }
  }
  next();
}

router.get('/search', ctrl.search);
router.get('/all', ctrl.getAll);
router.get('/nav-history', anonLimiter, validateNavHistory, ctrl.getNavHistory);
router.post('/batch', optionalAuth, ctrl.batchGetInfo);
router.get('/:code', optionalAuth, ctrl.getByCode);

module.exports = router;