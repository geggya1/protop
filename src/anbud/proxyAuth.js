/**
 * /api/tender-proxy krever innlogget bruker. Hodene her har Bearer-tokenet fra
 * Firebase Auth. Firebase lastes først ved bruk, så modulen kan testes uten appen.
 */
let tokenProvider = null;

/** Tester (og andre miljøer) kan sette sin egen tokenkilde. null = Firebase Auth. */
export function setProxyTokenProvider(fn) {
  tokenProvider = typeof fn === 'function' ? fn : null;
}

async function firebaseToken() {
  try {
    const { auth } = await import('../../firebase.js');
    return await auth?.currentUser?.getIdToken?.();
  } catch {
    return '';
  }
}

/** JSON-hoder til proxyen, med Authorization når noen er logget inn. */
export async function proxyAuthHeaders(base = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...base };
  let token = '';
  try {
    token = String((await (tokenProvider || firebaseToken)()) || '');
  } catch {
    token = '';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
