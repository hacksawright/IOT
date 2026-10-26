const { Op } = require('sequelize');
const { Device, Node, DeviceCommand, User, Alert } = require('../models');
const { DEVICE_TYPES, ACTUATOR_TYPES, AUTO_ACTUATORS, METRICS, LIFECYCLE, LIFECYCLE_TRANSITIONS } = require('../constants');
const ApiError = require('../utils/apiError');
const { pick } = require('../utils/helpers');
const { paging, meta } = require('../utils/pagination');
const audit = require('../services/audit.service');
const socket = require('../services/socket.service');
const nodeService = require('../services/node.service');
const commandService = require('../services/command.service');
const alertService = require('../services/alert.service');
const { accessibleDeviceIds, scopeWhere, getDeviceForUser } = require('../services/access.service');

const nodeInclude = { model: Node, as: 'node', attributes: ['id', 'name', 'isOnline', 'lastHeartbeatAt', 'isRevoked'] };
const OPS = ['lt', 'lte', 'gt', 'gte'];

// Validate and normalize config. New configs use sourceDeviceCode; numeric sourceDeviceId is accepted
// only as a backward-compatible input and converted before saving.
async function validateConfig(type, config, user = null) {
    if (config === null || config === undefined || typeof config !== 'object' || Array.isArray(config)) {
        throw ApiError.badRequest('config phải là object JSON');
    }

    const normalized = JSON.parse(JSON.stringify(config));
    if (!Object.prototype.hasOwnProperty.call(normalized, 'auto')) return normalized;

    const auto = normalized.auto;
    if (!auto || typeof auto !== 'object' || Array.isArray(auto)) {
        throw ApiError.badRequest('config.auto phải là object JSON');
    }
    if (auto.enabled !== undefined && typeof auto.enabled !== 'boolean') {
        throw ApiError.badRequest('config.auto.enabled phải là true/false');
    }

    if (typeof auto.sourceDeviceCode === 'number' && Number.isInteger(auto.sourceDeviceCode)) {
        // Compatibility with an older draft that stored the DB ID in sourceDeviceCode.
        const legacySensor = await Device.findByPk(auto.sourceDeviceCode);
        if (!legacySensor || legacySensor.type !== 'SENSOR') {
            throw ApiError.badRequest(`sourceDeviceCode số cũ không trỏ đến SENSOR (ID=${auto.sourceDeviceCode})`);
        }
        auto.sourceDeviceCode = legacySensor.deviceCode;
    }
    if (!auto.sourceDeviceCode && auto.sourceDeviceId !== undefined && auto.sourceDeviceId !== null) {
        const legacyId = Number(auto.sourceDeviceId);
        if (!Number.isInteger(legacyId) || legacyId <= 0) {
            throw ApiError.badRequest('sourceDeviceId cũ phải là ID số hợp lệ');
        }
        const legacySensor = await Device.findByPk(legacyId);
        if (!legacySensor || legacySensor.type !== 'SENSOR') throw ApiError.badRequest(`Không tìm thấy SENSOR cho sourceDeviceId=${legacyId}`);
        auto.sourceDeviceCode = legacySensor.deviceCode;
    }
    delete auto.sourceDeviceId;

    if (auto.sourceDeviceCode !== undefined && auto.sourceDeviceCode !== null) {
        auto.sourceDeviceCode = String(auto.sourceDeviceCode).trim();
        if (!auto.sourceDeviceCode) throw ApiError.badRequest('sourceDeviceCode không được rỗng');
    }

    // Disabled rules may be saved incomplete, but if a source is supplied it must be a sensor.
    let sourceSensor = null;
    if (auto.sourceDeviceCode) {
        sourceSensor = await Device.findOne({ where: { deviceCode: auto.sourceDeviceCode } });
        if (!sourceSensor) throw ApiError.badRequest(`Không tìm thấy deviceCode cảm biến "${auto.sourceDeviceCode}"`);
        if (sourceSensor.type !== 'SENSOR') throw ApiError.badRequest('sourceDeviceCode phải trỏ đến thiết bị SENSOR');
        if (user && user.role !== 'admin') await getDeviceForUser(user, sourceSensor.id);
    }

    if (auto.enabled === true) {
        if (!AUTO_ACTUATORS.includes(type)) throw ApiError.badRequest('Chỉ actuator được hỗ trợ mới có quy tắc config.auto');
        const bad = [];
        if (!auto.sourceDeviceCode || !sourceSensor) bad.push('sourceDeviceCode');
        if (!METRICS.includes(String(auto.metric || '').toUpperCase())) bad.push('metric');
        else auto.metric = String(auto.metric).toUpperCase();
        auto.onOp = String(auto.onOp || '').toLowerCase();
        auto.offOp = String(auto.offOp || '').toLowerCase();
        if (!OPS.includes(auto.onOp)) bad.push('onOp');
        if (!OPS.includes(auto.offOp)) bad.push('offOp');
        const onValue = Number(auto.onValue);
        const offValue = Number(auto.offValue);
        if (auto.onValue === undefined || auto.onValue === null || auto.onValue === '' || !Number.isFinite(onValue)) bad.push('onValue');
        else auto.onValue = onValue;
        if (auto.offValue === undefined || auto.offValue === null || auto.offValue === '' || !Number.isFinite(offValue)) bad.push('offValue');
        else auto.offValue = offValue;
        if (auto.cooldownSec !== undefined) {
            const cooldown = Number(auto.cooldownSec);
            if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 86400) bad.push('cooldownSec');
            else auto.cooldownSec = cooldown;
        }
        if (bad.length) throw ApiError.badRequest(`config.auto thiếu/sai: ${bad.join(', ')}`);
    }

    return normalized;
}

