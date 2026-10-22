/**
 * Samlet ISO-tilstand i minnet. Lagres som én Firestore-samling per entitetstype
 * (se storage.js). Ingen eksempeldata legges inn i produksjon (T30).
 */
import { DEFAULT_RISK_METHOD, STANDARDS } from './catalog.js';
import { REGISTERS } from './registers.js';
import { text, uniq } from './core.js';

export const COLLECTIONS = {
  findings: 'isoFindings',
  restrictedFindings: 'isoFindingsRestricted',
  processes: 'isoProcesses',
  instances: 'isoInstances',
  documents: 'isoDocuments',
  forms: 'isoForms',
  submissions: 'isoSubmissions',
  requirements: 'isoRequirements',
  assessments: 'isoAssessments',
  evidence: 'isoEvidence',
  evidenceLinks: 'isoEvidenceLinks',
  records: 'isoRecords',
};

export function emptySystem() {
  return {
    name: '',
    scopeText: '',
    standards: [],
    units: '',
    locations: '',
    activities: '',
    exclusions: '',
    ownerName: '',
    ownerUid: '',
    riskMethod: DEFAULT_RISK_METHOD,
    roleMap: {},
    setupAt: '',
    setupBy: '',
    rev: 0,
  };
}

export function emptyIsoState() {
  return {
    system: emptySystem(),
    findings: [],
    processes: [],
    instances: [],
    documents: [],
    forms: [],
    submissions: [],
    requirements: [],
    assessments: [],
    evidence: [],
    evidenceLinks: [],
    records: Object.fromEntries(Object.keys(REGISTERS).map((k) => [k, []])),
  };
}

export function normalizeSystem(raw) {
  const base = emptySystem();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    name: text(raw.name, 200),
    scopeText: text(raw.scopeText, 4000),
    standards: uniq(raw.standards).filter((code) => STANDARDS.some((s) => s.code === code)),
    riskMethod: raw.riskMethod?.thresholds ? raw.riskMethod : DEFAULT_RISK_METHOD,
    roleMap: raw.roleMap && typeof raw.roleMap === 'object' ? raw.roleMap : {},
  };
}

export function isSetUp(state) {
  return !!(state?.system?.standards?.length && state?.system?.setupAt);
}

/** Bygg tilstand fra rå lister per samling. */
export function stateFromCollections(parts) {
  const state = emptyIsoState();
  state.system = normalizeSystem(parts.system);
  for (const key of ['processes', 'instances', 'documents', 'forms', 'submissions', 'requirements', 'assessments', 'evidence', 'evidenceLinks']) {
    state[key] = Array.isArray(parts[key]) ? parts[key].filter((r) => r?.id) : [];
  }
  const open = (parts.findings || []).filter((r) => r?.id).map((r) => ({ ...r, restricted: false }));
  const restricted = (parts.restrictedFindings || []).filter((r) => r?.id).map((r) => ({ ...r, restricted: true }));
  state.findings = [...open, ...restricted].sort((a, b) => String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')));
  for (const row of parts.records || []) {
    if (!row?.id || !REGISTERS[row.register]) continue;
    state.records[row.register].push(row);
  }
  return state;
}

/** Hvilken samling en entitet hører til. Skjermede avvik lagres separat. */
export function collectionFor(kind, entity) {
  if (kind === 'findings') return entity?.restricted ? COLLECTIONS.restrictedFindings : COLLECTIONS.findings;
  return COLLECTIONS[kind] || '';
}

export function replaceIn(state, kind, entity) {
  if (kind === 'records') {
    const list = state.records[entity.register] || [];
    const idx = list.findIndex((r) => r.id === entity.id);
    const nextList = idx < 0 ? [...list, entity] : list.map((r) => (r.id === entity.id ? entity : r));
    return { ...state, records: { ...state.records, [entity.register]: nextList } };
  }
  if (kind === 'system') return { ...state, system: normalizeSystem(entity) };
  const list = state[kind] || [];
  const idx = list.findIndex((r) => r.id === entity.id);
  return { ...state, [kind]: idx < 0 ? [entity, ...list] : list.map((r) => (r.id === entity.id ? entity : r)) };
}
