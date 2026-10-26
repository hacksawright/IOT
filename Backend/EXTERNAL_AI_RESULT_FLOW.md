# Nhận kết quả AI bên ngoài qua MQTT và lưu ảnh nhận diện

## 1. Luồng mới

1. Bên thứ ba chụp ảnh và chạy mô hình AI ở hệ thống của họ.
2. Bên thứ ba publish **một JSON gồm kết quả nhận diện và ảnh Base64** lên topic MQTT `{MQTT_TOPIC_PREFIX}/ai/result` (mặc định trong `.env.example` là `iot/ai/result`).
3. Backend xác thực kết nối thông qua MQTT username/password và ACL của broker; không yêu cầu `deviceCode`, `CAMERA` hay `sourceId`.
4. Backend kiểm tra định dạng/kích thước ảnh, đối chiếu `diseaseLabel`/`modelLabel` hoặc `diseaseName` với danh mục `diseases`, lưu ảnh vào thư mục riêng và lưu lịch sử vào `leafAnalyses`.
5. Backend phát Socket.IO `analysis:new`, tạo cảnh báo nếu phát hiện bệnh với confidence đạt ngưỡng và liên kết các phương pháp điều trị có sẵn theo `diseaseId`.
6. Frontend đọc lịch sử và chi tiết qua các API có JWT. Ảnh không public; phải gọi API ảnh kèm JWT.

Không cần camera hay mã định danh nguồn trong database. `deviceId` để `NULL` cho kết quả AI mới; lịch sử cũ có `deviceId` vẫn được giữ nguyên. API tạo thiết bị mới chỉ chấp nhận `SENSOR` và `PUMP`; giá trị `CAMERA` trong ENUM MySQL được giữ để tránh làm hỏng dữ liệu cũ.

## 2. Cấu hình

Sao chép `.env.example` thành `.env` rồi điền thông tin MySQL, JWT và MQTT. Cấu hình liên quan tới nhận diện:

```dotenv
MQTT_ENABLED=true
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=agri_backend
MQTT_PASSWORD=<mqtt-password>
MQTT_TOPIC_PREFIX=iot
AI_MIN_CONFIDENCE=0.5
AI_IMAGE_MAX_BYTES=5242880
AI_IMAGE_STORAGE_DIR=storage/analysis-images
```

- `AI_IMAGE_MAX_BYTES` mặc định 5 MiB cho ảnh **sau khi decode Base64**.
- Chỉ chấp nhận JPEG, PNG và WebP. Payload ảnh phải là Base64; backend không tải ảnh từ URL bên ngoài.
- Topic trong ví dụ là `iot/ai/result`; nếu đổi `MQTT_TOPIC_PREFIX`, publisher và ACL của broker phải đổi theo.
- MQTT broker phải cho phép packet lớn hơn payload Base64, mặc định backend chấp nhận khoảng 8 MiB. Nếu tăng `AI_IMAGE_MAX_BYTES`, hãy tăng giới hạn packet của broker tương ứng.
- Ảnh được lưu trên ổ đĩa máy chạy backend. Hãy backup thư mục này và dùng persistent volume nếu triển khai bằng container. Với nhiều backend instance, cần một thư mục dùng chung hoặc chuyển storage sang dịch vụ object storage.
- Không dùng `DB_SYNC=force` trên database thật vì chế độ đó xóa và tạo lại bảng.

## 3. Payload MQTT

Topic: `iot/ai/result` (QoS 1 khuyến nghị). Payload mẫu:

```json
{
  "eventId": "plant-result-20261026-000123",
  "capturedAt": "2026-10-26T14:30:00.000Z",
  "diseaseLabel": "Tomato___Late_blight",
  "diseaseName": "Bệnh mốc sương",
  "confidence": 0.93,
  "imageMimeType": "image/jpeg",
  "imageBase64": "<base64-noi-dung-anh-jpeg>",
  "modelVersion": "plant-ai-v3",
  "inferenceMs": 241,
  "boundingBoxes": []
}
```

Các field:

