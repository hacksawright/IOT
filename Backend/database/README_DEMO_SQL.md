# MySQL schema + demo data

## Database mới

1. Tạo database MySQL `iot`.
2. Chạy `smart_agri_mysql_demo.sql` bằng MySQL 8.0+.
3. Tạo file `Backend/.env` từ `.env.example`, cấu hình DB/JWT/AI/Cloudinary.
4. Chạy `npm run seed` trong Backend để bảo đảm có Admin, danh mục bệnh và Camera mẫu `CAM-001`.
5. Admin đăng nhập rồi cấp Camera token qua `POST /api/camera/tokens/CAM-001`.

Tài khoản demo trong SQL: `admin / Demo@12345678`. Đổi/xóa tài khoản demo trước khi dùng môi trường thật. Script `seed.js` tạo Admin theo `BOOTSTRAP_ADMIN_*`; password cần ít nhất 12 ký tự.

## Database đã tồn tại

Chạy migration `migrations/20261115_camera_http_cloudinary.sql` trước khi deploy code mới. Migration thêm:
- `cameraTokens`: hash token Camera, hạn dùng, trạng thái thu hồi và lần sử dụng gần nhất.
- `leafAnalyses.imageUrl`: secure URL từ Cloudinary.
- `leafAnalyses.cloudinaryPublicId`: định danh asset để xóa/quản lý Cloudinary.
- `leafAnalyses.imageSha256`: checksum ảnh nhận được.

Sau đó chạy `npm run seed`.

## Lưu ý bảo mật

- Không seed sẵn Camera token; Admin phải cấp token riêng.
- Token thô chỉ trả về một lần, DB chỉ lưu SHA-256 hash.
- Không commit `.env`, `CLOUDINARY_API_SECRET`, `AI_API_KEY` hoặc token Camera.
- Ảnh mới được upload Cloudinary; database lưu URL, public ID, SHA-256 và kết quả AI.
