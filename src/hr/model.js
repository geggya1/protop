/**
 * HR-modul: livsløp for medarbeidere (kontrakter, samtaler, saker, memo,
 * oppgaver, lønn) og rekruttering (annonser, søknader).
 * Stamdata ligger i Ansatte-registeret; HR bygger oppå.
 */

export const HR_VERSION = 1;

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

/** ATS-pipeline inspirert av BambooHR/Personio. */
export const APPLICATION_STAGES = [
  { id: 'new', label: 'Ny', order: 1 },
  { id: 'screening', label: 'Screening', order: 2 },
  { id: 'interview', label: 'Intervju', order: 3 },
  { id: 'offer', label: 'Tilbud', order: 4 },
  { id: 'hired', label: 'Ansatt', order: 5 },
  { id: 'rejected', label: 'Avslått', order: 6 },
  { id: 'withdrawn', label: 'Trukket', order: 7 },
];

export const SALARY_KINDS = [
  { id: 'actual', label: 'Gjeldende / historikk' },
  { id: 'planned', label: 'Planlagt justering' },
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
    updatedAt: '',
  };
}

function normalizeIsoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeList(rows, normalizeOne) {
  return (Array.isArray(rows) ? rows : []).map(normalizeOne).filter(Boolean);
}

export function normalizeContract(row = {}) {
  const id = text(row.id) || newId('hrc');
  return {
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
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
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
  return {
    id: text(row.id) || newId('hrsal'),
    employeeId: text(row.employeeId),
    kind: text(row.kind) === 'planned' ? 'planned' : 'actual',
    effectiveDate: normalizeIsoDate(row.effectiveDate),
    annualAmount: num(row.annualAmount, 0),
    currency: text(row.currency) || 'NOK',
    reason: text(row.reason),
    notes: text(row.notes),
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
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeApplication(row = {}) {
  const stage = text(row.stage) || 'new';
  const known = APPLICATION_STAGES.some((s) => s.id === stage) ? stage : 'new';
  return {
    id: text(row.id) || newId('hrapp'),
    jobId: text(row.jobId),
    name: text(row.name) || 'Søker',
    email: text(row.email).toLowerCase(),
    phone: text(row.phone),
    stage: known,
    score: Math.min(10, Math.max(0, num(row.score, 0))),
    evaluation: text(row.evaluation),
    response: text(row.response),
    notes: text(row.notes),
    source: text(row.source),
    appliedAt: normalizeIsoDate(row.appliedAt) || new Date().toISOString().slice(0, 10),
    createdAt: text(row.createdAt) || new Date().toISOString(),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
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

/** Det den ansatte selv skal se på Min side. */
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
  };
}

function parseDateParts(iso) {
  const raw = normalizeIsoDate(iso);
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, iso: raw };
}

/** Neste forekomst av måned/dag fra referansedato (inkl. i dag). */
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

/**
 * Kommende bursdager og jubileum (ansettelsesdato) innenfor `withinDays`.
 */
export function upcomingPeopleEvents(employees, { withinDays = 45, today = new Date() } = {}) {
  const events = [];
  const now = today instanceof Date ? today : new Date(today);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);

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
      if (next && next <= horizon.toISOString().slice(0, 10)) {
        const age = yearsBetween(birth, new Date(next));
        events.push({
          type: 'birthday',
          employeeId: id,
          name,
          date: next,
          label: age != null ? `Blir ${age} år` : 'Bursdag',
        });
      }
    }
    const hired = normalizeIsoDate(employee?.company?.periodFrom);
    if (hired) {
      const next = nextOccurrence(hired, now);
      if (next && next <= horizon.toISOString().slice(0, 10)) {
        const years = yearsBetween(hired, new Date(next));
        if (years > 0) {
          events.push({
            type: 'anniversary',
            employeeId: id,
            name,
            date: next,
            label: `${years}-årsjubileum`,
            years,
          });
        }
      }
    }
  }

  return events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
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

export function recruitmentFunnel(applications) {
  const counts = Object.fromEntries(APPLICATION_STAGES.map((s) => [s.id, 0]));
  for (const row of applications || []) {
    if (counts[row.stage] != null) counts[row.stage] += 1;
    else counts.new += 1;
  }
  return APPLICATION_STAGES.map((stage) => ({
    ...stage,
    count: counts[stage.id] || 0,
  }));
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

/** Kontrakter som snart utløper (innen `withinDays`). */
export function expiringContracts(contracts, { withinDays = 60, today = new Date() } = {}) {
  const now = today instanceof Date ? today : new Date(today);
  const start = now.toISOString().slice(0, 10);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  const end = horizon.toISOString().slice(0, 10);
  return (contracts || [])
    .filter((row) => row.status === 'active' && row.endDate && row.endDate >= start && row.endDate <= end)
    .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
}

export function patchHrState(state, patch) {
  const next = normalizeHrState({ ...clone(normalizeHrState(state)), ...patch });
  next.updatedAt = new Date().toISOString();
  return next;
}

export {
  text as hrText,
  normalizeIsoDate,
  clone as cloneHr,
};
