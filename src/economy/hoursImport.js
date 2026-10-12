/**
 * Hurtigimport av timer / timeføringer fra Excel/CSV (f.eks. Moment hours).
 * Kobler mot medarbeidere, kunder og prosjekter, sjekker duplikater,
 * og forbereder lagring i prosjektets timeEntries + medlemskap.
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import {
  namesLikelyMatch,
  normalizeCustomerNumber,
  normalizeOrgnr,
} from '../anbud/customers.js';
import { parseHours, roundHours, formatHours } from '../arbeid/hours.js';
import { displayName, employeeEmails } from '../employees/model.js';
import {
  matchCustomer,
  matchProject,
  customerIdentityKey,
  normalizeProjectNumber,
} from './invoiceImport.js';
import { parseDate, fold, text } from './invoices.js';

export { matchCustomer, matchProject, customerIdentityKey, normalizeProjectNumber };

const FIELD_ALIASES = [
  ['date', [
    'dato', 'date', 'workdate', 'arbeidsdato', 'day',
    'opprettetdato', 'createddate', 'startdato', 'fromdate', 'workday',
  ]],
  ['employeeNumber', [
    'ansattnummer', 'ansattnr', 'ansattno', 'employeenumber', 'employeeno',
    'externalemployeenumber', 'eksterntansattnummer', 'resourceid', 'userid', 'brukerid',
  ]],
  ['employeeName', [
    'ansatt', 'ansattnavn', 'medarbeider', 'medarbeidernavn', 'resource', 'ressurs',
    'user', 'bruker', 'employee', 'employeename', 'name', 'navn',
    'medarbeidereksterntansattnummer', 'employeeexternalemployeenumber',
  ]],
  ['employeeEmail', [
    'ansattepost', 'ansattmail', 'medarbeiderepost', 'medarbeidermail',
    'employeeemail', 'workemail', 'arbeidsepost', 'epost', 'email', 'mail',
  ]],
  ['customerNumber', ['kundenummer', 'kundenr', 'customernumber', 'customerno']],
  ['customerName', ['kundenavn', 'kunde', 'customer', 'client', 'oppdragsgiver']],
  ['orgnr', ['orgnr', 'org.nr', 'organisasjonsnummer', 'orgno']],
  ['projectNumber', ['prosjektnummer', 'prosjektnr', 'projectnumber', 'projectno', 'projectid']],
  ['projectName', ['prosjekt', 'prosjektnavn', 'project', 'projectname']],
  ['activityName', ['aktivitet', 'aktivitetsnavn', 'activity', 'activityname', 'task']],
  ['hours', [
    'timer', 'hours', 'quantity', 'antall', 'registeredhours', 'registrertetimer',
    'antalltimer', 'antalltimerivalgtperiode', 'numberofhoursinselectedperiod',
    'hoursinselectedperiod', 'quantityhours',
  ]],
  ['billableHours', [
    'fakturerbaretimer', 'billablehours', 'timerfakturerbart', 'hoursbillable',
  ]],
  ['billable', ['fakturerbart', 'billable', 'isfacturable', 'isfakturerbar']],
  ['description', ['beskrivelse', 'description', 'tekst', 'kommentar', 'comment', 'note', 'notes']],
  ['internalNote', [
    'internmerknad', 'internkommentar', 'internalnote', 'internalcomment',
    'privatkommentar', 'privatnote', 'interntnotat',
  ]],
  ['department', ['avdeling', 'department']],
  ['status', ['status', 'godkjent', 'approved', 'approvalstatus']],
  ['rate', ['timepris', 'rate', 'hourlyrate', 'pris', 'enhetspris']],
  ['amount', ['belop', 'beløp', 'amount', 'sum', 'verdi']],
  ['externalId', ['timeid', 'recordid', 'timerecordid', 'entryid', 'linjeid']],
];

const SKIP_HEADERS = [
  'opprettetav', 'createdby', 'sistendret', 'sistendretav', 'lastchanged', 'lastchangedby',
  'lastmodified', 'tagger', 'tags', 'utsett', 'utsetttil', 'utsettelsensarsak',
  'postpone', 'postponeuntil', 'overtid', 'overtime', 'rolle', 'role',
  'aktivitetsnummer', 'activitynumber', 'activityno',
];

/** Kolonner som ligner «timer» men ikke er føringens timeantall (Moment-eksport). */
function isNonEntryHoursHeader(key) {
  if (!key) return false;
  if (key.includes('avtalt')) return true;
  if (key.includes('estimert') || key.includes('estimated')) return true;
  if (key.includes('planlagt') || key.includes('planned')) return true;
  if (key.includes('rest') && (key.includes('timer') || key.includes('hour'))) return true;
  if (key.includes('andel')) return true;
  if (key.includes('visfaktisk') || key.includes('vispafaktura') || key.includes('vispåfaktura')) return true;
  if (key.includes('ikkefakturerbar') || key.includes('nonbillable')) return true;
  if (key.includes('opparbeidet') || key.includes('inntekt') || key.includes('profitt')) return true;
  return false;
}

