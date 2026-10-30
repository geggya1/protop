/**
 * HMS-kort per ansatt (forskrift om HMS-kort for bygge- og anleggsplasser) og daglig
 * oversiktsliste for byggeplass (byggherreforskriften § 15).
 * Kortet lagres i HR-tilstanden (hr.hmsCards), ikke på ansattposten.
 * Ren logikk uten avhengighet til resten av HR-modellen.
 */

/** Varsel så mange dager før kortet går ut. */
export const HMS_CARD_WARN_DAYS = 30;

/**
 * Bransjer der HMS-kort er påbudt, etter bedriftens næringskode (SN2007).
 * Bilpleie, hjulskift og hjullagring er også omfattet, men har ingen egen næringskode
 * og slås på med innstillingen.
 */
const HMS_TRADES = [
  { re: /^4[123]\./, label: 'bygg og anlegg' },
  { re: /^81\.2/, label: 'renhold' },
];

export const HMS_SCOPE_TEXT = 'HMS-kort er påbudt i bygg og anlegg, renhold og bilpleie, hjulskift og hjullagring.';

/** Innstillingen i HR: '' følger næringskoden, 'on' kreves alltid, 'off' kreves ikke. */
export function normalizeHmsSetting(value) {
  return value === 'on' || value === 'off' ? value : '';
}

/**
 * Kreves HMS-kort i bedriften? Næringskoden avgjør, med mindre bedriften har valgt selv.
 * Den enkelte kan fortsatt settes til «Ikke aktuelt» (arbeider ikke på byggeplass).
 */
export function hmsCardRequirement({ naeringskode = '', setting = '' } = {}) {
  const code = text(naeringskode, 20);
  const trade = HMS_TRADES.find((row) => row.re.test(code));
  const choice = normalizeHmsSetting(setting);
  if (choice === 'on') return { required: true, setting: choice, trade: trade?.label || '', text: 'Bedriften har valgt at HMS-kort kreves.' };
  if (choice === 'off') return { required: false, setting: choice, trade: trade?.label || '', text: 'Bedriften har valgt at HMS-kort ikke kreves.' };
  if (trade) {
    return { required: true, setting: '', trade: trade.label, text: `Kreves fordi bedriften er registrert med ${trade.label} (næringskode ${code}).` };
  }
  return {
    required: false,
    setting: '',
    trade: '',
    text: code
      ? `Kreves ikke etter bedriftens næringskode (${code}). ${HMS_SCOPE_TEXT}`
      : `Bedriften har ingen næringskode registrert. ${HMS_SCOPE_TEXT}`,
  };
}

/**
 * QR-koden på HMS-kortet. Den viser status i registeret når den skannes, så lenken lagres
 * på kortet. Kortnummeret hentes ut bare når QR-koden er selve nummeret.
 */
