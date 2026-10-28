/**
 * Hurtigimport av fravær fra Excel/CSV (f.eks. Moment fraværseksport).
 * Kobler mot medarbeidere, mapper fraværstype, sjekker duplikater,
 * og forbereder lagring i absences (egen subcollection).
 */
import { readSpreadsheetTables, CUSTOMER_IMPORT_ACCEPT } from '../anbud/customerImport.js';
import { displayName } from '../employees/model.js';
import {
  matchEmployee,
  parseImportHours,
  suggestEmployees,
  splitEmployeeHint,
} from '../economy/hoursImport.js';
import { fold, parseDate, text } from '../economy/invoices.js';
import { ABSENCE_TYPES, absenceTypeById } from './absenceCatalog.js';
import { roundHours } from './hours.js';

export { suggestEmployees, matchEmployee };

const FIELD_ALIASES = [
  ['date', [
    'dato', 'date', 'workdate', 'arbeidsdato', 'fravaersdato', 'absencedate',
    'startdato', 'fromdate', 'opprettetdato', 'createddate',
  ]],
  ['employeeNumber', [
    'ansattnummer', 'ansattnr', 'ansattno', 'employeenumber', 'employeeno',
    'externalemployeenumber', 'eksterntansattnummer', 'resourceid', 'userid',
  ]],
  ['employeeName', [
    'ansatt', 'ansattnavn', 'medarbeider', 'medarbeidernavn', 'resource', 'ressurs',
    'employee', 'employeename', 'name', 'navn',
  ]],
  ['employeeEmail', [
    'ansattepost', 'ansattmail', 'medarbeiderepost', 'employeeemail',
    'epost', 'email', 'mail',
  ]],
  ['typeLabel', [
    'type', 'fravaerstype', 'absencetype', 'kategori', 'category', 'leave type',
  ]],
  ['percent', [
    'fravaersprosent', 'prosent', 'percent', 'absencepercent', 'grad',
  ]],
  ['status', [
    'status', 'godkjent', 'approved', 'approvalstatus',
  ]],
  ['assessedBy', [
    'vurdertav', 'godkjentav', 'assessedby', 'approvedby', 'reviewedby',
  ]],
  ['description', [
    'beskrivelse', 'description', 'tekst', 'kommentar', 'comment', 'note', 'notes', 'merknad',
  ]],
  ['hours', [
    'timer', 'hours', 'quantity', 'antall', 'registeredhours', 'registrertetimer',
    'fravaerstimer', 'absencehours',
  ]],
  ['paidHours', [
    'timermedlonn', 'paidhours', 'hourswithpay',
  ]],
];

const SKIP_HEADERS = [
  'kjonn', 'gender', 'sex',
  'avtalttimer', 'avtalttimerminusferie',
  'avtaltarbeidsdager', 'avtaltarbeidsdagerminusferie',
  'opprettetav', 'createdby', 'sistendret', 'sistendretav',
  'tagger', 'tags', 'overtid', 'overtime',
];

/** Labels fra Moment → katalog-id. */
const TYPE_ALIASES = new Map([
  ...ABSENCE_TYPES.map((row) => [fold(row.label), row.id]),
  [fold('Ferie'), 'ferie'],
  [fold('Sykdom'), 'sykdom'],
  [fold('Syk'), 'sykdom'],
  [fold('Permisjon'), 'permisjon'],
  [fold('Legebesøk'), 'lege_med'],
  [fold('Legebesok'), 'lege_med'],
  [fold('Pappaperm'), 'foreldre'],
  [fold('Mammadag'), 'foreldre'],
  [fold('Foreldrepenger'), 'foreldre'],
  [fold('Annet'), 'annet'],
  // Navn fra eldre eksport (før standardtypene fikk generiske navn) tolkes som før.
  [fold('Reisetid - Frøya (Ikke til lønn) (Annet fravær)'), 'reise_uten_lonn'],
  [fold('Reisetid - Frøya (Ikke til lønn)'), 'reise_uten_lonn'],
  [fold('Interntid - Smartplan (Ikke til timebank)'), 'intern_smart'],
]);

function isNoiseHoursHeader(key) {
  if (!key) return false;
  if (key.includes('avtalt')) return true;
  if (key.includes('estimert') || key.includes('estimated')) return true;
  if (key.includes('planlagt') || key.includes('planned')) return true;
  if (key.includes('arbeidsdager')) return true;
  return false;
}

