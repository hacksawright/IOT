import { Clock } from 'lucide-react';
import useClock from '../hooks/useClock';
import { formatClock } from '../utils/format';

export default function LiveIndicator() {
  const now = useClock();
  return (
    <div className="live-indicator">
      <span className="live-clock">
        <Clock size={14} />
        {formatClock(now)}
      </span>
      <span className="live-badge">
        <span className="live-badge__dot" />
        LIVE
      </span>
    </div>
  );
}
