export const disconnectTimers = new Map();

// Grace period before a disconnected user is marked offline. Configurable so
// tests can use a short value instead of waiting wall-clock seconds.
export const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 3000;