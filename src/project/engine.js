import {
  ACCOUNTS,
  CHECKLIST_TEMPLATES,
  HOUR_ACCOUNTS,
  PHASES,
  account,
  costCode,
  defaultProcedures,
} from './catalog.js';
import {
  PROJECT_AUTO_KEYS,
  PROJECT_LEGACY_KEYS,
  feeEstimateFromSettings,
  normalizePricingModel,
  normalizePricingSettings,
  projectNumberKey,
  scrubProjectState,
} from './projectFields.js';
import { defaultWorkSettings } from '../arbeid/roles.js';
import { parseHours, roundHours } from '../arbeid/hours.js';

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function text(value) {
  return String(value || '').trim();
}

function canonicalProjectNumber(value) {
  return projectNumberKey(value) || text(value);
}

function findProjectByNumber(projects, number, { includeArchived = false } = {}) {
  const key = projectNumberKey(number);
  if (!key) return null;
  return (Array.isArray(projects) ? projects : []).find((project) => (
    projectNumberKey(project.number) === key
    && (includeArchived || project.status !== 'arkivert')
  )) || null;
}

export function emptyProjectState() {
  return {
    projects: [],
    activeProjectId: null,
    activities: [],
    members: [],
    timeEntries: [],
    absences: [],
    board: [],
    sja: [],
    incidents: [],
    inspections: [],
    deviations: [],
    checklists: [],
    documents: [],
    meetings: [],
    changes: [],
    contracts: [],
    entries: [],
    crew: [],
    waste: [],
    procedures: defaultProcedures(),
    audits: [],
    syncedAt: '',
  };
}

export function normalizeProjectState(raw) {
  const base = emptyProjectState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const next = {
    ...base,
    ...src,
    procedures: src.procedures?.length ? src.procedures : base.procedures,
    syncedAt: text(src.syncedAt),
  };
  for (const key of Object.keys(base)) {
    if (key === 'activeProjectId' || key === 'syncedAt') continue;
    if (!Array.isArray(next[key])) next[key] = [];
  }
  if (next.activeProjectId && !next.projects.some((p) => p.id === next.activeProjectId)) {
    next.activeProjectId = next.projects[0]?.id || null;
  }
  next.projects = next.projects.map((project) => ({
    ...project,
    workSettings: defaultWorkSettings(project?.workSettings),
  }));
  next.activities = next.activities.map((row) => normalizeActivityRow(row));
  next.members = next.members.map((row) => normalizeMemberRow(row)).filter(Boolean);
  next.timeEntries = next.timeEntries.map((row) => normalizeTimeEntryRow(row)).filter(Boolean);
  next.absences = next.absences.map((row) => normalizeAbsenceRow(row)).filter(Boolean);
  // Nullstill Moment-restfelter og økonomiske verdier som andre moduler fyller automatisk.
  return scrubProjectState(next);
}

function normalizeActivityRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    name: text(row.name) || 'Aktivitet',
    status: ['under_arbeid', 'avsluttet', 'planlagt'].includes(row.status) ? row.status : 'under_arbeid',
    estimatedHours: roundHours(row.estimatedHours),
    priceModelName: text(row.priceModelName),
    billable: row.billable !== false,
  };
}

function normalizeMemberRow(row) {
  if (!row || typeof row !== 'object') return null;
  const employeeId = text(row.employeeId);
  const projectId = text(row.projectId);
  if (!employeeId || !projectId) return null;
  return {
    id: text(row.id) || createId('mem'),
    projectId,
    employeeId,
    employeeName: text(row.employeeName),
    photoUrl: text(row.photoUrl),
    role: text(row.role) || 'Prosjektmedlem',
    active: row.active !== false,
    starred: !!row.starred,
    addedAt: text(row.addedAt) || '',
    addedByUid: text(row.addedByUid),
  };
}

function normalizeTimeEntryRow(row) {
  if (!row || typeof row !== 'object') return null;
  const projectId = text(row.projectId);
  const employeeId = text(row.employeeId);
  const date = text(row.date);
  if (!projectId || !employeeId || !date) return null;
  const hours = roundHours(row.hours);
  const billableHours = row.billableHours == null ? hours : roundHours(row.billableHours);
  return {
    id: text(row.id) || createId('tid'),
    projectId,
    employeeId,
    employeeName: text(row.employeeName),
    activityId: text(row.activityId) || null,
    activityName: text(row.activityName) || 'Hovedaktivitet',
    date,
    hours,
    billableHours,
    description: text(row.description),
    internalNote: text(row.internalNote),
    status: ['registrert', 'godkjent', 'låst'].includes(row.status) ? row.status : 'registrert',
    createdAt: text(row.createdAt) || '',
    updatedAt: text(row.updatedAt) || '',
    createdByUid: text(row.createdByUid),
  };
}

function normalizeAbsenceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const employeeId = text(row.employeeId);
  const date = text(row.date);
  if (!employeeId || !date) return null;
  return {
    id: text(row.id) || createId('fra'),
    employeeId,
    employeeName: text(row.employeeName),
    date,
    hours: roundHours(row.hours),
    type: text(row.type) || 'ferie',
    description: text(row.description),
    createdAt: text(row.createdAt) || '',
    createdByUid: text(row.createdByUid),
  };
}

function stamp() {
  return new Date().toISOString();
}

