import { TriangleAlert, Info, Activity } from 'lucide-react';

const ROWS = [
  { key: 'critical', label: 'Nghiêm trọng', color: '#ff4d5e', icon: TriangleAlert },
  { key: 'warning', label: 'Cảnh báo', color: '#f6b01e', icon: TriangleAlert },
  { key: 'info', label: 'Thông tin', color: '#19c3ff', icon: Info },
];

export default function AlertSummaryCard({ summary, aiDetections = 0 }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Cảnh Báo</h3>
      </div>

      {ROWS.map(({ key, label, color, icon: Icon }) => (
        <div className="alert-box" key={key} style={{ '--c': color }}>
          <span className="alert-box__label">
            <Icon size={16} />
            {label}
          </span>
          <span className="alert-box__count">{summary[key] ?? 0}</span>
        </div>
      ))}

      <div className="alert-ai">
        <Activity size={16} />
        <span>
          {aiDetections > 0
            ? `AI phát hiện ${aiDetections} vùng bệnh trên lá trong 24h qua`
            : 'AI chưa phát hiện bệnh trên lá trong 24h qua'}
        </span>
      </div>
    </div>
  );
}