export function parseHmsQr(raw) {
  const value = text(raw, 500);
  if (!value) return { url: '', number: '', id: '' };
  if (/^https:\/\/[^\s]+$/i.test(value)) {
    // Kortets side i HMS-kortregisteret: hmskort.no/v/<id>.
    const id = (value.match(/^https:\/\/(?:www\.)?hmskort\.no\/v\/([^/?#\s]+)/i) || [])[1] || '';
    return { url: value, number: '', id: decodeURIComponent(id).slice(0, 120) };
  }
  const digits = value.replace(/\s+/g, '');
  if (/^\d{6,20}$/.test(digits)) return { url: '', number: digits, id: '' };
  return { url: '', number: '', id: '' };
}

/** Feltene AI-en leser fra bildet av HMS-kortet. */
export const HMS_CARD_READ_FIELDS = ['number', 'validTo', 'firstName', 'lastName', 'birthDate', 'employerName', 'employerOrgnr'];

/** Instruks til AI-lesing av bildet av HMS-kortet (forsiden). */
export function hmsCardPrompt() {
  return `Du leser et bilde av et norsk HMS-kort (forsiden) utstedt etter forskrift om HMS-kort.
Trekk ut det som står på kortet. Ikke finn opp verdier. Tom streng når feltet ikke kan leses.
Returner KUN JSON med disse nøklene:
number: kortnummeret
validTo: gyldig til (YYYY-MM-DD)
firstName: fornavn
lastName: etternavn
birthDate: fødselsdato (YYYY-MM-DD)
employerName: arbeidsgiverens navn
employerOrgnr: arbeidsgiverens organisasjonsnummer (9 sifre)`;
}

/** Rens svaret fra AI-en. Bare kjente felt, gyldige datoer og org.nr. */
export function sanitizeHmsCardRead(parsed = {}) {
  const src = parsed && typeof parsed === 'object' ? (parsed.card || parsed) : {};
  const orgnr = text(src.employerOrgnr, 20).replace(/\D/g, '');
  return {
    number: text(src.number, 40).replace(/\s+/g, ' '),
    validTo: isoDate(src.validTo),
    firstName: text(src.firstName, 80),
    lastName: text(src.lastName, 80),
    birthDate: isoDate(src.birthDate),
    employerName: text(src.employerName, 120),
    employerOrgnr: orgnr.length === 9 ? orgnr : '',
  };
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function isoDate(value) {
  const raw = text(value, 40);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nb = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`;
  return '';
}

function dayIndex(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
}

function nbDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function normalizeHmsCard(row = {}) {
  const employeeId = text(row.employeeId, 120);
  return {
    id: text(row.id, 120) || `hms_${employeeId || 'x'}`,
    employeeId,
    number: text(row.number, 40).replace(/\s+/g, ' '),
    validTo: isoDate(row.validTo),
    employerOrgnr: text(row.employerOrgnr, 20).replace(/\D/g, '').slice(0, 9),
    // Lenken fra QR-koden på kortet. Åpnes for å se status i registeret.
    qrUrl: /^https:\/\//i.test(text(row.qrUrl, 500)) ? text(row.qrUrl, 500) : '',
    qrId: text(row.qrId, 120),
    // Det som står på kortet, lest fra bildet eller skrevet inn.
    holderName: text(row.holderName, 160),
    birthDate: isoDate(row.birthDate),
    employerName: text(row.employerName, 120),
    // Hvor dataene kom fra: qr (skannet), photo (lest fra bilde) eller manual.
    source: ['qr', 'photo', 'manual'].includes(row.source) ? row.source : '',
    scannedAt: text(row.scannedAt, 40),
    updatedAt: text(row.updatedAt, 40) || new Date().toISOString(),
  };
}

/** Kortet til en ansatt (ett per ansatt). */
export function hmsCardFor(employeeId, cards) {
  const id = text(employeeId, 120);
  if (!id) return null;
  return (Array.isArray(cards) ? cards : []).find((row) => text(row?.employeeId, 120) === id) || null;
}

/**
 * Kortene i HR slått sammen med dem de ansatte har registrert selv (hmsSelf.js).
 * Ett kort per ansatt. Det sist oppdaterte vinner.
 */
export function mergeHmsCards(hrCards, selfCards) {
  const byEmployee = new Map();
  for (const raw of [...(Array.isArray(hrCards) ? hrCards : []), ...(Array.isArray(selfCards) ? selfCards : [])]) {
    const card = normalizeHmsCard(raw);
    if (!card.employeeId) continue;
    const prev = byEmployee.get(card.employeeId);
    if (!prev || String(card.updatedAt) > String(prev.updatedAt)) byEmployee.set(card.employeeId, card);
  }
  return [...byEmployee.values()];
}

/**
 * Det som står på kortet, lagt på kortet som er lagret. Tomme felt i det som er lest,
 * endrer ikke det som står fra før.
 */
export function applyHmsCardRead(card, read = {}) {
  const name = [read.firstName, read.lastName].map((v) => text(v)).filter(Boolean).join(' ');
  const pick = (next, prev) => (text(next) ? next : prev);
  return {
    ...(card || {}),
    number: pick(read.number, card?.number || ''),
    validTo: pick(read.validTo, card?.validTo || ''),
    holderName: pick(name, card?.holderName || ''),
    birthDate: pick(read.birthDate, card?.birthDate || ''),
    employerName: pick(read.employerName, card?.employerName || ''),
    employerOrgnr: pick(read.employerOrgnr, card?.employerOrgnr || ''),
  };
}

/** Bytter ut kortet til den ansatte. Tomt kortnummer og tom dato fjerner kortet. */
export function upsertHmsCard(cards, card) {
  const next = normalizeHmsCard(card);
  const rest = (Array.isArray(cards) ? cards : []).filter((row) => text(row?.employeeId, 120) !== next.employeeId);
  if (!next.employeeId) return rest;
  if (!next.number && !next.validTo && !next.qrUrl) return rest;
  return [...rest, next];
}

/**
 * Status for kortet på dagen today: missing (ikke registrert), valid, expiring (innen
 * HMS_CARD_WARN_DAYS dager) eller expired. Kort uten utløpsdato regnes som ikke registrert.
 */
export function hmsCardStatus(card, today = '') {
  const now = isoDate(today) || new Date().toISOString().slice(0, 10);
  if (!card || !text(card.number) || !isoDate(card.validTo)) {
    let label = 'Ikke registrert';
    if (card?.number || card?.qrUrl) label = isoDate(card?.validTo) ? 'Kortnummer mangler' : 'Utløpsdato mangler';
    return { id: 'missing', label, daysLeft: null };
  }
  const daysLeft = dayIndex(card.validTo) - dayIndex(now);
  if (daysLeft < 0) return { id: 'expired', label: `Utløpt ${nbDate(card.validTo)}`, daysLeft };
  if (daysLeft <= HMS_CARD_WARN_DAYS) {
    return { id: 'expiring', label: `Utløper ${nbDate(card.validTo)} (om ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dager'})`, daysLeft };
  }
  return { id: 'valid', label: `Gyldig til ${nbDate(card.validTo)}`, daysLeft };
}

/** Status i «Lovpålagt»: ok, overdue (utløpt) eller missing. */
export function hmsComplianceStatus(card, today = '') {
  const state = hmsCardStatus(card, today);
  if (state.id === 'valid' || state.id === 'expiring') return 'ok';
  return state.id === 'expired' ? 'overdue' : 'missing';
}

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map((v) => text(v)).filter(Boolean).join(' ')
    || text(employee?.name) || text(employee?.displayName);
}

/**
 * Kort som er utløpt eller går ut snart, for ansatte som ikke er slettet.
 * notApplicable er ansatt-id-er der HMS-kort er satt til «Ikke aktuelt».
 */
export function hmsCardAlerts(employees, cards, { today = '', notApplicable = [] } = {}) {
  const skip = new Set(notApplicable);
  const out = [];
  for (const employee of employees || []) {
    const id = text(employee?.id, 120);
    if (!id || skip.has(id) || employee?.company?.status === 'deleted') continue;
    const card = hmsCardFor(id, cards);
    const state = hmsCardStatus(card, today);
    if (state.id === 'expired' || state.id === 'expiring') {
      out.push({ employeeId: id, name: personName(employee), number: card.number, validTo: card.validTo, status: state.id, text: state.label });
    }
  }
  return out.sort((a, b) => a.validTo.localeCompare(b.validTo));
}

/**
 * Daglig oversiktsliste for byggeplass fra timeføringen (byggherreforskriften § 15):
 * én rad per dag, prosjekt og person med navn, fødselsdato, arbeidsgiver, org.nr. og HMS-kort.
 * Bare føringer med timer telles. projectId tomt gir alle prosjekter.
 */
export function siteOverviewRows({
  entries = [],
  employees = [],
  cards = [],
  employer = {},
  from = '',
  to = '',
  projectId = '',
} = {}) {
  const byId = new Map((employees || []).map((row) => [text(row?.id, 120), row]));
  const groups = new Map();
  for (const entry of entries || []) {
    const date = isoDate(entry?.date);
    if (!date || (from && date < from) || (to && date > to)) continue;
    if (projectId && text(entry.projectId, 120) !== projectId) continue;
    const hours = Number(entry.hours) || 0;
    if (hours <= 0) continue;
    const key = `${date}|${text(entry.projectId, 120)}|${text(entry.employeeId, 120)}`;
    const row = groups.get(key) || {
      date,
      projectId: text(entry.projectId, 120),
      projectNumber: text(entry.projectNumber, 40),
      projectName: text(entry.projectName),
      employeeId: text(entry.employeeId, 120),
      employeeName: text(entry.employeeName),
      hours: 0,
    };
    row.hours = Math.round((row.hours + hours) * 100) / 100;
    groups.set(key, row);
  }
  const orgnr = text(employer.orgnr, 20).replace(/\D/g, '');
  return [...groups.values()].map((row) => {
    const employee = byId.get(row.employeeId);
    const card = hmsCardFor(row.employeeId, cards);
    const state = hmsCardStatus(card, row.date);
    return {
      date: row.date,
      projectNumber: row.projectNumber,
      projectName: row.projectName,
      name: personName(employee) || row.employeeName,
      birthDate: isoDate(employee?.person?.birthDate),
      employer: text(employer.name),
      employerOrgnr: card?.employerOrgnr || orgnr,
      hmsCardNumber: card?.number || '',
      hmsValidTo: card?.validTo || '',
      hmsStatus: state.id,
      hours: row.hours,
    };
  }).sort((a, b) => a.date.localeCompare(b.date)
    || a.projectNumber.localeCompare(b.projectNumber)
    || a.name.localeCompare(b.name, 'nb'));
}

function csvCell(value) {
  const raw = String(value ?? '');
  return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

const STATUS_TEXT = { valid: 'Gyldig', expiring: 'Gyldig, utløper snart', expired: 'Utløpt', missing: 'Mangler' };

/** CSV med semikolon (åpnes i Excel med norsk oppsett). */
export function siteOverviewCsv(rows) {
  const head = ['Dato', 'Prosjektnr', 'Prosjekt', 'Navn', 'Fødselsdato', 'Arbeidsgiver', 'Org.nr.', 'HMS-kort', 'HMS-kort gyldig til', 'HMS-kort status', 'Timer'];
  const lines = (rows || []).map((row) => [
    nbDate(row.date),
    row.projectNumber,
    row.projectName,
    row.name,
    nbDate(row.birthDate),
    row.employer,
    row.employerOrgnr,
    row.hmsCardNumber,
    nbDate(row.hmsValidTo),
    STATUS_TEXT[row.hmsStatus] || '',
    String(row.hours).replace('.', ','),
  ].map(csvCell).join(';'));
  return [head.join(';'), ...lines].join('\n');
}
