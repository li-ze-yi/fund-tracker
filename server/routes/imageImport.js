const router = require('express').Router();
const ctrl = require('../controllers/imageImportController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.post('/recognize', ctrl.recognize);
router.post('/confirm', ctrl.confirmImport);

module.exports = router;
