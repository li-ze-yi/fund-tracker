const router = require('express').Router();
const ctrl = require('../controllers/planController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id/status', ctrl.updateStatus);
router.delete('/:id', ctrl.delete);

module.exports = router;