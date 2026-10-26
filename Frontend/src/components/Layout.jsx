import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import * as dashboardApi from '../api/dashboard.api';
import { getSocket } from '../api/socket';

export default function Layout() {
  const [openAlerts, setOpenAlerts] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => dashboardApi.getSummary().then(({data}) => {
      if (!alive) return;
      setOpenAlerts((data.openAlertsBySeverity || []).reduce((sum,row) => sum + Number(row.count || 0), 0));
    }).catch(() => {});
    load();
    const socket = getSocket();
    socket.on('alert:new', load); socket.on('alert:update', load);
    return () => { alive = false; socket.off('alert:new', load); socket.off('alert:update', load); };
  }, []);
  return <div className="app-shell"><Sidebar alertCount={openAlerts}/><main className="app-main"><Outlet/></main></div>;
}
