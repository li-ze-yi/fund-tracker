const router = require('express').Router();
const ctrl = require('../controllers/statsController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/daily', ctrl.daily);
router.get('/monthly', ctrl.monthly);
router.get('/yearly', ctrl.yearly);

module.exports = router;