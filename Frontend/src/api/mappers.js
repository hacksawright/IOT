import { formatTime } from '../utils/format';

// Giá trị metric trong DB -> khóa mà biểu đồ dùng. Nhận cả dạng camelCase vì
// ingest.service.js đang ghi chú payload kiểu "soilMoisture".
const METRIC_KEY = {
  AIR_TEMPERATURE: 'temperature',
  AIR_HUMIDITY: 'humidity',
  SOIL_MOISTURE: 'soil',
  airTemperature: 'temperature',
  airHumidity: 'humidity',
  soilMoisture: 'soil',
  temperature: 'temperature',
  humidity: 'humidity',
  soil: 'soil',
};
const KEYS = ['temperature', 'humidity', 'soil'];
const BUCKET_MS = 5000; // các chỉ số đo cách nhau dưới 5 giây được gộp thành một điểm

export const metricKey = (metric) => METRIC_KEY[metric] ?? null;

/**
 * Backend lưu mỗi chỉ số một dòng (sensor_readings), biểu đồ cần mỗi điểm đủ 3 chỉ số.
 * Gộp theo khoảng thời gian, chỉ số nào thiếu thì lấy lại giá trị gần nhất.
 */
export function toChartPoints(rows, maxPoints = 30, bucketMs = BUCKET_MS) {
  const sorted = rows
    .map((r) => ({ key: metricKey(r.metric), value: Number(r.value), t: new Date(r.recordedAt).getTime() }))
    .filter((r) => r.key && Number.isFinite(r.value) && Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  const last = {};
  const points = [];
  let bucket = null;
  let current = null;

  for (const r of sorted) {
    last[r.key] = r.value;
    const b = Math.floor(r.t / bucketMs);
    if (b !== bucket) {
      bucket = b;
      current = null;
    }
    if (!KEYS.every((k) => last[k] !== undefined)) continue; // chưa đủ 3 chỉ số
    if (current) {
      current[r.key] = r.value;
    } else {
      current = { time: new Date(r.t), temperature: last.temperature, humidity: last.humidity, soil: last.soil };
      points.push(current);
    }
  }
  return points.slice(-maxPoints);
}

/**
 * Thêm một bản ghi realtime (sự kiện socket 'reading') vào chuỗi điểm.
 * `known` là object giữ giá trị gần nhất của từng chỉ số (dùng useRef), được cập nhật tại chỗ.
 */
export function appendReading(series, reading, known, maxPoints = 30, bucketMs = BUCKET_MS) {
  const key = metricKey(reading.metric);
  const value = Number(reading.value);
  const t = new Date(reading.recordedAt ?? Date.now());
  if (!key || !Number.isFinite(value) || Number.isNaN(t.getTime())) return series;

  known[key] = value;
  if (!KEYS.every((k) => known[k] !== undefined)) return series;

  const prev = series[series.length - 1];
  if (prev && Math.abs(t - prev.time) < bucketMs) {
    return [...series.slice(0, -1), { ...prev, [key]: value }];
  }
  return [...series, { time: t, temperature: known.temperature, humidity: known.humidity, soil: known.soil }].slice(-maxPoints);
}

// Device (kèm node) -> thẻ "Trạng Thái Thiết Bị"
export function toDeviceCard(d) {
  const lifecycle = String(d.lifecycle).toUpperCase();
  const status = lifecycle === 'FAULT' ? 'ERROR' : d.node?.isOnline ? 'ONLINE' : 'OFFLINE';
  return { id: d.id, name: d.name, type: String(d.type).toUpperCase(), status, isOn: Boolean(d.isOn) };
}

// [{ severity, count }] -> { critical, warning, info }
export function summarizeAlerts(rows = []) {
  const out = { critical: 0, warning: 0, info: 0 };
  for (const r of rows) {
    const key = String(r.severity).toLowerCase();
    if (key in out) out[key] = Number(r.count);
  }
  return out;
}

// Alert -> dòng trong "Sự Kiện Gần Đây"
export function eventFromAlert(a) {
  const type = String(a.type).toUpperCase();
  const severity = String(a.severity).toUpperCase();
  const kind = type === 'DISEASE' ? 'ai' : severity === 'INFO' ? 'info' : 'warning';
  return {
    id: `alert-${a.id}`,
    time: formatTime(new Date(a.createdAt)),
    kind,
    text: a.message ? `${a.title}: ${a.message}` : a.title,
  };
}

// AuditLog -> dòng sự kiện (chỉ admin gọi được /audit-logs)
export function eventFromAudit(l) {
  return {
    id: `audit-${l.id}`,
    time: formatTime(new Date(l.createdAt)),
    kind: l.success === false ? 'warning' : 'success',
    text: `${l.user?.username ?? 'Hệ thống'}: ${l.action}`,
  };
}
