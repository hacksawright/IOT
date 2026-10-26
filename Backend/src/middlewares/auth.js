const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

// Xác thực người dùng bằng JWT (Authorization: Bearer <token>)
exports.authenticate = asyncHandler(async (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw ApiError.unauthorized();
    let payload;
    try {
        payload = jwt.verify(token, env.jwt.secret);
    } catch {
        throw ApiError.unauthorized('Token không hợp lệ hoặc đã hết hạn');
    }
    const user = await User.findByPk(payload.sub);
    if (!user || !user.isActive) throw ApiError.unauthorized('Tài khoản không tồn tại hoặc đã bị khóa');
    req.user = user;
    next();
});
