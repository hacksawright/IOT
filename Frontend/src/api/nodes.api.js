import { get, post, patch } from './client';
export const list = () => get('/nodes');
export const getDetail = (id) => get(`/nodes/${id}`);
export const create = (body) => post('/nodes', body);
export const update = (id, body) => patch(`/nodes/${id}`, body);
export const revoke = (id) => post(`/nodes/${id}/revoke`);
export const restore = (id) => post(`/nodes/${id}/restore`);
export const issueMqttCredentials = (id) => post(`/nodes/${id}/mqtt-credentials`);
