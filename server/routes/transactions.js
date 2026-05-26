const router = require('express').Router();
const ctrl = require('../controllers/transactionController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/all', ctrl.listAll);
router.post('/settle', ctrl.settlePending);
router.get('/:fundCode', ctrl.listByFund);
router.post('/buy', ctrl.buy);
router.post('/sell', ctrl.sell);
router.delete('/:id', ctrl.delete);

module.exports = router;