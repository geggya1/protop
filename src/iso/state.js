/**
 * Samlet ISO-tilstand i minnet. Lagres som én Firestore-samling per entitetstype
 * (se storage.js). Ingen eksempeldata legges inn i produksjon (T30).
 */
import { DEFAULT_RISK_METHOD, STANDARDS, canonicalRequirementId, cleanEditions } from './catalog.js';
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
    restrictedGrants: { uids: [], people: [], readable: false },
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
    // Utgave per standard (ISO-09). Tomt = utgaven i kravbiblioteket.
    editions: cleanEditions(raw.editions),
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
  state.restrictedGrants = parts.restrictedGrants || { uids: [], people: [], readable: false };
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
  return migrateRequirementRefs(state);
}

function canonIds(list) {
  const ids = Array.isArray(list) ? list : [];
  const next = [...new Set(ids.map(canonicalRequirementId))];
  return next.length !== ids.length || next.some((x, i) => x !== ids[i]) ? next : null;
}

/**
 * Eldre krav-id-er med utgave (req_9001_2026_context) gjøres om til id-er uten utgave når tilstanden lastes,
 * så vurderinger, bevis og koblinger følger kravet uansett valgt utgave (ISO-09). Postene lagres med ny
 * id neste gang de endres. state.idMigration sier hvor mange poster som ble flyttet.
 */
export function migrateRequirementRefs(state) {
  let moved = 0;
  const one = (row, key) => {
    const id = canonicalRequirementId(row?.[key]);
    if (!row || id === row[key]) return row;
    moved += 1;
    return { ...row, [key]: id };
  };
  const many = (row, key) => {
    const next = canonIds(row?.[key]);
    if (!next) return row;
    moved += 1;
    return { ...row, [key]: next };
  };
  state.assessments = state.assessments.map((a) => one(a, 'requirementId'));
  state.evidenceLinks = state.evidenceLinks.map((l) => one(l, 'requirementId'));
  state.documents = state.documents.map((d) => many(d, 'requirementIds'));
  state.processes = state.processes.map((p) => many(p, 'requirementIds'));
  state.findings = state.findings.map((f) => {
    const next = canonIds(f.links?.requirementIds);
    if (!next) return f;
    moved += 1;
    return { ...f, links: { ...f.links, requirementIds: next } };
  });
  for (const key of Object.keys(state.records)) {
    state.records[key] = state.records[key].map((r) => {
      let row = many(r, 'requirementIds');
      if (Array.isArray(row.findings) && row.findings.some((x) => canonIds(x?.requirementIds))) {
        moved += 1;
        row = { ...row, findings: row.findings.map((x) => { const next = canonIds(x?.requirementIds); return next ? { ...x, requirementIds: next } : x; }) };
      }
      return row;
    });
  }
  state.idMigration = moved;
  return state;
}

/**
 * En sak slik den står i skyen nå (lytter på åpen sak, DRIFT-23). Bare en nyere revisjon enn den
 * lokale tas inn, så en lagring som er på vei ikke overskrives av et eldre øyeblikksbilde.
 * Returnerer samme tilstand når ingenting er nytt.
 */
export function mergeRemoteFinding(state, remote) {
  if (!state || !remote?.id) return state;
  const local = (state.findings || []).find((f) => f.id === remote.id);
  if (local && (Number(remote.rev) || 0) <= (Number(local.rev) || 0)) return state;
  const row = { ...remote, restricted: !!remote.restricted };
  const ids = canonIds(row.links?.requirementIds);
  return replaceIn(state, 'findings', ids ? { ...row, links: { ...row.links, requirementIds: ids } } : row);
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
