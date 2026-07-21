const router = require('express').Router();
const ctrl = require('../controllers/announcementController');
const { authenticate, requireAdmin, optionalAuth } = require('../middlewares/auth');

// 公开接口 - 无需管理员权限
router.get('/active/popup', optionalAuth, ctrl.getActivePopup);
router.get('/active/banner', optionalAuth, ctrl.getActiveBanner);

// 管理后台接口 - 需要管理员权限
router.use(authenticate, requireAdmin);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);
router.post('/:id/republish', ctrl.republish);

module.exports = router;