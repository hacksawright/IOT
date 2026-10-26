import { io } from 'socket.io-client';
import { getToken } from './client';
let socket = null;
export function getSocket() {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    socket = io(socketUrl, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
  }
  return socket;
}
export function resetSocket() {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); }
  socket = null;
}
