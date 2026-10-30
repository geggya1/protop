/**
 * Lovpålagt per ansatt: arbeidsavtale, verneutstyr, HMS-kort og personvern.
 * Kilder: AML §§ 14-5/14-6/15-6 (§ 14-6 slik den lyder fra 1.7.2024) og personvernforordningen.
 * Kompetanse, opplæring, HMS-introduksjon og avviksrutine følges opp i ISO / K-HMS → Kompetanse.
 * Medarbeidersamtaler holdes og følges opp under HR → Oppfølging, ikke her.
 * Punkter med derived settes fra dataene (avtalen, HMS-kortet), ikke ved avkrysning.
 */
import { hmsCardFor, hmsComplianceStatus } from './hmsCard.js';

export const COMPLIANCE_SOURCES = [
  { id: 'aml', label: 'Arbeidsmiljøloven' },
  { id: 'gdpr', label: 'GDPR' },
];

/**
 * Standard sjekkliste — «skal være under kontroll» for oppdragsgiver.
 * short brukes i personellisten («HMS-kort, personvern»), todo sier hva som må gjøres,
 * og sheet er fanen på personen der det gjøres (ellers på selve punktet i Lovpålagt).
 */
export const COMPLIANCE_CATALOG = [
  {
    id: 'aml_written_contract',
    source: 'aml',
    label: 'Skriftlig arbeidsavtale',
    short: 'arbeidsavtale',
    todo: 'Registrer arbeidsavtalen under Avtale.',
    sheet: 'avtale',
    hint: 'AML §§ 14-5 og 14-6 — alle skal ha skriftlig avtale, senest sju dager etter tiltredelse.',
    required: true,
    derived: 'contractExists',
  },
  {
    id: 'aml_contract_minimum',
    source: 'aml',
    label: 'Avtalen dekker minimumskrav',
    short: 'minimumskrav',
    todo: 'Fyll ut de påkrevde punktene i arbeidsavtalen under Avtale.',
    sheet: 'avtale',
    hint: 'AML § 14-6 fra 1.7.2024: partene, arbeidssted, stilling, tiltredelse, varighet, prøvetid, ferie, opphør med frister for søksmål, lønn og utbetaling, arbeidstid og overtid, pauser, tariffavtale, kompetanseutvikling og pensjon. Blir OK når punktene er fylt ut i avtalen.',
    required: true,
    derived: 'contract',
  },
  {
    id: 'aml_probation_documented',
    source: 'aml',
    label: 'Prøvetid dokumentert (hvis avtalt)',
    short: 'prøvetid',
    todo: 'Skriv prøvetiden inn i arbeidsavtalen, eller velg «Ikke aktuelt» hvis det ikke er avtalt prøvetid.',
    sheet: 'avtale',
    hint: 'Maks 6 måneder, og ved midlertidig ansettelse høyst halvparten av ansettelsens varighet (AML § 15-6). Skriftlig i avtalen.',
    required: false,
  },
  {
    // Id-en er beholdt fra da punktet lå under ISO 45001, så lagrede avkrysninger følger med.
    id: 'iso45001_ppe',
    source: 'aml',
    label: 'Verneutstyr utlevert (ved behov)',
    short: 'verneutstyr',
    todo: 'Marker OK når verneutstyret er utlevert, eller «Ikke aktuelt» hvis rollen ikke krever det.',
    hint: 'Når rollen krever det. Arbeidsgiver stiller verneutstyret til rådighet.',
    required: false,
  },
  {
    id: 'hms_card',
    source: 'aml',
    label: 'Gyldig HMS-kort',
    short: 'HMS-kort',
    todo: 'Skann QR-koden på kortet eller skriv inn kortnummer og utløpsdato. Velg «Ikke aktuelt» for den som ikke arbeider der kortet kreves.',
    hint: 'Påbudt i bygg og anlegg, renhold og bilpleie, hjulskift og hjullagring. Varsel 30 dager før kortet går ut.',
    // Påkrevd bare når bedriften krever HMS-kort (hmsRequired, se hmsCard.js hmsCardRequirement).
    required: true,
    derived: 'hmsCard',
  },
  {
    id: 'gdpr_privacy_notice',
    source: 'gdpr',
    label: 'Personverninformasjon gitt',
    short: 'personvern',
    todo: 'Gi personen informasjon om hvordan personaldata behandles, og marker punktet OK.',
    hint: 'Personvernforordningen art. 13: den ansatte skal få vite hva som behandles, hvorfor, hvem som får det, hvor lenge det lagres og hvilke rettigheter hen har.',
    required: true,
    // KS-malen som gir informasjonen. Når den er godkjent, følger punktet lesebekreftelsen (privacy).
    doc: 'personvern-ansatte',
  },
];

