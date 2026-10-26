require('dotenv').config();

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true');

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: num(process.env.PORT, 3000),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: num(process.env.DB_PORT, 3306),
        name: process.env.DB_NAME || 'iot',
        user: process.env.DB_USER || 'root',
        pass: process.env.DB_PASSWORD || process.env.DB_PASS || (process.env.NODE_ENV === 'production' ? '' : '123456'),
        sync: process.env.DB_SYNC || 'safe',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    },
    mqtt: {
        enabled: bool(process.env.MQTT_ENABLED, true),
        url: process.env.MQTT_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME || '',
        password: process.env.MQTT_PASSWORD || '',
        prefix: process.env.MQTT_TOPIC_PREFIX || 'agri',
    },
    heartbeatSweepSec: num(process.env.HEARTBEAT_SWEEP_SEC, 10),
    commandAckTimeoutSec: num(process.env.COMMAND_ACK_TIMEOUT_SEC, 15),
    ai: {
        minConfidence: num(process.env.AI_MIN_CONFIDENCE, 0.5),
        imageMaxBytes: num(process.env.AI_IMAGE_MAX_BYTES, 5 * 1024 * 1024),
        imageStorageDir: process.env.AI_IMAGE_STORAGE_DIR || 'storage/analysis-images',
    },
};

if (env.nodeEnv === 'production' && env.jwt.secret === 'dev-secret-change-me') {
    throw new Error('Phải đặt JWT_SECRET khi chạy production');
}
if (!Number.isFinite(env.ai.minConfidence) || env.ai.minConfidence < 0 || env.ai.minConfidence > 1) {
    throw new Error('AI_MIN_CONFIDENCE phải là số từ 0 đến 1');
}
if (!Number.isSafeInteger(env.ai.imageMaxBytes) || env.ai.imageMaxBytes < 1 || env.ai.imageMaxBytes > 50 * 1024 * 1024) {
    throw new Error('AI_IMAGE_MAX_BYTES phải là số nguyên từ 1 đến 52428800');
}

module.exports = env;
