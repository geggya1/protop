/**
 * HR-katalog: søk, intern/ekstern og aktiv/deaktivert.
 * Samlesider leser disse radene. Registrering skjer på den enkelte ansatte.
 */
import { displayName, personnelKind } from '../employees/model.js';
import { companyComplianceOverview } from './compliance.js';
import {
  CONTRACT_STATUSES,
  activeContractFor,
  choiceLabel,
  currentSalaryFor,
  employeeHrBucket,
  formatMoney,
  formatNbDate,
  latestReviewsFor,
  plannedSalariesFor,
} from './model.js';
import { summarizeProductivity } from './productivity.js';

export function hrKindBucket(employee) {
  const kind = personnelKind(employee);
  return kind === 'external' || kind === 'innleid' ? 'external' : 'internal';
}

export function hrKindLabel(employee) {
  const kind = personnelKind(employee);
  if (kind === 'innleid') return 'Innleid';
  if (kind === 'external') return 'Ekstern';
  return 'Intern';
}

/** Beholder rekkefølgen. Ukjent person telles som egen ansatt. */
export function splitPeopleEventsByKind(events, employees) {
  const kind = new Map();
  for (const row of employees || []) {
    if (row?.id) kind.set(row.id, hrKindBucket(row));
  }
  const internal = [];
  const external = [];
  for (const event of events || []) {
    if (kind.get(event.employeeId) === 'external') external.push(event);
    else internal.push(event);
  }
  return { internal, external };
}

export function filterHrDirectory(employees, {
  query = '',
  status = 'active',
  kind = 'all',
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (employees || [])
    .filter((row) => {
      const bucket = employeeHrBucket(row);
      if (bucket === 'deleted') return false;
      if (status && status !== 'all' && bucket !== status) return false;
      if (kind && kind !== 'all' && hrKindBucket(row) !== kind) return false;
      if (!q) return true;
      const hay = [
        displayName(row),
        row?.company?.title,
        row?.person?.email,
        row?.company?.email,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
}

/** Facet-tall: status innen valgt type, type innen valgt status. Søketeller ikke med. */
export function directoryFacetCounts(employees, { status = 'active', kind = 'all' } = {}) {
  const statusPool = filterHrDirectory(employees, { status: 'all', kind });
  const kindPool = filterHrDirectory(employees, { status, kind: 'all' });
  return {
    active: statusPool.filter((row) => employeeHrBucket(row) === 'active').length,
    inactive: statusPool.filter((row) => employeeHrBucket(row) === 'inactive').length,
    internal: kindPool.filter((row) => hrKindBucket(row) === 'internal').length,
    external: kindPool.filter((row) => hrKindBucket(row) === 'external').length,
  };
}

export function hrControlCells(employee, { hr = {}, entries = [] } = {}) {
  const id = employee?.id || '';
  const overview = companyComplianceOverview([employee], hr.compliance, {
    contracts: hr.contracts,
    reviews: hr.reviews,
    applyEvidence: true,
  })[0];
  const contract = id ? activeContractFor(id, hr.contracts) : null;
  const review = id ? (latestReviewsFor(id, hr.reviews, 1)[0] || null) : null;
  const salary = id ? currentSalaryFor(id, hr.salaries) : null;
  const planned = id ? (plannedSalariesFor(id, hr.salaries)[0] || null) : null;
  const utilization = summarizeProductivity(entries, { employeeId: id });
  const openCases = (hr.cases || []).filter((row) => row.employeeId === id && row.status !== 'closed').length;
  const openTasks = (hr.tasks || []).filter((row) => row.employeeId === id && row.status !== 'done').length;
  const hasHours = utilization.total > 0;
  return {
    kind: hrKindBucket(employee),
    kindLabel: hrKindLabel(employee),
    checklist: overview ? `${overview.ok}/${overview.total}` : '—',
    checklistPct: overview ? `${overview.pct} %` : '—',
    checklistOk: overview?.ok ?? 0,
    checklistMissing: overview?.missing ?? 0,
    contract: contract
      ? (contract.aml?.pct != null ? `AML ${contract.aml.pct} %` : 'Registrert')
      : 'Mangler',
    contractTitle: contract?.title || 'Mangler',
    contractStatus: contract ? choiceLabel(CONTRACT_STATUSES, contract.status) : 'Mangler',
    contractFrom: contract?.startDate ? formatNbDate(contract.startDate) : '—',
    contractAml: contract?.aml?.pct != null ? `${contract.aml.pct} %` : '—',
    review: review?.date ? formatNbDate(review.date) : 'Mangler',
    utilization: hasHours ? `${Number(utilization.utilizationPct || 0).toFixed(0)} %` : '—',
    billableHours: hasHours ? String(utilization.billable) : '—',
    totalHours: hasHours ? String(utilization.total) : '—',
    salary: salary ? formatMoney(salary.annualAmount, salary.currency) : 'Mangler',
    salaryFrom: salary?.effectiveDate ? formatNbDate(salary.effectiveDate) : '—',
    nextPlan: planned
      ? `${formatNbDate(planned.effectiveDate)} · ${formatMoney(planned.annualAmount, planned.currency)}`
      : '—',
    openCases: String(openCases),
    openTasks: String(openTasks),
  };
}
