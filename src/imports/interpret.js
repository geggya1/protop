/**
 * Felles tolking av importfiler for kunder og ansatte.
 * Regneark leses lokalt. Ukjente kolonner og skannede filer sendes til OCR/AI.
 * Verdiene i cellene beholdes. Modellen får bare lov til å si hvilken kolonne som er hvilket felt.
 */

export const CUSTOMER_AI_FIELDS = {
  name: 'Kundenavn eller firmanavn',
  orgnr: 'Organisasjonsnummer, ni siffer',
  personnummer: 'Fødselsnummer for privatperson, elleve siffer',
  address: 'Gateadresse, første linje',
  address2: 'Adresselinje 2',
  postalCode: 'Postnummer, fire siffer',
  place: 'Poststed',
  contactName: 'Kontaktperson',
  email: 'E-postadresse',
  invoiceEmail: 'Faktura-e-post, bare når den er en e-postadresse',
  phone: 'Telefon',
  customerNo: 'Kundenummer i leverandørens system',
  website: 'Nettside',
  notes: 'Fritekst som hører til kunden',
  kind: 'Virksomhet eller privatperson',
};

export const EMPLOYEE_AI_FIELDS = {
  firstName: 'Fornavn',
  middleName: 'Mellomnavn',
  lastName: 'Etternavn',
  fullName: 'Fullt navn i ett felt',
  email: 'Privat e-post',
  workEmail: 'E-post på jobb',
  phone: 'Mobil',
  phoneAlt: 'Telefon',
  username: 'Brukernavn',
  title: 'Stillingstittel',
  department: 'Avdeling',
  status: 'Ansatt, sluttet eller permisjon',
  external: 'Ekstern medarbeider, ja eller nei',
  canLogin: 'Kan logge inn, ja eller nei',
  hasLicense: 'Har lisens, ja eller nei',
  employmentType: 'Ansettelsestype',
  compensationType: 'Lønnstype',
  workPercent: 'Stillingsprosent',
  periodFrom: 'Ansatt fra',
  periodTo: 'Ansatt til',
  externalEmployeeNumber: 'Ansattnummer',
  accessRole: 'Tilgangsrolle',
  canHandleLegal: 'Kan behandle juridiske saker, ja eller nei',
  projectRole: 'Prosjektrolle',
  permissionsText: 'Rettigheter som tekst',
  nationalId: 'Personnummer',
  birthDate: 'Fødselsdato',
  gender: 'Kjønn',
  language: 'Språk',
  nationality: 'Nasjonalitet',
  maritalStatus: 'Sivilstatus',
  address1: 'Adresse',
  postalCode: 'Postnummer',
  place: 'Poststed',
  kinName: 'Pårørende',
  kinPhone: 'Telefon til pårørende',
  kinEmail: 'E-post til pårørende',
  comment: 'Kommentar',
  examYear: 'Eksamensår',
  educationLevel: 'Utdanningsnivå',
  competence: 'Kompetanse',
};

const YES = new Set(['ja', 'yes', 'j', 'y', 'true', 'sant', 'sann', 'x', '1', 'ok', 'on']);
const NO = new Set(['nei', 'no', 'n', 'false', 'usann', '0', 'av', 'off']);

export function fieldsFor(kind) {
  return kind === 'employees' ? EMPLOYEE_AI_FIELDS : CUSTOMER_AI_FIELDS;
}

export function foldToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function fileMedia(bytes, filename = '') {
  const name = String(filename || '').toLowerCase();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46) {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (raw[0] === 0x89 && raw[1] === 0x50) return { kind: 'image', mime: 'image/png' };
  if (raw[0] === 0xff && raw[1] === 0xd8) return { kind: 'image', mime: 'image/jpeg' };
  if (name.endsWith('.pdf')) return { kind: 'pdf', mime: 'application/pdf' };
  if (name.endsWith('.png')) return { kind: 'image', mime: 'image/png' };
  if (name.endsWith('.webp')) return { kind: 'image', mime: 'image/webp' };
  if (name.endsWith('.gif')) return { kind: 'image', mime: 'image/gif' };
  if (/\.jpe?g$|\.heic$|\.heif$/.test(name)) return { kind: 'image', mime: 'image/jpeg' };
  return { kind: 'table', mime: '' };
}

