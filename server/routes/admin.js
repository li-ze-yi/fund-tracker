const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/auth');

router.use(authenticate, requireAdmin);

router.get('/dashboard', ctrl.dashboard);
router.get('/users', ctrl.listUsers);
router.post('/users', ctrl.createUser);
router.put('/users/:id/role', ctrl.updateUserRole);
router.put('/users/:id/password', ctrl.resetPassword);
router.delete('/users/:id', ctrl.deleteUser);
router.get('/funds', ctrl.listFunds);
router.post('/funds/sync', ctrl.syncFunds);
router.delete('/funds/:code', ctrl.deleteFund);
router.get('/cache/stats', ctrl.cacheStats);
router.get('/cache/check', ctrl.cacheCheck);
router.post('/cache/clear', ctrl.cacheClear);
router.get('/feedbacks', ctrl.listFeedbacks);
router.delete('/feedbacks/:id', ctrl.deleteFeedback);

module.exports = router;