async function bumpAndPushConfig(device) {
    device.configVersion = Number(device.configVersion || 0) + 1;
    await device.save();
    // Always refresh Node from DB so a stale included association cannot bypass isRevoked checks.
    const node = device.nodeId ? await Node.findByPk(device.nodeId) : null;
    return nodeService.pushDeviceConfig(device, node);
}

exports.list = async (req, res) => {
    const { page, limit, offset } = paging(req);
    const ids = await accessibleDeviceIds(req.user);
    const where = { ...scopeWhere(ids, 'id') };
    for (const k of ['type', 'lifecycle', 'nodeId', 'deviceCode']) {
        if (req.query[k] !== undefined && req.query[k] !== '') where[k] = req.query[k];
    }
    const { rows, count } = await Device.findAndCountAll({ where, include: [nodeInclude], limit, offset, order: [['id', 'ASC']] });
    res.json({ data: rows, meta: meta(page, limit, count) });
};

exports.get = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id, { include: [nodeInclude] });
    res.json({ data: device });
};

exports.create = async (req, res) => {
    const { deviceCode, name, type, location, nodeId, gpioPin, config } = req.body || {};
    const normalizedDeviceCode = typeof deviceCode === 'string' ? deviceCode.trim() : '';
    if (!normalizedDeviceCode || typeof name !== 'string' || !name.trim() || !type) throw ApiError.badRequest('Cần deviceCode, name, type');
    if (normalizedDeviceCode.length > 50) throw ApiError.badRequest('deviceCode không được dài quá 50 ký tự');
    if (!DEVICE_TYPES.includes(type)) throw ApiError.badRequest(`type phải thuộc: ${DEVICE_TYPES.join(', ')}`);
    const duplicateCode = await Device.findOne({ where: { deviceCode: normalizedDeviceCode }, attributes: ['id'] });
    if (duplicateCode) throw ApiError.conflict(`deviceCode "${normalizedDeviceCode}" đã được sử dụng`);

    let normalizedNodeId = null;
    if (nodeId !== undefined && nodeId !== null && nodeId !== '') {
        normalizedNodeId = Number(nodeId);
        if (!Number.isInteger(normalizedNodeId) || normalizedNodeId <= 0) throw ApiError.badRequest('nodeId không hợp lệ');
        const node = await Node.findByPk(normalizedNodeId);
        if (!node) throw ApiError.badRequest('nodeId không tồn tại');
        if (node.isRevoked) throw ApiError.conflict('Không thể gán thiết bị vào Node đã bị thu hồi');
    }

    let normalizedGpioPin = null;
    if (gpioPin !== undefined && gpioPin !== null && gpioPin !== '') {
        normalizedGpioPin = Number(gpioPin);
        if (!Number.isInteger(normalizedGpioPin) || normalizedGpioPin < 0) throw ApiError.badRequest('gpioPin phải là số nguyên không âm');
    }
    const normalizedConfig = config === undefined ? {} : await validateConfig(type, config, req.user);
    const device = await Device.create({
        deviceCode: normalizedDeviceCode,
        name: String(name).trim(),
        type,
        location: location ?? null,
        nodeId: normalizedNodeId,
        gpioPin: normalizedGpioPin,
        config: normalizedConfig,
        configVersion: Object.keys(normalizedConfig).length ? 1 : 0,
        lifecycle: 'REGISTERED',
    });
    await audit.log(req, { action: 'device.create', entityType: 'device', entityId: device.id, detail: { deviceCode: normalizedDeviceCode, type } });
    res.status(201).json({ data: device });
};