export function absenceColumnField(header) {
  const key = fold(header);
  if (!key) return '';
  if (SKIP_HEADERS.some((skip) => key === skip || key.startsWith(skip))) return '';
  if (isNoiseHoursHeader(key)) return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
    if (fold(field) === key) return field;
  }
  if (key.includes('fravaersprosent') || key === 'prosent') return 'percent';
  if (key.includes('vurdert') || key.includes('godkjentav')) return 'assessedBy';
  if (key.includes('timer') && key.includes('lonn')) return 'paidHours';
  if (key === 'timer' || key === 'hours') return 'hours';
  if (key.includes('fravaerstype') || key === 'type') return 'typeLabel';
  if ((key.endsWith('dato') || key.endsWith('date')) && !key.includes('utsett')) return 'date';
  if (key.includes('eksterntansatt') || key.includes('externalemployee')) return 'employeeNumber';
  if (key.includes('medarbeider') || key.includes('employeename') || key.includes('ansattnavn')) {
    return 'employeeName';
  }
  if (key.includes('ansatt') && (key.includes('nr') || key.includes('nummer'))) return 'employeeNumber';
  if (key.includes('beskrivelse') || key.includes('description') || key.includes('kommentar')) {
    return 'description';
  }
  return '';
}

export function mapAbsenceType(label) {
  const raw = text(label);
  if (!raw) return 'annet';
  const key = fold(raw);
  if (TYPE_ALIASES.has(key)) return TYPE_ALIASES.get(key);
  for (const row of ABSENCE_TYPES) {
    if (fold(row.label) === key) return row.id;
    if (key.includes(fold(row.label)) || fold(row.label).includes(key)) return row.id;
  }
  if (key.includes('ferie')) return 'ferie';
  if (key.includes('sykemelding') || key.includes('sykmelding')) return 'syk_melding';
  if (key.includes('egenmelding')) return 'egenmelding';
  if (key.includes('syktbarn') || (key.includes('sykt') && key.includes('barn'))) return 'sykt_barn';
  if (key.includes('foreldre') || key.includes('pappa') || key.includes('mamma')) return 'foreldre';
  if (key.includes('avspas')) return 'avspasering';
  if (key.includes('permitter')) return 'permittert';
  if (key.includes('permisjon')) return 'permisjon';
  if (key.includes('lege')) return key.includes('uten') ? 'lege_uten' : 'lege_med';
  if (key.includes('syk')) return key.includes('uten') ? 'syk_uten' : 'sykdom';
  if (key.includes('seminar')) return key.includes('uten') ? 'seminar_uten' : 'seminar_med';
  if (key.includes('smartplan')) return 'intern_smart';
  if (key.includes('administrasjon') || key.includes('interntid')) return 'intern_admin';
  if (key.includes('reise')) return 'reise_uten_lonn';
  if (key.includes('uten') && key.includes('lonn')) return 'annet_uten';
  return 'annet';
}

export function normalizeAbsenceStatus(value) {
  const key = fold(value);
  if (!key) return 'registrert';
  if (['godkjent', 'approved', 'ok', 'ja', 'yes', 'true', '1'].includes(key)) return 'godkjent';
  if (['last', 'locked', 'closed', 'avsluttet'].includes(key)) return 'låst';
  // Moment «Pending approval» og lignende → klar for behandling i ProTop.
  if (
    key.includes('pending')
    || key.includes('approval')
    || key.includes('venter')
    || key.includes('tilgodkjenning')
    || ['registrert', 'draft', 'open', 'submitted'].includes(key)
  ) {
    return 'registrert';
  }
  return 'registrert';
}

export function absencePersonKey(row = {}) {
  return text(row.employeeId)
    || text(row.employeeNumber)
    || fold(row.employeeName);
}

/** Duplikatnøkkel: dato + person + type + timer + beskrivelse. */
export function absenceFingerprint(row = {}) {
  const date = parseDate(row.date) || text(row.date);
  const person = absencePersonKey(row);
  const type = text(row.type) || 'ferie';
  const hours = String(roundHours(row.hours ?? 0));
  const description = fold(row.description);
  if (!date || !person) return '';
  return [date, person, type, hours, description].join('|');
}

