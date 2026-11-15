# Vòng đời Device và Node — IoT Control Firmware v1.2

## 1. Hai trạng thái độc lập

- **Device lifecycle** mô tả vòng đời nghiệp vụ của từng cảm biến/bơm/quạt: `REGISTERED`, `PROVISIONED`, `ACTIVE`, `FAULT`, `MAINTENANCE`, `DECOMMISSIONED`.
- **Node connection** mô tả trạng thái kết nối của bo ESP32: `Online` hoặc `Offline`, ngoài ra có cờ `isRevoked` và trạng thái tài khoản MQTT.

Một Device có thể ở lifecycle `ACTIVE` nhưng Node `Offline`; lúc đó lifecycle vẫn là ACTIVE nhưng Device không thể được điều khiển từ xa cho đến khi Node kết nối lại. Heartbeat chỉ cập nhật trạng thái kết nối, tuyệt đối không tự chuyển Device sang ACTIVE.

## 2. Sáu trạng thái Device

| Trạng thái | Ý nghĩa | Điều kiện / tác động |
|---|---|---|
| `REGISTERED` | Admin đã khai báo Device trong Web Admin | Device được tạo với mã `deviceCode` do Backend sinh; chưa sẵn sàng vận hành |
| `PROVISIONED` | Device đã cấu hình, gán Node và phân công ít nhất một người quản lý | Không yêu cầu probe hoặc heartbeat đầu tiên; Backend gửi cấu hình cần thiết tới Node |
| `ACTIVE` | Device đã được Admin chủ động kích hoạt và Firmware xác nhận | Chỉ chuyển sau ACK thành công của lệnh `lifecycle: ACTIVE` tương ứng UUID |
| `FAULT` | Device gặp sự cố | Cấm điều khiển vận hành thông thường; tạo/duy trì cảnh báo và yêu cầu kiểm tra |
| `MAINTENANCE` | Device đang được kiểm tra/sửa chữa/nâng cấp | Hạn chế điều khiển; sau khi xử lý, Admin kích hoạt lại bằng quy trình có ACK |
| `DECOMMISSIONED` | Device bị thu hồi/ngừng sử dụng | Khóa điều khiển, loại khỏi tự động hóa; giữ dữ liệu và audit để tra cứu |

## 3. Quy trình Registered → Provisioned → Active

### 3.1 Registered — đăng ký

1. Admin khai báo tên, loại (`SENSOR`, `PUMP`, `FAN`), GPIO, Node, vị trí và metric tương ứng trên Web Admin.
2. Backend sinh `deviceCode` và lưu Device ở `REGISTERED`.
3. Không sử dụng `device/probe` làm điều kiện bắt buộc cho Firmware v1.2 inventory flow.

### 3.2 Provisioned — cấu hình và phân công

1. Admin cấu hình loại cảm biến/metric, GPIO và các tham số vận hành cần thiết.
2. Admin gán Device vào Node hợp lệ, chưa bị thu hồi và đã có tài khoản MQTT riêng đang bật.
3. Admin gán Device cho ít nhất một User phụ trách trong màn hình Quản lý người dùng.
4. Admin chuyển lifecycle sang `PROVISIONED`. Backend kiểm tra đủ cấu hình, Node, MQTT account và assignment; lưu `PROVISIONED`, tăng config version và gửi cấu hình phù hợp xuống Node.
5. Với PUMP/FAN, Backend cần nhận config ACK đúng version trước khi cho phép kích hoạt. Với SENSOR, metric được xử lý phía Backend và version được đánh dấu tương ứng trong luồng này.

`PROVISIONED` là trạng thái đã chuẩn bị xong theo nghiệp vụ; không có nghĩa Device đã được phép chạy. Việc Node online/heartbeat không tự chuyển Device sang ACTIVE.

### 3.3 Active — Admin kích hoạt và Firmware ACK

1. Admin nhấn **Kích hoạt** trên Web Admin. Chỉ tài khoản Admin được thực hiện bước này.
2. Backend kiểm tra Device đang ở trạng thái cho phép chuyển ACTIVE, Node online/chưa thu hồi, MQTT account đang bật và cấu hình đã được xác nhận.
3. Backend tạo `commandUuid` duy nhất và publish lệnh lên `sf/{nodeCode}/cmd`:

