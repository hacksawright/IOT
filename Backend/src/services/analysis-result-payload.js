const MAX_LABEL_LENGTH = 120;
const MAX_BOUNDING_BOXES = 500;
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function collectStrings(values, fieldName) {
    const output = [];
    for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        if (typeof value !== 'string') return { ok: false, message: `${fieldName} phải là chuỗi` };
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
            return { ok: false, message: `${fieldName} không hợp lệ hoặc vượt ${MAX_LABEL_LENGTH} ký tự` };
        }
        if (!output.some((item) => item.toLowerCase() === trimmed.toLowerCase())) output.push(trimmed);
    }
    return { ok: true, values: output };
}

function detectImageMimeType(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) return 'image/png';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    return null;
}

function decodeImage(input, maxImageBytes) {
    const imageObject = input.image && typeof input.image === 'object' && !Array.isArray(input.image)
        ? input.image : {};
    let rawBase64 = input.imageBase64 ?? input.image_base64 ?? imageObject.base64 ?? imageObject.data;
    const declaredMime = input.imageMimeType ?? input.image_mime_type ?? imageObject.mimeType ?? imageObject.mime_type;
    let dataUriMime = null;

    if (typeof rawBase64 !== 'string' || !rawBase64.trim()) {
        return { ok: false, message: 'Cần imageBase64 (Base64 của ảnh JPEG, PNG hoặc WebP)' };
    }

    rawBase64 = rawBase64.trim();
    const dataUriMatch = rawBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i);
    if (dataUriMatch) {
        dataUriMime = dataUriMatch[1].toLowerCase();
        rawBase64 = dataUriMatch[2];
    } else if (/^data:/i.test(rawBase64)) {
        return { ok: false, message: 'Ảnh Data URI phải có dạng data:image/jpeg;base64,... (hoặc PNG/WebP)' };
    }

    const base64 = rawBase64.replace(/\s+/g, '');
    // Reject invalid Base64 rather than letting Buffer.from silently discard bad characters.
    if (!base64 || base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
        return { ok: false, message: 'imageBase64 không phải chuỗi Base64 hợp lệ' };
    }
    const estimatedBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (estimatedBytes <= 0 || estimatedBytes > maxImageBytes) {
        return { ok: false, message: `Ảnh phải có kích thước từ 1 byte đến ${maxImageBytes} byte` };
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > maxImageBytes) {
        return { ok: false, message: `Ảnh phải có kích thước từ 1 byte đến ${maxImageBytes} byte` };
    }

    const actualMime = detectImageMimeType(buffer);
    if (!actualMime || !ALLOWED_IMAGE_MIME_TYPES.has(actualMime)) {
        return { ok: false, message: 'Nội dung file không phải ảnh JPEG, PNG hoặc WebP hợp lệ' };
    }
    const requestedMime = typeof declaredMime === 'string' && declaredMime.trim()
        ? declaredMime.trim().toLowerCase()
        : dataUriMime;
    if (requestedMime && requestedMime !== actualMime) {
        return { ok: false, message: `imageMimeType không khớp định dạng ảnh thực tế (${actualMime})` };
    }

    return { ok: true, value: { imageBuffer: buffer, imageMimeType: actualMime } };
}

exports.normalizeExternalResult = (input, options = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, message: 'Payload phải là JSON object' };
    }

    const maxImageBytes = Number.isInteger(options.maxImageBytes) && options.maxImageBytes > 0
        ? options.maxImageBytes : DEFAULT_MAX_IMAGE_BYTES;

    const diseaseObject = input.disease && typeof input.disease === 'object' && !Array.isArray(input.disease)
        ? input.disease : {};
    const diseaseString = typeof input.disease === 'string' ? input.disease : undefined;

    const labels = collectStrings([
        input.diseaseLabel,
        input.disease_label,
        input.modelLabel,
        input.model_label,
        input.label,
        diseaseObject.label,
        diseaseObject.modelLabel,
        diseaseString,
    ], 'diseaseLabel/label');
    if (!labels.ok) return labels;

    const names = collectStrings([
        input.diseaseName,
        input.disease_name,
        input.name,
        input.nameVi,
        input.name_vi,
        input.nameEn,
        input.name_en,
        diseaseObject.name,
        diseaseObject.nameVi,
        diseaseObject.nameEn,
        diseaseString,
    ], 'diseaseName');
    if (!names.ok) return names;
    if (!labels.values.length && !names.values.length) {
        return { ok: false, message: 'Cần diseaseLabel/modelLabel/label hoặc diseaseName' };
    }

    const rawConfidence = input.confidence ?? diseaseObject.confidence;
    const confidence = typeof rawConfidence === 'number' ? rawConfidence : Number.NaN;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return { ok: false, message: 'confidence phải là số từ 0 đến 1' };
    }

    const rawVersion = input.modelVersion ?? input.model_version;
    const modelVersion = rawVersion === undefined || rawVersion === null || rawVersion === ''
        ? 'external'
        : (typeof rawVersion === 'string' ? rawVersion.trim() : '');
    if (!modelVersion || modelVersion.length > 50) {
        return { ok: false, message: 'modelVersion phải là chuỗi tối đa 50 ký tự' };
    }

    const rawInferenceMs = input.inferenceMs ?? input.inference_ms;
    let inferenceMs = null;
    if (rawInferenceMs !== undefined && rawInferenceMs !== null && rawInferenceMs !== '') {
        inferenceMs = typeof rawInferenceMs === 'number' ? rawInferenceMs : Number.NaN;
        if (!Number.isInteger(inferenceMs) || inferenceMs < 0 || inferenceMs > 3600000) {
            return { ok: false, message: 'inferenceMs phải là số nguyên từ 0 đến 3600000' };
        }
    }

    const rawBoxes = input.boundingBoxes ?? input.bounding_boxes;
    let boundingBoxes = null;
    if (rawBoxes !== undefined && rawBoxes !== null) {
        if (!Array.isArray(rawBoxes) || rawBoxes.length > MAX_BOUNDING_BOXES) {
            return { ok: false, message: `boundingBoxes phải là mảng tối đa ${MAX_BOUNDING_BOXES} phần tử` };
        }
        boundingBoxes = rawBoxes;
    }

    const rawEventId = input.eventId ?? input.event_id;
    let eventId = null;
    if (rawEventId !== undefined && rawEventId !== null && rawEventId !== '') {
        if (typeof rawEventId !== 'string') return { ok: false, message: 'eventId phải là chuỗi' };
        eventId = rawEventId.trim();
        if (!eventId || eventId.length > 100 || /[\u0000-\u001f\u007f]/.test(eventId)) {
            return { ok: false, message: 'eventId phải là chuỗi 1–100 ký tự và không chứa ký tự điều khiển' };
        }
    }

    const image = decodeImage(input, maxImageBytes);
    if (!image.ok) return image;

    return {
        ok: true,
        value: {
            labels: labels.values,
            names: names.values,
            confidence,
            modelVersion,
            inferenceMs,
            boundingBoxes,
            eventId,
            imageBuffer: image.value.imageBuffer,
            imageMimeType: image.value.imageMimeType,
        },
    };
};

exports.detectImageMimeType = detectImageMimeType;
