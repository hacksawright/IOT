const { createHash, randomBytes } = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Node, ProvisioningToken } = require('../models');
const mqttDynsec = require('./mqtt-dynsec.service');
const env = require('../config/env');
const ApiError = require('../utils/apiError');

const TOKEN_TTL_HOURS = 24;

function hashToken(token) {
    return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function makeToken() {
    return `PRV-${randomBytes(24).toString('base64url')}`;
}

async function issueForNode(node) {
    const token = makeToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
    const values = { tokenHash: hashToken(token), expiresAt, usedAt: null };
    const existing = await ProvisioningToken.findOne({ where: { nodeId: node.id } });
    if (existing) await existing.update(values);
    else await ProvisioningToken.create({ nodeId: node.id, ...values });
    return { token, expiresAt };
}

function deviceBrokerConfig() {
    const raw = env.mqtt.deviceUrl || env.mqtt.url;
    let parsed;
    try { parsed = new URL(raw); }
    catch { throw new ApiError(503, 'MQTT_DEVICE_URL không hợp lệ. Hãy cấu hình địa chỉ Broker mà ESP32 truy cập được.'); }
    if (!['mqtt:', 'mqtts:'].includes(parsed.protocol)) {
        throw new ApiError(503, 'MQTT_DEVICE_URL phải dùng mqtt:// hoặc mqtts://');
    }
    const host = parsed.hostname;
    if (!host || ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
        throw new ApiError(503, 'MQTT_DEVICE_URL đang trỏ tới localhost. Hãy đặt IP LAN của máy chạy Mosquitto, ví dụ mqtt://192.168.1.10:1883.');
    }
    const port = Number(parsed.port || (parsed.protocol === 'mqtts:' ? 8883 : 1883));
    return { host, port, protocol: parsed.protocol === 'mqtts:' ? 'mqtts' : 'mqtt' };
}

async function claim(provisioningToken) {
    if (typeof provisioningToken !== 'string' || provisioningToken.length < 20 || provisioningToken.length > 160) {
        throw ApiError.badRequest('provisioningToken không hợp lệ');
    }

    const tokenHash = hashToken(provisioningToken);
    const broker = deviceBrokerConfig();
    return sequelize.transaction(async (transaction) => {
        const record = await ProvisioningToken.findOne({
            where: { tokenHash },
            include: [{ model: Node, as: 'node' }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!record) throw ApiError.unauthorized('provisioningToken không tồn tại hoặc đã bị thay thế');
        if (record.usedAt) throw ApiError.conflict('provisioningToken đã được sử dụng');
        const now = new Date();
        if (new Date(record.expiresAt).getTime() <= now.getTime()) throw ApiError.conflict('provisioningToken đã hết hạn; Admin cần cấp mã mới');

        const node = record.node;
        if (!node || node.isRevoked || !node.mqttAccountEnabled || !node.mqttUsername || !node.mqttRoleName) {
            throw ApiError.conflict('Node không ở trạng thái cho phép provisioning');
        }

        // MQTT account/ACL đã được tạo khi Admin tạo Node. Claim chỉ xoay password
        // một lần để cấp secret trực tiếp cho Firmware, không trả secret qua Frontend.
        const password = randomBytes(36).toString('base64url');
        try {
            await mqttDynsec.rotatePassword(node.mqttUsername, password);
        } catch (error) {
            throw new ApiError(503, `Không thể cấp MQTT credential cho Firmware: ${error.message}`);
        }

        record.usedAt = now;
        await record.save({ transaction });

        return {
            nodeCode: node.nodeCode,
            mqtt: {
                ...broker,
                username: node.mqttUsername,
                password,
                topicPrefix: env.mqtt.firmwarePrefix,
            },
        };
    });
}

module.exports = { issueForNode, claim, hashToken, TOKEN_TTL_HOURS };
