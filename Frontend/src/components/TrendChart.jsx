import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { formatTime } from '../utils/format';

const AXIS_TICK = { fill: '#5c6a8a', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' };

export default function TrendChart({ data, metrics }) {
  const chartData = data.map((p) => ({ ...p, label: formatTime(p.time) }));

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Nhiệt Độ, Độ Ẩm & Độ Ẩm Đất</h3>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <defs>
              {metrics.map((m) => (
                <linearGradient key={m.key} id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#1b2742" strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#1b2742' }} minTickGap={48} />
            <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0d1322', border: '1px solid #1b2742', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#8d99b5' }}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {metrics.map((m) => (
              <Area
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={`${m.shortLabel} (${m.unit})`}
                stroke={m.color}
                strokeWidth={2}
                fill={`url(#grad-${m.key})`}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
