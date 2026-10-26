const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/alert.controller'));
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/:id/acknowledge', requireRole('admin', 'operator'), ctrl.acknowledge);
router.post('/:id/resolve', requireRole('admin', 'operator'), ctrl.resolve);

module.exports = router;