export function collectAbsenceFingerprints(entries) {
  const keys = new Set();
  for (const row of Array.isArray(entries) ? entries : []) {
    const key = absenceFingerprint(row);
    if (key) keys.add(key);
  }
  return keys;
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const rank = (table[index] || []).filter((cell) => absenceColumnField(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 2 ? best : -1;
}

function looksLikeAbsenceRow(mapped) {
  if (!mapped) return false;
  if (parseDate(mapped.date) || text(mapped.date)) {
    if (text(mapped.employeeName) || text(mapped.employeeNumber) || text(mapped.typeLabel)) return true;
  }
  return false;
}

function parsePercent(value) {
  const raw = text(value).replace('%', '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} raw
 * @param {{ employees?: Array, existingFingerprints?: Set }} opts
 */
export function companyAbsenceRow(raw, {
  employees = [],
  existingFingerprints = new Set(),
} = {}) {
  const issues = [];
  let severity = 'ok';

  const hint = splitEmployeeHint(raw.employeeName);
  const employeeName = text(hint.name) || text(raw.employeeName);
  const employeeNumber = text(raw.employeeNumber) || text(hint.number);
  const date = parseDate(raw.date) || text(raw.date);
  const typeLabel = text(raw.typeLabel) || text(raw.type);
  const type = mapAbsenceType(typeLabel || raw.type);
  const hoursRaw = raw.hours != null && raw.hours !== '' ? raw.hours : raw.paidHours;
  const hours = parseImportHours(hoursRaw);
  const status = normalizeAbsenceStatus(raw.status);
  const description = text(raw.description);
  const assessedBy = text(raw.assessedBy);
  const percent = parsePercent(raw.percent);

  if (!date) {
    issues.push('Dato mangler — raden blir ikke importert.');
    severity = 'block';
  }
  if (!(hours > 0)) {
    issues.push('Timer mangler eller er null — raden blir ikke importert.');
    severity = 'block';
  }
  if (!employeeName && !employeeNumber) {
    issues.push('Medarbeider mangler — raden blir ikke importert.');
    severity = 'block';
  }

  const matched = severity === 'block'
    ? null
    : matchEmployee(employees, {
      employeeName,
      employeeNumber,
      employeeEmail: raw.employeeEmail,
    });

  if (severity !== 'block' && !matched) {
    severity = 'review';
    issues.push('Medarbeideren er ikke funnet i Ansatte. Velg person før import.');
  }

  const entry = {
    date,
    hours,
    type,
    typeLabel: typeLabel || absenceTypeById(type).label,
    description,
    status,
    assessedBy,
    percent,
    employeeId: matched?.id || '',
    employeeName: matched ? displayName(matched) : employeeName,
    employeeNumber: text(matched?.company?.externalEmployeeNumber) || employeeNumber,
    source: {
      filename: text(raw._filename),
      importedAt: text(raw._importedAt),
      values: raw._sourceValues && typeof raw._sourceValues === 'object' ? raw._sourceValues : {},
    },
  };
  entry.importFingerprint = absenceFingerprint(entry);

  const duplicate = Boolean(entry.importFingerprint && existingFingerprints.has(entry.importFingerprint));
  if (duplicate) {
    severity = 'existing';
    issues.push('Finnes allerede — hoppes over.');
  }

  const title = [
    date || 'Uten dato',
    entry.employeeName || employeeNumber || 'Uten ansatt',
  ].join(' · ');
  const meta = [
    entry.typeLabel,
    hours > 0 ? `${hours} t` : '',
    description,
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
    type: entry.type,
    typeLabel: entry.typeLabel,
    date,
    hours,
    description,
    duplicate,
  };
}

export function planAbsenceImport(existingAbsences, employees, rows) {
  const existingFingerprints = collectAbsenceFingerprints(existingAbsences);
  const planned = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    planned.push(companyAbsenceRow(raw, { employees, existingFingerprints }));
  }
  return { rows: planned };
}

export function linkAbsenceImportRowEmployee(row, employee) {
  if (!row || row.severity === 'existing' || !employee?.id || !row.entry) return row;
  const employeeName = displayName(employee) || text(row.employeeName);
  const employeeNumber = text(employee.company?.externalEmployeeNumber) || text(row.employeeNumber);
  const issues = (row.issues || []).filter((issue) => !/medarbeider|ansatt/i.test(issue));
  let severity = issues.length ? 'review' : 'ok';
  if (row.duplicate) severity = 'existing';
  const entry = {
    ...row.entry,
    employeeId: employee.id,
    employeeName,
    employeeNumber,
  };
  entry.importFingerprint = absenceFingerprint(entry);
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

export function linkAbsenceImportPlanEmployee(plan, rowIndex, employee, { applyGroup = true } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const target = rows[rowIndex];
  if (!target || !employee?.id) return plan;
  const key = fold(target.employeeNumber) || fold(target.employeeName);
  const nextRows = rows.map((row, index) => {
    if (index === rowIndex) return linkAbsenceImportRowEmployee(row, employee);
    if (
      applyGroup
      && key
      && !row.employeeId
      && (fold(row.employeeNumber) === key || fold(row.employeeName) === key)
    ) {
      return linkAbsenceImportRowEmployee(row, employee);
    }
    return row;
  });
  return { ...plan, rows: nextRows };
}

export async function readAbsenceTable(bytes, filename, { columnFields } = {}) {
  const tables = await readSpreadsheetTables(bytes, filename);
  if (!tables.length) throw new Error('Fant ingen tabell i filen.');
  let best = null;
  for (const sheet of tables) {
    const index = headerIndex(sheet.table || []);
    if (index < 0) continue;
    const fields = (sheet.table[index] || []).map((cell) => {
      if (columnFields && text(cell) && columnFields[text(cell)]) {
        return absenceColumnField(columnFields[text(cell)]) || absenceColumnField(cell);
      }
      return absenceColumnField(cell);
    });
    const score = fields.filter(Boolean).length;
    if (!best || score > best.score) best = { sheet, index, fields, score };
  }
  if (!best || best.score < 2) {
    throw new Error('Listen mangler kolonner for dato, medarbeider eller type. Bruk en fraværseksport med «Dato», «Medarbeider» og «Type».');
  }
  const headerCells = best.sheet.table[best.index] || [];
  const fields = best.fields;
  if (!fields.includes('date') && !fields.includes('hours') && !fields.includes('typeLabel')) {
    throw new Error('Listen mangler kolonne for dato, timer eller type.');
  }
  const importedAt = new Date().toISOString();
  const rows = [];
  for (const cells of best.sheet.table.slice(best.index + 1)) {
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
    if (looksLikeAbsenceRow(mapped)) rows.push(mapped);
  }
  if (!rows.length) throw new Error('Listen har ingen fraværsføringer.');
  return rows;
}

export async function readAbsenceImport(bytes, filename, {
  existingAbsences = [],
  employees = [],
} = {}) {
  const rows = await readAbsenceTable(bytes, filename);
  return planAbsenceImport(existingAbsences, employees, rows);
}

function includedIndexes(indexes, dropped) {
  return (indexes || []).filter((index) => !dropped.has(String(index)));
}

function blockTitle(row) {
  const label = text(row?.title);
  if (!label || /^\d+(\.\d+)?$/.test(label)) return 'Ugyldig rad';
  return label;
}

export function buildAbsenceImportReview(plan, { dropped = new Set() } = {}) {
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
          employeeName: row.employeeName || '',
          employeeNumber: row.employeeNumber || '',
          rowIndex: index,
        });
      }
      const group = reviewGroups.get(issueKey);
      group.indexes.push(index);
      if (group.sampleTitles.length < 4) group.sampleTitles.push(row.title);
      group.needsEmployee = group.needsEmployee || !row.employeeId;
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
      typeLabel: entry.typeLabel || row.typeLabel || '',
      hours: entry.hours,
      description: entry.description || '',
      status: entry.status || 'registrert',
    };
  });

  const okActive = includedIndexes(okIndexes, dropped);
  if (okIndexes.length) {
    cards.push({
      id: 'ok-group',
      severity: 'ok',
      included: okActive.length > 0,
      count: okActive.length,
      title: `${okIndexes.length} fraværsdager klare uten avvik`,
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
    if (!row.entry.employeeId) return;
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

export function toggleAbsenceReviewRow(dropped, reviewRow, plan) {
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

export const ABSENCE_IMPORT_ACCEPT = CUSTOMER_IMPORT_ACCEPT;
