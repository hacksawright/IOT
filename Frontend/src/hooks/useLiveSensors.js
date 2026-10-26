import { useCallback, useEffect, useRef, useState } from 'react';
import * as dashboardApi from '../api/dashboard.api';
import { getSocket } from '../api/socket';
import { appendReading, toChartPoints } from '../api/mappers';

const MAX_POINTS = 30;
export default function useLiveSensors() {
  const [series, setSeries] = useState([]);
  const known = useRef({});
  const load = useCallback(async () => {
    const { data = [] } = await dashboardApi.getTelemetry({ limit: 1500 });
    const points = toChartPoints(data, MAX_POINTS);
    setSeries(points);
    if (points.length) {
      const last = points[points.length - 1];
      known.current = { temperature: last.temperature, humidity: last.humidity, soil: last.soil };
    }
  }, []);
  useEffect(() => {
    load().catch(() => setSeries([]));
    const socket = getSocket();
    const onReading = (reading) => setSeries((prev) => appendReading(prev, reading, known.current, MAX_POINTS));
    socket.on('reading', onReading);
    return () => socket.off('reading', onReading);
  }, [load]);
  return series;
}
