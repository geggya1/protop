/**
 * Lagringstid for HR (L-07, GDPR art. 5(1)(e)). Ren logikk.
 *
 * Bedriften kan justere tidene under Selskapsinnstillinger → Personvern
 * (company.privacy.retention). Jobben kjøres i appen når noen med Admin på HR åpner HR
 * (CI deployer ikke planlagte jobber), og sletter det som har passert fristen:
 *   - søknader som er avslått (eller trukket): applicantMonths etter avgjørelsen, eller
 *     til datoen søkeren har samtykket til (retainUntil). Vedlegg i søknaden følger med.
 *   - personalmappen for tidligere ansatte (vurderinger, saker, notater, oppgaver, filer,
 *     avtaler, sjekkliste og HMS-kort): formerEmployeeYears etter sluttdatoen.
 *   - lønnshistorikken: PAYROLL_YEARS etter sluttdatoen (bokføringsloven § 13).
 * Timer og fravær er regnskaps- og lønnsgrunnlag og slettes ikke her. Brukslogg slettes
 * etter 90 dager på serveren (functions/usageLog.js).
 */
import { employmentEndDate, employmentStatusOf } from '../employees/employmentState.js';

export const RETENTION_DEFAULTS = { applicantMonths: 6, formerEmployeeYears: 3 };
export const RETENTION_LIMITS = {
  applicantMonths: { min: 1, max: 36 },
  formerEmployeeYears: { min: 1, max: 10 },
};
/** Lønnsgrunnlag beholdes i fem år (bokføringsloven § 13). Kan ikke settes lavere. */
export const PAYROLL_YEARS = 5;
/** Antall kjøringer som huskes i HR-tilstanden (hvem slettet hva og når). */
const MAX_RUNS = 20;

/** Lister i HR-tilstanden som er personalmappe for én ansatt (employeeId). */
export const PERSONNEL_LISTS = ['reviews', 'cases', 'memos', 'tasks', 'files', 'contracts', 'compliance', 'hmsCards'];

function text(value) {
  return String(value ?? '').trim();
}