export function hourColumnField(header) {
  const key = fold(header);
  if (!key) return '';
  if (SKIP_HEADERS.some((skip) => key === skip || key.startsWith(skip))) return '';
  if (isNonEntryHoursHeader(key)) return '';
  // Fakturadato er ikke arbeidsdato.
  if (key.includes('fakturadato') || key.includes('invoicedate')) return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
    if (fold(field) === key) return field;
  }
  if ((key.includes('fakturerbar') || key.includes('billable')) && (key.includes('timer') || key.includes('hour'))) {
    return 'billableHours';
  }
  if (key === 'fakturerbart' || key === 'billable') return 'billable';
  // Registrerte timer / antall timer i perioden — ikke «avtalte timer i valgt periode».
  if (key.includes('registrertetimer') || key === 'registeredhours') return 'hours';
  if (
    (key.includes('antalltimer') || key.includes('numberofhours') || key.includes('hoursinselected'))
    && !key.includes('avtalt')
  ) return 'hours';
  if (key.includes('timerivalgt') && key.includes('antall')) return 'hours';
  if (key === 'timer' || key === 'hours') return 'hours';
  if (key.includes('fakturertetimer') || key.includes('invoicedhours')) return 'hours';
  if (key.includes('arbeidsdato') || key.includes('workdate') || key.includes('opprettetdato') || key.includes('createddate')) {
    return 'date';
  }
  if ((key.endsWith('dato') || key.endsWith('date')) && !key.includes('utsett') && !key.includes('faktura')) {
    return 'date';
  }
  if (key.includes('intern') && (key.includes('notat') || key.includes('merknad') || key.includes('kommentar') || key.includes('note'))) {
    return 'internalNote';
  }
  if (key.includes('eksterntansatt') || key.includes('externalemployee')) return 'employeeNumber';
  if (key.includes('ansatt') && (key.includes('nr') || key.includes('nummer')) && !key.includes('medarbeider')) {
    return 'employeeNumber';
  }
  if (key.includes('medarbeider') || key.includes('employeename') || key.includes('resourcename')) return 'employeeName';
  if (key.includes('prosjekt') && (key.includes('nr') || key.includes('nummer') || key.endsWith('no'))) return 'projectNumber';
  if (key.includes('kunde') && (key.includes('nr') || key.includes('nummer') || key.endsWith('no'))) return 'customerNumber';
  if (key.includes('kundenavn')) return 'customerName';
  if (key.includes('prosjektnavn')) return 'projectName';
  return '';
}

/**
 * Moment eksporterer ofte fakturerbare timer som Excel-døgnbrøk (0.1458 ≈ 3:30).
 * Verdier i [0, 1) tolkes som brøk av døgn; ellers vanlige desimaltimer / H:MM.
 */
export function parseImportHours(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return 0;
  if (raw.includes(':')) return roundHours(parseHours(raw));
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n > 0 && n < 1) return roundHours(n * 24);
  return roundHours(n);
}

export function splitEmployeeHint(value) {
  const raw = text(value);
  const match = raw.match(/^(.*?)\s*[\(（]\s*([0-9]+)\s*[\)）]\s*$/);
  if (!match) return { name: raw, number: '' };
  return { name: text(match[1]), number: match[2] };
}

