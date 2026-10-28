/**
 * Kravbibliotek, kodeverk og standardprofiler for ISO / K-HMS.
 *
 * Kravtekstene her er ProToPs egne korte sammendrag av kravområder — ikke
 * standardenes normative ordlyd. Hver kravpost er merket «ikke faglig validert»
 * til en ISO-fagperson har kontrollert koblingen mot lisensiert standardtekst.
 */

export const STANDARDS = [
  { code: 'ISO9001', number: '9001', edition: '2026', label: 'ISO 9001:2026', short: '9001', domain: 'Kvalitet' },
  { code: 'ISO14001', number: '14001', edition: '2026', label: 'ISO 14001:2026', short: '14001', domain: 'Miljø' },
  { code: 'ISO45001', number: '45001', edition: '2018+A1:2024', label: 'ISO 45001:2018 + Amd 1:2024', short: '45001', domain: 'Arbeidsmiljø' },
];

export function standardByCode(code) {
  return STANDARDS.find((row) => row.code === code) || null;
}

/** Kravtyper som alltid skal skilles i UI (A19). */
export const REQUIREMENT_KINDS = [
  { id: 'iso', label: 'ISO-krav', hint: 'Krav i aktivert ISO-standard. Fagvalideres mot lisensiert tekst.' },
  { id: 'lov', label: 'Norsk lovkrav', hint: 'Lov eller forskrift. Ansvarlig vurderer relevans og etterlevelse.' },
  { id: 'kontrakt', label: 'Kontraktskrav', hint: 'Avtalt med kunde eller oppdragsgiver.' },
  { id: 'intern', label: 'Internt krav', hint: 'Virksomhetens egne regler.' },
  { id: 'anbefalt', label: 'Anbefalt praksis', hint: 'Valgfri beste praksis eller bransjemal.' },
];

export function kindLabel(id) {
  return REQUIREMENT_KINDS.find((row) => row.id === id)?.label || 'Krav';
}

/** Interne vurderingsstatuser (spesifikasjon kap. 9). Aldri «sertifisert». */
export const ASSESSMENT_STATUSES = [
  { id: 'ikke_vurdert', label: 'Ikke vurdert', tone: 'muted', icon: 'help-circle-outline' },
  { id: 'mangler', label: 'Mangler', tone: 'danger', icon: 'close-circle-outline' },
  { id: 'under_arbeid', label: 'Under arbeid', tone: 'warn', icon: 'construct-outline' },
  { id: 'dokumentert', label: 'Bevis tilgjengelig', tone: 'info', icon: 'document-attach-outline' },
  { id: 'internt_verifisert', label: 'Internt verifisert', tone: 'ok', icon: 'checkmark-done-outline' },
  { id: 'avvik', label: 'Avvik', tone: 'danger', icon: 'alert-circle-outline' },
  { id: 'ma_revurderes', label: 'Må revurderes', tone: 'warn', icon: 'refresh-circle-outline' },
  { id: 'ikke_relevant', label: 'Ikke relevant (begrunnet)', tone: 'muted', icon: 'remove-circle-outline' },
];

export function assessmentLabel(id) {
  return ASSESSMENT_STATUSES.find((row) => row.id === id)?.label || 'Ikke vurdert';
}

/**
 * Kravområder (kap. 4–10). Klausulnummer per standard der temaet har en konkret klausul.
 * `null` = temaet håndteres etter relevans, ikke som egen klausul i den standarden.
 * ISO 9001-operative krav (kap. 8) kan begrunnes som ikke anvendbare; 14001/45001 kan ikke klikkes bort.
 */
