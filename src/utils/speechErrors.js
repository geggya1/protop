/** Transient Web Speech errors — keep session / allow restart. */
export const TRANSIENT_SPEECH_ERRORS = new Set(['no-speech', 'aborted', 'network']);

/** Fatal Web Speech errors — end session and surface to UI. */
export const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'bad-grammar',
  'language-not-supported',
]);

export function isTransientSpeechError(code) {
  return TRANSIENT_SPEECH_ERRORS.has(String(code || ''));
}

export function isFatalSpeechError(code) {
  const c = String(code || '');
  if (!c) return false;
  // Ukjente koder behandles som fatale — bedre å stoppe enn å henge i «Lytter…».
  return !isTransientSpeechError(c);
}

export function speechErrorMessage(code) {
  switch (String(code || '')) {
    case 'not-allowed':
      return 'Mikrofon er blokkert. Tillat mikrofon i nettleseren, eller skriv notatet.';
    case 'service-not-allowed':
      return 'Talegjenkjenning er ikke tillatt her. Skriv eller lim inn notatet.';
    case 'audio-capture':
      return 'Fant ingen mikrofon. Sjekk at en mikrofon er tilkoblet.';
    case 'language-not-supported':
      return 'Talegjenkjenning støtter ikke norsk i denne nettleseren. Skriv notatet i stedet.';
    case 'network':
      return 'Nettverksfeil under talegjenkjenning. Prøv igjen.';
    default:
      return 'Opptak feilet. Prøv igjen, eller skriv notatet.';
  }
}

export function speechErrorInfo(code) {
  const error = String(code || 'unknown');
  return {
    error,
    fatal: isFatalSpeechError(error),
    message: speechErrorMessage(error),
  };
}
