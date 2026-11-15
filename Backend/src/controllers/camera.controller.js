const crypto = require('node:crypto');
const { CameraToken, Device } = require('../models');
const ApiError = require('../utils/apiError');
const audit = require('../services/audit.service');
const analysisService = require('../services/analysis.service');
const { Device: DeviceModel } = require('../models');
const { createWithSequentialCode } = require('../services/code-generator');


exports.register = async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) throw ApiError.badRequest('name Camera là bắt buộc, tối đa 100 ký tự');
  const location = req.body?.location ? String(req.body.location).trim().slice(0, 150) : null;
  const interval = req.body?.captureIntervalSeconds === undefined ? 60 : Number(req.body.captureIntervalSeconds);
  if (!Number.isInteger(interval) || interval < 5 || interval > 86400) {
    throw ApiError.badRequest('captureIntervalSeconds phải từ 5 đến 86400 giây');
  }
  const created = await createWithSequentialCode({
    prefix: 'CAM', Model: DeviceModel, field: 'deviceCode',
    values: {
      name, type: 'CAMERA', location, nodeId: null, gpioPin: null,
      lifecycle: 'REGISTERED', isOn: false, config: { captureIntervalSeconds: interval },
      configVersion: 0, configAppliedVersion: 0,
    },
  });
  await audit.log(req, {
    action: 'camera.created', entityType: 'device', entityId: created.record.id,
    detail: { cameraId: created.record.deviceCode, location },
  });
  res.status(201).json({ data: created.record, meta: { cameraIdGenerated: true } });
};

exports.issueToken = async (req, res) => {
  const cameraCode = String(req.params.cameraId || '').trim();
  if (!cameraCode || cameraCode.length > 50) throw ApiError.badRequest('cameraId không hợp lệ');
  const camera = await Device.findOne({ where: { deviceCode: cameraCode, type: 'CAMERA' } });
  if (!camera) throw ApiError.notFound('Không tìm thấy Camera theo deviceCode');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let expiresAt = null;
  if (req.body?.expiresInDays !== undefined) {
    const days = Number(req.body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw ApiError.badRequest('expiresInDays phải từ 1 đến 365');
    expiresAt = new Date(Date.now() + days * 86400000);
  }
  await CameraToken.upsert({
    deviceId: camera.id,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: new Date(),
    lastUsedAt: null,
  });
  await audit.log(req, {
    action: 'camera.token_issued',
    entityType: 'device',
    entityId: camera.id,
    detail: { cameraId: camera.deviceCode, expiresAt },
  });
  // Token thô chỉ xuất hiện trong response lần cấp này.
  res.status(201).json({
    data: {
      cameraId: camera.deviceCode,
      token,
      expiresAt,
      uploadUrl: `${req.protocol}://${req.get('host')}/api/camera/media`,
    },
    warning: 'Hãy lưu token ngay. Server không thể hiển thị lại token này.',
  });
};

exports.revokeToken = async (req, res) => {
  const camera = await Device.findOne({ where: { deviceCode: req.params.cameraId, type: 'CAMERA' } });
  if (!camera) throw ApiError.notFound('Không tìm thấy Camera');
  await CameraToken.update({ revokedAt: new Date() }, { where: { deviceId: camera.id } });
  await audit.log(req, { action: 'camera.token_revoked', entityType: 'device', entityId: camera.id });
  res.json({ message: 'Đã thu hồi token Camera' });
};

exports.receiveMedia = async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Thiếu file trong multipart field "file"');
  let metadata;
  try {
    metadata = typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata;
  } catch {
    throw ApiError.badRequest('metadata phải là JSON hợp lệ');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw ApiError.badRequest('Cần multipart field metadata chứa JSON object');
  }
  const metadataCameraId = String(metadata.cameraId || '').trim();
  if (metadataCameraId !== req.camera.deviceCode) {
    throw ApiError.forbidden('metadata.cameraId không khớp Camera được xác thực bằng token');
  }
  const eventId = String(metadata.eventId || '').trim();
  if (!eventId || eventId.length > 100 || /[\u0000-\u001f\u007f]/.test(eventId)) {
    throw ApiError.badRequest('metadata.eventId là bắt buộc, tối đa 100 ký tự');
  }
  const result = await analysisService.processCameraImage({
    camera: req.camera,
    eventId,
    capturedAt: metadata.capturedAt || metadata.timestamp,
    image: {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    },
  });
  res.status(result.duplicate ? 200 : 201).json({
    status: result.duplicate ? 'duplicate' : 'stored',
    data: result.analysis,
    alert: result.alert,
    aiResult: result.aiResult,
    imageUrl: result.analysis.imageUrl,
  });
};

