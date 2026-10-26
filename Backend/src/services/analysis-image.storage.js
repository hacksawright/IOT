const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');

const configuredDir = process.env.AI_IMAGE_STORAGE_DIR || 'storage/analysis-images';
const STORAGE_DIR = path.isAbsolute(configuredDir)
    ? configuredDir
    : path.resolve(process.cwd(), configuredDir);
const EXTENSIONS = Object.freeze({
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
});
const MIME_TYPES = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
});

exports.save = async (buffer, mimeType) => {
    const extension = EXTENSIONS[mimeType];
    if (!Buffer.isBuffer(buffer) || !buffer.length || !extension) {
        throw ApiError.badRequest('Ảnh nhận diện không hợp lệ');
    }
    await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
    const filename = `${crypto.randomUUID()}${extension}`;
    const absolutePath = path.join(STORAGE_DIR, filename);
    await fs.writeFile(absolutePath, buffer, { flag: 'wx', mode: 0o600 });
    return filename;
};

exports.remove = async (filename) => {
    if (typeof filename !== 'string' || path.basename(filename) !== filename) return;
    try {
        await fs.unlink(path.join(STORAGE_DIR, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
};

exports.read = async (filename) => {
    if (typeof filename !== 'string' || path.basename(filename) !== filename) {
        throw ApiError.notFound('Không tìm thấy ảnh nhận diện');
    }
    const extension = path.extname(filename).toLowerCase();
    const mimeType = MIME_TYPES[extension];
    if (!mimeType) throw ApiError.notFound('Không tìm thấy ảnh nhận diện');
    try {
        const buffer = await fs.readFile(path.join(STORAGE_DIR, filename));
        return { buffer, mimeType };
    } catch (error) {
        if (error.code === 'ENOENT') throw ApiError.notFound('File ảnh không còn trên máy chủ');
        throw error;
    }
};

exports.directory = STORAGE_DIR;
