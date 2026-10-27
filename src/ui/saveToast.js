/**
 * Kort bekreftelse når en endring er lagret.
 * Skjermen kaller showSaveToast; SaveToastHost viser popupen noen sekunder.
 */

const listeners = new Set();
let seq = 0;

export const SAVE_TOAST_TITLE = 'Endring er lagret';
export const SAVE_TOAST_MS = 3200;

const GENERIC = new Set([
  'endring er lagret',
  'lagret',
  'nivåene er lagret',
  'innstilling lagret',
]);

export function saveToastPayload(detail = '') {
  const text = String(detail ?? '').replace(/\s+/g, ' ').trim();
  const bare = text.replace(/[.!?]+$/g, '').trim().toLocaleLowerCase('nb');
  return {
    title: SAVE_TOAST_TITLE,
    detail: text && !GENERIC.has(bare) ? text : '',
  };
}

export function showSaveToast(detail = '') {
  const toast = { id: ++seq, ...saveToastPayload(detail) };
  for (const listener of listeners) listener(toast);
  return toast;
}

/** Feil som ellers ville blitt svelget, vises i samme popup (kind 'error'). */
export function errorToastPayload(title, detail = '') {
  const head = String(title ?? '').replace(/\s+/g, ' ').trim();
  const text = String(detail ?? '').replace(/\s+/g, ' ').trim();
  return {
    kind: 'error',
    title: head || 'Noe gikk galt',
    detail: text && text !== head ? text : '',
  };
}

export function showErrorToast(title, detail = '') {
  const toast = { id: ++seq, ...errorToastPayload(title, detail) };
  for (const listener of listeners) listener(toast);
  return toast;
}

export function subscribeSaveToast(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetSaveToastForTests() {
  listeners.clear();
  seq = 0;
}
