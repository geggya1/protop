/**
 * Import av et helt ledelsessystem (ISO-pakke) — f.eks. fra et tidligere system (SharePoint, Word, Excel).
 *
 * Pakken er DATA, ikke kode: dokumenter, prosesser, registerposter, lov-/kontraktskrav,
 * kravvurderinger, skjema/sjekklister og nyheter. Importen går gjennom de samme
 * domenefunksjonene som skjermene (createDocument, createProcess, createRecord …), så
 * validering, nummerering, historikk og revisjonsspor blir som om brukeren la inn alt selv.
 *
 *  parsePackage(raw)                 → { ok, pkg, warnings } — format og struktur
 *  planImport(state, pkg, opts)      → hva som blir opprettet, hva som finnes, hva som feiler (tørrkjøring)
 *  buildImport(state, pkg, opts)     → ferdige entiteter i rekkefølge, klare til lagring
 *
 * Idempotent: hver entitet får importKey «<pakke-id>:<del>:<nøkkel>». Finnes nøkkelen fra før, hoppes posten over.
 * Format beskrevet i docs/product/iso-khms/IMPORTPAKKE.md.
 */
import { addDays, fail, isoDate, text, todayKey, uniq } from './core.js';
import { STANDARDS } from './catalog.js';
import {
  approveAndPublishDocument, cleanLegacyRevisions, createDocument, DOC_TYPES, normalizeDocStructure, submitDocument,
} from './documents.js';
import {
  approveAndPublish, createProcess, makeNode, normalizeDiagram, PROCESS_CATEGORIES, submitForApproval, validateDiagram,
} from './processes.js';
import { layoutSwimlanes } from './processLayout.js';
import { createRecord, REGISTERS } from './registers.js';
import {
  allRequirements, attachEvidence, createCustomRequirement, requirementIdsForArea, setAssessment,
} from './requirements.js';
import { normalizeSystem } from './state.js';
import { requirementIdsForDocument } from './integrations.js';
import { approverUidsFromRoles } from './access.js';

export const PACKAGE_FORMAT = 'protop.iso.package';
export const PACKAGE_VERSION = 1;

export const PACKAGE_SECTIONS = [
  { id: 'system', label: 'Oppsett, omfang og dokumentstruktur' },
  { id: 'documents', label: 'Dokumenter (policy, prosedyrer, instrukser, håndbøker, maler …)' },
  { id: 'processes', label: 'Prosesser med prosesskart' },
  { id: 'records', label: 'Registre (kontekst, interessenter, risiko, miljø, roller, årshjul …)' },
  { id: 'requirements', label: 'Lov- og kontraktskrav' },
  { id: 'assessments', label: 'Kravvurderinger (GAP-analyse)' },
  { id: 'forms', label: 'Skjema og sjekklister (Skjemabygger)' },
  { id: 'news', label: 'Nyheter' },
];

const MAX_FORM_FIELDS = 120;
const FORM_KINDS = new Set(['title', 'note', 'long', 'text', 'choice', 'checks', 'dropdown', 'scale', 'date', 'time', 'number', 'check', 'image', 'file']);

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function keyOf(row) {
  return text(row?.key, 120);
}

