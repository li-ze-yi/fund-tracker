const router = require('express').Router();
const ctrl = require('../controllers/favoriteController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', ctrl.add);
router.delete('/:fundCode', ctrl.remove);

module.exports = router;