exports.update = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id, { include: [nodeInclude] });
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'deviceCode')) {
        throw ApiError.badRequest('deviceCode là định danh phần cứng dùng trong MQTT và không thể đổi qua PATCH thông thường');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'config')) {
        throw ApiError.badRequest('Dùng PATCH /devices/:id/config để cập nhật config');
    }

    const previousNodeId = device.nodeId == null ? null : Number(device.nodeId);
    const previousGpioPin = device.gpioPin == null ? null : Number(device.gpioPin);
    const changes = pick(body, ['name', 'location', 'nodeId', 'gpioPin']);

    if (Object.prototype.hasOwnProperty.call(changes, 'nodeId')) {
        if (changes.nodeId === '' || changes.nodeId === null) {
            if (!['REGISTERED', 'DECOMMISSIONED'].includes(device.lifecycle)) {
                throw ApiError.conflict('Không thể bỏ nodeId khi thiết bị đã qua trạng thái REGISTERED');
            }
            changes.nodeId = null;
        } else {
            changes.nodeId = Number(changes.nodeId);
            if (!Number.isInteger(changes.nodeId) || changes.nodeId <= 0) throw ApiError.badRequest('nodeId không hợp lệ');
            const targetNode = await Node.findByPk(changes.nodeId);
            if (!targetNode) throw ApiError.badRequest('nodeId không tồn tại');
            if (targetNode.isRevoked) throw ApiError.conflict('Không thể gán thiết bị vào Node đã bị thu hồi');
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'gpioPin')) {
        if (changes.gpioPin === '' || changes.gpioPin === null) changes.gpioPin = null;
        else {
            changes.gpioPin = Number(changes.gpioPin);
            if (!Number.isInteger(changes.gpioPin) || changes.gpioPin < 0) throw ApiError.badRequest('gpioPin phải là số nguyên không âm');
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
        changes.name = String(changes.name).trim();
        if (!changes.name) throw ApiError.badRequest('name không được rỗng');
    }

    Object.assign(device, changes);
    const nextNodeId = device.nodeId == null ? null : Number(device.nodeId);
    const nextGpioPin = device.gpioPin == null ? null : Number(device.gpioPin);
    const hardwareChanged = previousNodeId !== nextNodeId || previousGpioPin !== nextGpioPin;
    let pushed = false;
    if (hardwareChanged) pushed = await bumpAndPushConfig(device);
    else await device.save();

    await audit.log(req, { action: 'device.update', entityType: 'device', entityId: device.id, detail: { fields: Object.keys(changes), hardwareChanged, configPublishedNow: pushed } });
    socket.emitDevice(device.id, 'device:update', device);
    res.json({ data: device, ...(hardwareChanged ? { configPublishedNow: pushed, pendingUntilAcknowledged: device.configAppliedVersion < device.configVersion } : {}) });
};

// PATCH /devices/:id/config - update operational config, version and push over MQTT.
exports.updateConfig = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id, { include: [nodeInclude] });
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'config')) throw ApiError.badRequest('Cần trường config');
    const normalizedConfig = await validateConfig(device.type, req.body.config, req.user);
    device.config = normalizedConfig;
    const pushed = await bumpAndPushConfig(device);
    await audit.log(req, {
        action: 'device.config_update', entityType: 'device', entityId: device.id,
        detail: { configVersion: device.configVersion, pushed },
    });
    socket.emitDevice(device.id, 'device:update', device);
    res.json({
        data: device,
        configPublishedNow: pushed,
        pendingUntilAcknowledged: device.configAppliedVersion < device.configVersion,
    });
};