/** Unik nøkkel per del. Duplikater gir advarsel og ignoreres. */
function uniqueRows(rows, label, warnings) {
  const seen = new Set();
  const out = [];
  for (const row of arr(rows)) {
    const key = keyOf(row);
    if (!key) { warnings.push(`${label}: en rad mangler «key» og hoppes over.`); continue; }
    if (seen.has(key)) { warnings.push(`${label}: nøkkelen «${key}» står flere ganger. Bare den første brukes.`); continue; }
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Leser og kontrollerer pakken. Godtar tekst (JSON) eller objekt. */
export function parsePackage(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return fail('Filen er ikke gyldig JSON.');
    }
  }
  if (!data || typeof data !== 'object') return fail('Tom eller ukjent fil.');
  if (data.format !== PACKAGE_FORMAT) return fail(`Ukjent format. Forventet «${PACKAGE_FORMAT}».`);
  if (Number(data.formatVersion) > PACKAGE_VERSION) return fail('Pakken er laget for en nyere versjon av ProTop.');
  const id = text(data.id, 80).replace(/[^A-Za-z0-9_.-]/g, '-');
  if (!id) return fail('Pakken mangler «id».');
  const warnings = [];
  const records = {};
  for (const [register, rows] of Object.entries(data.records || {})) {
    if (!REGISTERS[register]) { warnings.push(`Ukjent register «${register}» hoppes over.`); continue; }
    records[register] = uniqueRows(rows, `Register ${register}`, warnings);
  }
  const pkg = {
    format: PACKAGE_FORMAT,
    formatVersion: Number(data.formatVersion) || 1,
    id,
    title: text(data.title, 200) || id,
    description: text(data.description, 4000),
    source: data.source && typeof data.source === 'object' ? {
      system: text(data.source.system, 120),
      location: text(data.source.location, 600),
      readAt: text(data.source.readAt, 40),
      note: text(data.source.note, 2000),
    } : null,
    system: data.system && typeof data.system === 'object' ? data.system : null,
    documents: uniqueRows(data.documents, 'Dokumenter', warnings),
    processes: uniqueRows(data.processes, 'Prosesser', warnings),
    records,
    requirements: uniqueRows(data.requirements, 'Krav', warnings),
    assessments: uniqueRows(data.assessments, 'Vurderinger', warnings),
    forms: uniqueRows(data.forms, 'Skjema', warnings),
    news: uniqueRows(data.news, 'Nyheter', warnings),
    review: arr(data.review).map((x) => text(x, 2000)).filter(Boolean),
  };
  return { ok: true, pkg, warnings };
}

export function importKeyFor(pkg, section, key) {
  return `${pkg.id}:${section}:${key}`;
}

