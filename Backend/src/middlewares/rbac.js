const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/audit.service');

// Kiểm tra quyền ở PHÍA MÁY CHỦ: sai vai trò → 403 + ghi audit log (success=false)
exports.requireRole = (...roles) =>
    asyncHandler(async (req, res, next) => {
        if (!req.user) throw ApiError.unauthorized();
        if (roles.includes(req.user.role)) return next();
        await audit.log(req, {
            action: 'authz.denied',
            entityType: 'route',
            success: false,
            detail: { method: req.method, path: req.originalUrl, role: req.user.role, required: roles },
        });
        throw ApiError.forbidden('Bạn không có quyền thực hiện thao tác này');
    });