/** Oppdater prosjektets auto-felter for timer fra timeEntries. */
export function syncProjectHourRollups(state, projectId) {
  const id = projectId || state.activeProjectId;
  if (!id) return state;
  const rows = (state.timeEntries || []).filter((row) => row.projectId === id);
  const hoursPeriod = roundHours(rows.reduce((sum, row) => sum + parseHours(row.hours), 0));
  const billableHours = roundHours(rows.reduce((sum, row) => sum + parseHours(row.billableHours), 0));
  return {
    ...state,
    projects: state.projects.map((project) => (
      project.id === id
        ? { ...project, hoursPeriod, billableHours }
        : project
    )),
  };
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

function requireProject(state, projectId) {
  const id = projectId || state.activeProjectId;
  const project = state.projects.find((p) => p.id === id && p.status !== 'arkivert');
  if (!project) return { error: 'Velg et aktivt prosjekt.' };
  return { project };
}

/** Generelle prosjektfelter som importeres, registreres og lagres. */
export const PROJECT_DETAIL_KEYS = [
  'supplierLabel',
  'customerTags',
  'parentProjectId',
  'parentNumber',
  'parentName',
  'department',
  'inboxEmail',
  'projectStatus',
  'statusComment',
  'openedAt',
  'createdBy',
  'start',
  'end',
  'customerSegment',
  'marketArea',
  'projectTags',
  'size',
  'street',
  'postalCode',
  'placeName',
  'place',
  'cadastralId',
  'pricingModel',
  'feeEstimate',
  'billedOnPricingModels',
  'description',
  'exportStatus',
  'hoursPeriod',
  'billableHours',
  'toInvoice',
  'totalCost',
  'invoices',
  'estimatedIncome',
  'totalPlanned',
  'futurePlanned',
  'forecast',
  'estimatedCosts',
  'expenses',
  'estimatedResult',
  'estimatedResultPct',
  'profitFactor',
  'expectedProfitFactor',
];

const PROJECT_NUMERIC_KEYS = new Set([
  'feeEstimate',
  'billedOnPricingModels',
  'hoursPeriod',
  'billableHours',
  'toInvoice',
  'totalCost',
  'invoices',
  'estimatedIncome',
  'totalPlanned',
  'futurePlanned',
  'forecast',
  'estimatedCosts',
  'expenses',
  'estimatedResult',
  'estimatedResultPct',
  'profitFactor',
  'expectedProfitFactor',
]);

const PROJECT_NULL_ON_SAVE = new Set([...PROJECT_AUTO_KEYS, ...PROJECT_LEGACY_KEYS]);

function detailValue(key, value) {
  if (PROJECT_NULL_ON_SAVE.has(key)) return null;
  if (key === 'parentProjectId') return text(value) || null;
  if (key === 'pricingModel') return normalizePricingModel(value);
  if (PROJECT_NUMERIC_KEYS.has(key)) {
    if (value === '' || value == null) return null;
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : text(value);
  }
  return text(value);
}

function composePlace(input = {}, current = {}) {
  const street = input.street !== undefined ? text(input.street) : text(current.street);
  const postalCode = input.postalCode !== undefined ? text(input.postalCode) : text(current.postalCode);
  const placeName = input.placeName !== undefined ? text(input.placeName) : text(current.placeName);
  if (input.place !== undefined && text(input.place) && !street && !postalCode && !placeName) {
    return text(input.place);
  }
  const composed = [street, [postalCode, placeName].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (composed) return composed;
  if (input.place !== undefined) return text(input.place);
  return text(current.place);
}

function projectLinks(input = {}) {
  const agreementKind = text(input.agreementKind);
  return {
    customerId: text(input.customerId) || null,
    customerNumber: text(input.customerNumber),
    orgnr: text(input.orgnr),
    client: text(input.client),
    contractId: text(input.contractId) || null,
    frameworkAgreementId: text(input.frameworkAgreementId) || null,
    agreementKind: ['oppdrag', 'avrop', 'rammeavtale', 'annet'].includes(agreementKind) ? agreementKind : '',
  };
}

function normalizeDocRows(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((doc) => {
      if (!doc || typeof doc !== 'object') return null;
      const name = text(doc.name) || text(doc.title) || 'Dokument';
      return {
        id: text(doc.id) || createId('pdoc'),
        name,
        title: text(doc.title) || name,
        url: text(doc.url),
        storagePath: text(doc.storagePath),
        mimeType: text(doc.mimeType),
        size: Number(doc.size) || 0,
        source: text(doc.source) || 'upload',
        sourceId: text(doc.sourceId),
        uploadedAt: text(doc.uploadedAt) || '',
      };
    })
    .filter(Boolean);
}

export function projectDetails(input = {}, current = {}) {
  const details = {};
  for (const key of PROJECT_DETAIL_KEYS) {
    if (key === 'place') continue;
    if (PROJECT_NULL_ON_SAVE.has(key)) {
      details[key] = null;
      continue;
    }
    if (input[key] !== undefined) details[key] = detailValue(key, input[key]);
    else if (current[key] !== undefined) details[key] = detailValue(key, current[key]);
    else details[key] = key === 'parentProjectId' || PROJECT_NUMERIC_KEYS.has(key) ? null : '';
  }
  details.place = composePlace(input, current);
  details.pricingModel = normalizePricingModel(
    input.pricingModel !== undefined ? input.pricingModel : current.pricingModel,
  );
  const settingsInput = input.pricingSettings !== undefined
    ? input.pricingSettings
    : (current.pricingSettings || {});
  details.pricingSettings = normalizePricingSettings(
    { ...settingsInput, feeEstimate: input.feeEstimate ?? current.feeEstimate },
    details.pricingModel,
  );
  const fee = feeEstimateFromSettings(details.pricingModel, details.pricingSettings);
  details.feeEstimate = fee === '' ? null : fee;
  if (input.agreementDocuments !== undefined) {
    details.agreementDocuments = normalizeDocRows(input.agreementDocuments);
  } else if (current.agreementDocuments !== undefined) {
    details.agreementDocuments = normalizeDocRows(current.agreementDocuments);
  } else {
    details.agreementDocuments = [];
  }
  if (input.offerDocuments !== undefined) {
    details.offerDocuments = normalizeDocRows(input.offerDocuments);
  } else if (current.offerDocuments !== undefined) {
    details.offerDocuments = normalizeDocRows(current.offerDocuments);
  } else {
    details.offerDocuments = [];
  }
  return details;
}

/** Legg til avtaledokumenter på prosjektet. */
export function addProjectAgreementDocuments(state, projectId, files = []) {
  const current = state.projects.find((p) => p.id === projectId);
  if (!current) return fail(state, 'Prosjektet finnes ikke.');
  const rows = normalizeDocRows(files).map((doc) => ({
    ...doc,
    source: doc.source || 'upload',
    uploadedAt: doc.uploadedAt || new Date().toISOString(),
  }));
  if (!rows.length) return fail(state, 'Ingen dokumenter å legge til.');
  const agreementDocuments = [...normalizeDocRows(current.agreementDocuments), ...rows];
  return updateProject(state, projectId, { agreementDocuments });
}

/** Overfør tilbudsdokumenter til prosjektet (rød tråd fra tilbudsmodulen). */
export function attachOfferDocuments(state, projectId, files = []) {
  const current = state.projects.find((p) => p.id === projectId);
  if (!current) return fail(state, 'Prosjektet finnes ikke.');
  const rows = normalizeDocRows(files).map((doc) => ({
    ...doc,
    source: doc.source || 'tilbud',
    uploadedAt: doc.uploadedAt || new Date().toISOString(),
  }));
  if (!rows.length) return fail(state, 'Ingen tilbudsdokumenter å overføre.');
  const existing = normalizeDocRows(current.offerDocuments);
  const seen = new Set(existing.map((doc) => `${doc.sourceId}|${doc.url}|${doc.name}`));
  const merged = [...existing];
  for (const row of rows) {
    const key = `${row.sourceId}|${row.url}|${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return updateProject(state, projectId, { offerDocuments: merged });
}

export function removeProjectDocument(state, projectId, docId, kind = 'agreement') {
  const current = state.projects.find((p) => p.id === projectId);
  if (!current) return fail(state, 'Prosjektet finnes ikke.');
  const key = kind === 'offer' ? 'offerDocuments' : 'agreementDocuments';
  const list = normalizeDocRows(current[key]).filter((doc) => doc.id !== docId);
  return updateProject(state, projectId, { [key]: list });
}

/** Avtale mangler når prosjektet ikke er koblet til oppdragsavtale/avrop (eller rammeavtale ved avrop). */
export function projectMissingAgreement(project) {
  if (!project || project.status === 'arkivert') return false;
  if (project.agreementKind === 'avrop') {
    return !project.contractId || !project.frameworkAgreementId;
  }
  return !project.contractId;
}

export function createProject(state, input) {
  const name = text(input.name);
  const number = canonicalProjectNumber(input.number);
  if (!name) return fail(state, 'Prosjektnavn må fylles ut.');
  if (!number) return fail(state, 'Prosjektnummer må fylles ut.');
  if (findProjectByNumber(state.projects, number)) {
    return fail(state, 'Prosjektnummeret er allerede i bruk.');
  }
  const phase = PHASES.includes(input.phase) ? input.phase : 'planlegging';
  const links = projectLinks(input);
  const details = projectDetails(input);
  const project = {
    id: createId('prj'),
    name,
    number,
    ...links,
    ...details,
    manager: text(input.manager),
    phase,
    status: text(input.status) === 'arkivert' ? 'arkivert' : 'aktiv',
    wasteGoal: Number(input.wasteGoal) > 0 ? Number(input.wasteGoal) : 70,
    workSettings: defaultWorkSettings(input.workSettings),
  };
  return ok({
    ...state,
    projects: [project, ...state.projects],
    activeProjectId: project.status === 'arkivert' ? state.activeProjectId : project.id,
  });
}

/** Sikrer at prosjektet har minst én aktivitet (Hovedaktivitet). */
export function ensureMainActivity(state, projectId) {
  const gate = requireProject(state, projectId);
  if (gate.error) return fail(state, gate.error);
  const existing = state.activities.find((row) => (
    row.projectId === gate.project.id && row.name === 'Hovedaktivitet'
  )) || state.activities.find((row) => row.projectId === gate.project.id);
  if (existing) return ok(state);
  return addActivity(state, {
    projectId: gate.project.id,
    name: 'Hovedaktivitet',
    owner: gate.project.manager,
    billable: gate.project.pricingModel !== 'not_billable',
  });
}

export function updateProject(state, projectId, patch) {
  const current = state.projects.find((p) => p.id === projectId);
  if (!current) return fail(state, 'Prosjektet finnes ikke.');
  const nextNumber = patch.number !== undefined ? canonicalProjectNumber(patch.number) : current.number;
  const nextName = patch.name !== undefined ? text(patch.name) : current.name;
  if (!nextName) return fail(state, 'Prosjektnavn må fylles ut.');
  if (!nextNumber) return fail(state, 'Prosjektnummer må fylles ut.');
  const clash = findProjectByNumber(state.projects, nextNumber);
  if (clash && clash.id !== projectId) {
    return fail(state, 'Prosjektnummeret er allerede i bruk.');
  }
  const phase = patch.phase !== undefined
    ? (PHASES.includes(patch.phase) ? patch.phase : current.phase)
    : current.phase;
  const links = projectLinks({ ...current, ...patch });
  const details = projectDetails(patch, current);
  const projects = state.projects.map((p) => (p.id === projectId ? {
    ...p,
    ...links,
    ...details,
    name: nextName,
    number: nextNumber,
    manager: patch.manager !== undefined ? text(patch.manager) : p.manager,
    phase,
    status: patch.status === 'arkivert' ? 'arkivert' : (patch.status === 'aktiv' ? 'aktiv' : p.status),
    workSettings: patch.workSettings !== undefined
      ? defaultWorkSettings(patch.workSettings)
      : defaultWorkSettings(p.workSettings),
  } : p));
  return ok({ ...state, projects });
}

/**
 * Hurtigimport av nye prosjekt. Eksisterende prosjektnummer hoppes over,
 * slik at listen ikke overskriver det som allerede er lagret.
 */
export function importProjects(state, rows) {
  let next = state;
  const created = [];
  const updated = [];
  const skipped = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const number = canonicalProjectNumber(row?.number);
    const name = text(row?.name);
    if (!number || !name) {
      skipped.push({ number, name, reason: 'Mangler prosjektnummer eller navn.' });
      continue;
    }
    if (findProjectByNumber(next.projects, number, { includeArchived: true })) {
      skipped.push({ number, name, reason: 'Prosjektnummeret finnes allerede.' });
      continue;
    }
    const payload = {
      ...row,
      name,
      number,
      client: text(row.client),
      customerId: text(row.customerId) || null,
      customerNumber: text(row.customerNumber),
      orgnr: text(row.orgnr),
      manager: text(row.manager),
      phase: text(row.phase) || 'planlegging',
      contractId: text(row.contractId) || null,
      frameworkAgreementId: text(row.frameworkAgreementId) || null,
      agreementKind: text(row.agreementKind),
    };
    const result = createProject(next, payload);
    if (!result.ok) {
      skipped.push({ number, name, reason: result.error });
      continue;
    }
    next = result.state;
    created.push(next.projects[0]);
  }
  if (!created.length) {
    return fail(state, skipped[0]?.reason || 'Ingen prosjekter ble importert.');
  }
  return { ok: true, state: next, error: null, created, updated, skipped };
}

export function selectProject(state, projectId) {
  if (!state.projects.some((p) => p.id === projectId)) return fail(state, 'Prosjektet finnes ikke.');
  return ok({ ...state, activeProjectId: projectId });
}

export function archiveProject(state, projectId) {
  if (!state.projects.some((p) => p.id === projectId)) return fail(state, 'Prosjektet finnes ikke.');
  const projects = state.projects.map((p) => (p.id === projectId ? { ...p, status: 'arkivert' } : p));
  const active = projects.find((p) => p.status !== 'arkivert');
  return ok({ ...state, projects, activeProjectId: active?.id || null });
}

const PROJECT_SCOPED_KEYS = [
  'activities',
  'members',
  'timeEntries',
  'board',
  'sja',
  'incidents',
  'inspections',
  'deviations',
  'checklists',
  'documents',
  'meetings',
  'changes',
  'contracts',
  'entries',
  'crew',
  'waste',
  'audits',
];

/** Sletter ett eller flere prosjekter permanent, inkl. tilhørende poster. */
export function deleteProjects(state, projectIds) {
  const wanted = [...new Set((Array.isArray(projectIds) ? projectIds : [projectIds]).filter(Boolean))];
  if (!wanted.length) return fail(state, 'Ingen prosjekt er valgt.');
  const idSet = new Set(wanted);
  const deletedIds = state.projects.filter((row) => idSet.has(row.id)).map((row) => row.id);
  if (!deletedIds.length) return fail(state, 'Fant ingen av de valgte prosjektene.');
  const removed = new Set(deletedIds);
  const projects = state.projects.filter((row) => !removed.has(row.id));
  const next = { ...state, projects };
  for (const key of PROJECT_SCOPED_KEYS) {
    next[key] = (state[key] || []).filter((row) => !removed.has(row.projectId));
  }
  if (removed.has(state.activeProjectId)) {
    next.activeProjectId = projects.find((row) => row.status !== 'arkivert')?.id || null;
  }
  return { ok: true, state: next, error: null, deletedIds };
}

export function addActivity(state, input) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const name = text(input.name);
  if (!name) return fail(state, 'Aktiviteten trenger et navn.');
  if (input.predecessorId) {
    const pred = state.activities.find((a) => a.id === input.predecessorId && a.projectId === gate.project.id);
    if (!pred) return fail(state, 'Forgjengeren ligger ikke i prosjektet.');
  }
  const row = {
    id: createId('act'),
    projectId: gate.project.id,
    name,
    owner: text(input.owner),
    start: text(input.start),
    end: text(input.end),
    progress: 0,
    milestone: !!input.milestone,
    predecessorId: input.predecessorId || null,
    status: ['under_arbeid', 'avsluttet', 'planlagt'].includes(input.status) ? input.status : 'under_arbeid',
    estimatedHours: roundHours(input.estimatedHours),
    priceModelName: text(input.priceModelName),
    billable: input.billable !== false,
  };
  return ok({ ...state, activities: [...state.activities, row] });
}

export function updateActivity(state, activityId, patch = {}) {
  const current = state.activities.find((a) => a.id === activityId);
  if (!current) return fail(state, 'Aktiviteten finnes ikke.');
  const name = patch.name !== undefined ? text(patch.name) : current.name;
  if (!name) return fail(state, 'Aktiviteten trenger et navn.');
  return ok({
    ...state,
    activities: state.activities.map((row) => (
      row.id === activityId
        ? {
          ...row,
          name,
          owner: patch.owner !== undefined ? text(patch.owner) : row.owner,
          start: patch.start !== undefined ? text(patch.start) : row.start,
          end: patch.end !== undefined ? text(patch.end) : row.end,
          status: patch.status !== undefined
            ? (['under_arbeid', 'avsluttet', 'planlagt'].includes(patch.status) ? patch.status : row.status)
            : row.status,
          estimatedHours: patch.estimatedHours !== undefined ? roundHours(patch.estimatedHours) : row.estimatedHours,
          priceModelName: patch.priceModelName !== undefined ? text(patch.priceModelName) : row.priceModelName,
          billable: patch.billable !== undefined ? !!patch.billable : row.billable,
          progress: patch.progress !== undefined
            ? Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0)))
            : row.progress,
        }
        : row
    )),
  });
}

export function setActivityProgress(state, activityId, progress) {
  const activity = state.activities.find((a) => a.id === activityId);
  if (!activity) return fail(state, 'Aktiviteten finnes ikke.');
  const value = Math.max(0, Math.min(100, Math.round(Number(progress))));
  if (!Number.isFinite(value)) return fail(state, 'Fremdrift må være et tall.');
  if (activity.predecessorId && value > 0) {
    const pred = state.activities.find((a) => a.id === activity.predecessorId);
    if (pred && pred.progress < 100) {
      return fail(state, 'Forgjengeren må være ferdig før denne kan starte.');
    }
  }
  return ok({
    ...state,
    activities: state.activities.map((a) => (a.id === activityId ? { ...a, progress: value } : a)),
  });
}

function addRow(state, key, input, build) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const built = build(gate.project.id);
  if (built.error) return fail(state, built.error);
  return ok({ ...state, [key]: [...state[key], built.row] });
}

export function addBoardNote(state, input) {
  return addRow(state, 'board', input, (projectId) => {
    const title = text(input.title);
    if (!title) return { error: 'Tavlen trenger en overskrift.' };
    return { row: { id: createId('hms'), projectId, title, body: text(input.body), kind: text(input.kind) || 'melding' } };
  });
}

export function addSja(state, input) {
  return addRow(state, 'sja', input, (projectId) => {
    const task = text(input.task);
    if (!task) return { error: 'SJA trenger en arbeidsoperasjon.' };
    return {
      row: {
        id: createId('sja'),
        projectId,
        task,
        hazards: text(input.hazards),
        measures: text(input.measures),
        status: 'åpen',
      },
    };
  });
}

export function updateSja(state, id, input) {
  if (!state.sja.some((item) => item.id === id)) return fail(state, 'SJA finnes ikke.');
  return ok({
    ...state,
    sja: state.sja.map((item) => (
      item.id === id
        ? { ...item, hazards: text(input.hazards), measures: text(input.measures) }
        : item
    )),
  });
}

export function signSja(state, id) {
  const row = state.sja.find((item) => item.id === id);
  if (!row) return fail(state, 'SJA finnes ikke.');
  if (!text(row.measures)) return fail(state, 'Skriv tiltak før SJA signeres.');
  return ok({
    ...state,
    sja: state.sja.map((item) => (item.id === id ? { ...item, status: 'signert' } : item)),
  });
}

export function addIncident(state, input) {
  return addRow(state, 'incidents', input, (projectId) => {
    const title = text(input.title);
    if (!title) return { error: 'RUH trenger en tittel.' };
    const severity = ['lav', 'middels', 'høy', 'kritisk'].includes(input.severity) ? input.severity : 'middels';
    return {
      row: {
        id: createId('ruh'),
        projectId,
        title,
        description: text(input.description),
        severity,
        status: 'åpen',
      },
    };
  });
}

export function closeIncident(state, id) {
  if (!state.incidents.some((item) => item.id === id)) return fail(state, 'RUH finnes ikke.');
  return ok({
    ...state,
    incidents: state.incidents.map((item) => (item.id === id ? { ...item, status: 'lukket' } : item)),
  });
}

export function addInspection(state, input) {
  return addRow(state, 'inspections', input, (projectId) => {
    const area = text(input.area);
    if (!area) return { error: 'Befaringen trenger et område.' };
    return {
      row: {
        id: createId('bef'),
        projectId,
        area,
        date: text(input.date),
        findings: text(input.findings),
      },
    };
  });
}

export function addDeviation(state, input) {
  return addRow(state, 'deviations', input, (projectId) => {
    const title = text(input.title);
    if (!title) return { error: 'Avviket trenger en tittel.' };
    const type = ['ks', 'hms', 'iso', 'miljø'].includes(input.type) ? input.type : 'ks';
    return {
      row: {
        id: createId('avv'),
        projectId,
        type,
        title,
        description: text(input.description),
        cause: '',
        action: '',
        owner: text(input.owner),
        due: text(input.due),
        status: 'åpen',
        iso: text(input.iso) || 'ISO 9001 kap. 10.2',
      },
    };
  });
}

export function closeDeviation(state, id, input) {
  const row = state.deviations.find((item) => item.id === id);
  if (!row) return fail(state, 'Avviket finnes ikke.');
  const cause = text(input.cause);
  const action = text(input.action);
  if (!cause || !action) return fail(state, 'Årsak og tiltak må fylles ut før avviket lukkes.');
  return ok({
    ...state,
    deviations: state.deviations.map((item) => (
      item.id === id ? { ...item, cause, action, status: 'lukket' } : item
    )),
  });
}

export function addChecklist(state, input) {
  return addRow(state, 'checklists', input, (projectId) => {
    const template = CHECKLIST_TEMPLATES.find((item) => item.id === input.templateId);
    const title = text(input.title) || template?.title;
    const source = template?.items || String(input.items || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (!title || !source.length) return { error: 'Sjekklisten trenger tittel og minst ett punkt.' };
    return {
      row: {
        id: createId('chk'),
        projectId,
        title,
        items: source.map((label) => ({ id: createId('itm'), label, done: false })),
      },
    };
  });
}

export function toggleCheckItem(state, checklistId, itemId) {
  const list = state.checklists.find((item) => item.id === checklistId);
  if (!list) return fail(state, 'Sjekklisten finnes ikke.');
  return ok({
    ...state,
    checklists: state.checklists.map((listRow) => (
      listRow.id === checklistId
        ? {
          ...listRow,
          items: listRow.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
        }
        : listRow
    )),
  });
}

export function addDocument(state, input) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const title = text(input.title);
  if (!title) return fail(state, 'Dokumentet trenger en tittel.');
  const discipline = text(input.discipline) || 'dokument';
  const same = state.documents.filter((doc) => (
    doc.projectId === gate.project.id && doc.title === title && doc.discipline === discipline
  ));
  const revision = same.reduce((max, doc) => Math.max(max, doc.revision), 0) + 1;
  const row = {
    id: createId('dok'),
    projectId: gate.project.id,
    title,
    discipline,
    revision,
    status: 'gjeldende',
    note: text(input.note),
  };
  const documents = state.documents.map((doc) => (
    doc.projectId === row.projectId && doc.title === title && doc.discipline === discipline
      ? { ...doc, status: 'utgått' }
      : doc
  ));
  return ok({ ...state, documents: [...documents, row] });
}

export function addMeeting(state, input) {
  return addRow(state, 'meetings', input, (projectId) => {
    const title = text(input.title);
    if (!title) return { error: 'Møtet trenger en tittel.' };
    return {
      row: {
        id: createId('mot'),
        projectId,
        title,
        date: text(input.date),
        agenda: text(input.agenda),
        minutes: text(input.minutes),
      },
    };
  });
}

export function addChange(state, input) {
  return addRow(state, 'changes', input, (projectId) => {
    const title = text(input.title);
    const amount = round2(input.amount);
    if (!title) return { error: 'Endringen trenger en tittel.' };
    if (!Number.isFinite(amount)) return { error: 'Beløpet må være et tall.' };
    const status = ['varslet', 'godkjent', 'avvist'].includes(input.status) ? input.status : 'varslet';
    return { row: { id: createId('end'), projectId, title, amount, status } };
  });
}

export function setChangeStatus(state, id, status) {
  if (!['varslet', 'godkjent', 'avvist'].includes(status)) return fail(state, 'Ukjent endringsstatus.');
  if (!state.changes.some((item) => item.id === id)) return fail(state, 'Endringen finnes ikke.');
  return ok({
    ...state,
    changes: state.changes.map((item) => (item.id === id ? { ...item, status } : item)),
  });
}

export function addContract(state, input) {
  return addRow(state, 'contracts', input, (projectId) => {
    const title = text(input.title);
    const party = text(input.party);
    const value = round2(input.value);
    if (!title || !party) return { error: 'Kontrakten trenger part og tittel.' };
    if (!(value > 0)) return { error: 'Kontraktssum må være større enn null.' };
    return { row: { id: createId('kon'), projectId, title, party, value, status: 'aktiv' } };
  });
}

export function postEntry(state, input) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const acc = account(input.account);
  const code = costCode(input.costCode);
  if (!acc) return fail(state, 'Velg en konto fra kontoplanen.');
  if (!code) return fail(state, 'Velg en prosjektkode.');
  const description = text(input.text);
  if (!description) return fail(state, 'Bilaget trenger en tekst.');
  let amount = 0;
  let hours = 0;
  let rate = 0;
  if (input.kind === 'hours') {
    if (!HOUR_ACCOUNTS.includes(acc.code)) return fail(state, 'Timer føres på lønnskonto 5010 eller 5400.');
    hours = round2(input.hours);
    rate = round2(input.rate);
    if (!(hours > 0) || !(rate > 0)) return fail(state, 'Timer og timepris må være større enn null.');
    amount = round2(hours * rate);
  } else if (input.kind === 'income') {
    if (acc.kind !== 'income') return fail(state, 'Inntekt må føres på en inntektskonto.');
    amount = round2(input.amount);
    if (!(amount > 0)) return fail(state, 'Beløpet må være større enn null.');
  } else if (input.kind === 'cost') {
    if (acc.kind !== 'cost') return fail(state, 'Kostnad må føres på en kostnadskonto.');
    amount = round2(input.amount);
    if (!(amount > 0)) return fail(state, 'Beløpet må være større enn null.');
  } else {
    return fail(state, 'Velg inntekt, kostnad eller timer.');
  }
  const row = {
    id: createId('bil'),
    projectId: gate.project.id,
    date: text(input.date),
    kind: input.kind,
    account: acc.code,
    costCode: code.code,
    text: description,
    amount,
    hours,
    rate,
  };
  return ok({ ...state, entries: [...state.entries, row] });
}

export function checkInCrew(state, input) {
  return addRow(state, 'crew', input, (projectId) => {
    const name = text(input.name);
    const company = text(input.company);
    if (!name || !company) return { error: 'Navn og firma må fylles ut.' };
    return { row: { id: createId('mann'), projectId, name, company, inn: text(input.inn) || 'inne', status: 'inne' } };
  });
}

export function checkOutCrew(state, id) {
  if (!state.crew.some((item) => item.id === id)) return fail(state, 'Personen står ikke på listen.');
  return ok({
    ...state,
    crew: state.crew.map((item) => (item.id === id ? { ...item, status: 'ute' } : item)),
  });
}

export function addWaste(state, input) {
  return addRow(state, 'waste', input, (projectId) => {
    const fraction = text(input.fraction);
    const kg = round2(input.kg);
    if (!fraction) return { error: 'Velg avfallsfraksjon.' };
    if (!(kg > 0)) return { error: 'Vekt må være større enn null.' };
    const sorted = input.sorted !== false;
    return { row: { id: createId('avf'), projectId, fraction, kg, sorted } };
  });
}

export function addAudit(state, input) {
  return addRow(state, 'audits', input, (projectId) => {
    const standard = text(input.standard);
    if (!standard) return { error: 'Velg standard.' };
    return {
      row: {
        id: createId('rev'),
        projectId,
        standard,
        date: text(input.date),
        findings: text(input.findings),
        status: 'utført',
      },
    };
  });
}

export function projectEconomy(state, projectId) {
  const rows = state.entries.filter((row) => row.projectId === projectId);
  let income = 0;
  let cost = 0;
  let hours = 0;
  for (const row of rows) {
    if (row.kind === 'income') income += row.amount;
    else {
      cost += row.amount;
      hours += row.hours || 0;
    }
  }
  const approvedChanges = state.changes
    .filter((row) => row.projectId === projectId && row.status === 'godkjent')
    .reduce((sum, row) => sum + row.amount, 0);
  const contract = state.contracts
    .filter((row) => row.projectId === projectId && row.status === 'aktiv')
    .reduce((sum, row) => sum + row.value, 0);
  return {
    income: round2(income),
    cost: round2(cost),
    hours: round2(hours),
    result: round2(income - cost),
    approvedChanges: round2(approvedChanges),
    contract: round2(contract),
    forecast: round2(contract + approvedChanges),
  };
}

export function progressSummary(state, projectId) {
  const rows = state.activities.filter((row) => row.projectId === projectId && !row.milestone);
  if (!rows.length) return { percent: 0, count: 0, blocked: 0 };
  const percent = Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length);
  const blocked = rows.filter((row) => {
    if (!row.predecessorId || row.progress > 0) return false;
    const pred = state.activities.find((item) => item.id === row.predecessorId);
    return pred && pred.progress < 100;
  }).length;
  return { percent, count: rows.length, blocked };
}

export function wasteSummary(state, projectId) {
  const rows = state.waste.filter((row) => row.projectId === projectId);
  const total = rows.reduce((sum, row) => sum + row.kg, 0);
  const sorted = rows.filter((row) => row.sorted).reduce((sum, row) => sum + row.kg, 0);
  const project = state.projects.find((item) => item.id === projectId);
  const rate = total ? Math.round((sorted / total) * 100) : 0;
  return { total: round2(total), sorted: round2(sorted), rate, goal: project?.wasteGoal || 70 };
}

export function checklistScore(list) {
  if (!list?.items?.length) return 0;
  const done = list.items.filter((item) => item.done).length;
  return Math.round((done / list.items.length) * 100);
}

export function accounts() {
  return ACCOUNTS;
}

export function removeRecord(state, key, id) {
  if (!Array.isArray(state[key])) return fail(state, 'Listen finnes ikke.');
  return ok({ ...state, [key]: state[key].filter((row) => row.id !== id) });
}

/** Legg til ansatt som deltaker på prosjekt. */
export function addProjectMember(state, input) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const employeeId = text(input.employeeId);
  if (!employeeId) return fail(state, 'Velg en medarbeider.');
  const exists = state.members.some((row) => (
    row.projectId === gate.project.id && row.employeeId === employeeId && row.active !== false
  ));
  if (exists) return fail(state, 'Medarbeideren er allerede deltaker.');
  const row = normalizeMemberRow({
    id: createId('mem'),
    projectId: gate.project.id,
    employeeId,
    employeeName: text(input.employeeName),
    photoUrl: text(input.photoUrl),
    role: text(input.role) || 'Prosjektmedlem',
    active: true,
    starred: !!input.starred,
    addedAt: stamp(),
    addedByUid: text(input.addedByUid),
  });
  return ok({ ...state, members: [row, ...state.members] });
}

export function updateProjectMember(state, memberId, patch = {}) {
  const current = state.members.find((row) => row.id === memberId);
  if (!current) return fail(state, 'Deltakeren finnes ikke.');
  return ok({
    ...state,
    members: state.members.map((row) => (
      row.id === memberId
        ? {
          ...row,
          role: patch.role !== undefined ? (text(patch.role) || row.role) : row.role,
          active: patch.active !== undefined ? !!patch.active : row.active,
          starred: patch.starred !== undefined ? !!patch.starred : row.starred,
          employeeName: patch.employeeName !== undefined ? text(patch.employeeName) : row.employeeName,
          photoUrl: patch.photoUrl !== undefined ? text(patch.photoUrl) : row.photoUrl,
        }
        : row
    )),
  });
}

export function removeProjectMember(state, memberId) {
  if (!state.members.some((row) => row.id === memberId)) {
    return fail(state, 'Deltakeren finnes ikke.');
  }
  return ok({
    ...state,
    members: state.members.map((row) => (
      row.id === memberId ? { ...row, active: false } : row
    )),
  });
}

export function toggleMemberStar(state, memberId) {
  const current = state.members.find((row) => row.id === memberId);
  if (!current) return fail(state, 'Deltakeren finnes ikke.');
  return updateProjectMember(state, memberId, { starred: !current.starred });
}

/**
 * Prosjekter synlige i timesheet for en ansatt:
 * medlemskap, showInAllTimesheets, eller allowSelfJoin (kan legges til).
 */
export function projectsForEmployee(state, employeeId, { includeJoinable = false } = {}) {
  const id = text(employeeId);
  const memberIds = new Set(
    state.members
      .filter((row) => row.employeeId === id && row.active !== false)
      .map((row) => row.projectId),
  );
  return state.projects.filter((project) => {
    if (project.status === 'arkivert') return false;
    if (memberIds.has(project.id)) return true;
    const settings = defaultWorkSettings(project.workSettings);
    if (settings.showInAllTimesheets) return true;
    if (includeJoinable && settings.allowSelfJoin) return true;
    return false;
  });
}

/** Registrer / oppdater timeføring på prosjekt+dag. */
export function upsertTimeEntry(state, input) {
  const gate = requireProject(state, input.projectId);
  if (gate.error) return fail(state, gate.error);
  const employeeId = text(input.employeeId);
  const date = text(input.date);
  if (!employeeId) return fail(state, 'Velg medarbeider.');
  if (!date) return fail(state, 'Velg dato.');
  const hours = roundHours(input.hours);
  if (hours < 0) return fail(state, 'Timer kan ikke være negative.');
  const settings = defaultWorkSettings(gate.project.workSettings);
  const description = text(input.description);
  if (settings.requireDescription && hours > 0 && !description && !input.id) {
    return fail(state, 'Beskrivelse av utført arbeid er påkrevd.');
  }
  let working = state;
  const ensured = ensureMainActivity(working, gate.project.id);
  if (!ensured.ok) return ensured;
  working = ensured.state;

  let activityId = text(input.activityId) || null;
  let activityName = text(input.activityName);
  if (!activityId) {
    const main = working.activities.find((row) => (
      row.projectId === gate.project.id && row.name === 'Hovedaktivitet'
    )) || working.activities.find((row) => row.projectId === gate.project.id);
    activityId = main?.id || null;
    activityName = activityName || main?.name || 'Hovedaktivitet';
  } else if (!activityName) {
    activityName = working.activities.find((row) => row.id === activityId)?.name || 'Aktivitet';
  }
  const now = stamp();
  const existingId = text(input.id);
  const existing = existingId
    ? working.timeEntries.find((row) => row.id === existingId)
    : null;
  if (existing?.status === 'låst') return fail(working, 'Føringen er låst og kan ikke endres.');

  // Slett når timer settes til 0 uten beskrivelse
  if (existing && hours === 0 && !description) {
    const next = {
      ...working,
      timeEntries: working.timeEntries.filter((row) => row.id !== existing.id),
    };
    return ok(syncProjectHourRollups(next, gate.project.id));
  }

  const billableHours = input.billableHours == null ? hours : roundHours(input.billableHours);
  const row = normalizeTimeEntryRow({
    id: existing?.id || createId('tid'),
    projectId: gate.project.id,
    employeeId,
    employeeName: text(input.employeeName) || existing?.employeeName,
    activityId,
    activityName,
    date,
    hours,
    billableHours,
    description,
    internalNote: text(input.internalNote !== undefined ? input.internalNote : existing?.internalNote),
    status: ['registrert', 'godkjent', 'låst'].includes(input.status)
      ? input.status
      : (existing?.status || 'registrert'),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByUid: text(input.createdByUid) || existing?.createdByUid,
  });

  const timeEntries = existing
    ? working.timeEntries.map((item) => (item.id === existing.id ? row : item))
    : [row, ...working.timeEntries];
  return ok(syncProjectHourRollups({ ...working, timeEntries }, gate.project.id));
}

export function deleteTimeEntry(state, entryId) {
  const current = state.timeEntries.find((row) => row.id === entryId);
  if (!current) return fail(state, 'Føringen finnes ikke.');
  if (current.status === 'låst') return fail(state, 'Føringen er låst og kan ikke slettes.');
  const next = {
    ...state,
    timeEntries: state.timeEntries.filter((row) => row.id !== entryId),
  };
  return ok(syncProjectHourRollups(next, current.projectId));
}

export function setTimeEntryStatus(state, entryId, status) {
  if (!['registrert', 'godkjent', 'låst'].includes(status)) {
    return fail(state, 'Ugyldig status.');
  }
  const current = state.timeEntries.find((row) => row.id === entryId);
  if (!current) return fail(state, 'Føringen finnes ikke.');
  return ok({
    ...state,
    timeEntries: state.timeEntries.map((row) => (
      row.id === entryId ? { ...row, status, updatedAt: stamp() } : row
    )),
  });
}

export function addAbsence(state, input) {
  const employeeId = text(input.employeeId);
  const date = text(input.date);
  if (!employeeId) return fail(state, 'Velg medarbeider.');
  if (!date) return fail(state, 'Velg dato.');
  const hours = roundHours(input.hours);
  if (!(hours > 0)) return fail(state, 'Fravær må ha timer.');
  const row = normalizeAbsenceRow({
    id: createId('fra'),
    employeeId,
    employeeName: text(input.employeeName),
    date,
    hours,
    type: text(input.type) || 'ferie',
    description: text(input.description),
    createdAt: stamp(),
    createdByUid: text(input.createdByUid),
  });
  return ok({ ...state, absences: [row, ...state.absences] });
}

export function deleteAbsence(state, absenceId) {
  if (!state.absences.some((row) => row.id === absenceId)) {
    return fail(state, 'Fraværet finnes ikke.');
  }
  return ok({
    ...state,
    absences: state.absences.filter((row) => row.id !== absenceId),
  });
}

/** Summer timer for prosjekt (timeEntries). */
export function projectTimeSummary(state, projectId) {
  const rows = state.timeEntries.filter((row) => row.projectId === projectId);
  const hours = roundHours(rows.reduce((sum, row) => sum + parseHours(row.hours), 0));
  const billable = roundHours(rows.reduce((sum, row) => sum + parseHours(row.billableHours), 0));
  const toBill = roundHours(rows
    .filter((row) => row.status === 'registrert' || row.status === 'godkjent')
    .reduce((sum, row) => sum + parseHours(row.billableHours), 0));
  return {
    hours,
    billable,
    nonBillable: roundHours(hours - billable),
    toBill,
    count: rows.length,
  };
}

export function activityTimeSummary(state, activityId) {
  const activity = state.activities.find((row) => row.id === activityId);
  const rows = state.timeEntries.filter((row) => row.activityId === activityId);
  const registered = roundHours(rows.reduce((sum, row) => sum + parseHours(row.hours), 0));
  const billable = roundHours(rows.reduce((sum, row) => sum + parseHours(row.billableHours), 0));
  const estimated = roundHours(activity?.estimatedHours);
  return {
    registered,
    remaining: roundHours(estimated - registered),
    billable,
    nonBillable: roundHours(registered - billable),
    estimated,
  };
}

/** Merg lokal og remote prosjektstate (by-id, nyeste vinner). */
export function mergeProjectStates(left, right) {
  const a = normalizeProjectState(left);
  const b = normalizeProjectState(right);
  const aSync = Date.parse(a.syncedAt || '') || 0;
  const bSync = Date.parse(b.syncedAt || '') || 0;

  function mergeRows(listA, listB) {
    const map = new Map();
    for (const row of listA) {
      if (row?.id) map.set(row.id, row);
    }
    for (const row of listB) {
      if (!row?.id) continue;
      const prev = map.get(row.id);
      if (!prev) {
        map.set(row.id, row);
        continue;
      }
      const tA = Date.parse(prev.updatedAt || prev.addedAt || prev.createdAt || '') || 0;
      const tB = Date.parse(row.updatedAt || row.addedAt || row.createdAt || '') || 0;
      map.set(row.id, tB >= tA ? { ...prev, ...row } : { ...row, ...prev });
    }
    return [...map.values()];
  }

  const keys = Object.keys(emptyProjectState()).filter((key) => (
    key !== 'activeProjectId' && key !== 'syncedAt' && key !== 'procedures'
  ));
  const next = emptyProjectState();
  for (const key of keys) {
    next[key] = mergeRows(a[key] || [], b[key] || []);
  }
  next.procedures = (bSync >= aSync ? (b.procedures?.length ? b.procedures : a.procedures) : (a.procedures?.length ? a.procedures : b.procedures));
  next.syncedAt = aSync >= bSync ? (a.syncedAt || b.syncedAt) : (b.syncedAt || a.syncedAt);
  next.activeProjectId = (bSync >= aSync ? b.activeProjectId : a.activeProjectId)
    || a.activeProjectId
    || b.activeProjectId
    || null;
  if (next.activeProjectId && !next.projects.some((p) => p.id === next.activeProjectId)) {
    next.activeProjectId = next.projects[0]?.id || null;
  }
  return normalizeProjectState(next);
}
