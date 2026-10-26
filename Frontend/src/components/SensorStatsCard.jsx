import { summarize } from '../utils/stats';
import { clamp } from '../utils/format';

export default function SensorStatsCard({ data, metrics, sampleCount = 20 }) {
  const sample = data.slice(-sampleCount);
  if (!sample.length) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Thống Kê Cảm Biến</h3>
        <span className="muted-mono">{sample.length} mẫu gần nhất</span>
      </div>

      {metrics.map((m) => {
        const { min, avg, max } = summarize(sample, m.key);
        const current = sample[sample.length - 1][m.key];
        const inRange = current >= m.safe.min && current <= m.safe.max;
        const pct = (v) => clamp(((v - m.scale.min) / (m.scale.max - m.scale.min)) * 100, 0, 100);
        const Icon = m.icon;

        return (
          <div className="stat-block" key={m.key} style={{ '--c': m.color }}>
            <div className="stat-block__head">
              <span className="stat-block__name">
                <Icon size={15} />
                {m.label}
              </span>
              <span className={`status-pill ${inRange ? 'status-pill--ok' : 'status-pill--warn'}`}>
                {inRange ? 'TRONG NGƯỠNG' : 'NGOÀI NGƯỠNG'}
              </span>
            </div>

            <div className="stat-values">
              {[
                ['Thấp nhất', min],
                ['Trung bình', avg],
                ['Cao nhất', max],
              ].map(([name, v]) => (
                <div key={name}>
                  <div className="stat-values__label">{name}</div>
                  <div className="stat-values__num">
                    {v.toFixed(1)}
                    <small>{m.unit}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="range">
              <div className="range__safe" style={{ left: `${pct(m.safe.min)}%`, width: `${pct(m.safe.max) - pct(m.safe.min)}%` }} />
              <div className="range__marker" style={{ left: `${pct(current)}%` }} />
            </div>
            <div className="range__labels">
              <span>{m.scale.min}{m.unit}</span>
              <span>Ngưỡng an toàn {m.safe.min}–{m.safe.max}{m.unit}</span>
              <span>{m.scale.max}{m.unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
