import { TriangleAlert, Activity, CircleCheck } from 'lucide-react';

const KINDS = {
  warning: { icon: TriangleAlert, color: '#f6b01e' },
  ai: { icon: Activity, color: '#19c3ff' },
  success: { icon: CircleCheck, color: '#22d17b' },
};

export default function RecentEvents({ events }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Sự Kiện Gần Đây</h3>
      </div>
      <ul className="event-list">
        {events.map((e) => {
          const { icon: Icon, color } = KINDS[e.kind] ?? KINDS.warning;
          return (
            <li className="event" key={e.id} style={{ '--c': color }}>
              <Icon size={16} />
              <span className="event__time">{e.time}</span>
              <span className="event__text">{e.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
