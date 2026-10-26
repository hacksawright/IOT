const pad = (n) => String(n).padStart(2, '0');

export const formatTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const formatClock = (d) => `${formatTime(d)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
