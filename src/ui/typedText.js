/**
 * Felt som ryddes (trimmes) på veien til lagring, mister mellomrom og linjeskift mens man
 * skriver: «Prosjekt- » kommer tilbake som «Prosjekt-» før neste tegn. Mens feltet er i bruk
 * vises derfor det som er skrevet, så lenge verdien som kom tilbake er den samme teksten
 * bortsett fra mellomrom og linjeskift. Endres verdien ellers, vises verdien.
 */

export function squashSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Samme tekst bortsett fra mellomrom og linjeskift. */
export function sameExceptSpace(typed, stored) {
  return squashSpace(typed) === squashSpace(stored);
}

/**
 * Som sameExceptSpace, men et tømt felt regnes også som det samme, så feltet kan tømmes og
 * skrives på nytt selv om verdien faller tilbake til en standardtekst.
 */
export function sameOrCleared(typed, stored) {
  return !squashSpace(typed) || sameExceptSpace(typed, stored);
}

/** Teksten feltet skal vise. typed er null når feltet ikke er i bruk. */
export function shownText(typed, value, same = sameExceptSpace) {
  const stored = value == null ? '' : String(value);
  return typed != null && same(typed, stored) ? typed : stored;
}
