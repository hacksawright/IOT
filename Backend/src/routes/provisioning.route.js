const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/provisioning.controller'));

// Public endpoint: ESP32 chưa có MQTT credential nên xác thực bằng provisioningToken.
router.post('/claim', ctrl.claim);

module.exports = router;
