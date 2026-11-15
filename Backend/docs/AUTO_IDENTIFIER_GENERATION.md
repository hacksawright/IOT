# Tự động sinh `nodeCode`, `deviceCode` và provisioningToken

## 1. Mã định danh tuần tự

Backend là nơi duy nhất sinh mã định danh. Mã lấy từ `AUTO_INCREMENT id` của bản ghi, không dùng `COUNT(*) + 1`:

- Node: `NODE-001`, `NODE-002`, `NODE-010`, ...
- Device: `DEV-001`, `DEV-002`, `DEV-010`, ...
- Tối thiểu 3 chữ số; từ ID 1000 trở đi giữ nguyên đủ chữ số, ví dụ `NODE-1000`.
- Không tái sử dụng số khi xóa bản ghi vì ID AUTO_INCREMENT không được tính lại.
- Các mã cũ trong database đang sử dụng được giữ nguyên để không phá MQTT topic, ACL và cấu hình Firmware hiện có. Database demo mới sử dụng định dạng tuần tự ngay từ đầu.

Việc tạo bản ghi tạm và cập nhật mã cuối cùng diễn ra trong cùng transaction. Unique index trên `nodeCode`/`deviceCode` vẫn là hàng rào cuối cùng.

## 2. Tạo Node và cấp MQTT Account

`POST /api/nodes` (Admin) không cần gửi `nodeCode`:

```json
{
  "name": "Node nhà kính A",
  "firmwareVersion": "1.4.0",
  "hardwareVersion": "ESP32-WROOM",
  "heartbeatTimeoutSec": 60
}
```

Backend thực hiện theo thứ tự:

1. Tạo Node, lấy ID tự tăng và định dạng `NODE-<id>`.
2. Tạo MQTT username, MQTT password ngẫu nhiên và Dynamic Security role/ACL ngay khi Admin tạo Node.
3. Sinh provisioningToken ngẫu nhiên, chỉ lưu SHA-256 hash trong bảng `provisioningTokens`.
4. Trả `provisioningToken` rõ đúng một lần trong response. MQTT password không trả về Frontend.

Response mẫu:

```json
{
  "data": { "id": 1, "nodeCode": "NODE-001", "mqttUsername": "node_node_001" },
  "provisioningToken": "PRV-<random-secret>",
  "provisioningTokenExpiresAt": "2026-11-16T...",
  "meta": {
    "nodeCodeGenerated": true,
    "mqttAccountProvisioned": true,
    "provisioningTokenIssued": true
  }
}
```

Token mặc định có hạn 24 giờ và chỉ dùng một lần. Cấp token mới sẽ vô hiệu hóa token trước đó.

## 3. Cấp lại provisioningToken

Admin gọi:

```http
POST /api/nodes/:id/provisioning-token
Authorization: Bearer <admin-token>
```

Response chứa `provisioningToken` mới. API này không tạo lại Node hay MQTT Account.

## 4. ESP32 claim cấu hình

ESP32 kết nối Wi-Fi gia đình trước, sau đó gọi API public:

```http
POST /api/device-provisioning/claim
Content-Type: application/json
```

Request:

```json
{
  "provisioningToken": "PRV-<random-secret>"
}
```

Backend kiểm tra hash, hạn dùng, trạng thái đã sử dụng, Node có bị thu hồi hay không và MQTT Account có đang bật hay không. Khi hợp lệ, Backend xoay MQTT password của account đã được tạo lúc Admin tạo Node, đánh dấu token đã sử dụng và trả cấu hình:

```json
{
  "success": true,
  "data": {
    "nodeCode": "NODE-001",
    "mqtt": {
      "host": "192.168.1.10",
      "port": 1883,
      "protocol": "mqtt",
      "username": "node_node_001",
      "password": "<new-secret>",
      "topicPrefix": "sf"
    }
  }
}
```

MQTT account/ACL không bị tạo lại ở bước claim; chỉ password được xoay để cấp bí mật trực tiếp cho Firmware. Token claim được khóa trong transaction để tránh hai thiết bị dùng cùng token đồng thời.

## 5. Cấu hình local cho đồ án

Backend dùng `MQTT_URL` để kết nối Broker từ chính máy chạy Backend, thường có thể là `mqtt://localhost:1883`.

ESP32 không thể dùng `localhost` để truy cập máy tính. Cần cấu hình thêm:

```env
MQTT_URL=mqtt://localhost:1883
MQTT_DEVICE_URL=mqtt://192.168.1.10:1883
```

Thay `192.168.1.10` bằng IP LAN thực tế của máy chạy Mosquitto. Mở Windows Firewall cho port 1883 và đảm bảo Mosquitto lắng nghe trên interface LAN.

ESP32 gọi Backend bằng IP LAN, ví dụ `http://192.168.1.10:3000/api/device-provisioning/claim`; không dùng `localhost`. Firmware cần được cấu hình đúng địa chỉ Backend LAN bởi thành viên phụ trách Firmware.

## 6. Bảng dữ liệu và migration

- Bảng mới `provisioningTokens`: `nodeId`, `tokenHash`, `expiresAt`, `usedAt`, `createdAt`.
- `tokenHash` là SHA-256; token rõ không được lưu DB hoặc ghi log.
- Chạy `database/migrations/20261115_node_provisioning_tokens.sql` trên DB hiện có.
- Nếu tạo DB mới bằng `database/smart_agri_mysql_demo.sql`, bảng token đã có sẵn.
- `DB_SYNC=safe` cũng có thể tạo bảng mới thông qua Sequelize model, nhưng migration SQL là cách triển khai rõ ràng được khuyến nghị.

## 7. Lưu ý bảo mật

- Claim endpoint giới hạn 10 lần / 15 phút / IP.
- Token có entropy 192 bit, hết hạn sau 24 giờ và chỉ dùng một lần.
- Không trả MQTT password cho Frontend ở API tạo Node; password chỉ được trả cho Firmware qua claim.
- API provisioning hiện dùng HTTP phù hợp demo LAN; không đưa ra Internet. Khi triển khai thực tế cần HTTPS và xác thực TLS.
- Nếu token hết hạn hoặc đã dùng, Admin cấp token mới qua API ở mục 3.
