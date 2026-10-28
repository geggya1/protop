/**
 * Teksten på tilbakelenken fra en detaljside (UX-20): alltid «‹ {Listenavn}».
 * Skjermlesere får «Tilbake til {Listenavn}». Komponenten ligger i BackLink.jsx.
 */
export function backLinkLabel(label) {
  return String(label || '').trim() || 'Tilbake';
}

export function backLinkText(label) {
  return `‹ ${backLinkLabel(label)}`;
}

export function backLinkA11y(label) {
  return `Tilbake til ${backLinkLabel(label)}`;
}
