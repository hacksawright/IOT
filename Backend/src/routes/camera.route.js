const router = require('express').Router();
const wrap = require('../utils/wrap');
const ctrl = wrap(require('../controllers/camera.controller'));
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');
const cameraAuth = require('../middlewares/camera-auth');
const parseCameraUpload = require('../middlewares/camera-upload');

// Admin đăng ký Camera và cấp/thu hồi credential riêng.
router.post('/', authenticate, requireRole('admin'), ctrl.register);
router.post('/tokens/:cameraId', authenticate, requireRole('admin'), ctrl.issueToken);
router.delete('/tokens/:cameraId', authenticate, requireRole('admin'), ctrl.revokeToken);

// Camera/Agent gửi ảnh trực tiếp tới Backend, không cần JWT người dùng.
router.post('/media', cameraAuth, parseCameraUpload, ctrl.receiveMedia);

module.exports = router;
