const STATUS = {
  ONLINE: { label: 'Trực tuyến', color: '#22d17b' },
  OFFLINE: { label: 'Ngoại tuyến', color: '#8d99b5' },
  ERROR: { label: 'Lỗi', color: '#ff4d5e' },
};
const TYPE_LABEL = { PUMP: 'Bơm', SENSOR: 'Cảm biến', CAMERA: 'Camera' };

export default function DeviceStatusCard({ devices }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Trạng Thái Thiết Bị</h3>
      </div>
      <ul className="device-list">
        {devices.map((d) => {
          const s = STATUS[d.status] ?? STATUS.OFFLINE;
          const canSwitch = ['PUMP', 'FAN', 'BUZZER', 'LED'].includes(d.type);
          return (
            <li className="device" key={d.id}>
              <div>
                <div className="device__name">{d.name}</div>
                <div className="device__type">{TYPE_LABEL[d.type] ?? d.type}</div>
              </div>
              <div className="device__right">
                {canSwitch && d.status === 'ONLINE' && (
                  <span className={`chip ${d.isOn ? 'chip--on' : 'chip--off'}`}>{d.isOn ? 'BẬT' : 'TẮT'}</span>
                )}
                <span className="device__status" style={{ '--c': s.color }}>
                  <i />
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
