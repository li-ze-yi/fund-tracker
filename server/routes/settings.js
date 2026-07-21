const router = require('express').Router();
const ctrl = require('../controllers/settingController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/', ctrl.get);
router.put('/', ctrl.update);
router.put('/valuation-method', ctrl.updateValuationMethod);
router.put('/fund-override', ctrl.setFundOverride);

module.exports = router;