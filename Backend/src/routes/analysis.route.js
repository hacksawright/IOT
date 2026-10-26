const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/analysis.controller'));
const { authenticate } = require('../middlewares/auth');

// Chỉ đọc lịch sử qua JWT/RBAC; kết quả mới được nhận từ MQTT topic {prefix}/ai/result.
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id/image', ctrl.image);
router.get('/:id', ctrl.get);

module.exports = router;
