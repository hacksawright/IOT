const multer = require('multer');
const ApiError = require('../utils/apiError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16 * 1024, parts: 2 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) return cb(ApiError.badRequest('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP'));
    cb(null, true);
  },
}).single('file');

module.exports = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Ảnh vượt giới hạn 10 MB' : `Multipart không hợp lệ: ${error.message}`;
    return next(ApiError.badRequest(message));
  }
  next(error);
});
