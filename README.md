# IoT Control — Full-stack source

Gói này gồm frontend React/Vite và backend Express/MySQL/MQTT/Socket.IO. Giao diện sử dụng dữ liệu API thật; không tự sinh telemetry giả. Khi database trống, các danh sách sẽ rỗng cho đến khi bạn tạo thiết bị/Node/danh mục bệnh và hệ thống nhận được telemetry hoặc kết quả AI.


## MySQL schema + dữ liệu mẫu để kiểm tra giao diện

Nếu database mới/trống và bạn muốn nạp dữ liệu demo, chạy script:

```bash
mysql -u root -p < Backend/database/smart_agri_mysql_demo.sql
```

Script tạo database `iot`, tạo 11 bảng theo các model Sequelize và thêm tài khoản, Node/thiết bị, telemetry 24 giờ gần nhất, danh mục bệnh/phác đồ demo, lịch sử AI, cảnh báo, lệnh và audit log. Tài khoản mẫu dùng chung mật khẩu `Demo@12345678`: `admin`, `operator1`, `operator2`, `viewer1`, `viewer2`. Chỉ dùng local và đổi/xóa tài khoản demo trước khi deploy.

Gói demo kèm ảnh minh họa tại `Backend/storage/analysis-images/demo-late-blight.jpg`; hãy giữ file này để liên kết `imagePath` của bản ghi AI mẫu hoạt động. Trong `Backend/.env`, đặt `DB_NAME=iot`, đúng `DB_USER`/`DB_PASSWORD`; khi chỉ kiểm tra UI có thể tạm đặt `MQTT_ENABLED=false`. Dữ liệu/phác đồ là dữ liệu giả lập, không dùng làm khuyến cáo nông nghiệp thực tế.

## 1. Chuẩn bị database và Admin đầu tiên

1. Cài MySQL và tạo database, ví dụ `iot`.
2. Mở `Backend/.env.example`, sao chép thành `Backend/.env`.
3. Điền `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; cấu hình MQTT (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC_PREFIX`) và thay `JWT_SECRET` bằng chuỗi ngẫu nhiên dài. Đặt `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` (mật khẩu ít nhất 12 ký tự).
4. Cài dependencies và khởi tạo schema + tài khoản Admin:

```bash
cd Backend
npm install
npm run seed:admin
npm run test:security
npm run dev
```

`seed:admin` tạo các bảng còn thiếu bằng Sequelize `sync()` an toàn và thêm một tài khoản Admin nếu chưa có Admin nào. Nếu đã có Admin, script không tạo tài khoản thứ hai. Không dùng `DB_SYNC=force` cho database cần giữ dữ liệu.

Sau khi chạy seed, đăng nhập bằng username/email và mật khẩu bạn đã đặt trong `Backend/.env`. Không có đăng ký công khai; Admin tạo Operator/Viewer qua trang Người dùng.

## 2. Chạy Frontend

Mở terminal thứ hai:

```bash
cd Frontend
npm install
npm run dev
```

Lần cài đầu hãy dùng `npm install` (không dùng `npm ci`) để đồng bộ `package-lock.json` với dependency `socket.io-client` vừa thêm. Mặc định `.env` frontend cấu hình Vite proxy các đường dẫn `/api` và `/socket.io` tới `http://localhost:3000`. Nếu backend chạy ở máy/cổng khác, sửa `VITE_BACKEND_ORIGIN` trong `Frontend/.env`. Với môi trường deploy cross-origin, đặt `VITE_API_URL` thành URL API đầy đủ (ví dụ `https://api.example.com/api`) và `VITE_SOCKET_URL` thành origin của backend.

## 3. Những màn hình đã tích hợp

- **Login:** `/api/auth/login`, khôi phục session qua `/api/auth/me`, JWT gắn vào API; trang được bảo vệ khi chưa đăng nhập.
- **Dashboard:** `/api/dashboard/summary`, `/api/dashboard/telemetry`, devices/alerts/analyses APIs và Socket.IO (`reading`, `alert:new`, `alert:update`, `device:update`, `analysis:new`, `node:status`). Không còn số liệu telemetry sinh ngẫu nhiên.
- **Thiết bị:** danh sách thật, lọc trạng thái, xem panel chi tiết, telemetry mới nhất, lịch sử lệnh, lệnh bật/tắt bơm có ACK, cấu hình tự động, lifecycle và tạo/sửa thiết bị theo quyền.
- **Node ESP32:** danh sách, tạo/cập nhật, trạng thái heartbeat realtime và thu hồi Node (Admin).
- **Người dùng:** tạo/sửa/kích hoạt/khóa tài khoản, ma trận RBAC, gán thiết bị, hai chế độ xem theo người dùng/theo thiết bị (Admin).
- **Cảnh báo:** lọc theo trạng thái/mức độ/loại, xác nhận và xử lý, cập nhật realtime.
- **AI chẩn đoán:** lịch sử kết quả MQTT, ảnh tải qua API có JWT, độ tin cậy, model và điều trị sinh học/hóa học.
- **Audit Log:** bộ lọc và phân trang theo API, chỉ Admin.

Backend vẫn là nơi thực thi quyền truy cập; ẩn trang ở frontend chỉ là tiện ích giao diện, không thay thế RBAC backend.

## 4. Dữ liệu còn cần cấu hình để chạy end-to-end

- Tạo Node và thiết bị trong giao diện Admin; gán thiết bị vào Node, cấu hình firmware/ACL MQTT phù hợp với `Backend/docs/mosquitto-acl.example`.
- Cấp danh mục `Disease` và `Treatment` trước khi bên thứ ba gửi kết quả AI; backend phải map nhãn AI về bệnh trong danh mục.
- Bên AI publish JSON kết quả có `eventId`, tên/nhãn bệnh, confidence, thời gian và `imageBase64` lên `{MQTT_TOPIC_PREFIX}/ai/result`.
- Khi firmware ESP32 bắt đầu publish heartbeat/telemetry và trả ACK đúng topic, trạng thái thiết bị/telemetry/lệnh sẽ cập nhật thật.

## 5. Kiểm thử và giới hạn xác nhận

Bộ test backend được chạy trong quá trình đóng gói: **21/21 test PASS** cho kiểm tra ACK, payload kết quả AI và lưu ảnh. Toàn bộ JS/JSX frontend đã được parse kiểm tra cú pháp. Không thể xác nhận build Vite trong môi trường đóng gói này vì `node_modules` lấy từ ZIP nguồn thiếu native binding tương thích Linux; gói xuất không kèm `node_modules`, vì vậy cần chạy `npm install` trên máy phát triển của bạn để cài đúng binary cho hệ điều hành. Chưa thể kiểm thử kết nối thật với MySQL/MQTT broker/Node/AI do chưa có cấu hình và thiết bị thực tế.
