const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/user.controller'));
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');

// Toàn bộ quản lý người dùng chỉ dành cho Admin
router.use(authenticate, requireRole('admin'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.deactivate); // khóa tài khoản, không xóa cứng
router.put('/:id/devices', ctrl.assignDevices);

module.exports = router;
