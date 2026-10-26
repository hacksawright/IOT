const { Op } = require('sequelize');
const { UserDevice, Device } = require('../models');
const { ROLES } = require('../constants');
const ApiError = require('../utils/apiError');

function assertKnownRole(user) {
    if (!user || !ROLES.includes(user.role)) {
        throw ApiError.forbidden('Tài khoản không có vai trò hợp lệ');
    }
}

// null = admin thấy tất cả; các role còn lại chỉ thấy device_id được gán.
exports.accessibleDeviceIds = async (user) => {
    assertKnownRole(user);
    if (user.role === 'admin') return null;
    const rows = await UserDevice.findAll({
        where: { userId: user.id },
        attributes: ['deviceId'],
        raw: true,
    });
    return rows.map((r) => Number(r.deviceId));
};

// null = không giới hạn theo device; [] = không được thấy thiết bị nào.
exports.scopeWhere = (ids, field = 'deviceId') =>
    (ids === null ? {} : { [field]: { [Op.in]: ids } });

// Lấy device và kiểm tra quyền object-level. Luôn gọi trước khi trả dữ liệu hoặc thao tác.
exports.getDeviceForUser = async (user, id, options = {}) => {
    assertKnownRole(user);
    const deviceId = Number(id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
        throw ApiError.badRequest('deviceId không hợp lệ');
    }

    const device = await Device.findByPk(deviceId, options);
    if (!device) throw ApiError.notFound('Không tìm thấy thiết bị');

    if (user.role !== 'admin') {
        const assignment = await UserDevice.findOne({
            where: { userId: user.id, deviceId: device.id },
            attributes: ['userId'],
        });
        if (!assignment) throw ApiError.forbidden('Thiết bị này chưa được gán cho bạn');
    }
    return device;
};