export const REQUIREMENT_AREAS = [
  { key: 'context', title: 'Organisasjonens kontekst', clauses: { ISO9001: '4.1', ISO14001: '4.1', ISO45001: '4.1' }, summary: 'Interne og eksterne forhold som påvirker ledelsessystemet er kartlagt, vurdert og holdt oppdatert, også klimarelevans.', module: 'kontekst' },
  { key: 'parties', title: 'Interessenter og forventninger', clauses: { ISO9001: '4.2', ISO14001: '4.2', ISO45001: '4.2' }, summary: 'Relevante interessenter, deres behov og hvilke av dem som blir bindende forpliktelser er dokumentert.', module: 'kontekst' },
  { key: 'scope', title: 'Omfang av ledelsessystemet', clauses: { ISO9001: '4.3', ISO14001: '4.3', ISO45001: '4.3' }, summary: 'Omfanget (enheter, lokasjoner, aktiviteter, tjenester) er fastsatt og begrunnet.', module: 'innstillinger' },
  { key: 'processes', title: 'Prosesser og ledelsessystem', clauses: { ISO9001: '4.4', ISO14001: '4.4', ISO45001: '4.4' }, summary: 'Prosessene har eier, input/output, kriterier, ressurser, risiko og samspill beskrevet.', module: 'prosesser' },
  { key: 'leadership', title: 'Lederskap og forpliktelse', clauses: { ISO9001: '5.1', ISO14001: '5.1', ISO45001: '5.1' }, summary: 'Ledelsen tar ansvar, sikrer ressurser og integrerer systemet i virksomhetens drift.', module: 'ledelse' },
  { key: 'customer', title: 'Kundeorientering', clauses: { ISO9001: '5.1.2', ISO14001: null, ISO45001: null }, summary: 'Kundekrav, lovkrav og kundetilfredshet følges opp.', module: 'prosjekt' },
  { key: 'policy', title: 'Policy', clauses: { ISO9001: '5.2', ISO14001: '5.2', ISO45001: '5.2' }, summary: 'Policy er vedtatt, kommunisert og tilgjengelig, og passer virksomhetens formål.', module: 'dokumenter' },
  { key: 'roles', title: 'Roller, ansvar og myndighet', clauses: { ISO9001: '5.3', ISO14001: '5.3', ISO45001: '5.3' }, summary: 'Ansvar og myndighet er tildelt, kommunisert og forstått.', module: 'organisasjon' },
  { key: 'participation', title: 'Konsultasjon og medvirkning', clauses: { ISO9001: null, ISO14001: null, ISO45001: '5.4' }, summary: 'Arbeidstakere og representanter konsulteres og medvirker, uten hindringer.', module: 'hms' },
  { key: 'risk', title: 'Risiko og muligheter', clauses: { ISO9001: '6.1', ISO14001: '6.1.1', ISO45001: '6.1' }, summary: 'Risiko og muligheter er identifisert, vurdert og håndtert med tiltak som evalueres.', module: 'risiko' },
  { key: 'aspects', title: 'Miljøaspekter', clauses: { ISO9001: null, ISO14001: '6.1.2', ISO45001: null }, summary: 'Miljøaspekter og -påvirkning er identifisert i et livsløpsperspektiv, og vesentlige aspekter er fastsatt med kriterier.', module: 'miljo' },
  { key: 'obligations', title: 'Samsvarsforpliktelser', clauses: { ISO9001: null, ISO14001: '6.1.3', ISO45001: '6.1.3' }, summary: 'Lovkrav og andre forpliktelser er identifisert, tilgjengelige og koblet til virksomheten.', module: 'lovkrav' },
  { key: 'hazards', title: 'Fareidentifikasjon og arbeidsmiljørisiko', clauses: { ISO9001: null, ISO14001: null, ISO45001: '6.1.2' }, summary: 'Farer identifiseres løpende med medvirkning, og risiko vurderes med tiltakshierarki.', module: 'hms' },
  { key: 'objectives', title: 'Mål og planer', clauses: { ISO9001: '6.2', ISO14001: '6.2', ISO45001: '6.2' }, summary: 'Målbare mål med eier, ressurser, frist og evaluering er etablert.', module: 'mal' },
  { key: 'change', title: 'Planlegging av endringer', clauses: { ISO9001: '6.3', ISO14001: null, ISO45001: '8.1.3' }, summary: 'Endringer planlegges kontrollert med vurdering av konsekvenser og risiko.', module: 'risiko' },
  { key: 'resources', title: 'Ressurser og organisasjonskunnskap', clauses: { ISO9001: '7.1', ISO14001: '7.1', ISO45001: '7.1' }, summary: 'Nødvendige ressurser, måleutstyr og kunnskap er fastsatt og tilgjengelig.', module: 'ledelse' },
  { key: 'measuring', title: 'Overvåkings- og måleressurser (kalibrering)', clauses: { ISO9001: '7.1.5', ISO14001: '9.1.1', ISO45001: '9.1.1' }, summary: 'Måleutstyr er kalibrert eller kontrollert mot sporbare standarder, merket og beskyttet, og tidligere resultater vurderes når utstyret viser seg å være feil. Kontroll og kalibrering registreres i Utstyr.', module: 'sertifisering' },
  { key: 'competence', title: 'Kompetanse', clauses: { ISO9001: '7.2', ISO14001: '7.2', ISO45001: '7.2' }, summary: 'Kompetansekrav per rolle, dokumentert kompetanse, opplæring og effektvurdering.', module: 'kompetanse' },
  { key: 'awareness', title: 'Bevissthet', clauses: { ISO9001: '7.3', ISO14001: '7.3', ISO45001: '7.3' }, summary: 'Ansatte kjenner policy, mål, eget bidrag og konsekvenser av avvik.', module: 'dokumenter' },
  { key: 'communication', title: 'Kommunikasjon', clauses: { ISO9001: '7.4', ISO14001: '7.4', ISO45001: '7.4' }, summary: 'Hva, når, med hvem og hvordan det kommuniseres internt og eksternt.', module: 'kommunikasjon' },
  { key: 'documented', title: 'Dokumentert informasjon', clauses: { ISO9001: '7.5', ISO14001: '7.5', ISO45001: '7.5' }, summary: 'Styrte dokumenter og registreringer har identifikasjon, godkjenning, versjon og tilgangskontroll.', module: 'dokumenter' },
  { key: 'operation', title: 'Operativ planlegging og styring', clauses: { ISO9001: '8.1', ISO14001: '8.1', ISO45001: '8.1' }, summary: 'Driften planlegges og styres med kriterier, kontrollpunkter og dokumentasjon.', module: 'prosesser' },
  { key: 'requirements', title: 'Krav til produkter og tjenester', clauses: { ISO9001: '8.2', ISO14001: null, ISO45001: null }, summary: 'Kundekrav avklares og kontrakt gjennomgås før aksept, og endringer håndteres.', module: 'prosjekt' },
  { key: 'design', title: 'Prosjektering og utvikling', clauses: { ISO9001: '8.3', ISO14001: null, ISO45001: null }, summary: 'Prosjektering planlegges med input, verifikasjon, validering, kontroll og godkjenning før frigivelse.', module: 'prosjekt' },
  { key: 'suppliers', title: 'Eksterne leverandører', clauses: { ISO9001: '8.4', ISO14001: '8.1', ISO45001: '8.1.4' }, summary: 'Eksterne leverandører kvalifiseres, styres og evalueres etter risiko.', module: 'leverandorer' },
  { key: 'delivery', title: 'Produksjon og levering', clauses: { ISO9001: '8.5', ISO14001: '8.1', ISO45001: '8.1' }, summary: 'Leveranser utføres under styrte forhold med sporbarhet.', module: 'prosjekt' },
  { key: 'release', title: 'Frigivelse og avvikende leveranser', clauses: { ISO9001: '8.6–8.7', ISO14001: null, ISO45001: null }, summary: 'Leveranser frigis etter kontroll, og avvikende leveranser identifiseres og håndteres.', module: 'avvik' },
  { key: 'emergency', title: 'Beredskap', clauses: { ISO9001: null, ISO14001: '8.2', ISO45001: '8.2' }, summary: 'Nødsituasjoner er analysert, planlagt for og øvd, og planer evalueres.', module: 'beredskap' },
  { key: 'monitoring', title: 'Overvåking, måling og analyse', clauses: { ISO9001: '9.1', ISO14001: '9.1', ISO45001: '9.1' }, summary: 'Hva som måles, metode, når og hvordan resultatene analyseres.', module: 'mal' },
  { key: 'satisfaction', title: 'Kundetilfredshet', clauses: { ISO9001: '9.1.2', ISO14001: null, ISO45001: null }, summary: 'Kundenes oppfatning måles og følges opp.', module: 'prosjekt' },
  { key: 'evaluation', title: 'Evaluering av samsvar', clauses: { ISO9001: null, ISO14001: '9.1.2', ISO45001: '9.1.2' }, summary: 'Etterlevelse av samsvarsforpliktelser evalueres planlagt og dokumentert.', module: 'lovkrav' },
  { key: 'internalAudit', title: 'Internrevisjon', clauses: { ISO9001: '9.2', ISO14001: '9.2', ISO45001: '9.2' }, summary: 'Risikobasert revisjonsprogram med objektive revisorer, rapport og oppfølging.', module: 'revisjon' },
  { key: 'review', title: 'Ledelsens gjennomgang', clauses: { ISO9001: '9.3', ISO14001: '9.3', ISO45001: '9.3' }, summary: 'Ledelsen gjennomgår systemet planlagt med definert input og dokumenterte beslutninger.', module: 'ledelse' },
  { key: 'nonconformity', title: 'Avvik og korrigerende tiltak', clauses: { ISO9001: '10.2', ISO14001: '10.2', ISO45001: '10.2' }, summary: 'Avvik håndteres med korreksjon, årsaksvurdering, tiltak, effektvurdering og dokumentasjon.', module: 'avvik' },
  { key: 'improvement', title: 'Kontinuerlig forbedring', clauses: { ISO9001: '10.1', ISO14001: '10.1', ISO45001: '10.3' }, summary: 'Egnethet, tilstrekkelighet og effektivitet forbedres kontinuerlig.', module: 'avvik' },
];

