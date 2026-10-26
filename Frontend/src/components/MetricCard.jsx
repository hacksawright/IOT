import { clamp } from '../utils/format';

export default function MetricCard({ metric, value }) {
  const { label, unit, color, icon: Icon, scale } = metric;
  const numericValue = Number(value);
  const pct = Number.isFinite(numericValue) ? clamp(((numericValue - scale.min) / (scale.max - scale.min)) * 100, 0, 100) : 0;

  return (
    <div className="card metric-card" style={{ '--c': color }}>
      <div className="metric-card__top">
        <span>{label}</span>
        <span className="metric-card__icon">
          <Icon size={16} />
        </span>
      </div>
      <div className="metric-card__value">
        {Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—'}
        <span className="metric-card__unit">{unit}</span>
      </div>
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
