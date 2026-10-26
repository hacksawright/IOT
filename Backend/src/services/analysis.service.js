const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { Disease, LeafAnalysis, Treatment, Alert } = require('../models');
const ApiError = require('../utils/apiError');
const env = require('../config/env');
const alertService = require('./alert.service');
const socket = require('./socket.service');
const audit = require('./audit.service');
const imageStorage = require('./analysis-image.storage');
const { normalizeExternalResult } = require('./analysis-result-payload');

exports.fullInclude = [
  { association: 'device', attributes: ['id', 'deviceCode', 'name', 'location'] },
  { association: 'disease', include: [{ model: Treatment, as: 'treatments' }] },
];

async function findDisease(labels, names) {
  const conditions = [];
  if (labels.length) conditions.push({ modelLabel: { [Op.in]: labels } });
  if (names.length) {
    conditions.push({ nameVi: { [Op.in]: names } });
    conditions.push({ nameEn: { [Op.in]: names } });
  }
  const matches = await Disease.findAll({ where: { [Op.or]: conditions } });
  const unique = [...new Map(matches.map((disease) => [Number(disease.id), disease])).values()];
  if (!unique.length) {
    const label = [...labels, ...names].join(' / ');
    throw ApiError.unprocessable(`Tên/nhãn bệnh "${label}" chưa có trong danh mục diseases`);
  }
  if (unique.length > 1) {
    throw ApiError.unprocessable('Kết quả AI chứa tên/nhãn khớp với nhiều bệnh trong database; hãy gửi modelLabel chính xác');
  }
  return unique[0];
}

function parseCapturedAt(body) {
  const timeValue = body.capturedAt ?? body.timestamp ?? body.ts;
  const capturedAt = timeValue === undefined || timeValue === null || timeValue === ''
    ? new Date()
    : new Date(timeValue);
  if (Number.isNaN(capturedAt.getTime())) throw ApiError.badRequest('capturedAt/timestamp không hợp lệ');
  if (capturedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw ApiError.badRequest('Thời gian nhận diện không được ở quá 5 phút trong tương lai');
  }
  return capturedAt;
}

function makeEventId(value, capturedAt, disease) {
  if (value.eventId) return value.eventId;
  const imageDigest = crypto.createHash('sha256').update(value.imageBuffer).digest('hex');
  const fingerprint = JSON.stringify({
    capturedAt: capturedAt.toISOString(),
    diseaseId: disease.id,
    confidence: value.confidence,
    modelVersion: value.modelVersion,
    inferenceMs: value.inferenceMs,
    boundingBoxes: value.boundingBoxes,
    imageDigest,
  });
  // Dùng hash làm idempotency key nếu bên gửi không cấp eventId ổn định.
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
}

async function loadDuplicate(eventId) {
  const existing = await LeafAnalysis.findOne({ where: { eventId } });
  if (!existing) return null;
  const analysis = await LeafAnalysis.findByPk(existing.id, { include: exports.fullInclude });
  const alert = await Alert.findOne({ where: { analysisId: existing.id, type: 'disease' } });
  return { analysis, alert, duplicate: true };
}

/**
 * Nhận kết quả qua MQTT topic {MQTT_TOPIC_PREFIX}/ai/result.
 * Bản tin bắt buộc kèm ảnh Base64; backend lưu ảnh vào local storage và chỉ lưu tên file trong DB.
 * Không cần deviceCode/camera/source để lưu lịch sử.
 */
exports.recordMqttResult = async (result) => {
  const normalized = normalizeExternalResult(result, { maxImageBytes: env.ai.imageMaxBytes });
  if (!normalized.ok) throw ApiError.badRequest(normalized.message);
  const value = normalized.value;
  const body = result || {};
  const capturedAt = parseCapturedAt(body);
  const disease = await findDisease(value.labels, value.names);
  const eventId = makeEventId(value, capturedAt, disease);

  const duplicate = await loadDuplicate(eventId);
  if (duplicate) return duplicate;

  const imagePath = await imageStorage.save(value.imageBuffer, value.imageMimeType);
  let analysis;
  try {
    analysis = await LeafAnalysis.create({
      eventId,
      deviceId: null,
      capturedAt,
      diseaseId: disease.id,
      confidence: value.confidence,
      boundingBoxes: value.boundingBoxes,
      imagePath,
      modelVersion: value.modelVersion,
      inferenceMs: value.inferenceMs,
    });
  } catch (error) {
    await imageStorage.remove(imagePath).catch((cleanupError) => {
      console.error('[analysis] không xóa được ảnh tạm:', cleanupError.message);
    });
    // MQTT QoS 1 có thể giao cùng event đồng thời; trả lại bản ghi đã được worker khác tạo.
    if (error.name === 'SequelizeUniqueConstraintError') {
      const raced = await loadDuplicate(eventId);
      if (raced) return raced;
    }
    throw error;
  }

  const isDiseaseAlert = !disease.isHealthy && value.confidence >= env.ai.minConfidence;
  let alert = null;
  if (isDiseaseAlert) {
    const pct = Math.round(value.confidence * 100);
    alert = await alertService.create({
      type: 'disease',
      severity: value.confidence >= 0.85 ? 'CRITICAL' : 'WARNING',
      title: `Phát hiện bệnh ${disease.nameVi}`,
      message: `Bệnh: ${disease.nameVi} (độ tin cậy ${pct}%)`,
      deviceId: null,
      analysisId: analysis.id,
    });
  }

  const full = await LeafAnalysis.findByPk(analysis.id, { include: exports.fullInclude });
  socket.emitAuthenticated('analysis:new', full);
  return { analysis: full, alert, duplicate: false };
};

exports.handleMqttResult = async (payload) => {
  let result;
  try {
    result = await exports.recordMqttResult(payload);
  } catch (error) {
    await audit.log(null, {
      action: 'analysis.mqtt_rejected',
      entityType: 'leafAnalysis',
      success: false,
      detail: { reason: String(error.message || 'invalid MQTT AI result').slice(0, 250) },
    });
    throw error;
  }
  await audit.log(null, {
    action: result.duplicate ? 'analysis.mqtt_duplicate' : 'analysis.mqtt_received',
    entityType: 'leafAnalysis',
    entityId: result.analysis.id,
    detail: {
      eventId: result.analysis.eventId,
      diseaseId: result.analysis.diseaseId,
      confidence: result.analysis.confidence,
      modelVersion: result.analysis.modelVersion,
      duplicate: result.duplicate,
      imageSaved: Boolean(result.analysis.imagePath),
    },
  });
  return result;
};