/** 9001 kap. 8 kan begrunnes som ikke anvendbart; 14001/45001-krav kan ikke klikkes bort. */
export function mayBeNotApplicable(requirement) {
  if (!requirement) return false;
  if (requirement.kind !== 'iso') return true;
  return requirement.standard === 'ISO9001' && /^8\./.test(String(requirement.clause || ''));
}

/** Standard kravbibliotek for valgte standarder. Stabil id per standard/utgave/klausul. */
export function isoRequirementLibrary(standardCodes = STANDARDS.map((s) => s.code)) {
  const out = [];
  for (const code of standardCodes) {
    const std = standardByCode(code);
    if (!std) continue;
    for (const area of REQUIREMENT_AREAS) {
      const clause = area.clauses[code];
      if (!clause) continue;
      out.push({
        id: `req_${std.number}_${std.edition.replace(/[^0-9A-Za-z]/g, '')}_${area.key}`,
        kind: 'iso',
        standard: code,
        edition: std.edition,
        clause,
        areaKey: area.key,
        title: area.title,
        summary: area.summary,
        module: area.module,
        reviewStatus: 'ikke_faglig_validert',
        source: `${std.label} (lisensiert tekst kreves for normativ ordlyd)`,
      });
    }
  }
  return out;
}

/**
 * Norsk regelverkslag — redaktørstyrte startmaler. Ordlyd er egne sammendrag.
 * Alle må vurderes av ansvarlig før de regnes som relevante for virksomheten.
 */
