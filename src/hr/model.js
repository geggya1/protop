/**
 * HR-modul v2 — fullverdig livsløp for medarbeidere og rekruttering.
 * Stamdata i Ansatte; HR eier avtaler, samtaler, saker, memo/filer, lønn,
 * compliance, stillinger og søknader (ATS-kanban).
 */
import {
  amlContractCompleteness,
  normalizeComplianceItem,
} from './compliance.js';
import { emptyHandbook, handbookHasContent, normalizeHandbook } from './handbook.js';
import { normalizeHmsCard } from './hmsCard.js';

export const HR_VERSION = 2;

export const REVIEW_STATUSES = [
  { id: 'planned', label: 'Planlagt' },
  { id: 'done', label: 'Gjennomført' },
  { id: 'cancelled', label: 'Avlyst' },
];

export const CASE_STATUSES = [
  { id: 'open', label: 'Åpen' },
  { id: 'watching', label: 'Under oppfølging' },
  { id: 'closed', label: 'Lukket' },
];

export const CASE_PRIORITIES = [
  { id: 'low', label: 'Lav' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'Høy' },
];

export const TASK_STATUSES = [
  { id: 'open', label: 'Åpen' },
  { id: 'doing', label: 'Pågår' },
  { id: 'done', label: 'Ferdig' },
];

export const CONTRACT_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'active', label: 'Aktiv' },
  { id: 'ended', label: 'Avsluttet' },
];

export const JOB_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'open', label: 'Åpen' },
  { id: 'paused', label: 'Pauset' },
  { id: 'closed', label: 'Lukket' },
];

/** Tre ATS-kolonner (brukerkrav) + utfall. */
export const APPLICATION_BOARD = [
  { id: 'received', label: 'Søknad mottatt', order: 1 },
  { id: 'processing', label: 'Til behandling', order: 2 },
  { id: 'completed', label: 'Ferdigbehandlet', order: 3 },
];

export const APPLICATION_OUTCOMES = [
  { id: 'pending', label: 'Under vurdering' },
  { id: 'hired', label: 'Vunnet / ansatt' },
  { id: 'rejected', label: 'Avslått' },
];

/** Bakoverkompatibilitet med v1-stadier. */
export const APPLICATION_STAGES = [
  { id: 'new', label: 'Ny', order: 1, board: 'received' },
  { id: 'screening', label: 'Screening', order: 2, board: 'processing' },
  { id: 'interview', label: 'Intervju', order: 3, board: 'processing' },
  { id: 'offer', label: 'Tilbud', order: 4, board: 'processing' },
  { id: 'hired', label: 'Ansatt', order: 5, board: 'completed', outcome: 'hired' },
  { id: 'rejected', label: 'Avslått', order: 6, board: 'completed', outcome: 'rejected' },
  { id: 'withdrawn', label: 'Trukket', order: 7, board: 'completed', outcome: 'rejected' },
];

export const SALARY_KINDS = [
  { id: 'actual', label: 'Gjeldende / historikk' },
  { id: 'planned', label: 'Neste år / planlagt' },
];

