import { get } from './client';
export const latest = () => get('/readings/latest');