// POST /devices/:id/lifecycle { "to": "ACTIVE" }
exports.changeLifecycle = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id, { include: [nodeInclude] });
    const to = req.body?.to;
    if (!LIFECYCLE.includes(to)) throw ApiError.badRequest(`to phải thuộc: ${LIFECYCLE.join(', ')}`);
    const allowed = LIFECYCLE_TRANSITIONS[device.lifecycle] || [];
    if (!allowed.includes(to)) {
        throw ApiError.conflict(`Không thể chuyển ${device.lifecycle} → ${to}. Cho phép: ${allowed.join(', ') || '(không có)'}`);
    }

    if (to === 'PROVISIONED') {
        if (!device.nodeId) throw ApiError.conflict('Cần gán nodeId trước khi PROVISIONED');
        if (device.gpioPin === null) throw ApiError.conflict('Cần gán gpioPin trước khi PROVISIONED');
    }
    if (to === 'ACTIVE') {
        const node = device.nodeId ? await Node.findByPk(device.nodeId) : null;
        if (!node || node.isRevoked) throw ApiError.conflict('Cần gán một Node hợp lệ, chưa bị thu hồi trước khi ACTIVE');
    }

    // Never mark a running actuator as under maintenance/decommissioned until OFF is ACKed.
    if (['MAINTENANCE', 'DECOMMISSIONED'].includes(to) && ACTUATOR_TYPES.includes(device.type) && device.isOn) {
        const cmd = await commandService.issue({ device, turnOn: false, source: 'MANUAL', userId: req.user.id });
        await device.reload();
        if (cmd.status === 'FAILED') throw ApiError.conflict(`Không gửi được lệnh tắt pump: ${cmd.resultMessage || 'lỗi không rõ'}`);
        if (device.isOn) {
            await audit.log(req, { action: 'device.lifecycle_shutdown_requested', entityType: 'device', entityId: device.id, detail: { targetLifecycle: to, commandUuid: cmd.commandUuid } });
            return res.status(202).json({ data: device, pendingShutdown: true, command: cmd, message: 'Đã gửi lệnh tắt; chờ ACK thành công rồi gửi lại yêu cầu chuyển lifecycle.' });
        }
    }

    const from = device.lifecycle;
    device.lifecycle = to;
    await device.save();
    if (['PROVISIONED', 'ACTIVE'].includes(to) && device.configVersion > device.configAppliedVersion) {
        await nodeService.pushDeviceConfig(device, device.nodeId ? await Node.findByPk(device.nodeId) : null);
    }
    if (to === 'FAULT' && from !== 'FAULT') {
        const existingFault = await Alert.findOne({ where: { deviceId: device.id, type: 'fault', status: { [Op.ne]: 'RESOLVED' } } });
        if (!existingFault) {
            await alertService.create({ type: 'fault', severity: 'CRITICAL', title: `Thiết bị ${device.name} được đánh dấu lỗi`, message: 'Lifecycle được Admin chuyển sang FAULT.', deviceId: device.id });
        }
    }
    if (from === 'FAULT' && to === 'ACTIVE') {
        const faultAlerts = await Alert.findAll({ where: { deviceId: device.id, type: 'fault', status: { [Op.ne]: 'RESOLVED' } } });
        for (const alert of faultAlerts) await alertService.autoResolve(alert, 'Thiết bị được Admin xác nhận đã khôi phục ACTIVE');
    }
    await audit.log(req, { action: 'device.lifecycle', entityType: 'device', entityId: device.id, detail: { from, to } });
    socket.emitDevice(device.id, 'device:update', device);
    res.json({ data: device });
};

// POST /devices/:id/commands { "turn_on": true }; `turnOn` is accepted for legacy clients.
exports.sendCommand = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id, { include: [nodeInclude] });
    if (!ACTUATOR_TYPES.includes(device.type)) throw ApiError.badRequest('Thiết bị này không phải cơ cấu chấp hành');
    if (device.lifecycle !== 'ACTIVE') throw ApiError.conflict(`Thiết bị đang ở trạng thái "${device.lifecycle}", chỉ điều khiển được khi ACTIVE`);
    const body = req.body || {};
    const turnOn = body.turn_on !== undefined ? body.turn_on : body.turnOn;
    if (typeof turnOn !== 'boolean') throw ApiError.badRequest('turn_on phải là true/false');
    let cmd;
    try {
        cmd = await commandService.issue({ device, turnOn, source: 'MANUAL', userId: req.user.id });
    } catch (error) {
        await audit.log(req, {
            action: 'device.command', entityType: 'device', entityId: device.id, success: false,
            detail: { turnOn, reason: String(error.message || 'command rejected').slice(0, 250) },
        });
        throw error;
    }
    await audit.log(req, {
        action: 'device.command', entityType: 'device', entityId: device.id, success: !['FAILED', 'TIMEOUT'].includes(cmd.status),
        detail: { turnOn, commandUuid: cmd.commandUuid, status: cmd.status },
    });
    res.status(['FAILED', 'TIMEOUT'].includes(cmd.status) ? 409 : 202).json({ data: cmd });
};

exports.listCommands = async (req, res) => {
    const device = await getDeviceForUser(req.user, req.params.id);
    const { page, limit, offset } = paging(req, 20);
    const where = { deviceId: device.id };
    if (req.query.status) where.status = req.query.status;
    if (req.query.source) where.source = req.query.source;
    const { rows, count } = await DeviceCommand.findAndCountAll({
        where, limit, offset, order: [['id', 'DESC']],
        include: [{ model: User, as: 'issuer', attributes: ['id', 'username', 'fullName'] }],
    });
    res.json({ data: rows, meta: meta(page, limit, count) });
};
