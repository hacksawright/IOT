'use strict';

// Pure validation helpers so ACK security rules can be unit-tested without a live DB/broker.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickConsistentAlias(payload, camelName, snakeName) {
    const camel = payload[camelName];
    const snake = payload[snakeName];
    if (camel !== undefined && snake !== undefined && String(camel).trim() !== String(snake).trim()) {
        return { ok: false, reason: `conflicting_${camelName}_aliases` };
    }
    const value = camel !== undefined ? camel : snake;
    return { ok: true, value };
}

exports.normalizeCommandAck = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, reason: 'payload_not_object' };
    }

    const uuidField = pickConsistentAlias(payload, 'commandUuid', 'command_uuid');
    if (!uuidField.ok) return uuidField;
    if (typeof uuidField.value !== 'string' || !UUID_RE.test(uuidField.value.trim())) {
        return { ok: false, reason: 'missing_or_invalid_command_uuid' };
    }

    const deviceField = pickConsistentAlias(payload, 'deviceCode', 'device_code');
    if (!deviceField.ok) return deviceField;
    if (typeof deviceField.value !== 'string') {
        return { ok: false, reason: 'missing_device_code' };
    }
    const deviceCode = deviceField.value.trim();
    if (!deviceCode || deviceCode.length > 50 || /[\r\n/]/.test(deviceCode)) {
        return { ok: false, reason: 'invalid_device_code' };
    }

    if (typeof payload.success !== 'boolean') {
        return { ok: false, reason: 'success_must_be_boolean' };
    }

    const message = typeof payload.message === 'string' ? payload.message.slice(0, 255) : null;
    return {
        ok: true,
        ack: {
            commandUuid: uuidField.value.trim().toLowerCase(),
            deviceCode,
            success: payload.success,
            message,
        },
    };
};

exports.authorizeCommandAck = ({ cmd, device, node, ack, now = new Date(), timeoutSec = 15 }) => {
    if (!cmd) return { ok: false, reason: 'command_not_found' };
    if (cmd.status !== 'SENT') return { ok: false, reason: 'command_not_waiting_for_ack' };
    if (!device) return { ok: false, reason: 'device_not_found' };
    if (!node || node.isRevoked) return { ok: false, reason: 'node_missing_or_revoked' };
    if (String(cmd.commandUuid).toLowerCase() !== ack.commandUuid) {
        return { ok: false, reason: 'command_uuid_mismatch' };
    }
    if (Number(cmd.deviceId) !== Number(device.id)) {
        return { ok: false, reason: 'command_device_mismatch' };
    }
    if (Number(device.nodeId) !== Number(node.id)) {
        return { ok: false, reason: 'wrong_node_for_device' };
    }
    if (typeof device.deviceCode !== 'string' || ack.deviceCode !== device.deviceCode) {
        return { ok: false, reason: 'device_code_mismatch' };
    }

    const sentAtMs = cmd.sentAt ? new Date(cmd.sentAt).getTime() : NaN;
    const nowMs = new Date(now).getTime();
    if (!Number.isFinite(sentAtMs) || !Number.isFinite(nowMs)) {
        return { ok: false, reason: 'missing_or_invalid_sent_at' };
    }
    if (nowMs - sentAtMs > Number(timeoutSec) * 1000) {
        return { ok: false, reason: 'ack_too_late', late: true };
    }
    if (nowMs < sentAtMs) {
        return { ok: false, reason: 'ack_before_command_sent' };
    }

    return { ok: true };
};