export function parseBillableFlag(value) {
  const key = fold(value);
  if (['ja', 'yes', 'true', '1', 'x', 'ok'].includes(key)) return true;
  if (['nei', 'no', 'false', '0'].includes(key)) return false;
  return null;
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const rank = (table[index] || []).filter((cell) => hourColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 2 ? best : -1;
}

function normalizeStatus(value) {
  const key = fold(value);
  if (!key) return 'registrert';
  if (['godkjent', 'approved', 'ok', 'ja', 'yes', 'true', '1'].includes(key)) return 'godkjent';
  if (['last', 'locked', 'closed', 'avsluttet'].includes(key)) return 'låst';
  if (['registrert', 'draft', 'pending', 'open'].includes(key)) return 'registrert';
  return 'registrert';
}

/**
 * Personnøkkel for duplikatsjekk: samme menneske, uavhengig av prosjekt.
 * Foretrekker ansatt-id (etter kobling), deretter ansattnummer, så navn.
 */
export function hourPersonKey(row = {}) {
  return text(row.employeeId)
    || text(row.employeeNumber)
    || fold(row.employeeName);
}

/**
 * Nøkkel for treff mot allerede lagrede føringer (dato, person, prosjekt,
 * timer, beskrivelse). Brukes ikke til å stryke like rader inne i eksportfilen.
 */
export function hourFingerprint(row = {}) {
  const date = parseDate(row.date) || text(row.date);
  const person = hourPersonKey(row);
  // Prosjektnummer først — stabilt mellom Excel og lagrede føringer (ikke intern id).
  const project = text(row.projectNumber)
    || fold(row.projectName)
    || text(row.projectId);
  const hours = String(roundHours(row.hours ?? 0));
  const description = fold(row.description);
  if (!date || !person) return '';
  return [date, person, project, hours, description].join('|');
}

/** Samme kriterier som fingerprint — eksplisitt for tester og UI. */
export function hoursLookDuplicate(left = {}, right = {}) {
  const a = hourFingerprint(left);
  const b = hourFingerprint(right);
  return Boolean(a) && a === b;
}

/** Nøkler for eksisterende føringer — alltid fra feltene, ikke gammel fingerprint-streng. */
export function collectHourFingerprints(entries) {
  const keys = new Set();
  for (const row of Array.isArray(entries) ? entries : []) {
    const key = hourFingerprint(row);
    if (key) keys.add(key);
  }
  return keys;
}

/** Normaliser ansattnummer: «02» og «2» er samme. */
export function normalizeEmployeeNumber(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw;
}

/** Lowercase/æøå-fold som beholder ordmellomrom (ulikt invoice-fold som stripper alt). */
function foldName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function employeeStatusRank(employee) {
  const status = foldName(employee?.company?.status || 'active');
  if (status === 'active' || status === 'current') return 0;
  if (status === 'leave') return 1;
  if (status === 'inactive' || status === 'former') return 2;
  if (status === 'deleted') return 3;
  return 2;
}

function nameTokens(value) {
  return foldName(value)
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

/** Fornavn + etternavn — mellomnavn ignoreres (Geir Ove Andersen ↔ Geir Andersen). */
export function employeeCoreName(value) {
  const tokens = nameTokens(value);
  if (!tokens.length) return '';
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

function employeeNameMatches(employee, name) {
  if (!name) return true;
  const label = displayName(employee);
  if (fold(label) === fold(name) || namesLikelyMatch(label, name)) return true;
  const core = employeeCoreName(name);
  return Boolean(core) && employeeCoreName(label) === core;
}

/** Velg beste treff blant flere: ansattnr, deretter aktiv > permisjon > inaktiv > slettet. */
export function pickBestEmployee(candidates, hint = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const number = normalizeEmployeeNumber(hint.employeeNumber);
  return [...list].sort((left, right) => {
    const leftNum = number && normalizeEmployeeNumber(left?.company?.externalEmployeeNumber) === number ? 0 : 1;
    const rightNum = number && normalizeEmployeeNumber(right?.company?.externalEmployeeNumber) === number ? 0 : 1;
    if (leftNum !== rightNum) return leftNum - rightNum;
    const byStatus = employeeStatusRank(left) - employeeStatusRank(right);
    if (byStatus) return byStatus;
    return displayName(left).localeCompare(displayName(right), 'nb');
  })[0];
}

function matchEmployeeByName(list, name, hint = {}) {
  if (!name) return null;
  const folded = fold(name);
  const exact = list.filter((row) => fold(displayName(row)) === folded);
  if (exact.length) return pickBestEmployee(exact, hint);

  // Samme synlige navn med ulik mellomrom/tegnsetting.
  const spaced = foldName(name);
  const exactSpaced = list.filter((row) => foldName(displayName(row)) === spaced);
  if (exactSpaced.length) return pickBestEmployee(exactSpaced, hint);

  const core = employeeCoreName(name);
  if (core) {
    const byCore = list.filter((row) => employeeCoreName(displayName(row)) === core);
    if (byCore.length) return pickBestEmployee(byCore, hint);
  }

  const soft = list.filter((row) => namesLikelyMatch(displayName(row), name));
  if (!soft.length) return null;
  if (soft.length === 1) return soft[0];

  // Flere myke treff (f.eks. Geir Ove Andersen / Geir Ove Tørnkvist): krev etternavn.
  const last = nameTokens(name).slice(-1)[0];
  const byLast = last
    ? soft.filter((row) => nameTokens(displayName(row)).includes(last))
    : [];
  if (byLast.length) return pickBestEmployee(byLast, hint);
  return null;
}

function normalizeMatchEmail(value) {
  const email = text(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function hintEmails(hint = {}) {
  const out = [];
  for (const value of [hint.employeeEmail, hint.email, hint.workEmail, hint.personEmail]) {
    const email = normalizeMatchEmail(value);
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

function matchEmployeeByEmail(list, hint = {}) {
  const needles = hintEmails(hint);
  if (!needles.length) return null;
  const hits = list.filter((row) => {
    const emails = employeeEmails(row);
    return needles.some((email) => emails.includes(email));
  });
  return pickBestEmployee(hits, hint);
}

/**
 * Match medarbeider på e-post (alle registrerte), ansattnummer og/eller navn.
 * Alle statuser (aktiv, permisjon, inaktiv, slettet) er med — aktiv foretrekkes
 * ved flere treff. Nummer alene brukes bare når navnet ikke motstrider.
 */
export function matchEmployee(employees, hint = {}) {
  const list = Array.isArray(employees) ? employees : [];
  const number = normalizeEmployeeNumber(hint.employeeNumber);
  const name = text(hint.employeeName);

  // E-post først når filen har det — prøv både person- og arbeidsadresse i Ansatte.
  const byEmail = matchEmployeeByEmail(list, hint);
  if (byEmail && (!name || employeeNameMatches(byEmail, name))) return byEmail;

  if (number) {
    const byNumber = list.filter((row) => (
      normalizeEmployeeNumber(row?.company?.externalEmployeeNumber) === number
    ));
    if (byNumber.length === 1) {
      const hit = byNumber[0];
      if (employeeNameMatches(hit, name)) return hit;
      // Nummer peker på annen person enn navnet — stol på unik navnematch.
      return matchEmployeeByName(list, name, hint);
    }
    if (byNumber.length > 1) {
      if (name) {
        const named = byNumber.filter((row) => employeeNameMatches(row, name));
        if (named.length) return pickBestEmployee(named, hint);
      }
      // Ambiguøst nummer uten klart navnetreff — prøv navn på hele listen.
      return matchEmployeeByName(list, name, hint);
    }
  }
  return matchEmployeeByName(list, name, hint);
}

/** Fyll kundenavn/-nummer fra register eller prosjektets client-felt. */
export function applyCustomerFromProject(entry, project, customers = []) {
  if (!entry || !project) return entry;
  const next = entry;
  if (!next.customerId && project.customerId) {
    next.customerId = text(project.customerId);
  }
  if (!next.customerName && project.client) {
    next.customerName = text(project.client);
  }
  if (!next.customerNumber && project.customerNumber) {
    next.customerNumber = normalizeCustomerNumber(project.customerNumber)
      || text(project.customerNumber);
  }
  if (next.customerId && (!next.customerName || !next.customerNumber || !next.orgnr)) {
    const linked = (customers || []).find((row) => row.id === next.customerId);
    if (linked) {
      next.customerName = text(linked.name) || next.customerName;
      next.customerNumber = normalizeCustomerNumber(linked.customerNumber) || next.customerNumber;
      next.orgnr = normalizeOrgnr(linked.orgnr) || next.orgnr;
    }
  }
  return next;
}

export function suggestEmployees(employees, hint = {}, limit = 8) {
  const list = Array.isArray(employees) ? employees : [];
  const qRaw = text(hint.query || hint.employeeName || hint.employeeNumber || hint.employeeEmail);
  const q = fold(qRaw);
  const qNumber = normalizeEmployeeNumber(hint.query || hint.employeeNumber);
  const qEmail = normalizeMatchEmail(hint.query || hint.employeeEmail);
  if (!q) {
    return [...list]
      .sort((left, right) => (
        employeeStatusRank(left) - employeeStatusRank(right)
        || displayName(left).localeCompare(displayName(right), 'nb')
      ))
      .slice(0, limit);
  }
  const scored = list.map((row) => {
    const name = fold(displayName(row));
    const number = normalizeEmployeeNumber(row?.company?.externalEmployeeNumber);
    const numberFold = fold(row?.company?.externalEmployeeNumber);
    const emails = employeeEmails(row);
    let score = 0;
    if (qEmail && emails.includes(qEmail)) score += 120;
    else if (emails.some((email) => email.includes(qRaw.toLowerCase()))) score += 50;
    if (number && qNumber && number === qNumber) score += 100;
    if (name === q) score += 80;
    if (employeeCoreName(displayName(row)) && employeeCoreName(displayName(row)) === employeeCoreName(qRaw)) score += 60;
    if (name.includes(q) || q.includes(name)) score += 40;
    if (numberFold && numberFold.includes(q)) score += 30;
    if (namesLikelyMatch(displayName(row), qRaw)) score += 20;
    score -= employeeStatusRank(row);
    return { row, score };
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || displayName(left.row).localeCompare(displayName(right.row), 'nb'));
  return scored.slice(0, limit).map((item) => item.row);
}

function resolveBillableHours(mapped, hours) {
  const billedHoursFlag = parseBillableFlag(mapped.billableHours);
  const billedFlag = parseBillableFlag(mapped.billable);
  if (mapped.billableHours != null && mapped.billableHours !== '' && billedHoursFlag == null) {
    return parseImportHours(mapped.billableHours);
  }
  if (mapped.billable != null && mapped.billable !== '' && billedFlag == null) {
    return parseImportHours(mapped.billable);
  }
  if (billedFlag === false || billedHoursFlag === false) return 0;
  return hours;
}

export function hourEntryFromMappedRow(mapped, originalValues = {}, meta = {}) {
  const date = parseDate(mapped.date) || text(mapped.date);
  let hours = parseImportHours(mapped.hours);
  let billableHours = resolveBillableHours(mapped, hours);
  // Moment: «Registrerte timer» tom, faktisk tid ligger ofte i fakturerbare (døgnbrøk).
  if (!(hours > 0) && billableHours > 0) hours = billableHours;
  if (!(billableHours > 0) && hours > 0) {
    const billedOff = parseBillableFlag(mapped.billableHours) === false
      || parseBillableFlag(mapped.billable) === false;
    if (!billedOff) billableHours = hours;
  }
  const split = splitEmployeeHint(mapped.employeeName);
  const employeeName = split.name || text(mapped.employeeName);
  const activityName = text(mapped.activityName) || 'Hovedaktivitet';
  const draft = {
    date,
    employeeNumber: text(mapped.employeeNumber) || split.number,
    employeeName,
    employeeEmail: text(mapped.employeeEmail).toLowerCase(),
    employeeId: text(mapped.employeeId),
    customerNumber: normalizeCustomerNumber(mapped.customerNumber) || text(mapped.customerNumber),
    customerName: text(mapped.customerName),
    orgnr: normalizeOrgnr(mapped.orgnr) || text(mapped.orgnr),
    customerId: text(mapped.customerId),
    projectNumber: text(mapped.projectNumber),
    projectName: text(mapped.projectName),
    projectId: text(mapped.projectId),
    activityName,
    hours,
    billableHours,
    description: text(mapped.description),
    internalNote: text(mapped.internalNote),
    department: text(mapped.department),
    status: normalizeStatus(mapped.status),
    rate: mapped.rate,
    amount: mapped.amount,
    externalId: text(mapped.externalId),
    source: {
      filename: text(meta.filename),
      importedAt: text(meta.importedAt) || new Date().toISOString(),
      values: originalValues,
    },
  };
  draft.importFingerprint = hourFingerprint(draft);
  return draft;
}

function looksLikeHourRow(mapped) {
  if (parseDate(mapped.date) || text(mapped.date)) return true;
  if (text(mapped.employeeName) || text(mapped.employeeNumber)) return true;
  if (text(mapped.projectNumber) || text(mapped.projectName)) return true;
  if (parseHours(mapped.hours) !== 0) return true;
  return false;
}

function looksLikeTotalRow(mapped) {
  const blob = fold([
    mapped.date, mapped.employeeName, mapped.employeeNumber,
    mapped.projectName, mapped.projectNumber, mapped.description,
  ].join(' '));
  if (blob === 'totalt' || blob === 'sum' || blob === 'total' || blob.startsWith('totalt')) return true;
  // Moment/Excel summeringsrad: bare et stort tall uten dato/prosjekt/ansatt.
  const bareNumber = /^\d+(\.\d+)?$/.test(text(mapped.employeeName) || text(mapped.hours));
  const noContext = !parseDate(mapped.date) && !text(mapped.date)
    && !text(mapped.projectNumber) && !text(mapped.projectName)
    && !text(mapped.employeeNumber);
  return bareNumber && noContext && !(text(mapped.employeeName) && /[a-zæøå]/i.test(mapped.employeeName));
}

export function companyHourRow(input, {
  employees = [],
  customers = [],
  projects = [],
  existingFingerprints = new Set(),
} = {}) {
  const mapped = input && typeof input === 'object' ? input : {};
  const originalValues = mapped._sourceValues && typeof mapped._sourceValues === 'object'
    ? mapped._sourceValues
    : {};
  const entry = hourEntryFromMappedRow(mapped, originalValues, {
    filename: mapped._filename,
    importedAt: mapped._importedAt,
  });
  const issues = [];
  let severity = 'ok';

  if (looksLikeTotalRow(mapped) || (!looksLikeHourRow(mapped) && !(entry.hours > 0))) {
    return {
      severity: 'block',
      issues: ['Ser ut som summeringsrad eller mangler timeføring.'],
      title: text(mapped.employeeName) || text(mapped.projectName) || 'Ugyldig rad',
      meta: '',
      entry: null,
      employeeId: '',
      projectId: '',
      customerId: '',
      duplicate: false,
      update: false,
    };
  }

  if (!entry.date) {
    severity = 'block';
    issues.push('Dato mangler — raden blir ikke importert.');
  }
  if (!(entry.hours > 0) && !(entry.billableHours > 0) && !entry.description) {
    if (severity !== 'block') severity = 'block';
    issues.push('Ingen timer i raden.');
  }

  const employee = entry.employeeId
    ? (employees || []).find((row) => row.id === entry.employeeId) || matchEmployee(employees, entry)
    : matchEmployee(employees, entry);
  if (employee) {
    entry.employeeId = employee.id;
    entry.employeeName = displayName(employee) || entry.employeeName;
    entry.employeeNumber = text(employee.company?.externalEmployeeNumber) || entry.employeeNumber;
  } else if (entry.employeeName || entry.employeeNumber) {
    severity = 'review';
    issues.push('Medarbeideren er ikke funnet i Ansatte. Importer/opprett personen først, eller koble manuelt.');
  } else {
    severity = 'review';
    issues.push('Mangler medarbeider — raden kan ikke lagres uten ansatt.');
  }

  const customer = entry.customerId
    ? (customers || []).find((row) => row.id === entry.customerId) || matchCustomer(customers, {
      customerNumber: entry.customerNumber,
      orgnr: entry.orgnr,
      client: entry.customerName,
    })
    : matchCustomer(customers, {
      customerNumber: entry.customerNumber,
      orgnr: entry.orgnr,
      client: entry.customerName,
    });
  if (customer) {
    entry.customerId = customer.id;
    entry.customerNumber = normalizeCustomerNumber(customer.customerNumber) || entry.customerNumber;
    entry.customerName = text(customer.name) || entry.customerName;
    entry.orgnr = normalizeOrgnr(customer.orgnr) || entry.orgnr;
  } else if (entry.customerName || entry.customerNumber || entry.orgnr) {
    if (severity === 'ok') severity = 'review';
    issues.push('Kunden er ikke koblet til kunderegisteret.');
  }

  const project = entry.projectId
    ? (projects || []).find((row) => row.id === entry.projectId) || matchProject(projects, entry)
    : matchProject(projects, entry);
  if (project) {
    entry.projectId = project.id;
    entry.projectNumber = text(project.number) || entry.projectNumber;
    entry.projectName = text(project.name) || entry.projectName;
    applyCustomerFromProject(entry, project, customers);
    // Etter prosjektkobling: fyll manglende kundenavn fra registeret.
    if (entry.customerId && !entry.customerName) {
      const linked = (customers || []).find((row) => row.id === entry.customerId);
      if (linked) {
        entry.customerName = text(linked.name) || entry.customerName;
        entry.customerNumber = normalizeCustomerNumber(linked.customerNumber) || entry.customerNumber;
        entry.orgnr = normalizeOrgnr(linked.orgnr) || entry.orgnr;
      }
    }
  } else if (entry.projectNumber || entry.projectName) {
    if (severity === 'ok') severity = 'review';
    issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
  } else {
    if (severity === 'ok') severity = 'review';
    issues.push('Mangler prosjekt — timer må fordeles på et prosjekt.');
  }

  const fingerprint = hourFingerprint(entry);
  entry.importFingerprint = fingerprint;
  // Kun mot allerede lagrede føringer — like rader i eksportfilen er lov (bokført/fakturert).
  const duplicate = Boolean(fingerprint) && existingFingerprints.has(fingerprint);
  if (duplicate) {
    severity = 'existing';
    issues.push('Finnes allerede i systemet (samme dato, person, prosjekt, timer og beskrivelse) — hoppes over.');
  }

  const title = [
    entry.date || 'Uten dato',
    entry.employeeName || entry.employeeNumber || 'Uten ansatt',
  ].join(' · ');
  const meta = [
    entry.projectNumber && entry.projectName
      ? `${entry.projectNumber} · ${entry.projectName}`
      : (entry.projectName || entry.projectNumber),
    entry.activityName,
    formatHours(entry.hours),
    entry.customerName,
  ].filter(Boolean).join(' · ');

  return {
    severity,
    issues,
    title,
    meta,
    entry,
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    employeeNumber: entry.employeeNumber,
    projectId: entry.projectId,
    projectNumber: entry.projectNumber,
    projectName: entry.projectName,
    customerId: entry.customerId,
    customerNumber: entry.customerNumber,
    customerName: entry.customerName,
    orgnr: entry.orgnr,
    duplicate,
    update: false,
  };
}

export function planHourImport(existingEntries, employees, customers, projects, rows) {
  const existingFingerprints = collectHourFingerprints(existingEntries);
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    planned.push(companyHourRow(raw, {
      employees,
      customers,
      projects,
      existingFingerprints,
    }));
  }
  return { rows: planned };
}

export function linkImportRowEmployee(row, employee) {
  if (!row || row.severity === 'existing' || !employee?.id || !row.entry) return row;
  const employeeName = displayName(employee) || text(row.employeeName);
  const employeeNumber = text(employee.company?.externalEmployeeNumber) || text(row.employeeNumber);
  const issues = (row.issues || []).filter((issue) => !/medarbeider|ansatt/i.test(issue));
  let severity = 'ok';
  if (!row.projectId) {
    severity = 'review';
    if (!issues.some((issue) => /prosjekt/i.test(issue))) {
      issues.push('Prosjektet er ikke funnet. Importer prosjektlisten først, eller koble manuelt.');
    }
  } else if (issues.some((issue) => /kunde/i.test(issue))) {
    severity = 'review';
  }
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    employeeId: employee.id,
    employeeName,
    employeeNumber,
  };
  entry.importFingerprint = hourFingerprint(entry);
  return {
    ...row,
    severity,
    issues,
    employeeId: employee.id,
    employeeName,
    employeeNumber,
    entry,
    linkedManually: true,
    title: [entry.date || 'Uten dato', employeeName].join(' · '),
  };
}

export function linkImportPlanEmployee(plan, rowIndex, employee, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !employee?.id) return plan;
  const key = fold(target.employeeNumber) || fold(target.employeeName);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowEmployee(row, employee);
    if (
      applyGroup
      && key
      && !row.employeeId
      && (fold(row.employeeNumber) === key || fold(row.employeeName) === key)
    ) {
      return linkImportRowEmployee(row, employee);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function linkImportRowProject(row, project, customers = []) {
  if (!row || row.severity === 'existing' || !project?.id || !row.entry) return row;
  const issues = (row.issues || []).filter((issue) => !/prosjekt/i.test(issue));
  let severity = 'ok';
  if (!row.employeeId) {
    severity = 'review';
    if (!issues.some((issue) => /medarbeider|ansatt/i.test(issue))) {
      issues.push('Mangler medarbeider — raden kan ikke lagres uten ansatt.');
    }
  } else if (issues.some((issue) => /kunde/i.test(issue))) {
    severity = 'review';
  }
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    projectId: project.id,
    projectNumber: text(project.number) || row.projectNumber,
    projectName: text(project.name) || row.projectName,
    customerId: row.entry.customerId || project.customerId || '',
    customerName: row.entry.customerName || text(project.client) || '',
    customerNumber: row.entry.customerNumber || text(project.customerNumber) || '',
  };
  applyCustomerFromProject(entry, project, customers);
  // Prosjektkobling løser også «kunden ikke koblet» når prosjektet har kunde.
  const nextIssues = entry.customerId
    ? issues.filter((issue) => !/kunde/i.test(issue))
    : issues;
  if (!nextIssues.length && entry.employeeId && entry.projectId && !row.duplicate) {
    severity = 'ok';
  } else if (!entry.employeeId || !entry.projectId) {
    severity = 'review';
  }
  entry.importFingerprint = hourFingerprint(entry);
  return {
    ...row,
    severity,
    issues: nextIssues,
    projectId: project.id,
    projectNumber: entry.projectNumber,
    projectName: entry.projectName,
    customerId: entry.customerId,
    customerNumber: entry.customerNumber,
    customerName: entry.customerName,
    entry,
    meta: [
      `${entry.projectNumber} · ${entry.projectName}`.replace(/^\s·\s/, ''),
      entry.activityName,
      formatHours(entry.hours),
      entry.customerName,
    ].filter(Boolean).join(' · '),
  };
}

export function linkImportPlanProject(plan, rowIndex, project, { applyGroup = true, customers = [] } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !project?.id) return plan;
  const key = normalizeProjectNumber(target.projectNumber);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowProject(row, project, customers);
    if (
      applyGroup
      && key
      && normalizeProjectNumber(row.projectNumber) === key
      && !row.projectId
      && row.severity !== 'block'
      && row.severity !== 'existing'
    ) {
      return linkImportRowProject(row, project, customers);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export function linkImportRowCustomer(row, customer) {
  if (!row || row.severity === 'existing' || !customer?.id || !row.entry) return row;
  const customerNumber = normalizeCustomerNumber(customer.customerNumber) || text(row.customerNumber);
  const customerName = text(customer.name) || text(row.customerName);
  const orgnr = normalizeOrgnr(customer.orgnr) || text(row.orgnr);
  const issues = (row.issues || []).filter((issue) => !/kunde/i.test(issue));
  let severity = row.severity;
  if (!issues.length && row.employeeId && row.projectId) severity = 'ok';
  else if (!row.employeeId || !row.projectId) severity = 'review';
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    customerId: customer.id,
    customerNumber,
    customerName,
    orgnr,
  };
  return {
    ...row,
    severity,
    issues,
    customerId: customer.id,
    customerNumber,
    customerName,
    orgnr,
    entry,
  };
}

export function linkImportPlanCustomer(plan, rowIndex, customer, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !customer?.id) return plan;
  const key = customerIdentityKey({
    customerNumber: target.customerNumber,
    orgnr: target.orgnr,
    client: target.customerName,
  });
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkImportRowCustomer(row, customer);
    if (
      applyGroup
      && key
      && customerIdentityKey({
        customerNumber: row.customerNumber,
        orgnr: row.orgnr,
        client: row.customerName,
      }) === key
      && !row.customerId
    ) {
      return linkImportRowCustomer(row, customer);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export async function readHourTable(bytes, filename = '', { columnFields } = {}) {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => hourColumnField(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) {
    throw new Error('Fant ingen timeliste. Filen trenger kolonner som Dato, Ansatt og Timer.');
  }
  const headerCells = best.table[best.index] || [];
  const fields = headerCells.map((cell, index) => {
    if (columnFields && columnFields[cell]) return columnFields[cell];
    if (columnFields && columnFields[String(index)]) return columnFields[String(index)];
    return hourColumnField(cell);
  });
  if (!fields.includes('date') && !fields.includes('hours')) {
    throw new Error('Listen mangler kolonne for dato eller timer. Bruk en eksport med «Dato»/«Opprettet dato» og «Timer»/«Antall timer i valgt periode».');
  }
  const importedAt = new Date().toISOString();
  const rows = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const mapped = { _filename: filename, _importedAt: importedAt };
    const sourceValues = {};
    headerCells.forEach((header, index) => {
      const label = text(header);
      const value = text(cells?.[index]);
      if (label) sourceValues[label] = value;
      const field = fields[index];
      if (!field || value === '') return;
      if (!mapped[field]) mapped[field] = value;
    });
    mapped._sourceValues = sourceValues;
    if (looksLikeHourRow(mapped)) rows.push(mapped);
  }
  if (!rows.length) throw new Error('Listen har ingen timeføringer.');
  return rows;
}

function includedIndexes(indexes, dropped) {
  return (indexes || []).filter((index) => !dropped.has(String(index)));
}

function blockTitle(row) {
  const label = text(row?.title);
  if (!label || /^\d+(\.\d+)?$/.test(label)) return 'Summeringsrad eller ugyldig rad';
  return label;
}

/**
 * Gjennomgang for timeimport: kort for avvik + tabellrader for klare føringer.
 * readyCount teller faktiske føringer, ikke kort.
 */
export function buildHourImportReview(plan, { dropped = new Set() } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const okIndexes = [];
  const blockIndexes = [];
  const existingIndexes = [];
  const reviewGroups = new Map();

  rows.forEach((row, index) => {
    if (row.severity === 'block') {
      blockIndexes.push(index);
      return;
    }
    if (row.severity === 'existing') {
      existingIndexes.push(index);
      return;
    }
    if (row.severity === 'review') {
      const issueKey = (row.issues || []).slice().sort().join(' | ') || 'Avvik';
      if (!reviewGroups.has(issueKey)) {
        reviewGroups.set(issueKey, {
          id: `review:${fold(issueKey).slice(0, 80)}`,
          severity: 'review',
          included: true,
          title: row.title,
          meta: row.meta,
          issues: row.issues || [],
          indexes: [],
          sampleTitles: [],
          needsEmployee: false,
          needsProject: false,
          needsCustomer: false,
          employeeName: row.employeeName || '',
          employeeNumber: row.employeeNumber || '',
          projectNumber: row.projectNumber || '',
          projectName: row.projectName || '',
          customerName: row.customerName || '',
          customerNumber: row.customerNumber || '',
          rowIndex: index,
        });
      }
      const group = reviewGroups.get(issueKey);
      group.indexes.push(index);
      if (group.sampleTitles.length < 4) group.sampleTitles.push(row.title);
      group.needsEmployee = group.needsEmployee || !row.employeeId;
      group.needsProject = group.needsProject || !row.projectId;
      group.needsCustomer = group.needsCustomer || !row.customerId;
      if (dropped.has(String(index))) group.included = false;
      return;
    }
    okIndexes.push(index);
  });

  const cards = [];
  if (blockIndexes.length) {
    const sample = blockIndexes.slice(0, 5).map((index) => blockTitle(rows[index])).filter(Boolean);
    cards.push({
      id: 'block-group',
      severity: 'block',
      included: false,
      locked: true,
      count: blockIndexes.length,
      title: blockIndexes.length === 1
        ? blockTitle(rows[blockIndexes[0]])
        : `${blockIndexes.length} rader blir ikke importert`,
      meta: sample.join(', '),
      issues: [rows[blockIndexes[0]]?.issues?.[0] || 'Kan ikke importeres.'],
      indexes: blockIndexes,
      rowIndex: blockIndexes[0],
    });
  }

  if (existingIndexes.length) {
    const sample = existingIndexes.slice(0, 5).map((index) => rows[index]?.title).filter(Boolean);
    cards.push({
      id: 'existing-group',
      severity: 'existing',
      included: false,
      locked: true,
      count: existingIndexes.length,
      title: existingIndexes.length === 1
        ? (rows[existingIndexes[0]]?.title || 'Duplikat')
        : `${existingIndexes.length} duplikater hoppes over`,
      meta: sample.join(', '),
      issues: [rows[existingIndexes[0]]?.issues?.[0] || 'Finnes allerede.'],
      indexes: existingIndexes,
      rowIndex: existingIndexes[0],
    });
  }

  const reviewCards = [...reviewGroups.values()].map((group) => {
    const active = includedIndexes(group.indexes, dropped);
    const count = group.indexes.length;
    return {
      ...group,
      count,
      included: active.length > 0,
      title: count === 1 ? group.title : `${count} føringer med samme avvik`,
      meta: group.sampleTitles.join(', '),
    };
  });
  cards.push(...reviewCards);

  const okRows = okIndexes.map((index) => {
    const row = rows[index];
    const entry = row?.entry || {};
    return {
      id: String(index),
      index,
      included: !dropped.has(String(index)),
      title: row.title,
      date: entry.date || '',
      employeeName: entry.employeeName || row.employeeName || '',
      customerName: entry.customerName || row.customerName || '',
      projectNumber: entry.projectNumber || row.projectNumber || '',
      projectName: entry.projectName || row.projectName || '',
      activityName: entry.activityName || '',
      hours: entry.hours,
      billableHours: entry.billableHours,
      description: entry.description || '',
    };
  });

  const okActive = includedIndexes(okIndexes, dropped);
  if (okIndexes.length) {
    cards.push({
      id: 'ok-group',
      severity: 'ok',
      included: okActive.length > 0,
      count: okActive.length,
      title: `${okIndexes.length} timer klare uten avvik`,
      meta: '',
      issues: [],
      indexes: okIndexes,
      list: true,
    });
  }

  let readyCount = 0;
  rows.forEach((row, index) => {
    if (row.severity === 'block' || row.severity === 'existing' || !row.entry) return;
    if (dropped.has(String(index))) return;
    if (!row.entry.employeeId || !row.entry.projectId) return;
    readyCount += 1;
  });

  return {
    cards,
    okRows,
    reviewCards,
    existingCount: existingIndexes.length,
    blockCount: blockIndexes.length,
    readyCount,
  };
}

/** Bakoverkompatibel wrapper for tester/eldre kall. */
export function reviewRowsForHourPlan(plan, options = {}) {
  return buildHourImportReview(plan, options).cards;
}

export function toggleHourReviewRow(dropped, reviewRow, plan) {
  const next = new Set(dropped);
  const indexes = reviewRow?.indexes
    || (reviewRow?.rowIndex != null ? [reviewRow.rowIndex] : []);
  if (reviewRow?.id && /^\d+$/.test(reviewRow.id)) indexes.push(Number(reviewRow.id));
  const unique = [...new Set(indexes.map(Number).filter(Number.isFinite))];
  if (!unique.length) return next;
  const allDropped = unique.every((index) => next.has(String(index)));
  for (const index of unique) {
    const id = String(index);
    if (allDropped) next.delete(id);
    else next.add(id);
  }
  void plan;
  return next;
}

export const HOUR_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
