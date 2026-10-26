const { Op } = require('sequelize');
const { Node, Device, Alert } = require('../models');
const mqtt = require('./mqtt.client');
const socket = require('./socket.service');
const alertService = require('./alert.service');
const commandService = require('./command.service');
const audit = require('./audit.service');

// Convert old stored config.auto.sourceDeviceId to deviceCode for the firmware contract.
// The persisted legacy JSON is not mutated as a side effect of publishing.
async function configForWire(config) {
    const copy = JSON.parse(JSON.stringify(config || {}));
    const auto = copy.auto;
    if (auto && typeof auto.sourceDeviceCode === 'number' && Number.isInteger(auto.sourceDeviceCode)) {
        const legacySensor = await Device.findByPk(auto.sourceDeviceCode);
        if (!legacySensor || legacySensor.type !== 'SENSOR') throw new Error(`Không thể chuyển sourceDeviceCode số cũ (ID=${auto.sourceDeviceCode}) sang mã SENSOR`);
        auto.sourceDeviceCode = legacySensor.deviceCode;
    }
    if (auto && !auto.sourceDeviceCode && auto.sourceDeviceId !== undefined && auto.sourceDeviceId !== null) {
        const legacyId = Number(auto.sourceDeviceId);
        if (!Number.isInteger(legacyId) || legacyId <= 0) throw new Error('config.auto.sourceDeviceId cũ không hợp lệ');
        const source = await Device.findByPk(legacyId);
        if (!source || source.type !== 'SENSOR') throw new Error(`Không thể chuyển sourceDeviceId=${legacyId} sang deviceCode SENSOR`);
        auto.sourceDeviceCode = source.deviceCode;
    }
    if (auto) delete auto.sourceDeviceId;
    return copy;
}

// Send configuration to the node that currently owns this device.
exports.pushDeviceConfig = async (device, node) => {
    if (!node || !node.isOnline || node.isRevoked) return false;
    try {
        await mqtt.publish(mqtt.topics.config(node.nodeCode), {
            deviceCode: device.deviceCode,
            type: device.type,
            gpioPin: device.gpioPin,
            config: await configForWire(device.config),
            version: device.configVersion,
        });
        return true;
    } catch (error) {
        console.warn('[node] Không gửi được config:', error.message);
        return false;
    }
};

async function pushPendingConfig(node) {
    const devices = await Device.findAll({
        where: {
            nodeId: node.id,
            lifecycle: { [Op.in]: ['PROVISIONED', 'ACTIVE', 'FAULT', 'MAINTENANCE'] },
        },
    });
    for (const device of devices) {
        if (device.configVersion > device.configAppliedVersion) await exports.pushDeviceConfig(device, node);
    }
}

async function onBackOnline(node) {
    const devices = await Device.findAll({ where: { nodeId: node.id } });
    for (const device of devices) {
        socket.emitDevice(device.id, 'device:update', { ...device.toJSON(), isOnline: true });
        const openAlerts = await Alert.findAll({
            where: { deviceId: device.id, type: 'offline', status: { [Op.ne]: 'RESOLVED' } },
        });
        for (const alert of openAlerts) {
            await alertService.autoResolve(alert, 'Tự động: Node đã kết nối lại');
            await audit.log(null, { action: 'alert.auto_resolve', entityType: 'alert', entityId: alert.id, detail: { reason: 'node_online', nodeCode: node.nodeCode } });
        }
    }
    socket.emitAdmin('node:status', { nodeId: node.id, isOnline: true });
    await pushPendingConfig(node);
}

exports.markAlive = async (node, { firmwareVersion } = {}) => {
    if (node.isRevoked) return false;
    const wasOnline = node.isOnline;
    node.lastHeartbeatAt = new Date();
    if (firmwareVersion) node.firmwareVersion = String(firmwareVersion).slice(0, 30);
    if (!wasOnline) {
        node.isOnline = true;
        node.onlineSince = new Date();
    }
    await node.save();
    if (!wasOnline) {
        await audit.log(null, { action: 'node.online', entityType: 'node', entityId: node.id, detail: { nodeCode: node.nodeCode } });
        await onBackOnline(node);
    }
    return true;
};

exports.markOffline = async (node, reason = 'timeout') => {
    if (!node.isOnline) return;
    node.isOnline = false;
    await node.save();
    await audit.log(null, { action: 'node.offline', entityType: 'node', entityId: node.id, success: true, detail: { nodeCode: node.nodeCode, reason } });
    const devices = await Device.findAll({ where: { nodeId: node.id, lifecycle: 'ACTIVE' } });
    for (const device of devices) {
        socket.emitDevice(device.id, 'device:update', { ...device.toJSON(), isOnline: false });
        const existing = await Alert.findOne({
            where: { deviceId: device.id, type: 'offline', status: { [Op.ne]: 'RESOLVED' } },
        });
        if (!existing) {
            await alertService.create({
                type: 'offline',
                severity: 'WARNING',
                title: `Thiết bị ${device.name} mất kết nối`,
                message: `Node ${node.nodeCode} không còn gửi heartbeat (${reason}).`,
                deviceId: device.id,
            });
        }
    }
    socket.emitAdmin('node:status', { nodeId: node.id, isOnline: false });
};

exports.sweep = async () => {
    const nodes = await Node.findAll({ where: { isOnline: true, isRevoked: false } });
    const now = Date.now();
    for (const node of nodes) {
        const last = node.lastHeartbeatAt ? new Date(node.lastHeartbeatAt).getTime() : 0;
        if (now - last > node.heartbeatTimeoutSec * 1000) await exports.markOffline(node, 'quá hạn heartbeat');
    }
    await commandService.expireStale();
};
