const { randomBytes } = require('crypto');
const { Node, Device, DeviceCommand } = require('../models');
const ApiError = require('../utils/apiError');
const { pick } = require('../utils/helpers');
const audit = require('../services/audit.service');
const nodeService = require('../services/node.service');
const mqttDynsec = require('../services/mqtt-dynsec.service');
const env = require('../config/env');
const { createWithSequentialCode } = require('../services/code-generator');
const provisioningService = require('../services/provisioning.service');
const commandService = require('../services/command.service');

const deviceInclude = [{ model: Device, as: 'devices', attributes: ['id', 'deviceCode', 'name', 'type', 'lifecycle'] }];
const find = async (id, opts = {}) => {
    const node = await Node.findByPk(id, opts);
    if (!node) throw ApiError.notFound('Không tìm thấy node');
    return node;
};

function usernameFor(nodeCode) {
    return `node_${String(nodeCode).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

async function provisionOrRotateCredentials(node) {
    try {
        mqttDynsec.assertConfigured();
        const password = randomBytes(36).toString('base64url');
        if (!node.mqttUsername && !node.mqttRoleName) {
            const username = usernameFor(node.nodeCode);
            const { roleName } = await mqttDynsec.createAccount({ nodeCode: node.nodeCode, username, password });
            node.mqttUsername = username;
            node.mqttRoleName = roleName;
        } else if (node.mqttUsername && node.mqttRoleName) {
            await mqttDynsec.rotatePassword(node.mqttUsername, password);
        } else {
            throw new Error('Thông tin tài khoản MQTT của Node không đồng bộ (thiếu username hoặc role). Cần kiểm tra Dynamic Security trên Broker trước khi cấp lại.');
        }
        node.mqttProvisionedAt = new Date();
        node.mqttAccountEnabled = true;
        await node.save();
        return {
            brokerUrl: env.mqtt.url,
            topicPrefix: env.mqtt.firmwarePrefix,
            nodeCode: node.nodeCode,
            username: node.mqttUsername,
            password,
        };
    } catch (error) {
        throw new ApiError(503, `Không thể cấp tài khoản MQTT cho Node: ${error.message}`);
    }
}


async function requestSafeStopForNode(node) {
    const result = { requested: 0, acknowledged: 0, failed: 0, skipped: 0, details: [] };
    const actuators = await Device.findAll({
        where: { nodeId: node.id, type: ['PUMP', 'FAN'], lifecycle: ['ACTIVE', 'FAULT', 'MAINTENANCE'] },
    });
    for (const device of actuators) {
        if (!device.isOn) { result.skipped += 1; continue; }
        try {
            const command = await commandService.issue({ device, turnOn: false, source: 'ALERT' });
            result.requested += 1;
            const deadline = Date.now() + Math.min(env.commandAckTimeoutSec * 1000, 5000);
            let current = command;
            while (current.status === 'SENT' && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                current = await DeviceCommand.findByPk(command.id);
            }
            if (current?.status === 'ACKED') result.acknowledged += 1;
            else result.failed += 1;
            result.details.push({ deviceCode: device.deviceCode, commandUuid: command.commandUuid, status: current?.status || 'UNKNOWN' });
        } catch (error) {
            result.failed += 1;
            result.details.push({ deviceCode: device.deviceCode, status: 'NOT_SENT', reason: String(error.message || error).slice(0, 200) });
        }
    }
    return result;
}

exports.list = async (req, res) => {
    res.json({ data: await Node.findAll({ include: deviceInclude, order: [['id', 'ASC']] }) });
};

exports.get = async (req, res) => res.json({ data: await find(req.params.id, { include: deviceInclude }) });

// Mỗi Node được cấp một MQTT username/password độc lập và một role ACL giới hạn đúng các Topic của Node.
exports.create = async (req, res) => {
    const { name, firmwareVersion, hardwareVersion, heartbeatTimeoutSec } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) throw ApiError.badRequest('Cần name');
    const timeout = heartbeatTimeoutSec === undefined ? 60 : Number(heartbeatTimeoutSec);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) throw ApiError.badRequest('heartbeatTimeoutSec phải là số nguyên từ 1 đến 3600');
    try { mqttDynsec.assertConfigured(); } catch (error) { throw new ApiError(503, error.message); }

    let created;
    try {
        created = await createWithSequentialCode({
            prefix: 'NODE', Model: Node, field: 'nodeCode',
            values: {
                name: normalizedName,
                firmwareVersion: firmwareVersion || null,
                hardwareVersion: hardwareVersion || null,
                heartbeatTimeoutSec: timeout,
            },
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') throw ApiError.conflict('Mã Node tuần tự đã tồn tại. Hãy kiểm tra dữ liệu Node cũ trước khi tạo tiếp.');
        throw error;
    }
    const node = created.record;
    let provisioning;
    try {
        // MQTT account/ACL vẫn được tạo ngay khi Admin tạo Node.
        // Password khởi tạo chỉ tồn tại trong request này; ESP32 sẽ nhận password mới
        // qua claim (Backend rotate password) nên không cần hiển thị MQTT secret trên UI.
        await provisionOrRotateCredentials(node);
        provisioning = await provisioningService.issueForNode(node);
    } catch (error) {
        if (node.mqttUsername) {
            try { await mqttDynsec.deleteAccount(node.mqttUsername, node.mqttRoleName); } catch { /* best-effort cleanup */ }
        }
        await node.destroy();
        throw error;
    }
    await audit.log(req, { action: 'node.create', entityType: 'node', entityId: node.id, detail: { nodeCode: node.nodeCode, mqttUsername: node.mqttUsername, mqttRoleName: node.mqttRoleName, provisioningTokenIssued: true } });
    res.status(201).json({
        data: node,
        provisioningToken: provisioning.token,
        provisioningTokenExpiresAt: provisioning.expiresAt,
        meta: { nodeCodeGenerated: true, mqttAccountProvisioned: true, provisioningTokenIssued: true },
    });
};

exports.update = async (req, res) => {
    const node = await find(req.params.id);
    const changes = pick(req.body, ['name', 'firmwareVersion', 'hardwareVersion', 'heartbeatTimeoutSec']);
    if (changes.heartbeatTimeoutSec !== undefined) {
        changes.heartbeatTimeoutSec = Number(changes.heartbeatTimeoutSec);
        if (!Number.isInteger(changes.heartbeatTimeoutSec) || changes.heartbeatTimeoutSec < 1 || changes.heartbeatTimeoutSec > 3600) throw ApiError.badRequest('heartbeatTimeoutSec phải là số nguyên từ 1 đến 3600');
    }
    if (changes.name !== undefined) {
        changes.name = String(changes.name).trim();
        if (!changes.name) throw ApiError.badRequest('name không được rỗng');
    }
    await node.update(changes);
    await audit.log(req, { action: 'node.update', entityType: 'node', entityId: node.id, detail: { fields: Object.keys(changes) } });
    res.json({ data: node });
};

exports.issueProvisioningToken = async (req, res) => {
    const node = await find(req.params.id);
    if (node.isRevoked) throw ApiError.conflict('Không thể cấp provisioningToken cho Node đang bị thu hồi.');
    // Hỗ trợ cả Node cũ/import từ SQL demo chưa có MQTT principal.
    if (!node.mqttAccountEnabled || !node.mqttUsername || !node.mqttRoleName) {
        await provisionOrRotateCredentials(node);
    }
    const result = await provisioningService.issueForNode(node);
    await audit.log(req, { action: 'node.provisioning_token_issued', entityType: 'node', entityId: node.id, detail: { nodeCode: node.nodeCode, expiresAt: result.expiresAt } });
    res.json({ data: { nodeId: node.id, nodeCode: node.nodeCode }, provisioningToken: result.token, expiresAt: result.expiresAt, message: 'Đã cấp provisioningToken mới; token cũ (nếu có) không còn hiệu lực.' });
};

exports.issueMqttCredentials = async (req, res) => {
    const node = await find(req.params.id);
    if (node.isRevoked) throw ApiError.conflict('Không thể cấp/đổi mật khẩu MQTT khi Node đang bị thu hồi. Hãy khôi phục Node trước.');
    const mqttCredentials = await provisionOrRotateCredentials(node);
    await nodeService.markOffline(node, 'cấp lại mật khẩu MQTT; ESP32 cần cập nhật credential mới');
    await audit.log(req, { action: 'node.mqtt_credentials_rotated', entityType: 'node', entityId: node.id, detail: { nodeCode: node.nodeCode, mqttUsername: node.mqttUsername } });
    res.json({ data: node, mqttCredentials, message: 'Đã cấp lại mật khẩu MQTT. Cập nhật mật khẩu mới vào cấu hình Wi-Fi/MQTT của ESP32.' });
};

exports.revoke = async (req, res) => {
    const node = await find(req.params.id);
    if (node.isRevoked) throw ApiError.conflict('Node đã bị thu hồi');
    // If the Node is reachable, ask every currently-on actuator to switch OFF and
    // wait briefly for ACK before disabling its shared MQTT identity. If offline or
    // no ACK arrives, revoke still proceeds but the response explicitly reports it.
    const safeStop = node.isOnline ? await requestSafeStopForNode(node) : {
        requested: 0, acknowledged: 0, failed: 0, skipped: 0,
        details: [{ status: 'SKIPPED_NODE_OFFLINE', reason: 'Không thể gửi lệnh dừng khi Node offline' }],
    };
    if (node.mqttUsername) {
        try { await mqttDynsec.disableAccount(node.mqttUsername); }
        catch (error) { throw new ApiError(503, `Broker chưa thu hồi được tài khoản ${node.mqttUsername}: ${error.message}. Node vẫn chưa được đánh dấu thu hồi trong hệ thống.`); }
    }
    node.isRevoked = true;
    node.revokedAt = new Date();
    node.mqttAccountEnabled = false;
    await node.save();
    await nodeService.markOffline(node, 'node bị thu hồi');
    await audit.log(req, { action: 'node.revoke', entityType: 'node', entityId: node.id, detail: { mqttUsername: node.mqttUsername, brokerAccountDisabled: Boolean(node.mqttUsername), safeStop } });
    res.json({ data: node, safeStop, message: safeStop.failed ? 'Đã thu hồi Node và khóa MQTT. Một số thiết bị chưa xác nhận lệnh dừng; cần kiểm tra an toàn tại hiện trường.' : 'Đã thu hồi Node, gửi lệnh dừng cho các cơ cấu chấp hành đang bật và khóa tài khoản MQTT.' });
};

exports.restore = async (req, res) => {
    const node = await find(req.params.id);
    if (!node.isRevoked) throw ApiError.conflict('Node chưa bị thu hồi; không cần khôi phục');
    let mqttCredentials = null;
    try {
        if (!node.mqttUsername || !node.mqttRoleName) {
            mqttCredentials = await provisionOrRotateCredentials(node);
        } else {
            await mqttDynsec.enableAccount(node.mqttUsername);
            node.mqttAccountEnabled = true;
            node.mqttProvisionedAt = node.mqttProvisionedAt || new Date();
        }
    } catch (error) {
        throw new ApiError(503, `Không thể khôi phục tài khoản MQTT của Node: ${error.message}`);
    }
    node.isRevoked = false;
    node.revokedAt = null;
    node.isOnline = false;
    node.onlineSince = null;
    await node.save();
    await audit.log(req, { action: 'node.restore', entityType: 'node', entityId: node.id, detail: { nodeCode: node.nodeCode, mqttUsername: node.mqttUsername, requiresFreshHeartbeat: true } });
    res.json({ data: node, mqttCredentials, message: 'Đã mở lại tài khoản MQTT. Node chỉ trực tuyến sau khi kết nối và gửi heartbeat mới.' });
};
