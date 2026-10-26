const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/dashboard.controller'));
const { authenticate } = require('../middlewares/auth');

router.get('/summary', authenticate, ctrl.summary);
router.get('/telemetry', authenticate, ctrl.telemetry);

module.exports = router;