function text(value) {
  return String(value ?? '').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function choiceLabel(options, id) {
  const hit = (options || []).find((row) => row.id === id);
  return hit?.label || text(id);
}

export function emptyHrState() {
  return {
    version: HR_VERSION,
    contracts: [],
    reviews: [],
    cases: [],
    memos: [],
    tasks: [],
    salaries: [],
    jobs: [],
    applications: [],
    compliance: [],
    files: [],
    // HMS-kort per ansatt (kortnummer, utløpsdato, arbeidsgivers org.nr.). Se hmsCard.js.
    hmsCards: [],
    // Kjøringer av lagringstiden (hvem slettet hva og når). Se retention.js.
    retentionRuns: [],
    handbook: emptyHandbook(),
    updatedAt: '',
  };
}

function normalizeIsoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeList(rows, normalizeOne) {
  return (Array.isArray(rows) ? rows : []).map(normalizeOne).filter(Boolean);
}

function normalizeAttachment(row = {}) {
  if (!row || (!row.url && !row.name)) return null;
  return {
    id: text(row.id) || newId('att'),
    name: text(row.name) || 'Dokument',
    url: text(row.url),
    mime: text(row.mime),
    size: num(row.size, 0),
    uploadedAt: text(row.uploadedAt) || new Date().toISOString(),
  };
}

export function normalizeContract(row = {}) {
  const id = text(row.id) || newId('hrc');
  const next = {
    id,
    employeeId: text(row.employeeId),
    title: text(row.title) || 'Arbeidsavtale',
    status: text(row.status) || 'active',
    startDate: normalizeIsoDate(row.startDate),
    endDate: normalizeIsoDate(row.endDate),
    workPercent: text(row.workPercent) || '100',
    employmentType: text(row.employmentType),
    notes: text(row.notes),
    documentUrl: text(row.documentUrl),
    formTemplateId: text(row.formTemplateId),
    formSnapshot: row.formSnapshot && typeof row.formSnapshot === 'object' ? row.formSnapshot : null,
    attachments: normalizeList(row.attachments, normalizeAttachment),
    // AML § 14-6 nøkkeldata
    employerName: text(row.employerName),
    employeeName: text(row.employeeName),
    workplace: text(row.workplace),
    // Stilling (AML) — ikke det samme som avtalens dokumenttittel
    positionTitle: text(row.positionTitle)
      || text(row.jobTitle)
      || (
        text(row.title)
        && !/^arbeidsavtale/i.test(text(row.title))
          ? text(row.title)
          : ''
      ),
    roleDescription: text(row.roleDescription),
    temporaryBasis: text(row.temporaryBasis),
    probationMonths: text(row.probationMonths),
    holidayTerms: text(row.holidayTerms),
    noticePeriod: text(row.noticePeriod),
    terminationProcedure: text(row.terminationProcedure),
    salaryAmount: text(row.salaryAmount),
    salaryExtras: text(row.salaryExtras),
    paySchedule: text(row.paySchedule),
    workHours: text(row.workHours),
    overtimeTerms: text(row.overtimeTerms),
    breakLength: text(row.breakLength),
    specialWorkingHours: text(row.specialWorkingHours),
    collectiveAgreement: text(row.collectiveAgreement),
    hirerIdentity: text(row.hirerIdentity),
    competenceDevelopment: text(row.competenceDevelopment),
    pensionInsurance: text(row.pensionInsurance),
    passportOrId: text(row.passportOrId),
    loanOrAdvance: text(row.loanOrAdvance),
    otherTerms: text(row.otherTerms),
    ocrSource: text(row.ocrSource),
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
  next.aml = amlContractCompleteness(next);
  return next;
}

export function normalizeReview(row = {}) {
  return {
    id: text(row.id) || newId('hrr'),
    employeeId: text(row.employeeId),
    date: normalizeIsoDate(row.date),
    status: text(row.status) || 'planned',
    interviewer: text(row.interviewer),
    summary: text(row.summary),
    goals: text(row.goals),
    wellbeing: text(row.wellbeing),
    strengths: text(row.strengths),
    challenges: text(row.challenges),
    development: text(row.development),
    followUps: text(row.followUps),
    previousReviewId: text(row.previousReviewId),
    formTemplateId: text(row.formTemplateId),
    formSnapshot: row.formSnapshot && typeof row.formSnapshot === 'object' ? row.formSnapshot : null,
    pdfUrl: text(row.pdfUrl),
    employeeVisible: row.employeeVisible !== false,
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeCase(row = {}) {
  return {
    id: text(row.id) || newId('hrcase'),
    employeeId: text(row.employeeId),
    title: text(row.title) || 'Sak',
    status: text(row.status) || 'open',
    priority: text(row.priority) || 'normal',
    dueDate: normalizeIsoDate(row.dueDate),
    description: text(row.description),
    owner: text(row.owner),
    sourceReviewId: text(row.sourceReviewId),
    taskId: text(row.taskId),
    assigneeUid: text(row.assigneeUid),
    assigneeName: text(row.assigneeName),
    employeeVisible: !!row.employeeVisible,
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeMemo(row = {}) {
  return {
    id: text(row.id) || newId('hrmemo'),
    employeeId: text(row.employeeId),
    author: text(row.author),
    title: text(row.title) || 'Notat',
    body: text(row.body),
    employeeVisible: !!row.employeeVisible,
    attachments: normalizeList(row.attachments, normalizeAttachment),
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeTask(row = {}) {
  return {
    id: text(row.id) || newId('hrtask'),
    employeeId: text(row.employeeId),
    title: text(row.title) || 'Oppgave',
    status: text(row.status) || 'open',
    dueDate: normalizeIsoDate(row.dueDate),
    description: text(row.description),
    assignedBy: text(row.assignedBy),
    employeeVisible: row.employeeVisible !== false,
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeSalary(row = {}) {
  const annualAmount = num(row.annualAmount, 0);
  const previousAmount = num(row.previousAmount, 0);
  let changePercent = row.changePercent;
  if (changePercent == null && previousAmount > 0) {
    changePercent = Math.round(((annualAmount - previousAmount) / previousAmount) * 1000) / 10;
  }
  return {
    id: text(row.id) || newId('hrsal'),
    employeeId: text(row.employeeId),
    kind: text(row.kind) === 'planned' ? 'planned' : 'actual',
    effectiveDate: normalizeIsoDate(row.effectiveDate),
    annualAmount,
    previousAmount,
    changePercent: changePercent == null || changePercent === '' ? null : num(changePercent, 0),
    currency: text(row.currency) || 'NOK',
    reason: text(row.reason),
    notes: text(row.notes),
    memo: text(row.memo) || text(row.notes),
    employeeVisible: row.employeeVisible !== false,
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeJob(row = {}) {
  return {
    id: text(row.id) || newId('hrjob'),
    title: text(row.title) || 'Stillingsannonse',
    status: text(row.status) || 'draft',
    department: text(row.department),
    location: text(row.location),
    publishedAt: normalizeIsoDate(row.publishedAt),
    closesAt: normalizeIsoDate(row.closesAt),
    description: text(row.description),
    requirements: text(row.requirements),
    headcount: Math.max(1, Math.round(num(row.headcount, 1))),
    attachments: normalizeList(row.attachments, normalizeAttachment),
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

function migrateBoard(stage, board, outcome) {
  if (APPLICATION_BOARD.some((b) => b.id === board)) {
    return {
      board,
      outcome: APPLICATION_OUTCOMES.some((o) => o.id === outcome) ? outcome : 'pending',
    };
  }
  const hit = APPLICATION_STAGES.find((s) => s.id === stage);
  if (hit) {
    return {
      board: hit.board || 'received',
      outcome: hit.outcome || (stage === 'hired' ? 'hired' : stage === 'rejected' || stage === 'withdrawn' ? 'rejected' : 'pending'),
    };
  }
  return { board: 'received', outcome: 'pending' };
}

export function normalizeApplication(row = {}) {
  const stage = text(row.stage) || 'new';
  const migrated = migrateBoard(stage, text(row.board), text(row.outcome));
  let stageOut = stage;
  if (migrated.outcome === 'hired') stageOut = 'hired';
  else if (migrated.outcome === 'rejected') stageOut = 'rejected';
  else if (migrated.board === 'received') stageOut = 'new';
  else if (migrated.board === 'processing') stageOut = stage === 'new' ? 'screening' : stage;
  else stageOut = stageOut || 'screening';

  return {
    id: text(row.id) || newId('hrapp'),
    jobId: text(row.jobId),
    name: text(row.name) || 'Søker',
    email: text(row.email).toLowerCase(),
    phone: text(row.phone),
    board: migrated.board,
    outcome: migrated.outcome,
    stage: stageOut,
    score: Math.min(10, Math.max(0, num(row.score, 0))),
    evaluation: text(row.evaluation),
    response: text(row.response),
    rejectReason: text(row.rejectReason),
    notes: text(row.notes),
    source: text(row.source),
    appliedAt: normalizeIsoDate(row.appliedAt) || localIsoDate(),
    attachments: normalizeList(row.attachments, normalizeAttachment),
    // Lagringstid (retention.js): når søknaden ble avgjort, og samtykke til å beholde den.
    closedAt: migrated.board === 'completed' && migrated.outcome !== 'pending' ? normalizeIsoDate(row.closedAt) : '',
    consentToKeep: row.consentToKeep === true,
    retainUntil: row.consentToKeep === true ? normalizeIsoDate(row.retainUntil) : '',
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

function normalizeRetentionRun(row = {}) {
  if (!row || typeof row !== 'object' || !text(row.at)) return null;
  return {
    at: text(row.at),
    byUid: text(row.byUid),
    byName: text(row.byName),
    applications: Math.max(0, Math.round(num(row.applications, 0))),
    employees: Math.max(0, Math.round(num(row.employees, 0))),
    rows: Math.max(0, Math.round(num(row.rows, 0))),
  };
}

export function normalizeHrFile(row = {}) {
  const att = normalizeAttachment(row);
  if (!att) return null;
  return {
    ...att,
    employeeId: text(row.employeeId),
    kind: text(row.kind) || 'document',
    memoId: text(row.memoId),
    contractId: text(row.contractId),
    applicationId: text(row.applicationId),
    // Standalone-filer er HR-interne som standard (ikke Min side).
    employeeVisible: !!row.employeeVisible,
  };
}

export function normalizeHrState(raw) {
  const base = emptyHrState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: HR_VERSION,
    contracts: normalizeList(raw.contracts, normalizeContract),
    reviews: normalizeList(raw.reviews, normalizeReview),
    cases: normalizeList(raw.cases, normalizeCase),
    memos: normalizeList(raw.memos, normalizeMemo),
    tasks: normalizeList(raw.tasks, normalizeTask),
    salaries: normalizeList(raw.salaries, normalizeSalary),
    jobs: normalizeList(raw.jobs, normalizeJob),
    applications: normalizeList(raw.applications, normalizeApplication),
    compliance: normalizeList(raw.compliance, normalizeComplianceItem),
    files: normalizeList(raw.files, normalizeHrFile),
    hmsCards: normalizeList(raw.hmsCards, normalizeHmsCard),
    retentionRuns: normalizeList(raw.retentionRuns, normalizeRetentionRun).slice(-20),
    handbook: normalizeHandbook(raw.handbook),
    updatedAt: text(raw.updatedAt),
  };
}

export function upsertRow(list, row, normalizeOne) {
  const next = normalizeOne(row);
  const rows = Array.isArray(list) ? [...list] : [];
  const idx = rows.findIndex((item) => item.id === next.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...next, updatedAt: new Date().toISOString() };
  else rows.unshift(next);
  return rows;
}

/** Sett inn/oppdater aktiv avtale og avslutt øvrige aktive for samme person. */
export function upsertActiveContract(list, contract) {
  const row = normalizeContract({ ...contract, status: 'active' });
  const emp = text(row.employeeId);
  const today = localIsoDate();
  const rest = (Array.isArray(list) ? list : [])
    .filter((item) => item.id !== row.id)
    .map((item) => {
      if (text(item.employeeId) === emp && item.status === 'active') {
        return {
          ...item,
          status: 'ended',
          endDate: item.endDate || today,
          updatedAt: new Date().toISOString(),
        };
      }
      return item;
    });
  return [row, ...rest];
}

export function removeRow(list, id) {
  const wanted = text(id);
  return (Array.isArray(list) ? list : []).filter((row) => row.id !== wanted);
}

export function forEmployee(list, employeeId) {
  const id = text(employeeId);
  if (!id) return [];
  return (Array.isArray(list) ? list : []).filter((row) => text(row.employeeId) === id);
}

/** True når HR-state inneholder minst én lagret samling (ikke bare tom skall). */
export function hrStateHasData(state) {
  const src = normalizeHrState(state);
  return [
    'contracts', 'reviews', 'cases', 'memos', 'tasks',
    'salaries', 'jobs', 'applications', 'compliance', 'files', 'hmsCards',
  ].some((key) => (src[key] || []).length > 0) || handbookHasContent(src.handbook);
}

export function employeeVisibleSlice(state, employeeId) {
  const id = text(employeeId);
  const src = normalizeHrState(state);
  const visibleMemos = forEmployee(src.memos, id).filter((row) => row.employeeVisible);
  const visibleMemoIds = new Set(visibleMemos.map((row) => row.id));
  return {
    reviews: forEmployee(src.reviews, id).filter((row) => row.employeeVisible),
    cases: forEmployee(src.cases, id).filter((row) => row.employeeVisible),
    memos: visibleMemos,
    tasks: forEmployee(src.tasks, id).filter((row) => row.employeeVisible),
    salaries: forEmployee(src.salaries, id).filter((row) => row.employeeVisible),
    contracts: forEmployee(src.contracts, id).filter((row) => row.status === 'active' || row.status === 'ended'),
    hmsCards: forEmployee(src.hmsCards, id),
    // Memo-filer følger memo-synlighet; standalone krever employeeVisible.
    files: forEmployee(src.files, id).filter((file) => {
      if (file.memoId) return visibleMemoIds.has(file.memoId);
      return !!file.employeeVisible;
    }),
  };
}

function parseDateParts(iso) {
  const raw = normalizeIsoDate(iso);
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, iso: raw };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Kalenderdato i lokal tid, uten UTC-forskyvning (toISOString flytter dagen i Norge). */
export function localIsoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function calendarIso(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function nextOccurrence(monthDayIso, fromDate = new Date()) {
  const parts = parseDateParts(monthDayIso);
  if (!parts) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  if (Number.isNaN(from.getTime())) return null;
  const todayIso = localIsoDate(from);
  let year = from.getFullYear();
  let candidate = calendarIso(year, parts.m, parts.d);
  if (candidate < todayIso) {
    year += 1;
    candidate = calendarIso(year, parts.m, parts.d);
  }
  return candidate;
}

export function yearsBetween(fromIso, toDate = new Date()) {
  const parts = parseDateParts(fromIso);
  if (!parts) return null;
  const toParts = toDate instanceof Date
    ? parseDateParts(localIsoDate(toDate))
    : parseDateParts(toDate);
  if (!toParts) return null;
  let years = toParts.y - parts.y;
  const hadBirthday = toParts.m > parts.m || (toParts.m === parts.m && toParts.d >= parts.d);
  if (!hadBirthday) years -= 1;
  return Math.max(0, years);
}

export function daysUntil(iso, fromDate = new Date()) {
  const target = normalizeIsoDate(iso);
  if (!target) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  if (Number.isNaN(from.getTime())) return null;
  const fromIso = localIsoDate(from);
  const fromParts = parseDateParts(fromIso);
  const toParts = parseDateParts(target);
  if (!fromParts || !toParts) return null;
  const a = Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d);
  const b = Date.UTC(toParts.y, toParts.m - 1, toParts.d);
  return Math.round((b - a) / 86400000);
}

export function formatNbDate(iso) {
  const parts = parseDateParts(iso);
  if (!parts) return '';
  return `${String(parts.d).padStart(2, '0')}.${String(parts.m).padStart(2, '0')}.${parts.y}`;
}

export function formatMoney(amount, currency = 'NOK') {
  const n = num(amount, 0);
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: currency || 'NOK',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString('nb-NO')} ${currency || 'NOK'}`;
  }
}

/** Aktiv, deaktivert (inkl. sluttet) eller slettet. Permisjon telles som aktiv. */
export function employeeHrBucket(employee) {
  const status = text(employee?.company?.status);
  if (status === 'deleted') return 'deleted';
  if (status === 'inactive' || status === 'former') return 'inactive';
  return 'active';
}

export function filterHrEmployees(employees, bucket = 'active') {
  return (employees || []).filter((row) => {
    const group = employeeHrBucket(row);
    if (group === 'deleted') return false;
    if (bucket === 'all') return true;
    return group === bucket;
  });
}

export function countHrEmployees(employees) {
  const rows = employees || [];
  return {
    active: rows.filter((row) => employeeHrBucket(row) === 'active').length,
    inactive: rows.filter((row) => employeeHrBucket(row) === 'inactive').length,
  };
}

export function upcomingPeopleEvents(employees, { withinDays = 90, today = new Date() } = {}) {
  const events = [];
  const now = today instanceof Date ? today : new Date(today);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  const horizonIso = localIsoDate(horizon);

  for (const employee of employees || []) {
    const id = text(employee?.id);
    if (!id) continue;
    const name = text(
      [employee?.person?.firstName, employee?.person?.middleName, employee?.person?.lastName]
        .filter(Boolean)
        .join(' '),
    ) || 'Uten navn';
    const birth = normalizeIsoDate(employee?.person?.birthDate);
    if (birth) {
      const next = nextOccurrence(birth, now);
      if (next && next <= horizonIso) {
        const age = yearsBetween(birth, next);
        events.push({
          type: 'birthday',
          employeeId: id,
          name,
          date: next,
          days: daysUntil(next, now),
          label: age != null ? `Blir ${age} år` : 'Bursdag',
        });
      }
    }
    const hired = normalizeIsoDate(employee?.company?.periodFrom);
    if (hired) {
      const next = nextOccurrence(hired, now);
      if (next && next <= horizonIso) {
        const years = yearsBetween(hired, next);
        if (years > 0) {
          events.push({
            type: 'anniversary',
            employeeId: id,
            name,
            date: next,
            days: daysUntil(next, now),
            label: `${years}-årsjubileum`,
            years,
          });
        }
      }
    }
  }

  return events.sort((a, b) => (a.days ?? 999) - (b.days ?? 999) || String(a.date).localeCompare(String(b.date)));
}

export function activeContractFor(employeeId, contracts) {
  const rows = forEmployee(contracts, employeeId)
    .filter((row) => row.status === 'active')
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  return rows[0] || null;
}

export function currentSalaryFor(employeeId, salaries, { onDate = new Date() } = {}) {
  const iso = onDate instanceof Date
    ? localIsoDate(onDate)
    : normalizeIsoDate(onDate);
  const rows = forEmployee(salaries, employeeId)
    .filter((row) => row.kind === 'actual' && row.effectiveDate && row.effectiveDate <= iso)
    .sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  return rows[0] || null;
}

export function plannedSalariesFor(employeeId, salaries) {
  return forEmployee(salaries, employeeId)
    .filter((row) => row.kind === 'planned')
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
}

export function salarySeriesFor(employeeId, salaries) {
  return forEmployee(salaries, employeeId)
    .filter((row) => row.kind === 'actual' && row.effectiveDate)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
}

/** Grafserie med prosentendring mellom punkter. */
export function salarySeriesWithPercents(employeeId, salaries) {
  const series = salarySeriesFor(employeeId, salaries);
  return series.map((row, index) => {
    // Preferer lagret prosent (riktig når mellomliggende rader er skjult for ansatt).
    if (row.changePercent != null && row.changePercent !== '') {
      return { ...row, changePercent: Number(row.changePercent) };
    }
    const prev = series[index - 1];
    const changePercent = prev?.annualAmount
      ? Math.round(((row.annualAmount - prev.annualAmount) / prev.annualAmount) * 1000) / 10
      : null;
    return { ...row, changePercent };
  });
}

export function recruitmentFunnel(applications) {
  const boardCounts = Object.fromEntries(APPLICATION_BOARD.map((b) => [b.id, 0]));
  const outcomeCounts = { hired: 0, rejected: 0, pending: 0 };
  for (const row of applications || []) {
    if (boardCounts[row.board] != null) boardCounts[row.board] += 1;
    else boardCounts.received += 1;
    if (outcomeCounts[row.outcome] != null) outcomeCounts[row.outcome] += 1;
    else outcomeCounts.pending += 1;
  }
  return {
    board: APPLICATION_BOARD.map((col) => ({ ...col, count: boardCounts[col.id] || 0 })),
    outcomes: APPLICATION_OUTCOMES.map((o) => ({ ...o, count: outcomeCounts[o.id] || 0 })),
    // bakoverkompatibel liste
    stages: APPLICATION_STAGES.map((stage) => ({
      ...stage,
      count: (applications || []).filter((row) => row.stage === stage.id).length,
    })),
  };
}

export function applicationsByBoard(applications) {
  const buckets = Object.fromEntries(APPLICATION_BOARD.map((b) => [b.id, []]));
  for (const row of applications || []) {
    const key = buckets[row.board] ? row.board : 'received';
    buckets[key].push(row);
  }
  return buckets;
}

export function moveApplicationBoard(application, board, outcome) {
  const nextBoard = APPLICATION_BOARD.some((b) => b.id === board) ? board : 'received';
  let nextOutcome = APPLICATION_OUTCOMES.some((o) => o.id === outcome) ? outcome : application?.outcome || 'pending';
  // Utfall (vunnet/avslått) gjelder bare i ferdigbehandlet. Ellers tilbakestilles.
  if (nextBoard !== 'completed' && nextOutcome !== 'pending') nextOutcome = 'pending';
  // Ferdigbehandlet kan være «pending» til HR velger vunnet/avslått — ikke auto-avslå.
  // Avgjørelsesdatoen styrer lagringstiden; den settes når utfallet velges eller endres.
  const decided = nextBoard === 'completed' && nextOutcome !== 'pending';
  const sameDecision = decided && application?.outcome === nextOutcome && application?.board === 'completed';
  return normalizeApplication({
    ...application,
    board: nextBoard,
    outcome: nextOutcome,
    closedAt: decided ? (sameDecision && application?.closedAt ? application.closedAt : localIsoDate()) : '',
    stage: nextOutcome === 'hired'
      ? 'hired'
      : nextOutcome === 'rejected'
        ? 'rejected'
        : nextBoard === 'received'
          ? 'new'
          : nextBoard === 'completed'
            ? 'offer'
            : 'screening',
  });
}

export function openFollowUps(state) {
  const src = normalizeHrState(state);
  const byDue = (a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
  return {
    cases: src.cases.filter((row) => row.status !== 'closed').sort(byDue),
    tasks: src.tasks.filter((row) => row.status !== 'done').sort(byDue),
    reviews: src.reviews
      .filter((row) => row.status === 'planned')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
  };
}

export function expiringContracts(contracts, { withinDays = 60, today = new Date() } = {}) {
  const now = today instanceof Date ? today : new Date(today);
  const start = localIsoDate(now);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  const end = localIsoDate(horizon);
  return (contracts || [])
    .filter((row) => row.status === 'active' && row.endDate && row.endDate >= start && row.endDate <= end)
    .map((row) => ({ ...row, days: daysUntil(row.endDate, now) }))
    .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
}

export function compareReviews(current, previous) {
  if (!current) return null;
  const fields = ['summary', 'goals', 'wellbeing', 'strengths', 'challenges', 'development', 'followUps'];
  const deltas = fields.map((key) => ({
    key,
    label: choiceLabel([
      { id: 'summary', label: 'Sammendrag' },
      { id: 'goals', label: 'Mål' },
      { id: 'wellbeing', label: 'Trivsel' },
      { id: 'strengths', label: 'Styrker' },
      { id: 'challenges', label: 'Utfordringer' },
      { id: 'development', label: 'Utvikling' },
      { id: 'followUps', label: 'Oppfølging' },
    ], key),
    previous: text(previous?.[key]),
    current: text(current[key]),
    changed: text(previous?.[key]) !== text(current[key]),
  }));
  return {
    previousId: previous?.id || '',
    previousDate: previous?.date || '',
    deltas,
    hasChanges: deltas.some((d) => d.changed && d.previous),
  };
}

export function latestReviewsFor(employeeId, reviews, limit = 2) {
  return forEmployee(reviews, employeeId)
    .filter((row) => row.status === 'done')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

export function patchHrState(state, patch) {
  const next = normalizeHrState({ ...clone(normalizeHrState(state)), ...patch });
  next.updatedAt = new Date().toISOString();
  return next;
}

export function employeeDraftFromApplication(application, job = null) {
  const app = normalizeApplication(application || {});
  const parts = text(app.name).split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');
  return {
    person: {
      firstName,
      lastName,
      email: app.email,
      phone: app.phone,
    },
    company: {
      status: 'active',
      personnelKind: 'staff',
      title: text(job?.title),
      periodFrom: localIsoDate(),
      comment: [
        `Ansatt via rekruttering${job?.title ? ` · ${job.title}` : ''}`,
        text(app.notes),
      ].filter(Boolean).join(' — '),
    },
    applicationId: app.id,
    jobId: app.jobId,
  };
}

/** Onboarding-oppgaver ved ansettelse (BambooHR-mønster). */
export function onboardingTasksFor(employeeId, { assignedBy = '' } = {}) {
  const today = localIsoDate();
  return [
    'Signert arbeidsavtale på plass',
    'HMS-intro gjennomført',
    'Utstyr / tilganger',
    'Første medarbeidersamtale planlagt',
  ].map((title) => normalizeTask({
    employeeId,
    title,
    status: 'open',
    dueDate: today,
    assignedBy,
    employeeVisible: true,
  }));
}

/** Opprett planleggingssak fra jubileum/bursdag (dashboard one-click). */
export function caseFromPeopleEvent(event) {
  if (!event?.employeeId) return null;
  const kind = event.type === 'birthday' ? 'Bursdag' : 'Jubileum';
  return normalizeCase({
    employeeId: event.employeeId,
    title: `Planlegg ${kind.toLowerCase()}: ${event.label || kind}`,
    description: [
      event.name,
      event.label,
      event.date ? `Dato ${formatNbDate(event.date)}` : '',
      event.days != null ? `Om ${event.days} dager` : '',
    ].filter(Boolean).join(' · '),
    dueDate: event.date || '',
    priority: event.days != null && event.days <= 14 ? 'high' : 'normal',
    status: 'open',
  });
}

/** Opprett sak for utløpende kontrakt. */
export function caseFromExpiringContract(contract, { employeeName = '' } = {}) {
  if (!contract?.employeeId) return null;
  return normalizeCase({
    employeeId: contract.employeeId,
    title: `Forny / avslutt avtale: ${contract.title || 'Arbeidsavtale'}`,
    description: [
      employeeName,
      contract.endDate ? `Utløper ${formatNbDate(contract.endDate)}` : '',
      contract.days != null ? `${contract.days} dager igjen` : '',
    ].filter(Boolean).join(' · '),
    dueDate: contract.endDate || '',
    priority: contract.days != null && contract.days <= 30 ? 'high' : 'normal',
    status: 'open',
  });
}

/**
 * Oppgaveutkast til oppgavemodulen. Tittel, frist og tekst kommer fra saken.
 * Ansvaret settes på den som planlegger.
 */
export function followUpTaskFromCase(caseRow, { assigneeUid = '', assigneeName = '' } = {}) {
  const row = normalizeCase(caseRow || {});
  if (!row.id || !row.title || row.title === 'Sak') return null;
  const owner = text(assigneeName);
  const responsible = text(assigneeUid);
  return {
    title: row.title,
    description: [
      row.description,
      owner ? `Ansvar: ${owner}` : '',
      'Opprettet fra HR-oppfølging.',
    ].filter(Boolean).join('\n'),
    deadline: row.dueDate || null,
    assignedTo: responsible || null,
    assigneeName: owner,
    hrCaseId: row.id,
    source: `hr-case:${row.id}`,
  };
}

/** Samme felt som lagres i oppgavemodulen, uten tidsstempler. */
export function followUpParentTodo(draft, { uid = '', startKey = '', id = '' } = {}) {
  const actor = text(uid);
  const assignedTo = text(draft?.assignedTo) || actor || null;
  return {
    id: text(id),
    title: text(draft?.title) || 'Oppgave',
    description: text(draft?.description),
    deadline: draft?.deadline || null,
    deadlineTime: null,
    participants: [],
    assignedTo,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: actor || null,
    startKey: text(startKey) || null,
    order: 0,
    source: text(draft?.source) || 'hr-followup',
    hrCaseId: text(draft?.hrCaseId) || null,
  };
}

/**
 * Legg inn planleggingssaken, eller knytt oppgave-id til åpen sak med samme tittel.
 * Returnerer uendret liste når saken allerede har oppgaven.
 */
export function planFollowUpCases(cases, caseRow, link = {}) {
  const row = normalizeCase({
    ...caseRow,
    taskId: link.taskId || caseRow?.taskId,
    assigneeUid: link.assigneeUid || caseRow?.assigneeUid,
    assigneeName: link.assigneeName || caseRow?.assigneeName,
  });
  const list = Array.isArray(cases) ? [...cases] : [];
  const existing = list.find((item) => (
    item.status !== 'closed'
    && text(item.employeeId) === text(row.employeeId)
    && text(item.title).toLowerCase() === text(row.title).toLowerCase()
  ));
  if (!existing) {
    return {
      created: true,
      linked: !!row.taskId,
      case: row,
      cases: [row, ...list],
    };
  }
  const next = normalizeCase({
    ...existing,
    taskId: existing.taskId || row.taskId,
    assigneeUid: existing.assigneeUid || row.assigneeUid,
    assigneeName: existing.assigneeName || row.assigneeName,
    description: existing.description || row.description,
    dueDate: existing.dueDate || row.dueDate,
  });
  const linked = !text(existing.taskId) && !!text(next.taskId);
  const same = !linked
    && text(existing.taskId) === text(next.taskId)
    && text(existing.assigneeUid) === text(next.assigneeUid)
    && text(existing.assigneeName) === text(next.assigneeName);
  return {
    created: false,
    linked,
    case: text(existing.taskId) ? existing : next,
    cases: same ? list : list.map((item) => (item.id === existing.id ? next : item)),
  };
}

/** Finnes allerede åpen sak med samme tittel for personen? */
export function hasOpenCaseLike(cases, { employeeId, title }) {
  const id = text(employeeId);
  const t = text(title).toLowerCase();
  return (cases || []).some(
    (row) => row.status !== 'closed'
      && text(row.employeeId) === id
      && text(row.title).toLowerCase() === t,
  );
}

export {
  text as hrText,
  normalizeIsoDate,
  clone as cloneHr,
};
