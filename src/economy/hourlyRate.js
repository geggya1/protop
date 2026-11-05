/**
 * Timepris i én rekkefølge (DS-12): prisversjon i avtalen, så prosjektets timepris,
 * så den ansattes timepris, så selskapets standard. Svaret sier hvor satsen kom fra,
 * så grensesnittet kan vise det.
 *
 * Til fakturering bruker i dag de to første trinnene (billingReady.hourlyRateFor).
 */
import { rateOnDate } from '../indeksregulering/cases.js';

export const RATE_SOURCES = [
  { id: 'contract', label: 'fra avtalen' },
  { id: 'project', label: 'fra prosjektet' },
  { id: 'employee', label: 'fra den ansatte' },
  { id: 'company', label: 'selskapets standard' },
];

export function rateSourceLabel(id) {
  return RATE_SOURCES.find((row) => row.id === id)?.label || '';
}

function positive(value) {
  if (value == null || value === '') return null;
  const rate = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Prisversjonene i avtalene som hører til prosjektet. */
export function contractRateVersions(project, contracts = []) {
  return (Array.isArray(contracts) ? contracts : []).flatMap((row) => {
    if (!row) return [];
    const linked = (project?.id && row.projectId === project.id)
      || (project?.contractId && row.id === project.contractId);
    return linked && Array.isArray(row.priceVersions) ? row.priceVersions : [];
  });
}

export function projectHourlyRate(project) {
  const settings = project?.pricingSettings || {};
  return positive(settings.hourlyRate ?? settings.ensTimepris ?? settings.rate);
}

/**
 * Den ansattes timepris: feltet på ansattkortet (Arbeid → Mål og timepris), ellers
 * overstyringen under Inntjening (economy/earnings.employees[id].billableRate).
 */
export function employeeHourlyRate(employee, earnings = null) {
  const own = positive(employee?.extras?.timeSettings?.hourlyRate);
  if (own != null) return own;
  const id = String(employee?.id || '').trim();
  return id ? positive(earnings?.employees?.[id]?.billableRate) : null;
}

export function companyHourlyRate(earnings = null) {
  return positive(earnings?.variables?.defaultBillableRate);
}

/**
 * { rate, source }. rate er null når ingen trinn har en sats.
 * steps begrenser hvilke trinn som brukes (standard: alle fire).
 */
export function resolveHourlyRate({
  project = null,
  contracts = [],
  date = '',
  employee = null,
  earnings = null,
  steps = null,
} = {}) {
  const allowed = (id) => !steps || steps.includes(id);
  if (allowed('contract')) {
    const indexed = rateOnDate(contractRateVersions(project, contracts), date);
    if (indexed != null && indexed > 0) return { rate: indexed, source: 'contract' };
  }
  if (allowed('project')) {
    const rate = projectHourlyRate(project);
    if (rate != null) return { rate, source: 'project' };
  }
  if (allowed('employee')) {
    const rate = employeeHourlyRate(employee, earnings);
    if (rate != null) return { rate, source: 'employee' };
  }
  if (allowed('company')) {
    const rate = companyHourlyRate(earnings);
    if (rate != null) return { rate, source: 'company' };
  }
  return { rate: null, source: '' };
}
