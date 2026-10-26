import { get, post } from './client';
export const list = (params) => get('/alerts', params);
export const getDetail = (id) => get(`/alerts/${id}`);
export const acknowledge = (id) => post(`/alerts/${id}/acknowledge`);
export const resolve = (id, resolutionNote) => post(`/alerts/${id}/resolve`, { resolutionNote });
