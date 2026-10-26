# IoT Control Frontend

React 19 + Vite interface for the IoT Control Backend.

## Chạy local
1. Cần Node.js tương thích với Vite hiện tại và backend chạy ở `http://localhost:3000`.
2. Cài phụ thuộc bằng `npm install`.
3. Kiểm tra `.env`: mặc định frontend dùng `/api` và proxy `/api`, `/socket.io` tới backend `http://localhost:3000`.
4. Chạy `npm run dev` rồi mở địa chỉ Vite hiển thị.

Nếu backend chạy ở cổng khác, sửa `VITE_BACKEND_ORIGIN`. Khi deploy frontend và backend trên hai origin riêng, đặt `VITE_API_URL` thành URL đầy đủ kết thúc bằng `/api` và `VITE_SOCKET_URL` thành URL gốc của backend.

## Trang đăng nhập (bản giao diện cập nhật)
- Giao diện hai cột theo mẫu IoT Control; đã bỏ khối thống kê thiết bị/uptime và danh sách tài khoản demo/role.
- Đăng nhập dùng API thật `POST /api/auth/login`; phiên làm việc sử dụng JWT và được khôi phục qua `GET /api/auth/me`.
- Nút **Đổi mật khẩu** xác minh thông tin đăng nhập rồi gọi `POST /api/auth/change-password`; mật khẩu mới tối thiểu 8 ký tự và cần xác nhận trùng khớp.
- Không có tài khoản mặc định được hiển thị trên giao diện. Hãy dùng tài khoản đã có trong cơ sở dữ liệu hoặc do quản trị viên cấp.

## Trang đã nối API
- Login / kiểm tra session JWT
- Dashboard / telemetry & Socket.IO
- Quản lý thiết bị / command, lifecycle, cấu hình và lịch sử
- Node ESP32
- Quản lý người dùng / RBAC, gán thiết bị
- Cảnh báo
- AI chẩn đoán / ảnh và điều trị
- Audit Log

Không có đăng ký công khai; tài khoản mới được Admin cấp trong trang Người dùng.

> Lần cài đầu dùng `npm install` (không dùng `npm ci`) để đồng bộ lockfile với dependency `socket.io-client` đã thêm.
