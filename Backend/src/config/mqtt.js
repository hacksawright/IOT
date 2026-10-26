const env = require('./env');

const PREFIX = env.mqtt.prefix; // mặc định "agri"

// ---- Tùy chọn kết nối tới broker (truyền vào mqtt.connect) ----
const connectOptions = {
    username: env.mqtt.username || undefined,
    password: env.mqtt.password || undefined,
    clientId: `agri-backend-${process.pid}`, // mỗi tiến trình một clientId, tránh bị broker đá nhau
    clean: true,
    keepalive: 30,
    reconnectPeriod: 3000,   // tự nối lại sau 3 giây
    connectTimeout: 10000,
    // Backend tự báo trạng thái để các bên khác biết khi nó chết bất thường (LWT)
    will: {
        topic: `${PREFIX}/_backend/status`,
        payload: 'offline',
        qos: 1,
        retain: true,
    },
};

// ---- Topic quy ước ----
// AI bên ngoài → server : {prefix}/ai/result (JSON + ảnh Base64)
// node → server : {prefix}/{node_code}/telemetry | heartbeat | status | command/ack | config/ack
// server → node : {prefix}/{node_code}/command   | config
const subscribeTopics = [
    `${PREFIX}/+/telemetry`,
    `${PREFIX}/+/heartbeat`,
    `${PREFIX}/+/status`,
    `${PREFIX}/+/command/ack`,
    `${PREFIX}/+/config/ack`,
    `${PREFIX}/ai/result`,
];

const topics = {
    command: (nodeCode) => `${PREFIX}/${nodeCode}/command`,
    config: (nodeCode) => `${PREFIX}/${nodeCode}/config`,
    backendStatus: `${PREFIX}/_backend/status`,
    aiResult: `${PREFIX}/ai/result`,
};

// "agri/NODE-01/command/ack" → { nodeCode: "NODE-01", kind: "command/ack" }
const parseTopic = (topic) => {
    if (topic === `${PREFIX}/ai/result`) return { nodeCode: null, kind: 'ai/result' };
    const [, nodeCode, ...rest] = topic.split('/');
    return { nodeCode, kind: rest.join('/') };
};

// ---- QoS & retain theo từng loại bản tin ----
const qos = {
    subscribe: 1,
    command: 1,    // lệnh bơm/quạt: không được mất
    config: 1,
};
const retain = {
    command: false, // lệnh cũ không được phát lại khi node nối lại
    config: false,  // server tự đẩy lại config khi node online (xem node.service)
};

module.exports = {
    enabled: env.mqtt.enabled,
    url: env.mqtt.url,
    prefix: PREFIX,
    connectOptions,
    subscribeTopics,
    topics,
    parseTopic,
    qos,
    retain,
};