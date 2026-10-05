import { auth } from '../../firebase';

function hostedOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:/.test(window.location.origin)) {
    return window.location.origin;
  }
  return 'https://protop.no';
}

/** POST JSON til Hosting-rewrite. Unngår callable CORS mot cloudfunctions.net. */
export async function postSameOrigin(path, body, { timeoutMs = 60000 } = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Uten token svarer endepunktet 401; kaller bruker lokal fallback.
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = timeoutMs && controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  let res;
  try {
    res = await fetch(`${hostedOrigin()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Innlesningen tok for lang tid. Prøv en mindre fil, eller lim inn teksten.');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const type = String(res.headers.get('content-type') || '');
  if (!type.includes('application/json')) {
    throw new Error('Tjenesten er ikke tilgjengelig.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Tjenesten svarte ${res.status}`);
  }
  return data;
}
