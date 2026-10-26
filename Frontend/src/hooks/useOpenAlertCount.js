import { useEffect, useState } from 'react';
import * as dashboardApi from '../api/dashboard.api';
import { getSocket } from '../api/socket';
export default function useOpenAlertCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => dashboardApi.getSummary().then(({data}) => {
      if (alive) setCount((data.openAlertsBySeverity || []).reduce((sum, r) => sum + Number(r.count || 0), 0));
    }).catch(() => {});
    load(); const socket = getSocket();
    socket.on('alert:new', load); socket.on('alert:update', load);
    return () => { alive = false; socket.off('alert:new', load); socket.off('alert:update', load); };
  }, []);
  return count;
}
