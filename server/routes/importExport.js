const router = require('express').Router();
const ctrl = require('../controllers/importExportController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.post('/import', ctrl.importData);
router.get('/export', ctrl.exportData);

module.exports = router;