- Bắt buộc: định danh bệnh (`diseaseLabel`/`modelLabel`/`label` hoặc `diseaseName`), `confidence` là số từ `0` đến `1`, và `imageBase64` của ảnh thực tế.
- `imageBase64` có thể là Base64 thuần hoặc Data URI như `data:image/jpeg;base64,...`. Có thể gửi `image` dạng object với `{ "mimeType": "image/jpeg", "base64": "..." }` thay cho `imageMimeType` + `imageBase64`.
- `imageMimeType` nếu có phải khớp nội dung ảnh thực tế. Nội dung ảnh được kiểm tra theo chữ ký file, không tin MIME do publisher tự khai.
- `capturedAt` (hoặc `timestamp`/`ts`) nên là thời điểm chụp/nhận diện ISO-8601. Nếu bỏ trống, backend dùng thời điểm nhận bản tin; không được gửi thời gian quá 5 phút trong tương lai.
- `eventId` là tùy chọn nhưng nên gửi một ID duy nhất, ổn định cho mỗi lần nhận diện để MQTT retry không tạo bản ghi trùng. Nếu không gửi, backend tạo khóa chống trùng từ timestamp, bệnh, confidence, model version và hash ảnh; khi đó cần giữ nguyên `capturedAt` ở những lần retry. Nếu không gửi cả `eventId` lẫn `capturedAt`, backend lấy thời điểm nhận bản tin nên không thể bảo đảm nhận ra retry là cùng sự kiện.
- `modelVersion` mặc định `external`; `inferenceMs` tùy chọn; `boundingBoxes` tùy chọn, tối đa 500 phần tử.
- Bệnh/nhãn phải khớp đúng một bệnh trong `diseases.modelLabel`, `nameVi` hoặc `nameEn`. Cần seed/import danh mục bệnh và phương pháp điều trị trước khi tích hợp.
- Không cần `deviceCode`, `deviceId`, `sourceId` hoặc camera.

Ví dụ publish bằng Mosquitto, giả sử JSON hoàn chỉnh được đặt trong `result.json`:

```bash
mosquitto_pub -h <broker-host> -p 1883 \
  -u <ai-publisher-user> -P '<ai-publisher-password>' \
  -t 'iot/ai/result' -q 1 -f result.json
```

`-f` gửi toàn bộ JSON; không đưa placeholder Base64 ở ví dụ trên vào production mà phải thay bằng chuỗi Base64 thật. Không publish kết quả với cờ `retain` vì đây là event lịch sử, không phải trạng thái hiện tại.

## 4. Lưu ảnh và API đọc lịch sử

- Ảnh được ghi vào `storage/analysis-images/` (hoặc `AI_IMAGE_STORAGE_DIR`) với tên UUID do backend tạo. Database chỉ lưu tên file trong `leafAnalyses.imagePath`; payload không thể chỉ định đường dẫn file.
- `GET /api/analyses` — danh sách lịch sử, bao gồm `imagePath`, `imageUrl` và thông tin bệnh. Kết quả AI không gắn thiết bị hiển thị cho người dùng đã đăng nhập; lịch sử cũ gắn device vẫn theo phân quyền thiết bị.
- `GET /api/analyses/:id` — chi tiết nhận diện và phương pháp điều trị sinh học/hóa học; response có `imageUrl` nếu ảnh còn tồn tại.
- `GET /api/analyses/:id/image` — trả byte ảnh. Gửi `Authorization: Bearer <JWT>` như các API lịch sử khác; không có URL ảnh public.
- Cảnh báo bệnh không gắn `deviceId` cũng được hiển thị cho người dùng đã đăng nhập vì bản ghi AI là dữ liệu hệ thống chung. Nếu hệ thống sau này có nhiều trang trại/tổ chức, nên bổ sung `farmId`/tenant scope trước khi phân tách quyền theo khách hàng.

Endpoint HTTP `POST /api/analyses/results` đã được bỏ trong luồng này; kết quả mới nhận qua MQTT. Các API đọc lịch sử tiếp tục dùng JWT.

## 5. Migration database bắt buộc

Model mới cần `leafAnalyses.eventId` và cho phép `leafAnalyses.deviceId` là `NULL`. Với database hiện tại, `sequelize.sync()` ở chế độ `safe` không tự sửa cột đang có. Sao lưu MySQL, sau đó chạy **một lần** file:

`database/migrations/20261026_external_ai_result_images.sql`

Ví dụ:

```bash
mysql -h <db-host> -u <db-user> -p <db-name> < database/migrations/20261026_external_ai_result_images.sql
```

Migration không xóa lịch sử hiện có; `eventId` của hàng cũ sẽ để `NULL`. Chỉ chạy trên đúng database mà backend dùng.

## 6. ACL Mosquitto

Xem `docs/mosquitto-acl.example`. Backend phải có quyền `read` cho `{prefix}/ai/result`; tài khoản bên thứ ba chỉ cần `write` cho đúng topic AI này. Không cấp cho publisher AI quyền gửi lệnh điều khiển thiết bị.

## 7. Cài đặt và kiểm thử

Tại thư mục `Backend`:

```bash
npm install
npm run test:security
npm start
```

Sau khi migration chạy xong, kiểm thử tích hợp với broker, database và dịch vụ AI thực tế. Đảm bảo thư mục lưu ảnh có quyền ghi cho user chạy Node.js và không bị xóa khi deploy/restart.