export const NORWEGIAN_OBLIGATIONS = [
  { key: 'ikf5', title: 'Internkontrollforskriften § 5', authority: 'Arbeidstilsynet m.fl.', source: 'https://www.arbeidstilsynet.no/regelverk/forskrifter/internkontrollforskriften', summary: 'Systematisk HMS-arbeid: oversikt over regler, kunnskap og medvirkning, skriftlige mål, ansvar, risikovurdering, rutiner for avvik og systematisk overvåking og gjennomgang.', areaKeys: ['obligations', 'risk', 'nonconformity', 'review'] },
  { key: 'aml', title: 'Arbeidsmiljøloven', authority: 'Arbeidstilsynet', source: 'https://lovdata.no/dokument/NL/lov/2005-06-17-62', summary: 'Fullt forsvarlig arbeidsmiljø, opplæring, medvirkning, verneombud/AMU/BHT der det kreves, og melding av alvorlige skader.', areaKeys: ['hazards', 'participation', 'competence'] },
  { key: 'olm', title: 'Forskrift om organisering, ledelse og medvirkning', authority: 'Arbeidstilsynet', source: 'https://www.arbeidstilsynet.no/regelverk/forskrifter/forskrift-om-organisering-ledelse-og-medvirkning/', summary: 'Risikovurdering, verneombud, AMU, BHT og opplæring etter virksomhetens art.', areaKeys: ['participation', 'hazards'] },
  { key: 'bhf', title: 'Byggherreforskriften', authority: 'Arbeidstilsynet', source: 'https://www.arbeidstilsynet.no/regelverk/forskrifter/byggherreforskriften/', summary: 'Gjelder for roller og prosjekter der forskriften kommer til anvendelse: SHA-plan, koordinering og prosjekteringsrisiko. Ikke et generelt ISO-krav.', areaKeys: ['hazards', 'design'] },
  { key: 'forurensning', title: 'Forurensningsloven og avfallsforskriften', authority: 'Miljødirektoratet / kommunen', source: 'https://lovdata.no/dokument/NL/lov/1981-03-13-6', summary: 'Plikter knyttet til forurensning, avfall og eventuelle tillatelser etter aktivitet.', areaKeys: ['aspects', 'obligations'] },
  { key: 'stoffkartotek', title: 'Forskrift om utførelse av arbeid (kjemikalier)', authority: 'Arbeidstilsynet', source: 'https://www.arbeidstilsynet.no/regelverk/forskrifter/forskrift-om-utforelse-av-arbeid/', summary: 'Stoffkartotek og risikovurdering ved bruk av farlige kjemikalier, når virksomheten bruker slike.', areaKeys: ['hazards', 'aspects'] },
  { key: 'personvern', title: 'Personopplysningsloven / GDPR', authority: 'Datatilsynet', source: 'https://lovdata.no/dokument/NL/lov/2018-06-15-38', summary: 'Behandlingsgrunnlag, dataminimering og tilgangsstyring for HMS- og personopplysninger.', areaKeys: ['documented'] },
];

