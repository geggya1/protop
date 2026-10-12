/** Avtalelenke som overlever innlogging. React Navigation skriver / om til /login og kaster ?avtale=. */

export const AGREEMENT_LINK_KEY = 'protop_pending_avtale';

let memory = '';

export function normalizeAgreementToken(value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return '';
  return token;
}

export function agreementTokenFromLocation(pathOrUrl) {
  const raw = String(pathOrUrl || '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : '';
  if (!query) return '';
  return normalizeAgreementToken(new URLSearchParams(query).get('avtale'));
}

function webStorage() {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch { /* privatmodus */ }
  return null;
}

export function persistAgreementToken(token, storage) {
  const safe = normalizeAgreementToken(token);
  if (!safe) return '';
  memory = safe;
  try { (storage || webStorage())?.setItem(AGREEMENT_LINK_KEY, safe); } catch { /* ignore */ }
  return safe;
}

export function peekAgreementToken(storage) {
  if (memory) return memory;
  try {
    const stored = normalizeAgreementToken((storage || webStorage())?.getItem(AGREEMENT_LINK_KEY));
    if (stored) memory = stored;
    return stored;
  } catch {
    return '';
  }
}

export function consumeAgreementToken(storage) {
  const token = peekAgreementToken(storage);
  memory = '';
  try { (storage || webStorage())?.removeItem(AGREEMENT_LINK_KEY); } catch { /* ignore */ }
  return token;
}

export function captureAgreementLinkFromLocation(pathOrUrl, storage) {
  const token = agreementTokenFromLocation(pathOrUrl);
  if (token) persistAgreementToken(token, storage);
  return token || peekAgreementToken(storage);
}

export function resetAgreementLinkMemory() {
  memory = '';
}

export function withAgreementQuery(path, token = peekAgreementToken()) {
  const base = String(path || '');
  const safe = normalizeAgreementToken(token);
  if (!safe || /(?:^|[?&])avtale=/.test(base)) return base;
  const hashAt = base.indexOf('#');
  const hash = hashAt >= 0 ? base.slice(hashAt) : '';
  const bare = hashAt >= 0 ? base.slice(0, hashAt) : base;
  const joiner = bare.includes('?') ? '&' : '?';
  return `${bare}${joiner}avtale=${encodeURIComponent(safe)}${hash}`;
}
