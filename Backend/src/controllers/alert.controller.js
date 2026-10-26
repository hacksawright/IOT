const { Op } = require('sequelize');
const { Alert, User } = require('../models');
const ApiError = require('../utils/apiError');
const { dateRange } = require('../utils/helpers');
const { paging, meta } = require('../utils/pagination');
const audit = require('../services/audit.service');
const alertService = require('../services/alert.service');
const { accessibleDeviceIds, getDeviceForUser } = require('../services/access.service');

const listInclude = [{ association: 'device', attributes: ['id', 'name'] }];
const fullInclude = [
    ...listInclude,
    { association: 'acknowledger', attributes: ['id', 'username', 'fullName'] },
    { association: 'resolver', attributes: ['id', 'username', 'fullName'] },
    { association: 'analysis', include: [{ association: 'disease' }] },
];

async function loadScoped(req) {
    const alert = await Alert.findByPk(req.params.id, { include: fullInclude });
    if (!alert) throw ApiError.notFound('Không tìm thấy cảnh báo');
    if (req.user.role !== 'admin') {
        if (alert.deviceId) {
            await getDeviceForUser(req.user, alert.deviceId);
        } else if (!(alert.type === 'disease' && alert.analysisId)) {
            throw ApiError.forbidden('Cảnh báo không gắn thiết bị này chỉ dành cho admin');
        }
    }
    return alert;
}

exports.list = async (req, res) => {
    const { page, limit, offset } = paging(req);
    const ids = await accessibleDeviceIds(req.user);
    const where = { ...dateRange(req.query, 'createdAt') };
    if (ids !== null) {
        // Cảnh báo bệnh không gắn deviceId đến từ kết quả AI bên ngoài và khả dụng cho người dùng đăng nhập.
        where[Op.or] = [
            { deviceId: { [Op.in]: ids } },
            { deviceId: null, type: 'disease', analysisId: { [Op.not]: null } },
        ];
    }
    for (const k of ['status', 'type', 'severity']) if (req.query[k]) where[k] = req.query[k];
    if (req.query.deviceId !== undefined && req.query.deviceId !== '') {
        const requestedDeviceId = Number(req.query.deviceId);
        if (!Number.isInteger(requestedDeviceId) || requestedDeviceId <= 0) {
            throw ApiError.badRequest('deviceId không hợp lệ');
        }
        // Do not let ?deviceId=... overwrite the user's device assignment filter.
        await getDeviceForUser(req.user, requestedDeviceId);
        where.deviceId = requestedDeviceId;
    }
    const { rows, count } = await Alert.findAndCountAll({ where, include: listInclude, limit, offset, order: [['id', 'DESC']] });
    res.json({ data: rows, meta: meta(page, limit, count) });
};

exports.get = async (req, res) => res.json({ data: await loadScoped(req) });

exports.acknowledge = async (req, res) => {
    const alert = await loadScoped(req);
    await alertService.acknowledge(alert, req.user);
    await audit.log(req, { action: 'alert.acknowledge', entityType: 'alert', entityId: alert.id });
    res.json({ data: alert });
};

// Nút "Đã xử lý" – kèm ghi chú đã làm gì
exports.resolve = async (req, res) => {
    const alert = await loadScoped(req);
    await alertService.resolve(alert, req.user, req.body?.resolutionNote);
    await audit.log(req, { action: 'alert.resolve', entityType: 'alert', entityId: alert.id, detail: { note: req.body?.resolutionNote } });
    res.json({ data: alert });
};
