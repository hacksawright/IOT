const { Op } = require('sequelize');
const { Device, Node, SensorReading, Alert } = require('../models');
const { METRICS } = require('../constants');
const nodeService = require('./node.service');
const commandService = require('./command.service');
const automation = require('./automation.service');
const socket = require('./socket.service');
const alertService = require('./alert.service');
const audit = require('./audit.service');
/**
 * telemetry payload (node → server):
 * { "ts": "2026-10-06T08:00:00Z", "backfilled": false,
 *   "readings": [ { "deviceCode": "SOIL-01", "metric": "SOIL_MOISTURE", "value": 28.4, "ts": "..." } ] }
 * Khi mạng khôi phục, node gửi bù các bản ghi cũ với "backfilled": true.
 */
async function onTelemetry(node, payload) {
  const items = Array.isArray(payload.readings) ? payload.readings : [];
  if (!items.length) return;

  const devices = await Device.findAll({ where: { nodeId: node.id } });
  const byCode = Object.fromEntries(devices.map((d) => [d.deviceCode, d]));
  const codeById = new Map(devices.map((d) => [Number(d.id), d.deviceCode]));
  const activeSensorIds = new Set(devices.filter((d) => d.type === 'SENSOR' && d.lifecycle === 'ACTIVE').map((d) => Number(d.id)));
  const now = new Date();
  const rows = [];

  for (const r of items) {
    const reportedCode = typeof r.deviceCode === 'string' ? r.deviceCode.trim() : '';
    if (!reportedCode) continue; // MQTT payload phải dùng deviceCode, không dùng DB deviceId.
    const dev = byCode[reportedCode];
    if (!dev || dev.type !== 'SENSOR' || !['ACTIVE', 'FAULT'].includes(dev.lifecycle)) continue;
    if (!METRICS.includes(r.metric)) continue;
    const value = Number(r.value);
    if (!Number.isFinite(value)) continue;
    if (['SOIL_MOISTURE', 'AIR_HUMIDITY'].includes(r.metric) && (value < 0 || value > 100)) continue;
    const timestampValue = r.ts ?? payload.ts;
    const ts = timestampValue ? new Date(timestampValue) : now;
    if (isNaN(ts) || ts.getTime() > now.getTime() + 5 * 60 * 1000) continue;
    rows.push({
      deviceId: dev.id,
      metric: r.metric,
      recordedAt: ts,
      value,
      isBackfilled: (r.backfilled ?? payload.backfilled) === true,
      receivedAt: now,
    });
  }
  if (!rows.length) return;

  // MQTT QoS 1 can redeliver packets. De-duplicate both within the payload and against the DB
  // primary key so a replay does not emit duplicate UI events or retrigger automation.
  const seen = new Set();
  const candidates = rows.filter((row) => {
    const key = `${row.deviceId}|${row.metric}|${new Date(row.recordedAt).getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!candidates.length) return;
  const deviceIds = [...new Set(candidates.map((row) => row.deviceId))];
  const metrics = [...new Set(candidates.map((row) => row.metric))];
  const times = candidates.map((row) => new Date(row.recordedAt).getTime());
  const existing = await SensorReading.findAll({
    where: {
      deviceId: { [Op.in]: deviceIds },
      metric: { [Op.in]: metrics },
      recordedAt: {
        [Op.gte]: new Date(Math.min(...times)),
        [Op.lte]: new Date(Math.max(...times)),
      },
    },
    attributes: ['deviceId', 'metric', 'recordedAt'],
    raw: true,
  });
  const existingKeys = new Set(existing.map((row) => `${row.deviceId}|${row.metric}|${new Date(row.recordedAt).getTime()}`));
  const freshRows = candidates.filter((row) => !existingKeys.has(`${row.deviceId}|${row.metric}|${new Date(row.recordedAt).getTime()}`));
  if (!freshRows.length) return;
  await SensorReading.bulkCreate(freshRows, { ignoreDuplicates: true });

  for (const row of freshRows) {
    const deviceCode = codeById.get(Number(row.deviceId));
    socket.emitDevice(row.deviceId, 'reading', {
      deviceId: row.deviceId, deviceCode, metric: row.metric, value: row.value,
      recordedAt: row.recordedAt, isBackfilled: row.isBackfilled,
    });
    // Chỉ tự động hóa với dữ liệu "tươi", không chạy lại trên dữ liệu gửi bù.
    // deviceId dùng cho DB; deviceCode dùng làm khóa thiết bị ổn định trong config.
    const ageMs = now.getTime() - new Date(row.recordedAt).getTime();
    if (!row.isBackfilled && activeSensorIds.has(Number(row.deviceId)) && ageMs >= 0 && ageMs < 5 * 60 * 1000) {
      await automation.evaluate({ ...row, deviceCode });
    }
  }
}
exports.handle = async (nodeCode, kind, payload) => {
  const node = await Node.findOne({ where: { nodeCode: nodeCode } });
  if (!node || node.isRevoked) return; // node lạ hoặc đã thu hồi: bỏ qua

  switch (kind) {
    case 'heartbeat':
      return nodeService.markAlive(node, { firmwareVersion: payload.firmwareVersion });
    case 'telemetry':
      await nodeService.markAlive(node);
      return onTelemetry(node, payload);
    case 'status': {
      // Device fault event: { deviceCode, deviceStatus: "FAULT", message }.
      // Also accepts { deviceCode, status: "FAULT" } for simpler firmware payloads.
      const deviceStatus = String(payload.deviceStatus || (payload.deviceCode ? payload.status : '') || '').toUpperCase();
      if (payload.deviceCode && deviceStatus) {
        await nodeService.markAlive(node);
        if (deviceStatus !== 'FAULT') return undefined; // ACTIVE does not auto-clear a fault; Admin verifies recovery.
        const deviceCode = String(payload.deviceCode).trim();
        const device = await Device.findOne({ where: { nodeId: node.id, deviceCode } });
        if (!device || ['REGISTERED', 'DECOMMISSIONED'].includes(device.lifecycle)) return undefined;
        if (device.lifecycle !== 'FAULT') {
          device.lifecycle = 'FAULT';
          await device.save();
          socket.emitDevice(device.id, 'device:update', device);
        }
        const existing = await Alert.findOne({ where: { deviceId: device.id, type: 'fault', status: { [Op.ne]: 'RESOLVED' } } });
        if (!existing) {
          await alertService.create({
            type: 'fault', severity: 'CRITICAL',
            title: `Thiết bị ${device.name} báo lỗi`,
            message: String(payload.message || 'Firmware báo trạng thái FAULT').slice(0, 2000),
            deviceId: device.id,
          });
        }
        await audit.log(null, {
          action: 'device.fault_report', entityType: 'device', entityId: device.id,
          detail: { nodeId: node.id, nodeCode: node.nodeCode, message: String(payload.message || '').slice(0, 500) },
        });
        return undefined;
      }
      // Retained/LWT: Node status "online" | "offline" (raw string or { status }).
      const nodeStatus = String(payload.status || payload.raw || '').toLowerCase();
      if (nodeStatus === 'offline') return nodeService.markOffline(node, 'node báo offline (LWT)');
      if (nodeStatus === 'online') return nodeService.markAlive(node);
      return undefined;
    }
    case 'command/ack': {
      // A malformed, mismatched, replayed or late ACK must not refresh the Node heartbeat.
      // Only an ACK correlated to a current command on this Node proves the exchange was valid.
      const accepted = await commandService.handleAck(node, payload);
      if (accepted) await nodeService.markAlive(node);
      return undefined;
    }
    case 'config/ack': {
      await nodeService.markAlive(node);
      const deviceCode = typeof payload.deviceCode === 'string' ? payload.deviceCode.trim() : '';
      if (!deviceCode) return undefined;
      const dev = await Device.findOne({ where: { nodeId: node.id, deviceCode } });
      const version = Number(payload.version);
      if (dev && Number.isInteger(version) && version === dev.configVersion && version > dev.configAppliedVersion) {
        dev.configAppliedVersion = version;
        await dev.save();
        await audit.log(null, { action: 'device.config_applied', entityType: 'device', entityId: dev.id, detail: { deviceCode, nodeCode: node.nodeCode, version } });
      }
      return undefined;
    }
    default:
  }
};
