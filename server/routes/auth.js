const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

// 登录限流：10 次 / 15 分钟，防止暴力破解
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '登录尝试过于频繁，请 15 分钟后再试' }
});

// 注册限流：5 次 / 1 小时，防止批量注册
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '注册尝试过于频繁，请 1 小时后再试' }
});

router.post('/register', registerLimiter, ctrl.register);
router.post('/login', loginLimiter, ctrl.login);
router.get('/me', authenticate, ctrl.me);

module.exports = router;