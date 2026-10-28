/**
 * Felles bekreftelse før destruktive handlinger (UX-27). Skjermene kaller
 * useConfirm() (src/ui/useConfirm.js) eller requestConfirm(), og ConfirmHost i skallet
 * tegner ProTops ConfirmDialog. Ingen window.confirm, og appen spør på samme måte som web.
 */

export const CONFIRM_TONES = ['default', 'warn', 'danger'];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Normaliserer en forespørsel. Tekst alene blir meldingen.
 * tone: 'danger' (sletting), 'warn' (kan ikke angres, men sletter ikke) eller 'default'.
 */
export function confirmOptions(input = {}) {
  const request = typeof input === 'string' ? { message: input } : (input || {});
  const tone = CONFIRM_TONES.includes(request.tone) ? request.tone : (request.danger ? 'danger' : 'default');
  return {
    title: clean(request.title) || (tone === 'danger' ? 'Slette?' : 'Bekreft'),
    message: clean(request.message),
    confirmText: clean(request.confirmText) || (tone === 'danger' ? 'Slett' : 'OK'),
    cancelText: clean(request.cancelText) || 'Avbryt',
    tone,
  };
}

/**
 * Én åpen forespørsel om gangen. En ny forespørsel mens en er åpen, svarer «nei» på den gamle,
 * og et svar kan bare gis én gang (dobbelttrykk og Escape etter trykk gjør ingenting).
 */
export function createConfirmGate() {
  let pending = null;
  return {
    open(resolve) {
      const previous = pending;
      pending = resolve;
      if (previous) previous(false);
    },
    settle(answer) {
      const resolve = pending;
      pending = null;
      if (resolve) resolve(!!answer);
      return !!resolve;
    },
    get busy() {
      return !!pending;
    },
  };
}

const listeners = new Set();
const gate = createConfirmGate();
let seq = 0;
let current = null;

function publish() {
  for (const listener of listeners) listener(current);
}

/**
 * Ber om bekreftelse. Gir et Promise som blir true (bekreftet) eller false (avbrutt).
 * Uten ConfirmHost (skjerm utenfor skallet) blir svaret false, så ingenting slettes uten spørsmål.
 */
export function requestConfirm(input) {
  const request = { id: ++seq, ...confirmOptions(input) };
  if (!listeners.size) {
    if (typeof console !== 'undefined') console.warn('requestConfirm: ConfirmHost er ikke montert.');
    return Promise.resolve(false);
  }
  const promise = new Promise((resolve) => {
    gate.open((answer) => {
      if (current && current.id === request.id) {
        current = null;
        publish();
      }
      resolve(answer);
    });
    current = request;
    publish();
  });
  // Id-en lar skjermen som spurte avbryte sin egen forespørsel (useConfirm ved avmontering).
  promise.confirmId = request.id;
  return promise;
}

/** Svar på forespørselen som vises (fra ConfirmHost). id hindrer at et sent svar treffer en ny dialog. */
export function answerConfirm(id, answer) {
  if (!current || (id != null && current.id !== id)) return false;
  return gate.settle(answer);
}

/** Avbryter forespørselen med gitt id, f.eks. når skjermen som spurte forsvinner. */
export function cancelConfirm(id) {
  return answerConfirm(id, false);
}

export function currentConfirm() {
  return current;
}

export function subscribeConfirm(listener) {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function resetConfirmForTests() {
  gate.settle(false);
  listeners.clear();
  current = null;
  seq = 0;
}
