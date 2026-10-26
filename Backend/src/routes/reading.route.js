const router = require('express').Router();
const ctrl = require('../utils/wrap')(require('../controllers/reading.controller'));
const { authenticate } = require('../middlewares/auth');

router.get('/latest', authenticate, ctrl.latest);

module.exports = router;
