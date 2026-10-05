/** Live public hosts. Alt annet (localhost, preview-kanal) er utviklingsmiljø. */
const LIVE_HOSTS = new Set([
  'protop.no',
  'www.protop.no',
  'protop-c189c.web.app',
  'protop-c189c.firebaseapp.com',
]);

export const PREVIEW_CHANNEL_ID = 'utvikling';

export function isPublicLiveHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return LIVE_HOSTS.has(host);
}

export function isPreviewHost(hostname) {
  return /^protop-c189c--[\w.-]+\.web\.app$/i.test(String(hostname || ''));
}

export function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '[::1]'
    || /^192\.168\./.test(host)
    || /^10\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

/**
 * authDomain for current page. Preview-kanaler serverer /__/auth på egen host.
 * Ukjent/lokal host bruker firebaseapp.com (localhost er allerede autorisert).
 */
export function resolveAuthDomain(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return 'protop-c189c.firebaseapp.com';
  if (host === 'protop.no' || host === 'www.protop.no') return host;
  if (host === 'protop-c189c.web.app' || host === 'protop-c189c.firebaseapp.com') return host;
  if (isPreviewHost(host)) return host;
  return 'protop-c189c.firebaseapp.com';
}

export function linkingPrefixes(origin) {
  const base = [
    'https://protop.no',
    'https://www.protop.no',
    'https://protop-c189c.web.app',
    'https://protop-c189c.firebaseapp.com',
  ];
  const extra = String(origin || '').replace(/\/$/, '');
  if (extra && /^https?:\/\//.test(extra) && !base.includes(extra)) {
    return [extra, ...base];
  }
  return base;
}