const CATALOG_IDS = new Set(COMPLIANCE_CATALOG.map((row) => row.id));

/** Er punktet påkrevd? HMS-kort er det bare når bedriften krever det. */
export function isRequiredItem(catalogId, { hmsRequired = true } = {}) {
  const cat = COMPLIANCE_CATALOG.find((row) => row.id === catalogId);
  if (!cat?.required) return false;
  return catalogId === 'hms_card' ? hmsRequired !== false : true;
}

/**
 * Punkter som før lå i sjekklisten og nå følges opp i ISO / K-HMS → Kompetanse.
 * Lagrede rader for dem beholdes, så ISO kan ta med det som er krysset av.
 */
export const MOVED_TO_ISO = [
  { id: 'ik_hms_intro', label: 'HMS-introduksjon gjennomført' },
  { id: 'ik_deviation_known', label: 'Kjenner avviksrutine' },
  { id: 'iso9001_competence', label: 'Kompetanse for rollen dokumentert' },
  { id: 'iso9001_training', label: 'Opplæring / bevissthet' },
  { id: 'iso14001_role', label: 'Miljøansvar / opplæring (ved behov)' },
  { id: 'iso45001_hms', label: 'Arbeidsmiljøopplæring' },
];

// «aml_followup_dialogue» (medarbeidersamtale) lå før her og følges nå opp under HR → Oppfølging.
// Lagrede rader blir stående, men teller ikke i Lovpålagt.

/** Bytt ut én ansatts sjekkliste. Rader utenfor katalogen (flyttet til ISO eller Oppfølging) blir stående. */
export function replaceEmployeeCompliance(all, employeeId, rows) {
  const emp = String(employeeId || '').trim();
  const kept = (all || []).filter((row) => String(row.employeeId) !== emp || !CATALOG_IDS.has(row.catalogId));
  return [...kept, ...(rows || [])];
}

