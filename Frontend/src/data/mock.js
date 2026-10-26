// Dữ liệu mẫu. Thay bằng gọi API khi có backend:
//   GET /api/alerts/summary, GET /api/devices, GET /api/events

// Cảnh báo chưa xử lý, theo mức độ (alerts.severity với status khác RESOLVED)
export const alertSummary = { critical: 1, warning: 2, info: 1 };

// Số kết quả AI phát hiện bệnh trong 24h qua (leaf_analyses)
export const aiDetections24h = 1;

// status: ONLINE | OFFLINE | ERROR (suy ra từ nodes.is_online và devices.lifecycle)
export const devices = [
  { id: 1, name: 'Bơm-01', type: 'PUMP', status: 'ONLINE', isOn: true },
  { id: 2, name: 'Bơm-02', type: 'PUMP', status: 'ONLINE', isOn: false },
  { id: 3, name: 'Bơm-03', type: 'PUMP', status: 'ERROR', isOn: false },
  { id: 4, name: 'Cảm biến S1', type: 'SENSOR', status: 'ONLINE', isOn: false },
  { id: 5, name: 'CAM-01', type: 'CAMERA', status: 'ONLINE', isOn: false },
];

// kind: warning | ai | success
export const events = [
  { id: 1, time: '14:32:11', kind: 'warning', text: 'Bơm-03 mất kết nối MQTT, kiểm tra nguồn điện' },
  { id: 2, time: '14:28:05', kind: 'ai', text: 'AI phát hiện bệnh đốm vòng trên lá cà chua (CAM-01), độ tin cậy 94%' },
  { id: 3, time: '14:15:44', kind: 'success', text: 'Người dùng operator@iot.vn đăng nhập thành công' },
  { id: 4, time: '13:59:21', kind: 'warning', text: 'Độ ẩm đất xuống 27%, dưới ngưỡng, Bơm-01 tự bật' },
];
