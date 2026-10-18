/** Prosjekter på indekssiden: avtale, aktivitet siste 3 måneder, og deaktiverte. */

import { seriesById } from './catalog.js';
import { effectiveRegulation } from './settings.js';

export const INDEX_BANDS = [
  { id: 'aktiv', label: 'Aktive', lead: 'Timeføringer de siste 3 månedene.' },
  { id: 'inaktiv', label: 'Inaktive', lead: 'Ingen timeføringer de siste 3 månedene.' },
  { id: 'deaktivert', label: 'Deaktiverte', lead: 'Valgt ferdig eller deaktivert.' },
];

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a');
}

export function monthsBefore(iso, months = 3) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  if (!match) return '';
  const day = Number(match[3]);
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) - months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function isDeactivatedProject(project) {
  if (!project) return false;
  if (project.status === 'arkivert') return true;
  if (project.phase === 'avsluttet') return true;
  const key = fold(project.projectStatus);
  return key.includes('avslutt') || key.includes('ferdig') || key.includes('deaktiv') || key.includes('arkiv');
}

export function projectHasRecentHours(projectId, timeEntries, today) {
  const id = text(projectId);
  const day = text(today).slice(0, 10);
  const cutoff = monthsBefore(day, 3);
  if (!id || !cutoff) return false;
  return (Array.isArray(timeEntries) ? timeEntries : []).some((row) => {
    if (text(row?.projectId) !== id) return false;
    const date = text(row?.date).slice(0, 10);
    const hours = Number(row?.hours);
    return date >= cutoff && date <= day && hours > 0;
  });
}

export function projectBand(project, timeEntries, today) {
  if (isDeactivatedProject(project)) return 'deaktivert';
  if (projectHasRecentHours(project?.id, timeEntries, today)) return 'aktiv';
  return 'inaktiv';
}

export function contractsForProject(contracts, project) {
  const id = text(project?.id);
  const contractId = text(project?.contractId);
  const rows = Array.isArray(contracts) ? contracts : [];
  return rows.filter((row) => (
    (id && text(row?.projectId) === id)
    || (contractId && row?.id === contractId)
  ));
}

export function projectHasAgreement(project, contracts) {
  if (contractsForProject(contracts, project).length) return true;
  return !!text(project?.contractId);
}

export function hasCalculationBasis(contract) {
  if (!contract) return false;
  const fields = contract.fields && typeof contract.fields === 'object' ? contract.fields : {};
  const draft = contract.indexDraft && typeof contract.indexDraft === 'object' ? contract.indexDraft : {};
  const indexId = text(fields.indexId || draft.indexId);
  if (!indexId) return false;
  const value = Number(contract.value);
  const lines = [...(Array.isArray(fields.lines) ? fields.lines : []), ...(Array.isArray(draft.lines) ? draft.lines : [])];
  const hasMoney = (Number.isFinite(value) && value > 0)
    || lines.some((line) => text(line?.rate));
  const hasAnchor = [
    fields.indexBase,
    fields.contractDate,
    fields.offerDate,
    fields.tenderDeadline,
    draft.contractDate,
    draft.offerDate,
    draft.tenderDeadline,
    contract.start,
  ].some((value) => text(value));
  return hasMoney && hasAnchor;
}

function projectName(project) {
  return text(project?.name || project?.title) || 'Prosjekt uten navn';
}

export function projectNeedsIndexAttention({
  project,
  contracts = [],
  timeEntries = [],
  dueById = {},
  today = '',
} = {}) {
  if (!project || projectBand(project, timeEntries, today) !== 'aktiv') return null;
  if (!projectHasAgreement(project, contracts)) return null;
  const targets = [];
  contractsForProject(contracts, project).forEach((contract) => {
    const settings = effectiveRegulation(contract, contracts);
    if (settings.regulatesHere) {
      targets.push(contract);
      return;
    }
    const parent = contracts.find((row) => row.id === contract.parentId);
    if (parent) targets.push(parent);
  });
  const seen = new Set();
  for (const contract of targets) {
    if (!contract?.id || seen.has(contract.id)) continue;
    seen.add(contract.id);
    if (!hasCalculationBasis(contract)) continue;
    const status = dueById?.[contract.id];
    if (!status?.due) continue;
    const series = seriesById(status.indexId);
    return {
      contractId: contract.id,
      reason: status.reason || 'Ny indeks krever regulering.',
      indexId: status.indexId || '',
      indexName: status.name || series?.name || '',
      table: status.table || series?.table || '',
    };
  }
  return null;
}

