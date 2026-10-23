/** Adressen til anbudsproxyen (Cloud Function bak Hosting). */

export const LIVE_TENDER_PROXY = 'https://protop.no/api/tender-proxy';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * På protop.no går kallet til samme origin. Lokalt (Metro på localhost) og i
 * mobilappen finnes ingen /api-rute, så kallet går til live-proxyen.
 */
export function tenderProxyUrl(
  location = typeof window !== 'undefined' ? window.location : null,
  override = process.env.EXPO_PUBLIC_TENDER_PROXY_URL,
) {
  const host = String(location?.hostname || '').toLowerCase();
  const local = LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
  // Lokal proxy for å teste endringer i funksjonen før de er deployet. Gjelder bare localhost.
  if (local && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(String(override || ''))) return override;
  if (!host || local) return LIVE_TENDER_PROXY;
  return '/api/tender-proxy';
}