export const FINDING_TYPES = [
  { id: 'prosess', label: 'Prosessavvik', domain: 'KVALITET' },
  { id: 'leveranse', label: 'Produkt-/leveranseavvik', domain: 'KVALITET' },
  { id: 'kundeklage', label: 'Kundeklage', domain: 'KVALITET' },
  { id: 'revisjonsfunn', label: 'Revisjonsfunn', domain: 'KVALITET' },
  { id: 'risikofunn', label: 'Risikofunn', domain: 'KVALITET' },
  { id: 'miljo', label: 'Miljøhendelse', domain: 'MILJO' },
  { id: 'hms', label: 'HMS-hendelse / personskade', domain: 'HMS' },
  { id: 'nestenulykke', label: 'Nestenulykke / RUH', domain: 'HMS' },
  { id: 'forbedring', label: 'Forbedringsforslag', domain: 'KVALITET' },
  { id: 'endringsforslag', label: 'Endringsforslag (endring i drift)', domain: 'KVALITET' },
  { id: 'positiv', label: 'Positiv tilbakemelding', domain: 'KVALITET' },
  { id: 'omdomme', label: 'Omdømmesak', domain: 'KVALITET' },
  { id: 'varsling', label: 'Varsling av kritikkverdige forhold', domain: 'HMS' },
];

export function findingTypeLabel(id) {
  return FINDING_TYPES.find((row) => row.id === id)?.label || 'Avvik';
}

export function findingDomain(type) {
  return FINDING_TYPES.find((row) => row.id === type)?.domain || 'KVALITET';
}

export const SEVERITIES = [
  { id: 'lav', label: 'Lav', rank: 1 },
  { id: 'middels', label: 'Middels', rank: 2 },
  { id: 'hoy', label: 'Høy', rank: 3 },
  { id: 'kritisk', label: 'Kritisk', rank: 4 },
];

export function severityLabel(id) {
  return SEVERITIES.find((row) => row.id === id)?.label || '–';
}

/**
 * Skadeklasse for HMS-hendelser (melderens vurdering, kan endres i triage).
 * serious = mulig meldeplikt til Arbeidstilsynet og politiet (aml § 5-2).
 */
export const INJURY_CLASSES = [
  { id: 'ingen', label: 'Ingen personskade' },
  { id: 'forstehjelp', label: 'Førstehjelp' },
  { id: 'medisinsk', label: 'Medisinsk behandling' },
  { id: 'fravaer', label: 'Skade med fravær' },
  { id: 'alvorlig', label: 'Alvorlig personskade', serious: true },
  { id: 'dodsfall', label: 'Dødsfall', serious: true },
];

export function injuryClassLabel(id) {
  return INJURY_CLASSES.find((row) => row.id === id)?.label || '';
}

export function seriousInjury(id) {
  return !!INJURY_CLASSES.find((row) => row.id === id)?.serious;
}

export const FINDING_STATES = [
  { id: 'registrert', label: 'Registrert', step: 0 },
  { id: 'triage', label: 'Triage', step: 1 },
  { id: 'vurdert', label: 'Vurdert', step: 2 },
  { id: 'tiltak', label: 'Tiltak pågår', step: 3 },
  { id: 'effektkontroll', label: 'Effektkontroll', step: 4 },
  { id: 'lukket', label: 'Lukket', step: 5 },
  { id: 'kansellert', label: 'Kansellert', step: 6 },
];

export function findingStateLabel(id) {
  return FINDING_STATES.find((row) => row.id === id)?.label || id;
}