function clampInt(value, { min, max }, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Bedriftens lagringstider, med standard og grenser. */
export function companyRetention(company) {
  const raw = company?.privacy?.retention && typeof company.privacy.retention === 'object'
    ? company.privacy.retention
    : {};
  return {
    applicantMonths: clampInt(raw.applicantMonths, RETENTION_LIMITS.applicantMonths, RETENTION_DEFAULTS.applicantMonths),
    formerEmployeeYears: clampInt(raw.formerEmployeeYears, RETENTION_LIMITS.formerEmployeeYears, RETENTION_DEFAULTS.formerEmployeeYears),
  };
}

/** Ny company.privacy med endret lagringstid. */
export function withCompanyRetention(company, key, value) {
  const current = companyRetention(company);
  const next = { ...current, [key]: value };
  return { ...(company?.privacy || {}), retention: companyRetention({ privacy: { retention: next } }) };
}

function isoDay(value) {
  const raw = text(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function localDay(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** åååå-mm-dd pluss måneder (siste dag i måneden ved overløp). */
export function addMonths(day, months) {
  const m = isoDay(day).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Number(months || 0);
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = Math.min(Number(m[3]), last);
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/** Hele dager fra i dag til dagen (negativ når den er passert). */
export function daysUntilDay(day, now = new Date()) {
  const target = isoDay(day);
  if (!target) return null;
  const a = Date.UTC(...localDay(now).split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...target.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Math.round((b - a) / 86400000);
}

/** Søknaden er avgjort med avslag (eller trukket). Ansatte søkere følger personalmappen. */
export function applicationClosed(app) {
  return app?.board === 'completed' && app?.outcome === 'rejected';
}

/** Dagen søknaden slettes, eller '' når den ikke skal slettes ennå (ikke avgjort). */
export function applicationDeleteOn(app, policy = RETENTION_DEFAULTS) {
  if (!applicationClosed(app)) return '';
  const consent = isoDay(app.retainUntil);
  if (app.consentToKeep && consent) return consent;
  const decided = isoDay(app.closedAt) || isoDay(app.updatedAt) || isoDay(app.appliedAt);
  if (!decided) return '';
  return addMonths(decided, policy.applicantMonths);
}

/** Sluttdato for en tidligere ansatt: «Ansatt til», ellers sist endret. '' = fortsatt ansatt. */
export function formerEmployeeEnd(employee, now = new Date()) {
  const status = employmentStatusOf(employee);
  const end = employmentEndDate(employee);
  const today = localDay(now);
  if (end && end < today) return end;
  if (status === 'inactive' || status === 'deleted') return end || isoDay(employee?.updatedAt) || '';
  return '';
}

/** Når personalmappen og lønnshistorikken slettes for en tidligere ansatt. */
export function formerEmployeeDeleteOn(employee, policy = RETENTION_DEFAULTS, now = new Date()) {
  const end = formerEmployeeEnd(employee, now);
  if (!end) return { end: '', personnel: '', payroll: '' };
  return {
    end,
    personnel: addMonths(end, policy.formerEmployeeYears * 12),
    payroll: addMonths(end, Math.max(PAYROLL_YEARS, policy.formerEmployeeYears) * 12),
  };
}

function displayName(employee) {
  const p = employee?.person || {};
  return text([p.firstName, p.lastName].filter(Boolean).join(' ')) || text(employee?.name) || 'Tidligere ansatt';
}

/**
 * Hva jobben sletter nå, og hva som slettes snart.
 * state = HR-tilstanden, employees = bedriftens ansattposter (alle, også tidligere).
 * Svar: { state, changed, removed: { applications, employees }, upcoming }.
 */
export function hrRetentionPlan(state, { employees = [], policy = RETENTION_DEFAULTS, now = new Date(), actor = null } = {}) {
  const src = state && typeof state === 'object' ? state : {};
  const today = localDay(now);
  const removedApps = [];
  const upcoming = [];
  const applications = (src.applications || []).filter((app) => {
    const on = applicationDeleteOn(app, policy);
    if (!on) return true;
    if (on <= today) {
      removedApps.push({ id: app.id, name: text(app.name), deleteOn: on });
      return false;
    }
    upcoming.push({ kind: 'application', id: app.id, name: text(app.name), deleteOn: on });
    return true;
  });
  const goneApps = new Set(removedApps.map((row) => row.id));

  const personnelGone = new Set();
  const payrollGone = new Set();
  const removedEmployees = [];
  for (const employee of Array.isArray(employees) ? employees : []) {
    const id = text(employee?.id);
    if (!id) continue;
    const dates = formerEmployeeDeleteOn(employee, policy, now);
    if (!dates.end) continue;
    const name = displayName(employee);
    if (dates.personnel <= today) personnelGone.add(id);
    else upcoming.push({ kind: 'employee', id, name, deleteOn: dates.personnel });
    if (dates.payroll <= today) payrollGone.add(id);
  }

  const next = { ...src, applications };
  const counts = new Map();
  const count = (id) => { counts.set(id, (counts.get(id) || 0) + 1); };
  for (const key of PERSONNEL_LISTS) {
    const list = Array.isArray(src[key]) ? src[key] : [];
    next[key] = list.filter((row) => {
      if (key === 'files' && row?.applicationId && goneApps.has(row.applicationId)) return false;
      const emp = text(row?.employeeId);
      if (emp && personnelGone.has(emp)) {
        count(emp);
        return false;
      }
      return true;
    });
  }
  next.salaries = (Array.isArray(src.salaries) ? src.salaries : []).filter((row) => {
    const emp = text(row?.employeeId);
    if (emp && payrollGone.has(emp)) {
      count(emp);
      return false;
    }
    return true;
  });
  for (const [id, rows] of counts) {
    const employee = employees.find((row) => text(row?.id) === id);
    removedEmployees.push({ employeeId: id, name: displayName(employee), rows });
  }
  const changed = removedApps.length > 0 || removedEmployees.length > 0
    || (src.files || []).length !== next.files.length;
  if (changed) {
    const run = {
      at: (now instanceof Date ? now : new Date(now)).toISOString(),
      byUid: text(actor?.uid),
      byName: text(actor?.name),
      applications: removedApps.length,
      employees: removedEmployees.length,
      rows: removedEmployees.reduce((sum, row) => sum + row.rows, 0),
    };
    next.retentionRuns = [...(Array.isArray(src.retentionRuns) ? src.retentionRuns : []), run].slice(-MAX_RUNS);
  }
  upcoming.sort((a, b) => (a.deleteOn < b.deleteOn ? -1 : a.deleteOn > b.deleteOn ? 1 : 0));
  return {
    state: changed ? next : src,
    changed,
    removed: { applications: removedApps, employees: removedEmployees },
    upcoming,
  };
}

/** «Slettes om 12 dager» / «Slettes i dag» / ''. */
export function deleteCountdownLabel(day, now = new Date()) {
  const days = daysUntilDay(day, now);
  if (days == null) return '';
  if (days <= 0) return 'Slettes i dag';
  if (days === 1) return 'Slettes i morgen';
  return `Slettes om ${days} dager`;
}

/** Kort melding etter en kjøring, eller ''. */
export function retentionToast(plan) {
  const apps = plan?.removed?.applications?.length || 0;
  const people = plan?.removed?.employees?.length || 0;
  if (!apps && !people) return '';
  const parts = [];
  if (apps) parts.push(`${apps} ${apps === 1 ? 'søknad' : 'søknader'}`);
  if (people) parts.push(`HR-opplysninger om ${people} ${people === 1 ? 'tidligere ansatt' : 'tidligere ansatte'}`);
  return `Lagringstiden er ute: slettet ${parts.join(' og ')}.`;
}