```json
{
  "commandUuid": "550e8400-e29b-41d4-a716-446655440000",
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "lifecycle",
  "deviceCode": "DEV-008",
  "type": "PUMP",
  "gpioPin": 26,
  "lifecycle": "ACTIVE",
  "state": "ACTIVE"
}
```

4. Firmware thực thi lệnh vòng đời và trả ACK trên `sf/{nodeCode}/cmd/ack`, tối thiểu có UUID và kết quả Boolean:

```json
{
  "commandUuid": "550e8400-e29b-41d4-a716-446655440000",
  "deviceCode": "DEV-008",
  "success": true,
  "message": "lifecycle updated"
}
```

Firmware v1.2 có thể dùng `commandId` thay `commandUuid`, hoặc `ok` thay `success`; Backend hỗ trợ các alias này. UUID phải được echo để tránh ghép ACK nhầm lệnh.

5. Chỉ khi ACK đúng UUID, đúng Node, đúng Device và `success/ok=true` đến trong timeout, Backend mới chuyển Device sang `ACTIVE`. ACK thất bại, không đến hoặc đến trễ không làm lifecycle đổi ACTIVE.

6. Heartbeat/telemetry tiếp tục chỉ cập nhật kết nối và số đo. Nếu Device đã ở `PROVISIONED`, dữ liệu cảm biến không tự kích hoạt Device.

**Firmware:** đặt `REQUIRE_ACTIVATION = 1` trong `config.h`. Báo cáo Firmware nêu rõ giá trị `0` cho phép tự vào Active ngay khi MQTT kết nối; không dùng chế độ đó cho luồng quản trị này. Lệnh `lc active` trên Serial chỉ dùng test độc lập, không thay cho nút Admin ở môi trường tích hợp.

## 4. Fault, Maintenance và khôi phục

- `ACTIVE` có thể chuyển `FAULT`, `MAINTENANCE` hoặc `DECOMMISSIONED` theo quy tắc lifecycle.
- Sự kiện lỗi hợp lệ từ Firmware có thể đưa Device vào `FAULT`; Heartbeat bình thường không tự xóa lỗi.
- Trước khi đưa PUMP/FAN đang bật vào FAULT, MAINTENANCE hoặc DECOMMISSIONED, Backend yêu cầu lệnh OFF và chờ ACK.
- Sau sửa chữa, Admin chuyển Device về `ACTIVE` bằng nút kích hoạt. Backend gửi lại lệnh `lifecycle ACTIVE`; chỉ ACK thành công mới đưa lifecycle về ACTIVE. Readiness telemetry có thể được ghi nhận cho chẩn đoán, nhưng không kích hoạt tự động.
- `DECOMMISSIONED` là trạng thái cuối; nếu thay phần cứng vật lý, đăng ký Device mới với `deviceCode` mới.

## 5. Một tài khoản MQTT riêng cho mỗi Node

Mỗi Node ESP32 có một principal MQTT riêng trên Mosquitto Dynamic Security:

- `mqttUsername` và `mqttRoleName` được lưu ở bảng `nodes`; password ngẫu nhiên chỉ hiển thị một lần khi tạo/cấp lại, không lưu dạng rõ trong MySQL.
- Mỗi Node có ACL role chỉ cho phép publish/subscribe các topic trong `sf/{nodeCode}/...` của chính Node đó.
- Nhiều Device con có thể dùng chung kết nối vật lý MQTT của Node; Backend phân biệt từng Device bằng `deviceCode` trong payload. Không tạo một MQTT username cho mỗi cảm biến/bơm/quạt trực thuộc Node.
- Backend có một MQTT principal riêng để nhận dữ liệu từ tất cả Node và gửi command/config. Tài khoản Dynamic Security admin là một thông tin riêng khác, chỉ dùng để tự động tạo/khóa/mở tài khoản Node qua control API.

### Thu hồi một Device

