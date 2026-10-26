import { get } from './client';
export const list = (params) => get('/audit-logs', params);
