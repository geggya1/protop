/**
 * Structured notification diagnostics — filter console by `[weekplan-notif]`.
 */
const PREFIX = '[weekplan-notif]';

export function notifLog(event, detail = {}) {
  try {
    const dev = typeof __DEV__ !== 'undefined' && __DEV__;
    const payload = detail && typeof detail === 'object' ? detail : { detail };
    const isError = payload.level === 'error' || payload.err || payload.code;
    if (!dev && !isError) return;
    if (isError) {
      if (dev) console.warn(PREFIX, event, payload);
    } else {
      console.log(PREFIX, event, payload);
    }
  } catch {
    /* ignore */
  }
}