Khi chỉ thu hồi một Device, Backend đặt `DECOMMISSIONED`, chặn command và không xử lý payload của Device đó như dữ liệu vận hành. **Không thu hồi MQTT account của Node**, vì điều đó sẽ ngắt cả những Device con còn lại. Node vẫn được phép giao tiếp cho các Device khác.

### Thu hồi toàn bộ Node

Khi thu hồi Node, Backend gọi Dynamic Security `disableClient` cho username MQTT của Node. Mosquitto sẽ ngắt các phiên hiện đang kết nối bằng username đó và từ chối kết nối mới. Backend đồng thời đặt `isRevoked=true`, `mqttAccountEnabled=false`, đánh dấu Node offline và chặn command/ingest với mọi Device trực thuộc.

Khi khôi phục Node, Backend gọi `enableClient` cho username đã có, bỏ cờ revoked và để `isOnline=false`. ESP32 reconnect bằng username/password cũ; chỉ sau heartbeat mới Node mới được hiển thị online. Nếu cần đổi password vì thất lạc, Admin dùng chức năng Cấp lại tài khoản MQTT; mật khẩu cũ bị vô hiệu và phải cập nhật password mới trong ESP32.

## 6. API và MQTT liên quan

| Hành động | Endpoint / Topic | Kết quả |
|---|---|---|
| Tạo Node + tài khoản MQTT | `POST /api/nodes` | Tạo Node, sinh username/password riêng và trả mật khẩu một lần |
| Cấp lại mật khẩu Node | `POST /api/nodes/:id/mqtt-credentials` | Vô hiệu mật khẩu cũ, cấp mật khẩu mới |
| Thu hồi Node | `POST /api/nodes/:id/revoke` | disable MQTT client, ngắt phiên, Node revoked/offline |
| Khôi phục Node | `POST /api/nodes/:id/restore` | enable MQTT client, chờ heartbeat mới |
| Đăng ký Device | `POST /api/devices` | Sinh `deviceCode`, lifecycle `REGISTERED` |
| Provisioned | `POST /api/devices/:id/lifecycle` body `{"to":"PROVISIONED"}` | Kiểm tra assignment/config/Node, lưu Provisioned và gửi config |
| Admin kích hoạt | `POST /api/devices/:id/lifecycle` body `{"to":"ACTIVE"}` | Publish lifecycle command, đợi Firmware ACK |
| Lifecycle ACK | `sf/{nodeCode}/cmd/ack` | Đúng UUID + success=true mới đổi sang ACTIVE |

## 7. Yêu cầu cài đặt/migration

- Bật Mosquitto Dynamic Security plugin và khởi tạo tài khoản quản trị theo `Backend/docs/mosquitto-acl.example`.
- Backend `.env` phải có `MQTT_DYNSEC_ENABLED=true`, `MQTT_DYNSEC_ADMIN_USERNAME`, `MQTT_DYNSEC_ADMIN_PASSWORD`, cùng `MQTT_USERNAME`/`MQTT_PASSWORD` riêng của Backend. Không dùng tài khoản Node cho Backend.
- Firmware cần được nạp với `REQUIRE_ACTIVATION = 1` và phải echo UUID của lifecycle command trong `cmd/ack`.
- Database đã cài từ phiên bản cũ: backup rồi chạy `Backend/database/migrations/20261102_node_mqtt_accounts_explicit_activation.sql` đúng một lần. Database mới phải dùng `Backend/database/smart_agri_mysql_demo.sql` đã cập nhật.
- Các tài khoản MQTT đã có trong DB cũ chưa tự động được tạo trên Broker; sau khi bật Dynamic Security, Admin cần vào Quản lý Node và dùng thao tác tạo/cấp lại thông tin MQTT cho từng Node trước khi Provisioned.

## 8. Giới hạn tích hợp

Các key JSON chi tiết của config/lifecycle ACK vẫn cần đối chiếu parser Firmware thực tế. Backend gửi command theo mẫu trên và hỗ trợ UUID aliases `commandUuid`/`commandId`, success aliases `success`/`ok`; cần xác nhận Firmware v1.2 echo đúng các trường đó trên thiết bị thật. Gói này không bao gồm source ESP32 và chưa thể xác minh kết nối broker/hardware end-to-end trong môi trường đóng gói.
