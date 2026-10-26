import PageHeader from '../components/PageHeader';
import LiveIndicator from '../components/LiveIndicator';
import MetricCard from '../components/MetricCard';
import TrendChart from '../components/TrendChart';
import SensorStatsCard from '../components/SensorStatsCard';
import AlertSummaryCard from '../components/AlertSummaryCard';
import RecentEvents from '../components/RecentEvents';
import DeviceStatusCard from '../components/DeviceStatusCard';
import useLiveSensors from '../hooks/useLiveSensors';
import { METRICS } from '../data/metrics';
import useDashboardData from '../hooks/useDashboardData';
import '../styles/dashboard.css';

export default function Dashboard() {
  const series = useLiveSensors();
  const { alertSummary, aiDetections, devices, events, error } = useDashboardData();
  const latest = series[series.length - 1] || {};

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Giám sát hệ thống IoT theo thời gian thực">
        <LiveIndicator />
      </PageHeader>

      <div className="dashboard">
        {error && <div className="notice notice--warning">{error}. Kiểm tra API/backend và cấu hình đăng nhập.</div>}
        {!series.length && <div className="notice">Chưa có telemetry thực tế. Biểu đồ sẽ hiển thị khi backend nhận được dữ liệu cảm biến.</div>}
        <section className="metric-grid">
          {METRICS.map((m) => (
            <MetricCard key={m.key} metric={m} value={latest[m.key]} />
          ))}
        </section>

        <TrendChart data={series} metrics={METRICS} />

        <section className="grid-2">
          <SensorStatsCard data={series} metrics={METRICS} />
          <AlertSummaryCard summary={alertSummary} aiDetections={aiDetections} />
        </section>

        <section className="grid-2">
          <RecentEvents events={events} />
          <DeviceStatusCard devices={devices} />
        </section>
      </div>
    </>
  );
}
