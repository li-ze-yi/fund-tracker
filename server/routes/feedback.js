const router = require('express').Router();
const ctrl = require('../controllers/feedbackController');
const { authenticate } = require('../middlewares/auth');

router.post('/', authenticate, ctrl.create);
router.get('/', authenticate, ctrl.list);

module.exports = router;