export function columnIsFlags(values) {
  const filled = (values || []).map((value) => foldToken(value)).filter(Boolean);
  if (!filled.length) return false;
  return filled.every((value) => YES.has(value) || NO.has(value));
}

export function tablePreview(table, { maxRows = 3, maxCell = 80 } = {}) {
  const headers = (table?.[0] || []).map((cell) => String(cell || '').trim().slice(0, 80));
  const samples = (table || []).slice(1, 1 + maxRows).map((row) => (
    headers.map((_, index) => String(row?.[index] || '').replace(/\s+/g, ' ').trim().slice(0, maxCell))
  )).filter((row) => row.some(Boolean));
  return { headers, samples };
}

export function columnsNeedingHelp(table, localField) {
  const headers = table?.[0] || [];
  const body = (table || []).slice(1, 12);
  return headers.map((header, index) => ({ header: String(header || '').trim(), index })).filter(({ header, index }) => {
    if (!header || localField(header)) return false;
    const values = body.map((row) => String(row?.[index] || '').trim()).filter(Boolean);
    if (!values.length || columnIsFlags(values)) return false;
    return true;
  });
}

export function assignmentMap(columns, headers) {
  const source = columns && typeof columns === 'object' ? columns : {};
  const byFold = new Map();
  for (const [header, field] of Object.entries(source)) {
    const key = foldToken(header);
    if (key && field && !byFold.has(key)) byFold.set(key, field);
  }
  const out = {};
  for (const header of headers || []) {
    const label = String(header || '').trim();
    const field = source[label] || byFold.get(foldToken(label)) || '';
    if (label && field) out[label] = field;
  }
  return out;
}

/** Første kolonne som krever et felt, vinner. Senere kolonner får ikke overskrive det. */
export function claimAssignments(headers, localFields, hinted) {
  const used = new Set((localFields || []).filter(Boolean));
  const out = {};
  (headers || []).forEach((header, index) => {
    const label = String(header || '').trim();
    if (!label || localFields?.[index]) return;
    const field = hinted?.[label] || '';
    if (!field || used.has(field)) return;
    used.add(field);
    out[label] = field;
  });
  return out;
}

export function acceptableValue(field, value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (field === 'email' || field === 'invoiceEmail' || field === 'workEmail' || field === 'kinEmail') {
    return raw.includes('@') ? raw : '';
  }
  if (field === 'orgnr') return raw.replace(/\D/g, '').length === 9 ? raw : '';
  if (field === 'postalCode') return raw.replace(/\D/g, '').length === 4 ? raw : '';
  if (field === 'phone' || field === 'phoneAlt' || field === 'kinPhone') {
    const count = raw.replace(/\D/g, '').length;
    return count >= 8 && count <= 15 ? raw : '';
  }
  if (field === 'personnummer' || field === 'nationalId') {
    return raw.replace(/\D/g, '').length === 11 ? raw : '';
  }
  return raw;
}

const CUSTOMER_FILL = ['orgnr', 'personnummer', 'address', 'postalCode', 'place', 'contactName', 'email', 'phone', 'notes', 'kind', 'customerNumber'];

export function mergeCustomerRows(localRows, assistedRows) {
  const local = Array.isArray(localRows) ? localRows : [];
  const assisted = Array.isArray(assistedRows) ? assistedRows : [];
  if (!assisted.length) return local;
  if (!local.length) return assisted.map(sanitizeAssistedCustomer);
  if (local.length === assisted.length) {
    return local.map((row, index) => fillCustomer(row, assisted[index]));
  }
  const used = new Set();
  const merged = [];
  for (const extra of assisted) {
    const index = local.findIndex((row, rowIndex) => !used.has(rowIndex) && sameCustomer(row, extra));
    if (index < 0) {
      merged.push(sanitizeAssistedCustomer(extra));
      continue;
    }
    used.add(index);
    merged.push(fillCustomer(local[index], extra));
  }
  local.forEach((row, index) => {
    if (!used.has(index)) merged.push(row);
  });
  return merged;
}

