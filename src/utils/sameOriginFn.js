import { auth } from '../../firebase';

function hostedOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:/.test(window.location.origin)) {
    return window.location.origin;
  }
  return 'https://protop.no';
}

/** POST JSON til Hosting-rewrite. Unngår callable CORS mot cloudfunctions.net. */
export async function postSameOrigin(path, body) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Uten token svarer endepunktet 401; kaller bruker lokal fallback.
  }
  const res = await fetch(`${hostedOrigin()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
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
