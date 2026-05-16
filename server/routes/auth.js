const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);

module.exports = router;