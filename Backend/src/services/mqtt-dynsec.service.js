const mqtt = require('mqtt');
const env = require('../config/env');

const CONTROL_TOPIC = '$CONTROL/dynamic-security/v1';
const RESPONSE_TOPIC = `${CONTROL_TOPIC}/response`;
const NODE_PUBLISH_SUFFIXES = [
    'telemetry', 'telemetry/backfill', 'heartbeat', 'status', 'config',
    'cmd/ack', 'command/ack', 'config/ack', 'device/probe/ack',
];
const NODE_SUBSCRIBE_SUFFIXES = ['cmd', 'config', 'device/probe'];

let client = null;
let connecting = null;
let pendingResponse = null;
let queue = Promise.resolve();

function assertConfigured() {
    if (!env.mqtt.dynsecEnabled) throw new Error('MQTT Dynamic Security chưa bật. Hãy cấu hình MQTT_DYNSEC_ENABLED=true và plugin Mosquitto Dynamic Security.');
    if (!env.mqtt.dynsecAdminUsername || !env.mqtt.dynsecAdminPassword) {
        throw new Error('Thiếu MQTT_DYNSEC_ADMIN_USERNAME hoặc MQTT_DYNSEC_ADMIN_PASSWORD.');
    }
}

async function ensureConnected() {
    assertConfigured();
    if (client?.connected) return client;
    if (connecting) return connecting;

    connecting = new Promise((resolve, reject) => {
        const current = mqtt.connect(env.mqtt.url, {
            username: env.mqtt.dynsecAdminUsername,
            password: env.mqtt.dynsecAdminPassword,
            clientId: `iot-dynsec-admin-${process.pid}`,
            clean: true,
            keepalive: 30,
            reconnectPeriod: 0,
            connectTimeout: 10000,
            rejectUnauthorized: true,
        });
        client = current;
        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            connecting = null;
            current.end(true);
            if (client === current) client = null;
            reject(error);
        };
        const timeout = setTimeout(() => fail(new Error('Timeout kết nối MQTT Dynamic Security')), 12000);
        current.once('connect', () => {
            current.subscribe(RESPONSE_TOPIC, { qos: 1 }, (error) => {
                if (error) return fail(error);
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(current);
            });
        });
        current.on('error', (error) => {
            if (!settled) fail(error);
            else console.error('[mqtt-dynsec] lỗi:', error.message);
        });
        current.on('close', () => {
            if (client === current) client = null;
            connecting = null;
            if (pendingResponse) {
                pendingResponse.reject(new Error('Mất kết nối MQTT trong khi chờ Dynamic Security phản hồi'));
                pendingResponse = null;
            }
        });
        current.on('message', (topic, buffer) => {
            if (topic !== RESPONSE_TOPIC || !pendingResponse) return;
            let response;
            try { response = JSON.parse(buffer.toString('utf8')); }
            catch { pendingResponse.reject(new Error('Phản hồi Dynamic Security không phải JSON hợp lệ')); pendingResponse = null; return; }
            const waiter = pendingResponse;
            pendingResponse = null;
            waiter.resolve(response);
        });
    });
    return connecting;
}

async function executeOne(command) {
    const connection = await ensureConnected();
    if (pendingResponse) throw new Error('Dynamic Security đang có một yêu cầu chưa hoàn tất');
    const response = await new Promise((resolve, reject) => {
        let waiter;
        const timer = setTimeout(() => {
            if (pendingResponse === waiter) pendingResponse = null;
            reject(new Error(`Dynamic Security không phản hồi lệnh ${command.command}`));
        }, Math.max(1000, env.mqtt.dynsecRequestTimeoutMs));
        const finishResolve = (value) => { clearTimeout(timer); resolve(value); };
        const finishReject = (error) => { clearTimeout(timer); reject(error); };
        waiter = { resolve: finishResolve, reject: finishReject };
        pendingResponse = waiter;
        connection.publish(CONTROL_TOPIC, JSON.stringify({ commands: [command] }), { qos: 1, retain: false }, (error) => {
            if (error && pendingResponse === waiter) {
                pendingResponse = null;
                finishReject(error);
            }
        });
    });
    const result = Array.isArray(response?.responses) ? response.responses[0] : null;
    if (!result) throw new Error(`Dynamic Security trả về phản hồi không hợp lệ cho ${command.command}`);
    if (result.error) throw new Error(`Mosquitto ${command.command}: ${result.error}`);
    return result;
}

function execute(command) {
    const task = queue.then(() => executeOne(command), () => executeOne(command));
    queue = task.catch(() => undefined);
    return task;
}

function buildNodeRole(nodeCode) {
    const prefix = env.mqtt.firmwarePrefix;
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(String(nodeCode))) throw new Error('nodeCode không hợp lệ để tạo ACL MQTT');
    const base = `${prefix}/${nodeCode}`;
    return {
        roleName: `role_${String(nodeCode).replace(/[^A-Za-z0-9._-]/g, '_')}`,
        acls: [
            ...NODE_PUBLISH_SUFFIXES.map((suffix) => ({ acltype: 'publishClientSend', topic: `${base}/${suffix}`, allow: true, priority: 1 })),
            ...NODE_SUBSCRIBE_SUFFIXES.flatMap((suffix) => [
                { acltype: 'subscribeLiteral', topic: `${base}/${suffix}`, allow: true, priority: 1 },
                { acltype: 'unsubscribeLiteral', topic: `${base}/${suffix}`, allow: true, priority: 1 },
                { acltype: 'publishClientReceive', topic: `${base}/${suffix}`, allow: true, priority: 1 },
            ]),
        ],
    };
}

async function createAccount({ nodeCode, username, password }) {
    const { roleName, acls } = buildNodeRole(nodeCode);
    await execute({ command: 'createRole', rolename: roleName, textname: `MQTT role ${nodeCode}`, textdescription: `Chỉ được giao tiếp trong topic ${env.mqtt.firmwarePrefix}/${nodeCode}/...` });
    try {
        for (const acl of acls) await execute({ command: 'addRoleACL', rolename: roleName, ...acl });
        await execute({
            command: 'createClient', username, password,
            textname: `ESP32 ${nodeCode}`,
            textdescription: `Tài khoản MQTT riêng của ${nodeCode}`,
            roles: [{ rolename: roleName, priority: 1 }],
        });
    } catch (error) {
        try { await execute({ command: 'deleteRole', rolename: roleName }); } catch { /* best-effort rollback */ }
        throw error;
    }
    return { roleName };
}

exports.isEnabled = () => Boolean(env.mqtt.dynsecEnabled && env.mqtt.dynsecAdminUsername && env.mqtt.dynsecAdminPassword);
exports.assertConfigured = assertConfigured;
exports.createAccount = createAccount;
exports.disableAccount = (username) => execute({ command: 'disableClient', username });
exports.deleteAccount = async (username, roleName) => {
    if (username) {
        try { await execute({ command: 'deleteClient', username }); } catch { /* continue cleanup */ }
    }
    if (roleName) {
        try { await execute({ command: 'deleteRole', rolename: roleName }); } catch { /* continue cleanup */ }
    }
};
exports.enableAccount = (username) => execute({ command: 'enableClient', username });
exports.rotatePassword = async (username, password) => {
    await execute({ command: 'disableClient', username });
    try {
        await execute({ command: 'setClientPassword', username, password });
        await execute({ command: 'enableClient', username });
    } catch (error) {
        // Avoid leaving a Node permanently disabled after a partial password rotation.
        try { await execute({ command: 'enableClient', username }); } catch { /* surface original error */ }
        throw error;
    }
};
exports.buildNodeRole = buildNodeRole;
