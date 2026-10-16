/**
 * Kjørebokflyt: prosjekt siste to måneder, sats, hensikt og tur/retur-kostnad.
 */

import { timesheetActivityRange } from '../arbeid/timesheetProjects.js';
import { parseHours } from '../arbeid/hours.js';
import { MILEAGE_RATE_TAX_FREE } from '../economy/mileage.js';
import { roundMoney } from '../economy/vat.js';

export const VISIT_PURPOSES = [
  { id: 'befaring', label: 'Befaring' },
  { id: 'mote', label: 'Møte' },
  { id: 'befaring-mote', label: 'Befaring og møte' },
  { id: 'service', label: 'Service' },
  { id: 'annet', label: 'Annet' },
];

function text(value) {
  return String(value ?? '').trim();
}

export function visitPurposeLabel(id, custom = '') {
  if (id === 'annet') return text(custom) || 'Annet';
  return VISIT_PURPOSES.find((row) => row.id === id)?.label || 'Befaring';
}

export function projectAddressLabel(project) {
  if (!project) return '';
  const place = [text(project.postalCode), text(project.placeName)].filter(Boolean).join(' ');
  return [text(project.street), place].filter(Boolean).join(', ');
}

export function companyAddressLabel(company) {
  if (!company) return '';
  return text(company.addressLabel)
    || text(company.forretning?.label)
    || [text(company.adresse), text(company.postnummer), text(company.poststed)].filter(Boolean).join(' ');
}

/**
 * Forslagslisten er den ansattes aktive prosjekt siste to måneder,
 * pluss stjernemerkede rader slik timelisten gjør. Søk åpner hele registeret.
 */
export function mileageProjectOptions(state, employeeId, { query = '', today = new Date() } = {}) {
  const q = text(query).toLowerCase();
  const projects = (state?.projects || []).filter((row) => row?.status !== 'arkivert' && row?.id);
  const range = timesheetActivityRange(today);
  const recent = new Set();
  for (const row of state?.timeEntries || []) {
    if (text(row.employeeId) !== text(employeeId)) continue;
    if (parseHours(row.hours) <= 0) continue;
    const date = text(row.date);
    if (!date || date < range.fromDate || date > range.toDate) continue;
    recent.add(text(row.projectId));
  }
  for (const member of state?.members || []) {
    if (text(member.employeeId) !== text(employeeId)) continue;
    if (member.active === false || !member.starred) continue;
    recent.add(text(member.projectId));
  }
  const ranked = projects.map((project) => ({
    project,
    recent: recent.has(project.id),
    address: projectAddressLabel(project),
    label: [project.number ? `#${project.number}` : '', project.name].filter(Boolean).join(' '),
  }));
  const pool = q
    ? ranked.filter((row) => `${row.label} ${row.project.client || ''} ${row.address}`.toLowerCase().includes(q))
    : ranked.filter((row) => row.recent);
  pool.sort((a, b) => (
    Number(b.recent) - Number(a.recent)
    || a.label.localeCompare(b.label, 'nb')
  ));
  return { range, options: pool };
}

export function mileageRate(policies = []) {
  const row = (policies || []).find((item) => item?.id === 'company') || (policies || [])[0];
  const rate = Number(row?.ratePerKm);
  if (Number.isFinite(rate) && rate > 0) {
    return { rate: roundMoney(rate), source: 'company', label: 'Selskapssats' };
  }
  return { rate: MILEAGE_RATE_TAX_FREE, source: 'statutory', label: 'Statens regulativ' };
}

export function sumCharges(charges = [], kind) {
  return roundMoney((charges || []).reduce((sum, row) => (
    !kind || row.kind === kind ? sum + (Number(row.amount) || 0) : sum
  ), 0));
}

export function roundTripKm(oneWayKm) {
  const one = Number(oneWayKm);
  if (!Number.isFinite(one) || one <= 0) return 0;
  return roundMoney(one * 2);
}

export function tripCost({ km = 0, rate = 0, tolls = 0, ferries = 0, parking = 0 } = {}) {
  const distance = Math.max(0, Number(km) || 0);
  const kroner = Math.max(0, Number(rate) || 0);
  const allowance = roundMoney(distance * kroner);
  const extras = roundMoney((Number(tolls) || 0) + (Number(ferries) || 0) + (Number(parking) || 0));
  return {
    allowance,
    extras,
    amount: roundMoney(allowance + extras),
  };
}