/** Id for et skjema i Skjemabygger fra pakken (fast, så installasjon er idempotent). */
export function formTemplateIdFor(pkg, key) {
  return `imp_${pkg.id}_${key}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 80);
}

function existingIndex(state, anbudTemplates = []) {
  const map = new Map();
  const put = (row, kind) => { if (row?.importKey) map.set(row.importKey, { kind, row }); };
  for (const d of state.documents || []) put(d, 'documents');
  for (const p of state.processes || []) put(p, 'processes');
  for (const r of state.requirements || []) put(r, 'requirements');
  for (const rows of Object.values(state.records || {})) for (const r of rows || []) put(r, 'records');
  for (const t of anbudTemplates || []) if (t?.importKey) map.set(t.importKey, { kind: 'forms', row: t });
  return map;
}

/* ───────────────────────── Oversettelse fra pakke til domene ───────────────────────── */

function documentInput(pkg, row, ctx) {
  const docType = DOC_TYPES.some((d) => d.id === row.docType) ? row.docType : '';
  const areaIds = uniq(arr(row.requirementAreas).flatMap((a) => requirementIdsForArea(ctx.state, a)));
  return {
    title: row.title,
    code: row.code,
    folder: row.folder,
    docType,
    ownerName: row.ownerName,
    approverName: row.approverName,
    accessClass: row.accessClass,
    readAckRequired: !!row.readAckRequired,
    reviewIntervalMonths: row.reviewIntervalMonths,
    tags: arr(row.tags),
    content: row.content,
    attachments: arr(row.attachments),
    changeReason: row.changeReason || `Importert fra ${pkg.source?.system || 'tidligere system'}`,
    legacyRevisions: cleanLegacyRevisions(row.legacyRevisions),
    source: row.source || (pkg.source ? { system: pkg.source.system } : null),
    requirementIds: areaIds.length ? areaIds : (docType ? requirementIdsForDocument(ctx.state, docType) : []),
  };
}

function resolveClick(node, refs) {
  if (node.documentKey && refs.documents.get(node.documentKey)) return { type: 'openDocument', ref: refs.documents.get(node.documentKey) };
  if (node.processKey && refs.processes.get(node.processKey)) return { type: 'openProcess', ref: refs.processes.get(node.processKey) };
  if (node.formKey && refs.forms.get(node.formKey)) return { type: 'openForm', ref: refs.forms.get(node.formKey) };
  if (node.module) return { type: 'openModule', ref: text(node.module, 80) };
  if (node.url) return { type: 'openUrl', ref: text(node.url, 2000) };
  return null;
}

/** Diagram fra pakken: svømmebaner + bokser + piler, med referanser løst til ProTop-id-er. */
export function diagramFromPackage(spec, refs, issues = []) {
  const lanes = arr(spec?.lanes);
  const laneById = new Map(lanes.map((l) => [String(l.id), l]));
  const nodes = arr(spec?.nodes).map((n) => {
    const lane = laneById.get(String(n.lane || ''));
    const click = resolveClick(n, refs);
    for (const [field, map, label] of [['documentKey', refs.documents, 'dokument'], ['processKey', refs.processes, 'prosess'], ['formKey', refs.forms, 'skjema']]) {
      if (n[field] && !map.get(n[field])) issues.push(`Boksen «${n.label}» viser til ${label} «${n[field]}», som ikke finnes i pakken eller i ProTop.`);
    }
    const type = n.type === 'subprocess' && !(n.processKey && refs.processes.get(n.processKey)) ? 'activity' : (n.type || 'activity');
    return {
      ...n,
      type,
      roleLabel: n.roleLabel || lane?.label || '',
      roleKey: n.roleKey || lane?.roleKey || '',
      documentId: n.documentKey ? (refs.documents.get(n.documentKey) || '') : '',
      subprocessId: type === 'subprocess' ? (refs.processes.get(n.processKey) || '') : '',
      formKey: n.formKey ? (refs.forms.get(n.formKey) || '') : '',
      onClick: click || { type: 'none', ref: '' },
      onEnter: n.onEnter || undefined,
    };
  });
  return layoutSwimlanes({ lanes, nodes, edges: arr(spec?.edges) });
}

/** Feltverdier for en registerpost. Ref-felt i pakken bruker nøkler; de løses til id-er her. */
function recordValues(register, row, refs, issues) {
  const def = REGISTERS[register];
  const values = {};
  for (const f of def.fields) {
    if (row[f.key] === undefined) continue;
    let v = row[f.key];
    // Importkilden ({ system, ref, url }) er ikke en feltverdi, selv om registeret har et felt som heter «source».
    if (v && typeof v === 'object' && !Array.isArray(v)) continue;
    if (f.type === 'ref' || f.type === 'refmulti') {
      const map = f.ref === 'process' ? refs.processes : (f.ref === 'requirement' ? refs.requirements : refs.records.get(f.ref));
      const resolve = (k) => {
        const id = map?.get(String(k));
        if (!id) issues.push(`${def.title} «${row.title || row.key}»: fant ikke «${k}» for feltet ${f.label}.`);
        return id || '';
      };
      v = f.type === 'refmulti' ? arr(v).map(resolve).filter(Boolean) : resolve(v);
    }
    if (f.type === 'date' && v) v = isoDate(v) || '';
    values[f.key] = v;
  }
  if (row.needsReview || row.reviewNote) {
    values.needsReview = true;
    values.reviewNote = text(row.reviewNote, 1000);
  }
  // Hvor posten kom fra lagres som origin, så den ikke kolliderer med felt som heter «source» (f.eks. kompetansekrav).
  const origin = row.origin || (row.source && typeof row.source === 'object' ? row.source : null);
  if (origin) values.origin = origin;
  return values;
}

function stateAfter(register, row) {
  const def = REGISTERS[register];
  return row.state && def.states.includes(row.state) ? row.state : '';
}

/* ───────────────────────── Plan og bygging ───────────────────────── */

/**
 * Bygger alt som skal lagres. Ingen skriving her — kalleren lagrer i rekkefølgen som returneres.
 * options.sections: Set av del-id-er som skal med (standard: alle)
 * options.publish:  { documents, processes } — publiser direkte (krever godkjenner), ellers sendes til godkjenning
 * options.fillSystem: fyll tomme felt i oppsettet (omfang, standarder …), og fullfør oppsettet hvis det mangler
 */
export function buildImport(state, pkg, {
  actor, caps = null, now = new Date(), options = {}, anbudTemplates = [],
} = {}) {
  const sections = options.sections || new Set(PACKAGE_SECTIONS.map((s) => s.id));
  const want = (id) => sections.has(id);
  const publish = options.publish || {};
  const existing = existingIndex(state, anbudTemplates);
  const issues = [];
  const plan = Object.fromEntries(PACKAGE_SECTIONS.map((s) => [s.id, []]));
  const note = (section, key, title, status, message = '') => plan[section].push({ key, title, status, message });

  /* Oppsett først: standardene styrer hvilke ISO-krav som finnes. */
  let system = state.system;
  let systemPatch = null;
  if (want('system') && pkg.system) {
    const s = pkg.system;
    const cur = normalizeSystem(state.system);
    const next = { ...cur };
    const filled = [];
    const fill = (key, value, max = 4000) => {
      const v = text(value, max);
      if (v && !text(cur[key])) { next[key] = v; filled.push(key); }
    };
    fill('name', s.name, 200);
    fill('scopeText', s.scopeText, 4000);
    fill('units', s.units, 2000);
    fill('locations', s.locations, 2000);
    fill('activities', s.activities, 2000);
    fill('exclusions', s.exclusions, 2000);
    const std = uniq(arr(s.standards)).filter((c) => STANDARDS.some((x) => x.code === c));
    const added = std.filter((c) => !(cur.standards || []).includes(c));
    if (added.length) { next.standards = uniq([...(cur.standards || []), ...added]); filled.push('standards'); }
    const structure = normalizeDocStructure(s.docStructure);
    if (structure.length && !normalizeDocStructure(cur.docStructure).length) { next.docStructure = structure; filled.push('docStructure'); }
    if (s.profile && typeof s.profile === 'object' && !cur.profile) {
      next.profile = {
        vision: text(s.profile.vision, 2000),
        values: arr(s.profile.values).map((v) => text(v, 300)).filter(Boolean).slice(0, 12),
        businessGoals: text(s.profile.businessGoals, 4000),
        about: text(s.profile.about, 6000),
      };
      filled.push('profile');
    }
    if (options.fillSystem !== false && !cur.setupAt && next.standards?.length && text(next.scopeText)) {
      // Systemansvarlig blir den som importerer (kan endres i Innstillinger), med innlogging og godkjennerrett.
      next.ownerName = text(cur.ownerName) || text(actor?.name, 160);
      next.ownerUid = text(cur.ownerUid) || text(actor?.uid, 128);
      next.setupAt = now.toISOString();
      next.setupBy = text(actor?.name, 160);
      // Som ved aktivering i Innstillinger: systemansvarlig i rollene og godkjennerlisten for Firestore-reglene.
      next.roleMap = { ...(cur.roleMap || {}), system_owner: { name: next.ownerName, uid: next.ownerUid, label: 'Systemansvarlig K-HMS' } };
      next.approverUids = approverUidsFromRoles(next.roleMap, next.ownerUid);
      filled.push('setupAt');
    }
    if (filled.length) {
      systemPatch = { ...next, rev: (Number(cur.rev) || 0) + 1, updatedAt: now.toISOString(), updatedBy: text(actor?.name, 160), updatedByUid: text(actor?.uid, 128) };
      system = systemPatch;
      note('system', 'system', 'Oppsett', 'ny', `Fyller ut: ${filled.join(', ')}`);
    } else {
      note('system', 'system', 'Oppsett', 'finnes', 'Ingenting å fylle ut (feltene har verdi fra før).');
    }
  }
  // Arbeidskopi av tilstanden med nytt oppsett, så ISO-kravene for nye standarder kan brukes.
  let work = { ...state, system: normalizeSystem(system) };

  /* Referansekart nøkkel → id (eksisterende eller nye). */
  const refs = {
    documents: new Map(),
    processes: new Map(),
    requirements: new Map(),
    forms: new Map(),
    records: new Map(Object.keys(REGISTERS).map((k) => [k, new Map()])),
  };
  for (const row of pkg.documents) { const hit = existing.get(importKeyFor(pkg, 'documents', row.key)); if (hit) refs.documents.set(row.key, hit.row.id); }
  for (const row of pkg.processes) { const hit = existing.get(importKeyFor(pkg, 'processes', row.key)); if (hit) refs.processes.set(row.key, hit.row.id); }
  for (const row of pkg.requirements) { const hit = existing.get(importKeyFor(pkg, 'requirements', row.key)); if (hit) refs.requirements.set(row.key, hit.row.id); }
  for (const row of pkg.forms) refs.forms.set(row.key, formTemplateIdFor(pkg, row.key));
  for (const [register, rows] of Object.entries(pkg.records)) {
    for (const row of rows) { const hit = existing.get(importKeyFor(pkg, `records.${register}`, row.key)); if (hit) refs.records.get(register).set(row.key, hit.row.id); }
  }

  const out = {
    system: systemPatch,
    requirements: [],
    documents: [],
    processes: [],
    records: [],
    assessments: null,
    evidence: null,
    forms: [],
    news: [],
    publishDocuments: [],
    publishProcesses: [],
    events: [],
  };

  /* Krav (lov/kontrakt/internt) — før registre, som kan peke til dem. */
  if (want('requirements')) {
    for (const row of pkg.requirements) {
      const ik = importKeyFor(pkg, 'requirements', row.key);
      if (existing.has(ik)) { note('requirements', row.key, row.title, 'finnes'); continue; }
      const res = createCustomRequirement({ ...row, areaKeys: arr(row.areaKeys) }, { actor, now });
      if (!res.ok) { note('requirements', row.key, row.title, 'feil', res.error); continue; }
      const requirement = { ...res.requirement, importKey: ik, templateKey: text(row.templateKey, 60) || undefined, lastCheckedAt: isoDate(row.lastCheckedAt) || res.requirement.lastCheckedAt };
      if (!requirement.templateKey) delete requirement.templateKey;
      refs.requirements.set(row.key, requirement.id);
      out.requirements.push({ ...res, requirement });
      note('requirements', row.key, row.title, 'ny');
    }
  }
  work = { ...work, requirements: [...(work.requirements || []), ...out.requirements.map((r) => r.requirement)] };

  /* Dokumenter. */
  const docRows = [];
  if (want('documents')) {
    let docs = [...(state.documents || [])];
    for (const row of pkg.documents) {
      const ik = importKeyFor(pkg, 'documents', row.key);
      if (existing.has(ik)) { note('documents', row.key, `${row.code || ''} ${row.title}`.trim(), 'finnes'); continue; }
      const res = createDocument(documentInput(pkg, row, { state: work }), { actor, existing: docs, now });
      if (!res.ok) { note('documents', row.key, `${row.code || ''} ${row.title}`.trim(), 'feil', res.error); continue; }
      const document = { ...res.document, importKey: ik };
      docs = [...docs, document];
      refs.documents.set(row.key, document.id);
      docRows.push({ row, document, events: res.events });
      note('documents', row.key, `${document.code} ${document.title}`, 'ny', publish.documents ? 'Publiseres' : 'Sendes til godkjenning');
    }
  }

  /* Prosesser: to omganger, så prosesser kan peke til hverandre (underprosess, neste prosess). */
  const procRows = [];
  if (want('processes')) {
    for (const row of pkg.processes) {
      const ik = importKeyFor(pkg, 'processes', row.key);
      if (existing.has(ik)) { note('processes', row.key, `${row.code || ''} ${row.title}`.trim(), 'finnes'); continue; }
      const res = createProcess({
        title: row.title,
        code: row.code,
        order: row.order,
        category: PROCESS_CATEGORIES.some((c) => c.id === row.category) ? row.category : 'kjerne',
        ownerName: row.ownerName,
        purpose: row.purpose,
        inputs: row.inputs,
        outputs: row.outputs,
        kpi: row.kpi,
        requirementIds: uniq(arr(row.requirementAreas).flatMap((a) => requirementIdsForArea(work, a))),
      }, { actor, now });
      if (!res.ok) { note('processes', row.key, row.title, 'feil', res.error); continue; }
      refs.processes.set(row.key, res.process.id);
      procRows.push({ row, res, ik });
    }
    for (const { row, res, ik } of procRows) {
      const local = [];
      const diagram = row.diagram ? diagramFromPackage(row.diagram, refs, local) : normalizeDiagram(res.process.versions[0].diagram);
      issues.push(...local.map((m) => `${row.code || row.title}: ${m}`));
      const documentIds = uniq(arr(row.documentKeys).map((k) => refs.documents.get(k)).filter(Boolean));
      const missingDocs = arr(row.documentKeys).filter((k) => !refs.documents.get(k));
      if (missingDocs.length) issues.push(`${row.code || row.title}: styrende dokumenter som ikke finnes: ${missingDocs.join(', ')}.`);
      const process = {
        ...res.process,
        documentIds,
        importKey: ik,
        ...(row.source ? { source: row.source } : {}),
        versions: res.process.versions.map((v, i) => (i === 0 ? { ...v, diagram, changeNote: row.changeNote || `Importert fra ${pkg.source?.system || 'tidligere system'}` } : v)),
      };
      const check = validateDiagram(diagram, {});
      const message = check.ok ? (publish.processes ? 'Publiseres' : 'Sendes til godkjenning') : `Lagres som utkast: ${check.errors[0].message}`;
      out.processes.push({ ...res, process, validation: check });
      note('processes', row.key, `${process.code ? `${process.code} ` : ''}${process.title}`, 'ny', message);
    }
    // Dokumenter som hører til prosessene (styrende dokumenter) får prosesskoblingen.
    for (const d of docRows) {
      const ids = uniq([...arr(d.row.processKeys).map((k) => refs.processes.get(k)), ...out.processes.filter((p) => p.process.documentIds.includes(d.document.id)).map((p) => p.process.id)].filter(Boolean));
      if (ids.length) d.document = { ...d.document, processIds: uniq([...(d.document.processIds || []), ...ids]) };
    }
  }

  /* Dokumentstatus: til godkjenning, eller publisert når importøren er godkjenner og ber om det. */
  for (const d of docRows) {
    let document = d.document;
    let events = d.events;
    const sub = submitDocument(document, { actor, caps, now });
    if (sub.ok) {
      document = sub.document;
      events = [...events, ...sub.events];
    }
    out.documents.push({ ok: true, document, events });
    if (publish.documents && sub.ok && (!caps || caps.approve)) {
      const pub = approveAndPublishDocument(document, { actor, caps, now, effectiveFrom: d.row.effectiveFrom });
      if (pub.ok) out.publishDocuments.push(pub);
    }
  }

  /* Prosessstatus. */
  const context = {
    forms: [...(state.forms || [])],
    documents: [...(state.documents || []), ...out.documents.map((d) => d.document), ...out.publishDocuments.map((d) => d.document)],
    processes: [...(state.processes || []), ...out.processes.map((p) => p.process)],
  };
  out.processes = out.processes.map((p) => {
    if (!p.validation.ok) return p;
    // Diagramreferanser til skjema/dokument valideres mot det som er publisert; uten kontekst ved innsending.
    const sub = submitForApproval(p.process, {}, { actor, caps, now });
    if (!sub.ok) return p;
    const next = { ...p, process: sub.process, events: [...p.events, ...sub.events] };
    if (publish.processes && (!caps || caps.approve)) {
      const pub = approveAndPublish(sub.process, context, { actor, caps, now, note: 'Godkjent ved import' });
      if (pub.ok) out.publishProcesses.push(pub);
      else issues.push(`${p.process.code || p.process.title}: ble ikke publisert (${pub.error}). Ligger til godkjenning.`);
    }
    return next;
  });

  /* Registre. Roller før myndighetsmatrise (som peker til roller). */
  if (want('records')) {
    const order = ['rolle', ...Object.keys(pkg.records).filter((k) => k !== 'rolle')];
    for (const register of order) {
      const rows = pkg.records[register];
      if (!rows) continue;
      let list = [...(state.records?.[register] || [])];
      for (const row of rows) {
        const ik = importKeyFor(pkg, `records.${register}`, row.key);
        const title = row.title || row.activity || row.key;
        if (existing.has(ik)) { note('records', `${register}:${row.key}`, `${REGISTERS[register].title}: ${title}`, 'finnes'); continue; }
        const local = [];
        const values = recordValues(register, row, refs, local);
        issues.push(...local);
        const res = createRecord(register, values, { actor, existing: list, now, riskMethod: work.system.riskMethod });
        if (!res.ok) { note('records', `${register}:${row.key}`, `${REGISTERS[register].title}: ${title}`, 'feil', res.error); continue; }
        let record = { ...res.record, importKey: ik };
        const st = stateAfter(register, row);
        if (st && st !== record.state) record = { ...record, state: st };
        if (register === 'mal' && arr(row.measurements).length) {
          record = { ...record, measurements: arr(row.measurements).map((m) => ({ period: text(m.period, 20), value: Number(m.value), quality: m.quality || 'Målt', source: text(m.source, 300), at: now.toISOString(), by: text(actor?.name, 160) })).filter((m) => m.period && Number.isFinite(m.value)) };
        }
        if (register === 'beredskap' && arr(row.exercises).length) {
          record = { ...record, exercises: arr(row.exercises).map((x, i) => ({ id: `ovl_imp_${i}`, date: isoDate(x.date), participants: text(x.participants, 1000), evaluation: text(x.evaluation, 3000), improvement: !!x.improvement, by: text(actor?.name, 160), at: now.toISOString() })).filter((x) => x.date && x.evaluation) };
        }
        list = [...list, record];
        refs.records.get(register).set(row.key, record.id);
        out.records.push({ ...res, record });
        note('records', `${register}:${row.key}`, `${REGISTERS[register].title}: ${title}`, 'ny', record.needsReview ? `Må gjennomgås: ${record.reviewNote || ''}`.trim() : '');
      }
    }
  }

  /* Kravvurderinger (f.eks. GAP-analyse). Aldri «internt verifisert» ved import. */
  if (want('assessments') && pkg.assessments.length) {
    let tmp = { ...work, assessments: [...(state.assessments || [])] };
    const all = allRequirements(tmp);
    for (const row of pkg.assessments) {
      const target = row.requirementKey
        ? refs.requirements.get(row.requirementKey)
        : all.find((r) => r.kind === 'iso' && r.standard === row.standard && r.areaKey === row.area)?.id;
      const label = row.title || `${row.standard || ''} ${row.area || row.requirementKey || ''}`.trim();
      if (!target) { note('assessments', row.key, label, 'feil', 'Fant ikke kravet. Er standarden valgt i oppsettet?'); continue; }
      if (row.status === 'internt_verifisert') { note('assessments', row.key, label, 'feil', '«Internt verifisert» krever vurdert bevis og settes ikke ved import.'); continue; }
      const current = (tmp.assessments || []).find((a) => a.requirementId === target);
      if (current && current.status !== 'ikke_vurdert' && !row.overwrite) { note('assessments', row.key, label, 'finnes', 'Kravet er allerede vurdert. Vurderingen beholdes.'); continue; }
      const res = setAssessment(tmp, target, { status: row.status, rationale: row.rationale, ownerName: row.ownerName, nextReview: row.nextReview }, { actor, caps, now });
      if (!res.ok) { note('assessments', row.key, label, 'feil', res.error); continue; }
      tmp = { ...tmp, assessments: res.assessments };
      out.events.push(...res.events);
      note('assessments', row.key, label, 'ny', row.status);
    }
    out.assessments = tmp.assessments;
  }

  /* Publiserte dokumenter blir bevis for kravene de er koblet til (som ved publisering i Dokumenter). */
  if (out.publishDocuments.length) {
    let tmp = { ...work, assessments: out.assessments || [...(state.assessments || [])], evidence: [...(state.evidence || [])], evidenceLinks: [...(state.evidenceLinks || [])] };
    for (const pub of out.publishDocuments) {
      const d = pub.document;
      if (!(d.requirementIds || []).length) continue;
      const att = attachEvidence(tmp, { type: 'document', objectId: d.id, objectRevision: d.publishedRevision, label: `${d.code} ${d.title} rev. ${d.publishedRevision}` }, d.requirementIds, { actor, now });
      if (!att.ok) continue;
      tmp = { ...tmp, evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments };
      out.events.push(...att.events);
    }
    out.assessments = tmp.assessments;
    out.evidence = { evidence: tmp.evidence, evidenceLinks: tmp.evidenceLinks };
  }

  /* Skjema og sjekklister til Skjemabygger. */
  if (want('forms')) {
    for (const row of pkg.forms) {
      const id = formTemplateIdFor(pkg, row.key);
      if (anbudTemplates.some((t) => t.id === id)) { note('forms', row.key, row.title, 'finnes'); continue; }
      const fields = arr(row.fields).filter((f) => FORM_KINDS.has(f?.kind)).slice(0, MAX_FORM_FIELDS).map((f, i) => ({
        id: text(f.id, 40) || `f${i + 1}`,
        label: text(f.label, f.kind === 'note' ? 4000 : 300),
        kind: f.kind,
        required: !!f.required,
        help: text(f.help, 180),
        options: arr(f.options).map((o, j) => (typeof o === 'string' ? { id: `${text(f.id, 40) || `f${i + 1}`}_${j}`, label: text(o, 120) } : { id: text(o.id, 60) || `o${j}`, label: text(o.label, 120) })),
        scaleMin: f.kind === 'scale' ? Number(f.scaleMin) || 1 : undefined,
        scaleMax: f.kind === 'scale' ? Number(f.scaleMax) || 5 : undefined,
        lowLabel: f.kind === 'scale' ? text(f.lowLabel, 40) : undefined,
        highLabel: f.kind === 'scale' ? text(f.highLabel, 40) : undefined,
      }));
      if (arr(row.fields).length > MAX_FORM_FIELDS) issues.push(`Skjema «${row.title}»: bare de første ${MAX_FORM_FIELDS} feltene får plass i Skjemabygger.`);
      if (!fields.some((f) => !['title', 'note'].includes(f.kind))) { note('forms', row.key, row.title, 'feil', 'Skjemaet har ingen felt å fylle ut.'); continue; }
      out.forms.push({
        key: row.key,
        approve: row.approve !== false,
        template: { id, title: text(row.title, 80), category: row.category === 'avtale' ? 'avtale' : 'skjema', intro: text(row.intro, 280), fields, importKey: importKeyFor(pkg, 'forms', row.key) },
      });
      note('forms', row.key, row.title, 'ny', row.approve !== false ? 'Legges i Skjemabygger og godkjennes som styrt skjema' : 'Legges i Skjemabygger');
    }
  }

  /* Nyheter: kunngjøring i ledelsessystemet (dokumenttype «nyhet», med lesebekreftelse om ønsket),
     og eventuelt også på Nyheter i Selskap (gjøres av kalleren). */
  if (want('news')) {
    let docs = [...(state.documents || []), ...out.documents.map((d) => d.document)];
    for (const row of pkg.news) {
      const ik = importKeyFor(pkg, 'news', row.key);
      const post = { key: row.key, importKey: ik, title: text(row.title, 140), body: text(row.body, 6000), category: text(row.category, 40) || 'selskap', linkUrl: text(row.linkUrl, 2000) };
      if (existing.has(ik)) { note('news', row.key, row.title, 'finnes'); continue; }
      const res = createDocument({
        title: row.title,
        docType: 'nyhet',
        code: row.code,
        ownerName: row.ownerName || actor?.name,
        content: row.content || row.body,
        readAckRequired: !!row.readAckRequired,
        reviewIntervalMonths: 36,
        tags: ['nyhet'],
        legacyRevisions: cleanLegacyRevisions(row.legacyRevisions),
        source: row.source || null,
        changeReason: `Importert nyhet${row.publishedAt ? ` publisert ${row.publishedAt}` : ''}`,
        requirementIds: requirementIdsForDocument(work, 'nyhet'),
      }, { actor, existing: docs, now });
      if (!res.ok) { note('news', row.key, row.title, 'feil', res.error); continue; }
      let document = { ...res.document, importKey: ik };
      let events = res.events;
      const sub = submitDocument(document, { actor, caps, now });
      if (sub.ok) { document = sub.document; events = [...events, ...sub.events]; }
      docs = [...docs, document];
      out.documents.push({ ok: true, document, events });
      if (publish.documents && sub.ok && (!caps || caps.approve)) {
        const pub = approveAndPublishDocument(document, { actor, caps, now });
        if (pub.ok) out.publishDocuments.push(pub);
      }
      out.news.push(post);
      note('news', row.key, row.title, 'ny', publish.documents ? 'Publiseres i ISO' : 'Sendes til godkjenning');
    }
  }

  return { ok: true, plan, issues: [...new Set(issues)], out, refs };
}

/** Tørrkjøring: hva blir opprettet, hva finnes, hva feiler. */
export function planImport(state, pkg, opts = {}) {
  const res = buildImport(state, pkg, opts);
  const counts = {};
  for (const [section, rows] of Object.entries(res.plan)) {
    counts[section] = {
      ny: rows.filter((r) => r.status === 'ny').length,
      finnes: rows.filter((r) => r.status === 'finnes').length,
      feil: rows.filter((r) => r.status === 'feil').length,
    };
  }
  return { plan: res.plan, counts, issues: res.issues };
}

/** Én samleoppgave til godkjenneren i stedet for én per dokument. */
export function approvalTaskFor(pkg, built) {
  const docs = built.out.documents.filter((d) => !built.out.publishDocuments.some((p) => p.document.id === d.document.id)).length;
  const procs = built.out.processes.filter((p) => p.process.versions?.[0]?.state === 'til_godkjenning' && !built.out.publishProcesses.some((x) => x.process.id === p.process.id)).length;
  if (!docs && !procs) return null;
  return {
    type: 'requestApproval',
    key: `isoimport_${pkg.id}_godkjenning`.replace(/[^A-Za-z0-9_-]/g, '_'),
    title: `Importert ledelsessystem: ${docs} dokumenter og ${procs} prosesser venter på godkjenning`,
    description: `Fra «${pkg.title}». Åpne ISO → Dokumenter (bare til godkjenning) og ISO → Prosesser. Les gjennom, rett og godkjenn.`,
    roleKey: 'top_management',
    roleLabel: 'Øverste ledelse',
    dueDays: 30,
  };
}

/** Forslag til neste revisjonsdato ut fra intervallet (brukes i forhåndsvisningen). */
export function nextReviewFrom(months, now = new Date()) {
  return addDays(todayKey(now), Math.round((Number(months) || 12) * 30.4));
}

export { makeNode };