export const ACTION_STATES = [
  { id: 'apen', label: 'Åpen' },
  { id: 'pagar', label: 'Pågår' },
  { id: 'til_verifisering', label: 'Til verifisering' },
  { id: 'verifisert', label: 'Verifisert' },
  { id: 'returnert', label: 'Returnert' },
  { id: 'kansellert', label: 'Kansellert' },
];

export function actionStateLabel(id) {
  return ACTION_STATES.find((row) => row.id === id)?.label || id;
}

export const RISK_CATEGORIES = [
  { id: 'strategisk', label: 'Strategisk' },
  { id: 'kvalitet', label: 'Kvalitet' },
  { id: 'miljo', label: 'Miljø' },
  { id: 'arbeidsmiljo', label: 'Arbeidsmiljø' },
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'beredskap', label: 'Beredskap' },
  { id: 'leverandor', label: 'Leverandør' },
];

/** Standard risikopolicy (versjonert). Virksomheten kan endre terskler i innstillinger. */
export const DEFAULT_RISK_METHOD = {
  version: '1.0',
  name: 'ProTop standard 5×5',
  likelihood: ['Svært lite sannsynlig', 'Lite sannsynlig', 'Mulig', 'Sannsynlig', 'Svært sannsynlig'],
  consequence: ['Ubetydelig', 'Mindre alvorlig', 'Alvorlig', 'Svært alvorlig', 'Katastrofal'],
  thresholds: { medium: 5, high: 10, critical: 15 },
};

export function riskLevel(likelihood, consequence, method = DEFAULT_RISK_METHOD) {
  const l = Number(likelihood) || 0;
  const c = Number(consequence) || 0;
  if (!l || !c) return { score: 0, id: 'ukjent', label: 'Ikke vurdert' };
  const score = l * c;
  const t = method?.thresholds || DEFAULT_RISK_METHOD.thresholds;
  if (score >= t.critical) return { score, id: 'kritisk', label: 'Kritisk' };
  if (score >= t.high) return { score, id: 'hoy', label: 'Høy' };
  if (score >= t.medium) return { score, id: 'middels', label: 'Middels' };
  return { score, id: 'lav', label: 'Lav' };
}

/** Nivå per celle i 5×5-matrisen etter virksomhetens terskler: [sannsynlighet 1–5][konsekvens 1–5] → lav | middels | hoy | kritisk. */
export function riskMatrixLevels(method = DEFAULT_RISK_METHOD) {
  return [1, 2, 3, 4, 5].map((l) => [1, 2, 3, 4, 5].map((c) => riskLevel(l, c, method).id));
}

/**
 * Veiledning til risikomatrisen. Grensene i metoden endres ikke; dette er skalabeskrivelser og
 * akseptkriterier slik NS 5814:2021 og ISO 31000 krever (kriterier fastsatt før vurderingen,
 * og risikonivået styrer hvem som kan akseptere risikoen).
 */
export const RISK_GUIDANCE = {
  likelihood: [
    'Sjeldnere enn hvert 10. år',
    'Én gang per 3–10 år',
    'Én gang per 1–3 år',
    'Flere ganger per år',
    'Månedlig eller oftere',
  ],
  dimensions: ['Person/HMS', 'Miljø', 'Kvalitet/kunde', 'Økonomi', 'Omdømme'],
  consequence: [
    ['Ingen personskade', 'Ingen påvirkning utover normal drift', 'Ubetydelig internt avvik', '< 10 000 kr', 'Ingen omtale'],
    ['Førstehjelpsskade', 'Liten lokal påvirkning, rask gjenoppretting', 'Avvik rettet før levering', '10 000–100 000 kr', 'Misnøye hos én kunde'],
    ['Skade med fravær', 'Krever tiltak, mulig brudd på tillatelse', 'Reklamasjon eller forsinkelse', '100 000–1 mill. kr', 'Lokal negativ omtale'],
    ['Alvorlig personskade, varig mén', 'Betydelig skade, rapporteringspliktig utslipp', 'Tap av kunde/kontrakt, erstatningskrav', '1–5 mill. kr', 'Regional eller nasjonal omtale'],
    ['Dødsfall', 'Langvarig eller irreversibel skade', 'Tap av sertifisering eller vesentlige kontrakter', '> 5 mill. kr', 'Varig omdømmetap'],
  ],
  acceptance: {
    lav: { label: 'Akseptabel', text: 'Følges opp ved revurdering.', who: 'Prosesseier' },
    middels: { label: 'Tiltak vurderes (ALARP)', text: 'Reduser så langt det er praktisk mulig. Aksepteres med begrunnelse.', who: 'Prosesseier eller leder' },
    hoy: { label: 'Ikke akseptabel uten tiltak', text: 'Tiltaksplan med ansvarlig og frist. Kan aksepteres midlertidig med dokumentasjon.', who: 'Daglig leder' },
    kritisk: { label: 'Ikke akseptabel', text: 'Umiddelbare tiltak. Aktiviteten stanses til risikoen er redusert.', who: 'Øverste ledelse' },
  },
  measures: 'Sannsynlighetsreduserende tiltak før konsekvensreduserende. For HMS gjelder tiltakshierarkiet (ISO 45001 8.1.2): eliminere, erstatte, tekniske tiltak, administrative tiltak, verneutstyr.',
  sources: 'NS 5814:2021 Krav til risikovurderinger · ISO 31000:2018 Risikostyring · ISO 45001 6.1.2 og 8.1.2 · ISO 14001 6.1.2',
};

