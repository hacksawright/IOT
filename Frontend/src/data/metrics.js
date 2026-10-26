import { Thermometer, Droplets, Sprout } from 'lucide-react';

// Cấu hình từng chỉ số: khoảng hiển thị (scale) và ngưỡng an toàn (safe)
export const METRICS = [
  {
    key: 'temperature',
    label: 'Nhiệt Độ',
    shortLabel: 'Nhiệt độ',
    unit: '°C',
    color: '#ff6a3d',
    icon: Thermometer,
    scale: { min: 15, max: 45 },
    safe: { min: 22, max: 35 },
  },
  {
    key: 'humidity',
    label: 'Độ Ẩm Không Khí',
    shortLabel: 'Độ ẩm KK',
    unit: '%',
    color: '#19c3ff',
    icon: Droplets,
    scale: { min: 0, max: 100 },
    safe: { min: 40, max: 85 },
  },
  {
    key: 'soil',
    label: 'Độ Ẩm Đất',
    shortLabel: 'Độ ẩm đất',
    unit: '%',
    color: '#22d17b',
    icon: Sprout,
    scale: { min: 0, max: 100 },
    safe: { min: 30, max: 80 },
  },
];
