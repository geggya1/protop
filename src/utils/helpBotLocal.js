/**
 * Local Skjetten fallback when aiSupportChat callable is unavailable.
 * Mirrors the server-side localSupportReply behaviour for offline / pre-deploy.
 */

export const HELP_ESCALATE_AFTER = 4;

function looksLikeBug(text = '') {
  const q = String(text).toLowerCase();
  return /feil|bug|error|crash|krasj|hvit skjerm|white screen|blank|fungerer ikke|virker ikke|broken|exception|stack|500|404/.test(q);
}

export function localHelpBotReply(message, {
  audience = 'parent',
  device = 'phone',
  knowledge = [],
  userQueryCount = 0,
} = {}) {
  const q = String(message || '').toLowerCase();
  const kid = audience === 'child' || audience === 'teen';
  const escalate = Number(userQueryCount || 0) >= HELP_ESCALATE_AFTER;

  const match = (knowledge || []).find((k) => {
    const hay = `${k.title} ${k.summary} ${(k.steps || []).join(' ')} ${k.moduleId}`.toLowerCase();
    return q.split(/\s+/).filter((w) => w.length > 3).some((w) => hay.includes(w));
  });

  if (/lyspære|lightbulb|guide|rundtur/.test(q)) {
    return kid
      ? 'Trykk på den lille lyspæren oppe ved profilbildet. Da får du en kort forklaring og en pil som viser hvor du skal trykke.'
      : 'Lyspæren ved profilbildet åpner en kort guide for siden du står på. Velg «Vis meg hvordan» for steg-for-steg med markering i UI.';
  }
  if (/innstill|settings|språk|varsl/.test(q)) {
    return 'Åpne Mer → Innstillinger. Der finner du profil, språk, posisjon, værsted, varsler, barnas apper (foresatte) og under Om: personvern + Hjelp & support.';
  }
  if (looksLikeBug(q)) {
    return [
      kid
        ? 'Oi — det høres ut som noe ikke fungerer. Ta gjerne et bilde av skjermen.'
        : 'Det høres ut som en teknisk feil. Ta skjermbilde hvis du kan.',
      '1. Noter hva du trykket på rett før det skjedde',
      '2. Åpne Hjelp → Kontakt support',
      '3. Lim inn beskrivelsen og legg ved bildet',
      'Da får du et saksnummer, og vi (utvikler) får et analyseforslag — uten at noe endres automatisk.',
    ].join('\n');
  }
  if (match) {
    const steps = (match.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const tip = device === 'desktop'
      ? 'På web: se også venstremenyen / Mer-huben.'
      : device === 'tablet'
        ? 'På nettbrett: samme menyer som mobil, med mer plass.'
        : 'På mobil: bruk fanene nederst og Mer for flere apper.';
    return [
      `${match.title}`,
      match.summary,
      steps ? `\nSlik gjør du:\n${steps}` : '',
      `\n${tip}`,
      escalate
        ? '\nFikk du ikke svar? Trykk «Kontakt support» så lager vi en sak med saksnummer.'
        : '\nVil du at jeg forklarer et bestemt steg nærmere?',
    ].filter(Boolean).join('\n');
  }
  if (/hei|hallo|hello|help|hjelp/.test(q)) {
    return kid
      ? 'Hei! Jeg er Skjetten — jeg hjelper deg med ProTop. Spør om kalender, gjøremål, lekser eller hvor du trykker. Etter noen spørsmål kan vi sende en sak til support hvis du står fast.'
      : 'Hei! Jeg er Skjetten, ProTop sin hjelpebot. Spør om moduler, innstillinger eller feil — jeg svarer stegvis. Etter 4–5 spørsmål uten løsning foreslår jeg supportsak med bilde og saksnummer.';
  }
  const base = kid
    ? 'Jeg er ikke helt sikker. Prøv å spørre om en app (f.eks. kalender eller gjøremål), eller trykk lyspæren på siden du er på.'
    : 'Jeg fant ikke et eksakt treff. Prøv å nevne modulnavn (kalender, gjøremål, leksehjelp, handleliste…) eller beskriv hva du ser på skjermen.';
  return escalate
    ? `${base}\n\nDet kan være lurt å kontakte support nå — trykk «Kontakt support», skriv tittel og tekst, og legg ved bilde om du har.`
    : `${base}\n\nHvilken skjerm står du på, og hva prøvde du sist?`;
}

export function shouldSuggestSupport(message, userQueryCount) {
  return Number(userQueryCount || 0) >= HELP_ESCALATE_AFTER || looksLikeBug(message);
}
