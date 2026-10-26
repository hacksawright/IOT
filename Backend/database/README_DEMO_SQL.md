# Khởi tạo MySQL và dữ liệu demo

## Cách chạy nhanh

1. Mở MySQL Workbench, chọn tab SQL hoặc dùng terminal.
2. Chạy toàn bộ file `database/smart_agri_mysql_demo.sql`.
3. File tạo database `iot`, schema theo các Sequelize model hiện tại, rồi chèn dữ liệu demo cho các màn hình.
4. Tạo `Backend/.env` từ `.env.example`, bảo đảm các biến MySQL đúng với database vừa tạo:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=iot
DB_USER=root
DB_PASSWORD=mat_khau_mysql_cua_ban
JWT_SECRET=thay_bang_chuoi_ngau_nhien_dai
MQTT_ENABLED=false
```

Để kiểm tra giao diện chỉ bằng dữ liệu demo, có thể tạm đặt `MQTT_ENABLED=false`; khi muốn chạy ESP32/AI thực tế thì cấu hình lại broker và bật MQTT.

Terminal tại thư mục `Backend`:

```bash
npm install
npm run test:security
npm run dev
```

Terminal thứ hai tại thư mục `Frontend`:

```bash
npm install
npm run dev
```

Mở URL Vite hiện ra (thường là `http://localhost:5173`).

## Tài khoản demo

Tất cả tài khoản mẫu dùng mật khẩu `Demo@12345678`:

| Username | Vai trò | Email |
|---|---|---|
| `admin` | Admin | admin@iot.vn |
| `operator1` | Operator | operator1@iot.vn |
| `operator2` | Operator | operator2@iot.vn |
| `viewer1` | Viewer | viewer1@iot.vn |
| `viewer2` | Viewer | viewer2@iot.vn |

Đây là mật khẩu demo dùng chung, chỉ dùng local. Đổi mật khẩu / xóa tài khoản demo trước khi triển khai thật. Vì đã có tài khoản Admin trong seed SQL, không cần chạy `npm run seed:admin` để tạo tài khoản đó.

## Ảnh demo cho lịch sử AI

SQL gán `leafAnalyses.imagePath = 'demo-late-blight.jpg'`. Sau khi giải nén gói demo, ảnh đã ở đúng đường dẫn mặc định:

`Backend/storage/analysis-images/demo-late-blight.jpg`

Nếu chỉ chạy riêng file SQL mà không lấy ảnh kèm theo, bản ghi AI vẫn có trong giao diện nhưng API xem ảnh sẽ báo không tìm thấy file.

## Ghi chú quan trọng

- Chỉ dùng script này trên database mới/trống. Script không xóa bảng, nhưng dữ liệu demo dùng ID cố định và `ON DUPLICATE KEY UPDATE` để dễ chạy lại.
- Tên database trong `.env` phải trùng `DB_NAME` trong backend. Nếu đổi tên database, đổi dòng `USE iot;` trong SQL tương ứng.
- Các bản ghi treatment, telemetry, cảnh báo, lệnh và audit là dữ liệu giả lập để kiểm tra UI. Nội dung điều trị được đánh dấu DEMO, không dùng làm chỉ dẫn canh tác thực tế.
- SQL chèn được history/alerts nhưng không phát Socket.IO; khi tải lại trang, frontend đọc dữ liệu từ API. Realtime chỉ xuất hiện với sự kiện mới kể từ khi backend đang chạy.
- Trường `imagePath` chỉ là tên file. Ảnh được lưu trong filesystem, không lưu nhị phân vào MySQL.