export function riskAcceptance(levelId) {
  return RISK_GUIDANCE.acceptance[levelId] || null;
}

/**
 * Vesentlighet for et miljøaspekt (ISO 14001 6.1.2) med samme matrise som risiko:
 * omfang × alvorlighet. Vesentlig når score ≥ høy, eller score ≥ middels og aspektet er knyttet
 * til en samsvarsforpliktelse eller kan gi en nødsituasjon. Gir forslag og begrunnelse; eieren bestemmer.
 */
export function aspectSignificance(aspect, method = DEFAULT_RISK_METHOD) {
  const level = riskLevel(aspect?.extent, aspect?.severity, method);
  const t = method?.thresholds || DEFAULT_RISK_METHOD.thresholds;
  if (!level.score) return { level, significant: null, reasons: [] };
  const reasons = [];
  if (level.score >= t.high) reasons.push(`score ${level.score} (${level.label.toLowerCase()})`);
  if (level.score >= t.medium && aspect?.obligation === 'Ja') reasons.push('samsvarsforpliktelse');
  if (level.score >= t.medium && aspect?.situation === 'Nødsituasjon') reasons.push('kan gi nødsituasjon');
  return { level, significant: reasons.length > 0, reasons };
}

/**
 * Roller i K-HMS. Kobles til ProTops eksisterende tilgangsnivåer, ikke egne brukere.
 * Én person per rolle (Innstillinger → Roller). Tilgangen hver rolle trenger, står i access.js (ROLE_ACCESS).
 */
export const ISO_ROLES = [
  { id: 'system_owner', label: 'Systemansvarlig K-HMS', summary: 'Eier ledelsessystemet og innstillingene. Godkjenner.' },
  { id: 'quality_manager', label: 'Kvalitetsleder', summary: 'Dokumentstyring, avvik, interne revisjoner og forbedring (ISO 9001). Godkjenner.' },
  { id: 'hse_manager', label: 'HMS-leder', summary: 'Arbeidsmiljø, sikkerhet og ytre miljø (ISO 45001 og 14001), beredskap. Godkjenner.' },
  { id: 'process_owner', label: 'Prosesseier', summary: 'Eier prosesser uten egen eier og følger opp målene deres.' },
  { id: 'project_manager', label: 'Prosjektleder', summary: 'Kvalitetsplan, risiko og avvik i prosjektene.' },
  { id: 'manager', label: 'Leder', summary: 'Følger opp avvik, tiltak og opplæring i egen enhet.' },
  { id: 'top_management', label: 'Øverste ledelse', summary: 'Policy, mål, ressurser og ledelsens gjennomgang. Godkjenner.' },
  { id: 'internal_auditor', label: 'Internrevisor', summary: 'Planlegger og gjennomfører interne revisjoner. Reviderer ikke eget arbeid.' },
  { id: 'hr_manager', label: 'HR-ansvarlig', summary: 'Kompetansekrav, opplæring og bemanning (ISO 7.2 og 7.3).' },
  { id: 'safety_rep', label: 'Verneombud / ansattrepresentant', summary: 'Medvirkning og konsultasjon i HMS (ISO 45001 5.4).' },
  { id: 'employee', label: 'Ansatt', summary: 'Melder avvik, leser og kvitterer dokumenter.' },
];

export function roleLabel(id) {
  return ISO_ROLES.find((row) => row.id === id)?.label || id || '–';
}
