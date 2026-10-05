/** Firebase callable errors for skjema-scan should not leak codes like «internal». */

export const FORM_SCAN_DOWN = 'AI-scan er nede akkurat nå. Prøv igjen om litt, eller bygg skjemaet manuelt.';

export function friendlyFormScanError(err) {
  const code = String(err?.code || '');
  const raw = String(err?.message || err || '').replace(/^FirebaseError:\s*/i, '').trim();
  const blob = `${code} ${raw}`;
  if (/unauthenticated/i.test(blob)) return 'Logg inn for å lese dokumentet med AI.';
  if (/resource-exhausted|too many|rate.?limit/i.test(blob)) {
    return 'For mange AI-kall. Vent litt og prøv igjen.';
  }
  if (
    /internal|not-found|not_found|unimplemented|failed to fetch|cors|load failed|unavailable|deadline|network|access-control-allow-origin/i.test(blob)
    || /^(internal|INTERNAL)$/.test(raw)
  ) {
    return FORM_SCAN_DOWN;
  }
  if (!raw) return FORM_SCAN_DOWN;
  return raw.slice(0, 280);
}
