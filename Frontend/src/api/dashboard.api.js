import { get } from './client';
export const getSummary = () => get('/dashboard/summary');
export const getTelemetry = (params) => get('/dashboard/telemetry', params);
