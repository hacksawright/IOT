import { get, post, patch, put, del } from './client';
export const list = (params) => get('/users', params);
export const getDetail = (id) => get(`/users/${id}`);
export const create = (body) => post('/users', body);
export const update = (id, body) => patch(`/users/${id}`, body);
export const deactivate = (id) => del(`/users/${id}`);
export const assignDevices = (id, deviceIds) => put(`/users/${id}/devices`, { deviceIds });
