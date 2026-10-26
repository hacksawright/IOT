const { Node, Device } = require('../models');
const ApiError = require('../utils/apiError');
const { pick } = require('../utils/helpers');
const audit = require('../services/audit.service');
const nodeService = require('../services/node.service');

const deviceInclude = [{ model: Device, as: 'devices', attributes: ['id', 'deviceCode', 'name', 'type', 'lifecycle'] }];
const find = async (id, opts = {}) => {
    const node = await Node.findByPk(id, opts);
    if (!node) throw ApiError.notFound('Không tìm thấy node');
    return node;
};

exports.list = async (req, res) => {
    res.json({ data: await Node.findAll({ include: deviceInclude, order: [['id', 'ASC']] }) });
};

exports.get = async (req, res) => res.json({ data: await find(req.params.id, { include: deviceInclude }) });

// Tạo Node quản lý ESP32. Xác thực MQTT được cấu hình tại broker, không lưu HTTP secret trong bảng nodes.
exports.create = async (req, res) => {
    const { nodeCode, name, firmwareVersion, hardwareVersion, heartbeatTimeoutSec } = req.body || {};
    const normalizedCode = typeof nodeCode === 'string' ? nodeCode.trim() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedCode || !normalizedName) throw ApiError.badRequest('Cần nodeCode và name');
    if (normalizedCode.length > 50 || !/^[A-Za-z0-9_-]+$/.test(normalizedCode)) {
        throw ApiError.badRequest('nodeCode chỉ được dùng chữ, số, dấu gạch ngang và gạch dưới (tối đa 50 ký tự)');
    }
    if (await Node.findOne({ where: { nodeCode: normalizedCode }, attributes: ['id'] })) {
        throw ApiError.conflict(`nodeCode "${normalizedCode}" đã được sử dụng`);
    }
    const timeout = heartbeatTimeoutSec === undefined ? 60 : Number(heartbeatTimeoutSec);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
        throw ApiError.badRequest('heartbeatTimeoutSec phải là số nguyên từ 1 đến 3600');
    }

    const node = await Node.create({
        nodeCode: normalizedCode,
        name: normalizedName,
        firmwareVersion: firmwareVersion || null,
        hardwareVersion: hardwareVersion || null,
        heartbeatTimeoutSec: timeout,
    });
    await audit.log(req, { action: 'node.create', entityType: 'node', entityId: node.id, detail: { nodeCode: normalizedCode } });
    res.status(201).json({ data: node });
};

exports.update = async (req, res) => {
    const node = await find(req.params.id);
    const changes = pick(req.body, ['name', 'firmwareVersion', 'hardwareVersion', 'heartbeatTimeoutSec']);
    if (changes.heartbeatTimeoutSec !== undefined) {
        changes.heartbeatTimeoutSec = Number(changes.heartbeatTimeoutSec);
        if (!Number.isInteger(changes.heartbeatTimeoutSec) || changes.heartbeatTimeoutSec < 1 || changes.heartbeatTimeoutSec > 3600) {
            throw ApiError.badRequest('heartbeatTimeoutSec phải là số nguyên từ 1 đến 3600');
        }
    }
    if (changes.name !== undefined) {
        changes.name = String(changes.name).trim();
        if (!changes.name) throw ApiError.badRequest('name không được rỗng');
    }
    await node.update(changes);
    await audit.log(req, { action: 'node.update', entityType: 'node', entityId: node.id, detail: { fields: Object.keys(changes) } });
    res.json({ data: node });
};

exports.revoke = async (req, res) => {
    const node = await find(req.params.id);
    if (node.isRevoked) throw ApiError.conflict('Node đã bị thu hồi');
    node.isRevoked = true;
    node.revokedAt = new Date();
    await node.save();
    await nodeService.markOffline(node, 'node bị thu hồi');
    await audit.log(req, { action: 'node.revoke', entityType: 'node', entityId: node.id });
    res.json({ data: node });
};