function matchesQuery(project, related, query) {
  const q = fold(query);
  if (!q) return true;
  const hay = [
    projectName(project),
    project?.number,
    project?.client,
    project?.projectStatus,
    ...related.map((row) => `${row.title || ''} ${row.buyer || ''}`),
  ].join(' ');
  return fold(hay).includes(q);
}

function emptyBands() {
  return { aktiv: [], inaktiv: [], deaktivert: [] };
}

export function indexProjectGroups({
  projects = [],
  contracts = [],
  timeEntries = [],
  dueById = {},
  today = '',
  query = '',
} = {}) {
  const withAgreement = emptyBands();
  const withoutAgreement = emptyBands();
  const linked = new Set();
  (Array.isArray(projects) ? projects : []).forEach((project) => {
    if (!project?.id) return;
    const related = contractsForProject(contracts, project);
    related.forEach((row) => linked.add(row.id));
    if (!matchesQuery(project, related, query)) return;
    const band = projectBand(project, timeEntries, today);
    const hasAgreement = projectHasAgreement(project, contracts);
    const attention = hasAgreement
      ? projectNeedsIndexAttention({ project, contracts, timeEntries, dueById, today })
      : null;
    const row = {
      project,
      band,
      hasAgreement,
      attention,
      contracts: related,
      title: projectName(project),
    };
    (hasAgreement ? withAgreement : withoutAgreement)[band].push(row);
  });
  const sortRows = (rows) => rows.sort((a, b) => {
    if (!!a.attention !== !!b.attention) return a.attention ? -1 : 1;
    return a.title.localeCompare(b.title, 'nb');
  });
  INDEX_BANDS.forEach((band) => {
    sortRows(withAgreement[band.id]);
    sortRows(withoutAgreement[band.id]);
  });
  const q = fold(query);
  const unassigned = (Array.isArray(contracts) ? contracts : []).filter((row) => {
    if (!row?.id || linked.has(row.id)) return false;
    if (text(row.projectId)) return false;
    if (!q) return true;
    return fold(`${row.title} ${row.buyer}`).includes(q);
  });
  return { withAgreement, withoutAgreement, unassigned };
}

export function invoiceIndexWarning({
  projectId,
  projects = [],
  contracts = [],
  timeEntries = [],
  dueById = {},
  today = '',
} = {}) {
  const project = (Array.isArray(projects) ? projects : []).find((row) => row?.id === projectId);
  const attention = projectNeedsIndexAttention({
    project,
    contracts,
    timeEntries,
    dueById,
    today,
  });
  if (!attention) return null;
  return {
    projectId: project.id,
    projectName: projectName(project),
    ...attention,
  };
}

function letterRows(contracts) {
  const rows = [];
  (Array.isArray(contracts) ? contracts : []).forEach((contract) => {
    (Array.isArray(contract?.regulations) ? contract.regulations : []).forEach((entry) => {
      if (!entry?.id) return;
      rows.push({
        ...entry,
        contractId: contract.id,
        contractTitle: entry.contractTitle || contract.title || 'Avtale',
        customerId: entry.customerId || contract.customerId || '',
        projectId: entry.projectId || contract.projectId || '',
        buyer: contract.buyer || '',
      });
    });
  });
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.contractId}:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

export function lettersForProject(project, contracts = []) {
  const related = contractsForProject(contracts, project);
  const extra = [];
  related.forEach((contract) => {
    if (!contract?.parentId) return;
    const parent = contracts.find((row) => row.id === contract.parentId);
    if (parent && effectiveRegulation(parent, contracts).scope === 'ramme') extra.push(parent);
  });
  return letterRows([...related, ...extra]);
}

export function lettersForCustomer(customer, contracts = []) {
  if (!customer) return [];
  const related = (Array.isArray(contracts) ? contracts : []).filter((row) => (
    row?.customerId === customer.id
    || (!row?.customerId && fold(row?.buyer) && fold(row.buyer) === fold(customer.name))
  ));
  return letterRows(related);
}
