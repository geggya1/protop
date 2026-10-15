/**
 * HR-modul v2 — fullverdig livsløp for medarbeidere og rekruttering.
 * Stamdata i Ansatte; HR eier avtaler, samtaler, saker, memo/filer, lønn,
 * compliance, stillinger og søknader (ATS-kanban).
 */
import {
  amlContractCompleteness,
  normalizeComplianceItem,
} from './compliance.js';

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
    salaryAmount: text(row.salaryAmount),
    salaryExtras: text(row.salaryExtras),
    paySchedule: text(row.paySchedule),
    workHours: text(row.workHours),
    breakLength: text(row.breakLength),
    collectiveAgreement: text(row.collectiveAgreement),
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
    appliedAt: normalizeIsoDate(row.appliedAt) || new Date().toISOString().slice(0, 10),
    attachments: normalizeList(row.attachments, normalizeAttachment),
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
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

export function removeRow(list, id) {
  const wanted = text(id);
  return (Array.isArray(list) ? list : []).filter((row) => row.id !== wanted);
}

export function forEmployee(list, employeeId) {
  const id = text(employeeId);
  if (!id) return [];
  return (Array.isArray(list) ? list : []).filter((row) => text(row.employeeId) === id);
}

export function employeeVisibleSlice(state, employeeId) {
  const id = text(employeeId);
  const src = normalizeHrState(state);
  return {
    reviews: forEmployee(src.reviews, id).filter((row) => row.employeeVisible),
    cases: forEmployee(src.cases, id).filter((row) => row.employeeVisible),
    memos: forEmployee(src.memos, id).filter((row) => row.employeeVisible),
    tasks: forEmployee(src.tasks, id).filter((row) => row.employeeVisible),
    salaries: forEmployee(src.salaries, id).filter((row) => row.employeeVisible),
    contracts: forEmployee(src.contracts, id).filter((row) => row.status === 'active' || row.status === 'ended'),
    files: forEmployee(src.files, id),
  };
}

function parseDateParts(iso) {
  const raw = normalizeIsoDate(iso);
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, iso: raw };
}

export function nextOccurrence(monthDayIso, fromDate = new Date()) {
  const parts = parseDateParts(monthDayIso);
  if (!parts) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  if (Number.isNaN(from.getTime())) return null;
  const year = from.getFullYear();
  let candidate = new Date(year, parts.m - 1, parts.d);
  candidate.setHours(0, 0, 0, 0);
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  if (candidate < today) candidate = new Date(year + 1, parts.m - 1, parts.d);
  return candidate.toISOString().slice(0, 10);
}

export function yearsBetween(fromIso, toDate = new Date()) {
  const parts = parseDateParts(fromIso);
  if (!parts) return null;
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  if (Number.isNaN(to.getTime())) return null;
  let years = to.getFullYear() - parts.y;
  const hadBirthday = to.getMonth() + 1 > parts.m
    || (to.getMonth() + 1 === parts.m && to.getDate() >= parts.d);
  if (!hadBirthday) years -= 1;
  return Math.max(0, years);
}

export function daysUntil(iso, fromDate = new Date()) {
  const target = normalizeIsoDate(iso);
  if (!target) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const a = new Date(from.toISOString().slice(0, 10));
  const b = new Date(target);
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

export function upcomingPeopleEvents(employees, { withinDays = 90, today = new Date() } = {}) {
  const events = [];
  const now = today instanceof Date ? today : new Date(today);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

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
        const age = yearsBetween(birth, new Date(next));
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
        const years = yearsBetween(hired, new Date(next));
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
    ? onDate.toISOString().slice(0, 10)
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
    const prev = series[index - 1];
    const changePercent = prev?.annualAmount
      ? Math.round(((row.annualAmount - prev.annualAmount) / prev.annualAmount) * 1000) / 10
      : (row.changePercent ?? null);
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
  return normalizeApplication({
    ...application,
    board: nextBoard,
    outcome: nextOutcome,
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
  const start = now.toISOString().slice(0, 10);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  const end = horizon.toISOString().slice(0, 10);
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
      periodFrom: new Date().toISOString().slice(0, 10),
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
  const today = new Date().toISOString().slice(0, 10);
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