function sameCustomer(left, right) {
  const orgnr = String(left?.orgnr || '').replace(/\D/g, '');
  const other = String(right?.orgnr || '').replace(/\D/g, '');
  if (orgnr && orgnr === other) return true;
  const name = String(left?.name || '').trim().toLowerCase();
  const otherName = String(right?.name || '').trim().toLowerCase();
  return Boolean(name) && name === otherName;
}

function fillCustomer(base, extra) {
  const next = { ...base };
  for (const field of CUSTOMER_FILL) {
    if (String(next[field] || '').trim()) continue;
    const value = acceptableValue(field, extra?.[field]);
    if (value) next[field] = value;
  }
  return next;
}

function sanitizeAssistedCustomer(row) {
  const next = { ...row };
  for (const field of CUSTOMER_FILL) next[field] = acceptableValue(field, next[field]);
  return next;
}

export function sanitizeColumnMap(parsed, kind) {
  const allowed = new Set(Object.keys(fieldsFor(kind)));
  const columns = Array.isArray(parsed?.columns) ? parsed.columns : [];
  const out = {};
  for (const column of columns) {
    const header = String(column?.header || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const field = String(column?.field || '').trim();
    if (!header || !allowed.has(field) || out[header]) continue;
    out[header] = field;
  }
  return {
    columns: out,
    summary: String(parsed?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

export function sanitizeOcrRows(parsed, kind) {
  const allowed = Object.keys(fieldsFor(kind));
  const rows = (Array.isArray(parsed?.rows) ? parsed.rows : []).slice(0, 80).map((row) => {
    const next = {};
    for (const field of allowed) {
      const value = acceptableValue(field, row?.[field]);
      if (value) next[field] = value.slice(0, 200);
    }
    return next;
  }).filter((row) => (
    kind === 'employees'
      ? (row.firstName || row.lastName || row.fullName)
      : row.name
  ));
  return {
    rows,
    summary: String(parsed?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

export function objectsToTable(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = [];
  for (const row of list) {
    for (const key of Object.keys(row || {})) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return [headers, ...list.map((row) => headers.map((key) => row?.[key] || ''))];
}

function csvCell(value) {
  const raw = String(value ?? '');
  if (/[;"\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function tableToCsv(table) {
  return (table || []).map((row) => (row || []).map(csvCell).join(';')).join('\n');
}

export function columnPrompt(kind) {
  const fields = Object.entries(fieldsFor(kind)).map(([field, label]) => `${field}: ${label}`).join('\n');
  const subject = kind === 'employees' ? 'en medarbeiderliste' : 'en kundeliste';
  return `Du tolker kolonneoverskrifter i ${subject}.
Returner KUN gyldig JSON:
{"columns":[{"header":"overskrift slik den står","field":"feltnavn eller tom streng"}],"summary":"én kort setning"}
Tillatte felt:
${fields}
Regler:
- Kopier header nøyaktig fra listen du får.
- Bruk eksemplene til å skille felt, for eksempel ni siffer som orgnr og fire siffer som postnummer.
- Kolonner med bare ja/nei er rettigheter. Sett field til tom streng for dem.
- Ikke finn opp kolonner. Ett felt brukes bare én gang. Tom streng når du er usikker.`;
}

export function ocrPrompt(kind) {
  const fields = Object.keys(fieldsFor(kind)).join(', ');
  const subject = kind === 'employees' ? 'medarbeidere' : 'kunder';
  return `Du leser et skannet dokument eller bilde med OCR og trekker ut ${subject}.
Returner KUN gyldig JSON:
{"rows":[{${Object.keys(fieldsFor(kind)).slice(0, 4).map((field) => `"${field}":""`).join(',')}}],"summary":"én kort setning"}
Tillatte felt i hver rad: ${fields}.
Regler:
- Ta bare med det som står i dokumentet. Ikke finn opp navn, nummer, e-post eller adresser.
- Hopp over overskrifter, summer og tomme rader.
- Maks 80 rader. Tom streng for felt som ikke finnes.`;
}

function clipText(value, max, lines = false) {
  const raw = String(value ?? '');
  const text = lines
    ? raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
    : raw.replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

function cvItems(list, max, map) {
  return (Array.isArray(list) ? list : []).slice(0, max).map(map).filter(Boolean);
}

export function sanitizeCv(parsed) {
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  const education = cvItems(src.education, 12, (row) => {
    const item = {
      from: clipText(row?.from, 20),
      to: clipText(row?.to, 20),
      school: clipText(row?.school, 160),
      program: clipText(row?.program, 160),
    };
    return item.school || item.program || item.from ? item : null;
  });
  const certifications = cvItems(src.certifications, 20, (row) => {
    const title = clipText(row?.title || row, 160);
    return title ? { title } : null;
  });
  const courses = cvItems(src.courses, 20, (row) => {
    const item = { date: clipText(row?.date, 40), title: clipText(row?.title, 160) };
    return item.title ? item : null;
  });
  const experience = cvItems(src.experience, 20, (row) => {
    const current = row?.current === true || /^(ja|true|1|nå|naa|navaerende|dd)$/i.test(clipText(row?.current, 20));
    const item = {
      employer: clipText(row?.employer, 160),
      place: clipText(row?.place, 80),
      from: clipText(row?.from, 20),
      to: current ? '' : clipText(row?.to, 20),
      current,
      title: clipText(row?.title, 160),
      tasks: clipText(row?.tasks, 2000, true),
    };
    return item.employer || item.title || item.tasks ? item : null;
  });
  const projects = cvItems(src.projects, 20, (row) => {
    const email = clipText(row?.email, 80);
    const item = {
      title: clipText(row?.title, 160),
      category: clipText(row?.category, 80),
      client: clipText(row?.client, 160),
      object: clipText(row?.object, 160),
      period: clipText(row?.period, 40),
      cost: clipText(row?.cost, 40),
      contact: clipText(row?.contact, 80),
      phone: clipText(row?.phone, 40),
      email: email.includes('@') ? email : '',
      employer: clipText(row?.employer, 160),
      roles: clipText(row?.roles, 500, true),
      responsibility: clipText(row?.responsibility, 1000, true),
    };
    return item.title || item.client || item.responsibility ? item : null;
  });
  return {
    cv: {
      headline: clipText(src.headline, 160),
      summary: clipText(src.summary, 4000, true),
      language: clipText(src.language, 80),
      nationality: clipText(src.nationality, 80),
      maritalStatus: clipText(src.maritalStatus, 80),
      education,
      certifications,
      courses,
      experience,
      projects,
    },
    summary: clipText(src.summaryNote, 240),
  };
}

export function cvPrompt() {
  return `Du leser én CV, enten som skann, PDF eller ren tekst, og trekker ut innholdet.
Returner KUN gyldig JSON:
{"headline":"","summary":"","language":"","nationality":"","maritalStatus":"","education":[{"from":"","to":"","school":"","program":""}],"certifications":[{"title":""}],"courses":[{"date":"","title":""}],"experience":[{"employer":"","place":"","from":"","to":"","current":false,"title":"","tasks":""}],"projects":[{"title":"","category":"","client":"","object":"","period":"","cost":"","contact":"","phone":"","email":"","employer":"","roles":"","responsibility":""}],"summaryNote":"én kort setning"}
Regler:
- Ta bare med det som står i dokumentet. Ikke finn opp arbeidsgivere, skoler, årstall, kunder eller prosjekter.
- summary er oppsummeringen og nøkkelkvalifikasjonene som sammenhengende tekst.
- tasks er arbeidsoppgaver, én linje per oppgave.
- current er true bare når stillingen er merket som nåværende.
- Tom streng eller tom liste når feltet ikke finnes.`;
}
