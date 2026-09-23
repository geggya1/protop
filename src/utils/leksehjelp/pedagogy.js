/**
 * Pedagogikk for Leksehjelpen — forankret i norsk praksis og forskning.
 *
 * Inspirasjon kartlagt:
 * - House of Math: Base–Build–Burn, mikrolæring, mestringsløyper
 * - Lekselos: hint/delsteg, aldri blank fasit, LK20
 * - Kikora: tilbakemelding på hvert regnesteg, visuelle konkreter
 * - Campus Matte: dybdelæring, forståelse før prosedyre (LK20)
 * - Regn med Max: umiddelbar ros, stjerner, lav-stress økter
 * - GlupusMatte: adaptiv kompetansegraf, elevstyrt læring
 * - Photomath/Socratic: stegvis visualisering (vi låner formen, ikke fasit-dump)
 *
 * Forskning / metode:
 * - Scaffolding (Wood mfl.): diagnose → responsiv støtte → fading
 * - Sokratisk spørsmålsstilling (Ulleberg/Solem; Boaler)
 * - Tenkende klasserom / vertikale tavler (Liljedahl) — «blyanttavle»
 * - Growth mindset: ros metode og innsats, ikke «du er smart»
 * - LK20 kjerneelementer: utforsking, resonnering, argumentasjon
 */

export const PEDAGOGY = {
  minAttemptsBeforeFasit: 2,
  minHintLevelBeforeFasit: 2,
  maxQuickReplies: 2,
  praiseOnCorrect: true,
  boardMaxLines: 8,
};

export const PRAISE_LINES = [
  'Stilig tenkning — du er på rett spor!',
  'Godt jobbet! Du forklarer metoden din klart.',
  'Wow — du klarte steget! Klar for neste?',
  'Du tenker som en ekte problemløser.',
  'Fin innsats. Det er slik man lærer matte (og andre fag)!',
  'Bra! Du prøvde selv — det er det viktigste.',
];

export const ENCOURAGE_WRONG = [
  'La oss se hvor det skled — så retter vi det sammen.',
  'Nesten! Ta ett lite steg tilbake, så finner vi det.',
  'Godt forsøk. Jeg hjelper deg videre uten å gi hele svaret.',
];

export function pickPraise(seed = 0) {
  const i = Math.abs(Number(seed) || 0) % PRAISE_LINES.length;
  return PRAISE_LINES[i];
}

export function pickEncourageWrong(seed = 0) {
  const i = Math.abs(Number(seed) || 0) % ENCOURAGE_WRONG.length;
  return ENCOURAGE_WRONG[i];
}

/**
 * Kan eleven be om fasit nå?
 * Foresatt-innstilling (allowFasit) + barnet må ha prøvd / fått hint.
 */
export function canRequestFasit({
  allowFasit,
  attemptCount = 0,
  hintLevel = 0,
  missionAccomplished = false,
} = {}) {
  if (!allowFasit) return false;
  if (missionAccomplished) return false;
  return (
    attemptCount >= PEDAGOGY.minAttemptsBeforeFasit
    || hintLevel >= PEDAGOGY.minHintLevelBeforeFasit
  );
}

export function fasitLockedReason({ allowFasit, attemptCount = 0, hintLevel = 0 } = {}) {
  if (!allowFasit) {
    return 'Foresatte har skrudd av fasit. Du får hint og veiledning i stedet.';
  }
  const needAttempts = PEDAGOGY.minAttemptsBeforeFasit - attemptCount;
  if (needAttempts > 0 && hintLevel < PEDAGOGY.minHintLevelBeforeFasit) {
    return needAttempts === 1
      ? 'Prøv å svare én gang til — så kan du be om fasit.'
      : `Prøv selv ${needAttempts} ganger (eller be om hint) før fasit.`;
  }
  return '';
}
