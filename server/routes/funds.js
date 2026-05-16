const router = require('express').Router();
const ctrl = require('../controllers/fundController');
const { optionalAuth } = require('../middlewares/auth');

router.get('/search', ctrl.search);
router.get('/all', ctrl.getAll);
router.get('/nav-history', ctrl.getNavHistory);
router.get('/:code', optionalAuth, ctrl.getByCode);

module.exports = router;