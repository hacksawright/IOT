const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/audit.controller'));
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');

router.get('/', authenticate, requireRole('admin'), ctrl.list);

module.exports = router;
