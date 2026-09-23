import {
  ACCOUNTS,
  CHECKLIST_TEMPLATES,
  HOUR_ACCOUNTS,
  PHASES,
  account,
  costCode,
  defaultProcedures,
} from './catalog.js';

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function text(value) {
  return String(value || '').trim();
}

export function emptyProjectState() {
  return {
    projects: [],
    activeProjectId: null,
    activities: [],
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
  };
}

export function normalizeProjectState(raw) {
  const base = emptyProjectState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const next = { ...base, ...src, procedures: src.procedures?.length ? src.procedures : base.procedures };
  for (const key of Object.keys(base)) {
    if (key === 'activeProjectId') continue;
    if (!Array.isArray(next[key])) next[key] = [];
  }
  if (next.activeProjectId && !next.projects.some((p) => p.id === next.activeProjectId)) {
    next.activeProjectId = next.projects[0]?.id || null;
  }
  return next;
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

export function createProject(state, input) {
  const name = text(input.name);
  const number = text(input.number);
  if (!name) return fail(state, 'Prosjektnavn må fylles ut.');
  if (!number) return fail(state, 'Prosjektnummer må fylles ut.');
  if (state.projects.some((p) => p.number === number && p.status !== 'arkivert')) {
    return fail(state, 'Prosjektnummeret er allerede i bruk.');
  }
  const phase = PHASES.includes(input.phase) ? input.phase : 'planlegging';
  const project = {
    id: createId('prj'),
    name,
    number,
    client: text(input.client),
    place: text(input.place),
    phase,
    status: 'aktiv',
    start: text(input.start),
    end: text(input.end),
    manager: text(input.manager),
    wasteGoal: Number(input.wasteGoal) > 0 ? Number(input.wasteGoal) : 70,
  };
  return ok({
    ...state,
    projects: [project, ...state.projects],
    activeProjectId: project.id,
  });
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
  };
  return ok({ ...state, activities: [...state.activities, row] });
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