export function emptyComplianceItem(catalogId, employeeId) {
  const cat = COMPLIANCE_CATALOG.find((row) => row.id === catalogId);
  return {
    id: `${catalogId}_${employeeId || 'x'}`,
    catalogId,
    employeeId: String(employeeId || ''),
    source: cat?.source || '',
    label: cat?.label || catalogId,
    status: 'missing', // missing | ok | na | overdue
    dueDate: '',
    completedAt: '',
    note: '',
    evidenceUrl: '',
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeComplianceItem(row = {}) {
  const catalogId = String(row.catalogId || row.id || '').trim();
  const cat = COMPLIANCE_CATALOG.find((item) => item.id === catalogId);
  const status = ['missing', 'ok', 'na', 'overdue'].includes(row.status) ? row.status : 'missing';
  return {
    id: String(row.id || '').trim() || `${catalogId}_${row.employeeId || 'x'}`,
    catalogId: catalogId || 'unknown',
    employeeId: String(row.employeeId || '').trim(),
    source: String(cat?.source || row.source || '').trim(),
    label: String(row.label || cat?.label || catalogId).trim(),
    status,
    dueDate: String(row.dueDate || '').slice(0, 10),
    completedAt: String(row.completedAt || '').slice(0, 10),
    note: String(row.note || '').trim(),
    evidenceUrl: String(row.evidenceUrl || '').trim(),
    updatedAt: String(row.updatedAt || '') || new Date().toISOString(),
  };
}

/** Sikre at alle katalogpunkter finnes for en ansatt. */
export function ensureEmployeeCompliance(existing, employeeId) {
  const emp = String(employeeId || '').trim();
  if (!emp) return [];
  const map = new Map(
    (existing || [])
      .filter((row) => String(row.employeeId) === emp)
      .map((row) => [row.catalogId, normalizeComplianceItem(row)]),
  );
  return COMPLIANCE_CATALOG.map((cat) => (
    map.get(cat.id) || emptyComplianceItem(cat.id, emp)
  ));
}

export function complianceSummary(items, { hmsRequired = true } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const required = rows.filter((row) => isRequiredItem(row.catalogId, { hmsRequired }) && row.status !== 'na');
  const ok = required.filter((row) => row.status === 'ok').length;
  const missing = required.filter((row) => row.status === 'missing' || row.status === 'overdue').length;
  return {
    total: required.length,
    ok,
    missing,
    pct: required.length ? Math.round((ok / required.length) * 1000) / 10 : 100,
  };
}

/**
 * AML § 14-6 første ledd slik den lyder fra 1.7.2024, med bokstaven feltet dekker
 * (lagres på kontrakt/person). Bokstavene bør kontrolleres mot lovteksten ved neste lovendring.
 */
export const AML_CONTRACT_FIELDS = [
  { key: 'employerName', label: 'Arbeidsgiver (navn og org.nr.)', aml: 'a' },
  { key: 'employeeName', label: 'Arbeidstaker (navn)', aml: 'a' },
  { key: 'workplace', label: 'Arbeidssted (uten fast sted: «ulike steder» og arbeidsgivers adresse)', aml: 'b' },
  { key: 'positionTitle', label: 'Stilling / tittel', aml: 'c' },
  { key: 'roleDescription', label: 'Beskrivelse av arbeidet / rollen', aml: 'c' },
  { key: 'startDate', label: 'Tiltredelse (startdato)', aml: 'd' },
  { key: 'employmentType', label: 'Ansettelsesform (fast, midlertidig, vikariat …)', aml: 'e' },
  { key: 'endDate', label: 'Sluttdato eller forventet varighet (hvis midlertidig)', aml: 'e' },
  { key: 'temporaryBasis', label: 'Grunnlag for midlertidig ansettelse', aml: 'e' },
  { key: 'probationMonths', label: 'Prøvetid (måneder)', aml: 'f' },
  { key: 'holidayTerms', label: 'Ferie og feriepenger, og hvordan ferietidspunktet fastsettes', aml: 'g' },
  { key: 'noticePeriod', label: 'Oppsigelsesfrist', aml: 'h' },
  { key: 'terminationProcedure', label: 'Framgangsmåte ved opphør: formkrav, oppsigelsesfrister og frister for søksmål', aml: 'h' },
  { key: 'salaryAmount', label: 'Lønn ved start', aml: 'i' },
  { key: 'salaryExtras', label: 'Tillegg / godtgjørelser', aml: 'i' },
  { key: 'paySchedule', label: 'Utbetalingsmåte og tidspunkt for lønn', aml: 'i' },
  { key: 'workPercent', label: 'Stillingsprosent / omfang', aml: 'j' },
  { key: 'workHours', label: 'Daglig og ukentlig arbeidstid, og når den ligger', aml: 'j' },
  { key: 'overtimeTerms', label: 'Overtid og godtgjøring for overtid', aml: 'j' },
  { key: 'breakLength', label: 'Pauser', aml: 'k' },
  { key: 'specialWorkingHours', label: 'Særlig arbeidstidsordning (hvis avtalt)', aml: 'l' },
  { key: 'collectiveAgreement', label: 'Tariffavtale (skriv «Ingen» hvis ingen)', aml: 'm' },
  { key: 'hirerIdentity', label: 'Innleievirksomhet (ved utleie fra bemanningsforetak)', aml: 'n' },
  { key: 'competenceDevelopment', label: 'Rett til kompetanseutvikling', aml: 'o' },
  { key: 'pensionInsurance', label: 'Pensjon og andre trygdeordninger / forsikringer', aml: 'p' },
  { key: 'passportOrId', label: 'ID / pass (referanse)', aml: '' },
  { key: 'loanOrAdvance', label: 'Lån / forskudd (hvis aktuelt)', aml: '' },
  { key: 'otherTerms', label: 'Øvrige betingelser', aml: '' },
];

/** Punktene alle avtaler skal ha. Midlertidig ansettelse og utleie gir flere (amlRequiredKeys). */
export const AML_REQUIRED_KEYS = [
  'employerName', 'employeeName', 'workplace', 'positionTitle', 'startDate',
  'holidayTerms', 'noticePeriod', 'terminationProcedure',
  'salaryAmount', 'paySchedule', 'workPercent', 'workHours', 'overtimeTerms', 'breakLength',
  'collectiveAgreement', 'competenceDevelopment', 'pensionInsurance',
];

const TEMPORARY = /midlertid|vikar|sesong|engasjement|åremål|prosjektansett|tidsbegrens/i;
const HIRED_OUT = /utleid|utleie|bemanning/i;

export function isTemporaryContract(contract = {}) {
  return TEMPORARY.test(String(contract.employmentType || '')) || !!String(contract.endDate || '').trim();
}

export function isHiredOutContract(contract = {}) {
  return contract.hiredOut === true || HIRED_OUT.test(String(contract.employmentType || ''));
}

/** Påkrevde felt for denne avtalen. */
export function amlRequiredKeys(contract = {}) {
  const keys = [...AML_REQUIRED_KEYS];
  if (isTemporaryContract(contract)) keys.push('endDate', 'temporaryBasis');
  if (isHiredOutContract(contract)) keys.push('hirerIdentity');
  return keys;
}

export function amlFieldLabel(key) {
  return AML_CONTRACT_FIELDS.find((row) => row.key === key)?.label || key;
}

export function amlContractCompleteness(contract = {}) {
  const requiredKeys = amlRequiredKeys(contract);
  const missing = requiredKeys.filter((key) => !String(contract[key] || '').trim());
  const filled = requiredKeys.length - missing.length;
  return {
    filled,
    total: requiredKeys.length,
    pct: Math.round((filled / requiredKeys.length) * 1000) / 10,
    missing,
  };
}

/**
 * Standardtekster etter loven som kan settes inn i tomme felt. Teksten skal kontrolleres
 * mot bedriftens ordninger før avtalen signeres.
 */
export const AML_STANDARD_TEXTS = {
  holidayTerms: 'Ferie og feriepenger etter ferieloven. Arbeidstakeren har rett til minst 25 virkedager ferie hvert ferieår. Arbeidsgiver fastsetter ferietidspunktet etter drøfting med arbeidstakeren, og arbeidstakeren skal få vite tidspunktet senest to måneder før ferien (ferieloven § 6). Feriepenger utbetales etter ferieloven § 10.',
  terminationProcedure: 'Oppsigelse skal være skriftlig (arbeidsmiljøloven § 15-4). Oppsigelse fra arbeidsgiver leveres personlig eller sendes rekommandert, og skal opplyse om retten til å kreve forhandlinger, reise søksmål og fortsette i stillingen, og om fristene for dette. Arbeidstakeren kan kreve forhandlinger innen to uker etter at oppsigelsen er mottatt (§ 17-3). Søksmål må reises innen åtte uker, eller innen seks måneder når bare erstatning kreves (§ 17-4). Oppsigelsesfristen løper fra den første dagen i måneden etter at oppsigelsen er mottatt (§ 15-3).',
  overtimeTerms: 'Overtid brukes bare ved særlig og tidsavgrenset behov, etter pålegg fra eller avtale med nærmeste leder (arbeidsmiljøloven § 10-6). For overtid betales et tillegg på minst 40 % av timelønnen (§ 10-6 (11)).',
  competenceDevelopment: 'Arbeidsgiver gir den opplæringen som trengs for å utføre arbeidet. Annen kompetanseutvikling avtales i medarbeidersamtalen.',
  pensionInsurance: 'Arbeidstakeren er med i arbeidsgivers tjenestepensjonsordning etter lov om obligatorisk tjenestepensjon, og er dekket av yrkesskadeforsikring.',
};

/** Fyller tomme felt med standardtekst. Felt som er fylt ut, endres ikke. */
export function withAmlStandardTexts(contract = {}) {
  const next = { ...contract };
  for (const [key, value] of Object.entries(AML_STANDARD_TEXTS)) {
    if (!String(next[key] || '').trim()) next[key] = value;
  }
  return next;
}

/** Kalendermåneder fra startdato til og med sluttdato (1.1.–30.6. er seks måneder). */
function monthsBetween(fromIso, toIso) {
  const a = String(fromIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const b = String(toIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!a || !b) return null;
  const end = new Date(Date.UTC(+b[1], +b[2] - 1, +b[3] + 1));
  const months = (end.getUTCFullYear() - Number(a[1])) * 12 + (end.getUTCMonth() + 1 - Number(a[2]))
    + (end.getUTCDate() - Number(a[3])) / 30;
  return months > 0 ? months : null;
}

/** Feil i prøvetiden (AML § 15-6). Tom liste når den er innenfor. */
export function probationIssues(contract = {}) {
  const raw = String(contract.probationMonths || '').replace(',', '.').trim();
  if (!raw) return [];
  const months = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(months) || months <= 0) return [];
  const out = [];
  if (months > 6) out.push('Prøvetiden kan ikke være mer enn seks måneder (AML § 15-6).');
  const length = monthsBetween(contract.startDate, contract.endDate);
  if (isTemporaryContract(contract) && length != null && months > length / 2 + 1e-9) {
    out.push('Ved midlertidig ansettelse kan prøvetiden ikke være lengre enn halvparten av ansettelsens varighet (AML § 15-6).');
  }
  return out;
}

/** Siste dag for skriftlig avtale: sju dager etter tiltredelse. */
export function contractDueDate(startDate) {
  const m = String(startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 7)).toISOString().slice(0, 10);
}

/**
 * Notater som synkroniseringen skrev før, på punkter som følger dataene. De gjentar bare
 * statusen og vises ikke. Avtalen og HMS-kortet står i statuslinjen.
 */
export function isAutoNote(note) {
  return /^(AML § 14-6 dekket \(\d+\/\d+\)|Aktiv arbeidsavtale i HR|HMS-kort .+)$/.test(String(note || '').trim());
}

/** Følger personverninformasjonen lesebekreftelsen for denne personen? */
export function privacyGoverned(privacy, employeeId) {
  return !!privacy && Array.isArray(privacy.acked) && !(privacy.manual || []).includes(employeeId);
}

function markOk(row, note = '') {
  return {
    ...row,
    status: 'ok',
    completedAt: row.completedAt || new Date().toISOString().slice(0, 10),
    note: note || row.note,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Synkroniser sjekkliste fra avtaler og HMS-kort (Personio/BambooHR-mønster).
 * Skriver bare opp mangler → OK når evidens finnes; overskriver ikke manuell OK/NA.
 */
export function syncComplianceFromEvidence(compliance, {
  employeeId,
  contracts = [],
  hmsCards = [],
  today = '',
  // Personverninformasjonen som styrt dokument: { acked, manual } med ansatt-id-er som har
  // bekreftet gjeldende versjon, og som ikke har brukerkonto (krysses av for hånd).
  // null: dokumentet er ikke godkjent ennå, og punktet krysses av for hånd for alle.
  privacy = null,
} = {}) {
  const emp = String(employeeId || '').trim();
  if (!emp) return Array.isArray(compliance) ? compliance : [];
  const rows = ensureEmployeeCompliance(compliance, emp);
  const active = (contracts || []).find(
    (c) => String(c.employeeId) === emp && c.status === 'active',
  );
  const aml = active ? amlContractCompleteness(active) : null;
  const now = String(today || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

  const next = rows.map((row) => {
    // Minimumskravene følger avtalen: OK bare når de påkrevde punktene er fylt ut, også
    // når punktet er krysset av for hånd eller ble grønt etter de gamle kravene.
    if (row.catalogId === 'aml_contract_minimum' && row.status !== 'na') {
      if (aml && aml.pct >= 100) {
        return row.status === 'ok' ? row : markOk(row);
      }
      const dueDate = contractDueDate(active?.startDate) || row.dueDate;
      const status = dueDate && dueDate < now ? 'overdue' : 'missing';
      if (row.status === status && row.dueDate === dueDate && !row.completedAt) return row;
      return { ...row, status, dueDate, completedAt: '', updatedAt: new Date().toISOString() };
    }
    // HMS-kort følger kortet som er registrert: OK når det er gyldig, forfalt når det er utløpt.
    if (row.catalogId === 'hms_card' && row.status !== 'na') {
      const card = hmsCardFor(emp, hmsCards);
      const status = hmsComplianceStatus(card, now);
      const dueDate = card?.validTo || '';
      if (row.status === status && row.dueDate === dueDate) return row;
      return {
        ...row,
        status,
        dueDate,
        completedAt: status === 'ok' ? (row.completedAt || now) : '',
        updatedAt: new Date().toISOString(),
      };
    }
    // Personverninformasjonen følger lesebekreftelsen når dokumentet er godkjent.
    if (row.catalogId === 'gdpr_privacy_notice' && privacyGoverned(privacy, emp) && row.status !== 'na') {
      const acked = privacy.acked.includes(emp);
      if (acked) return row.status === 'ok' ? row : markOk(row);
      if (row.status === 'missing') return row;
      return { ...row, status: 'missing', completedAt: '', updatedAt: new Date().toISOString() };
    }
    // Skriftlig avtale følger avtalen som er registrert under Avtale.
    if (row.catalogId === 'aml_written_contract' && row.status !== 'na') {
      if (active) return row.status === 'ok' ? row : markOk(row);
      if (row.status === 'missing') return row;
      return { ...row, status: 'missing', completedAt: '', updatedAt: new Date().toISOString() };
    }
    if (row.status === 'ok' || row.status === 'na') return row;
    if (row.catalogId === 'aml_probation_documented' && active?.probationMonths) {
      return markOk(row, `Prøvetid ${active.probationMonths} mnd i avtale`);
    }
    return row;
  });

  return replaceEmployeeCompliance(compliance, emp, next);
}

/** Kort navn på et manglende punkt, med «forfalt» når fristen er passert. */
export function complianceGapShort(row = {}) {
  const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
  const name = cat?.short || row.label || row.catalogId || '';
  return row.status === 'overdue' ? `${name} (forfalt)` : name;
}

/**
 * Celletekst for personellisten: hva som mangler, ikke bare et tall.
 * Avtalepunktene står i egen kolonne (Ansettelsesavtale) og gjentas ikke her.
 */
export function complianceGapText(overview) {
  if (!overview) return '—';
  const ids = overview.gapIds || [];
  const shorts = overview.gapShort || [];
  const other = shorts.filter((_, i) => COMPLIANCE_CATALOG.find((c) => c.id === ids[i])?.sheet !== 'avtale');
  if (other.length) {
    const text = other.join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return shorts.length ? 'Bare avtalen' : 'OK';
}

/** Oversikt over compliance-gap for hele selskapet (sortert verst først). */
export function companyComplianceOverview(employees, compliance, {
  contracts = [],
  hmsCards = [],
  applyEvidence = true,
  today = '',
  hmsRequired = true,
  privacy = null,
} = {}) {
  const rows = [];
  for (const emp of employees || []) {
    if (emp?.company?.status === 'deleted') continue;
    const id = String(emp?.id || '');
    if (!id) continue;
    const sourced = applyEvidence
      ? syncComplianceFromEvidence(compliance || [], {
        employeeId: id,
        contracts,
        hmsCards,
        today,
        privacy,
      })
      : (compliance || []);
    const items = ensureEmployeeCompliance(sourced, id);
    const summary = complianceSummary(items, { hmsRequired });
    const gapRows = items.filter((row) => (
      isRequiredItem(row.catalogId, { hmsRequired }) && (row.status === 'missing' || row.status === 'overdue')
    ));
    rows.push({
      employeeId: id,
      missing: summary.missing,
      ok: summary.ok,
      total: summary.total,
      pct: summary.pct,
      gaps: gapRows.map((row) => row.label),
      gapIds: gapRows.map((row) => row.catalogId),
      gapShort: gapRows.map((row) => complianceGapShort(row)),
    });
  }
  return rows.sort((a, b) => b.missing - a.missing || a.pct - b.pct);
}
