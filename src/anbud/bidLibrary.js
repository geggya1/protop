/** Dokumentmapper, opplastede filer og bedriftsskjema i ett tilbudsarbeid. */

import { coerceAnswer, emptyAnswer, normalizeBuilderField, normalizeResponses, normalizeSettings, cleanCover } from './formBuilder.js';
import { deadlinePassedAt, parseDeadline } from './noticeText.js';

export const GROUND_FOLDER_ID = 'grunnlag';
export const GROUND_ATTACH_FOLDER_ID = 'grunnlag_vedlegg';
export const QA_FOLDER_ID = 'qa';
export const QA_ATTACH_FOLDER_ID = 'qa_vedlegg';
export const WORK_ATTACH_FOLDER_ID = 'arbeid_vedlegg';

const SYSTEM_FOLDER_IDS = new Set([
  GROUND_FOLDER_ID,
  GROUND_ATTACH_FOLDER_ID,
  QA_FOLDER_ID,
  QA_ATTACH_FOLDER_ID,
  WORK_ATTACH_FOLDER_ID,
]);

export const BID_STEPS = [
  { id: 'grunnlag', label: '1 Konkurransegrunnlag' },
  { id: 'qa', label: '2 Spørsmål og svar' },
  { id: 'arbeid', label: '3 Tilbudsarbeid' },
];

export const WORK_ITEM_KINDS = [
  { id: 'tilbudsbrev', label: 'Tilbudsbrev' },
  { id: 'kvalifikasjon', label: 'Svar på kvalifikasjonsgrunnlag' },
  { id: 'tildeling', label: 'Svar på tildelingskriterium' },
  { id: 'sjekk', label: 'Sjekkpunkt' },
  { id: 'annet', label: 'Annet' },
];

export const WORK_ITEM_STATUSES = [
  { id: 'ikke-startet', label: 'Ikke startet' },
  { id: 'under-arbeid', label: 'Under arbeid' },
  { id: 'klart', label: 'Klart' },
  { id: 'levert', label: 'Levert' },
];

const WORK_KIND_IDS = new Set(WORK_ITEM_KINDS.map((row) => row.id));
const WORK_STATUS_IDS = new Set(WORK_ITEM_STATUSES.map((row) => row.id));
const STEP_IDS = new Set(BID_STEPS.map((row) => row.id));

export function isSystemFolderId(id) {
  return SYSTEM_FOLDER_IDS.has(text(id));
}

export const DEFAULT_FORM_TEMPLATES = [
  {
    id: 'tilbudsbrev',
    title: 'Tilbudsbrev',
    intro: 'Følgebrev som sendes med tilbudet.',
    fields: [
      { id: 'mottaker', label: 'Oppdragsgiver', kind: 'text' },
      { id: 'sum', label: 'Tilbudssum ekskl. mva', kind: 'number' },
      { id: 'gyldig', label: 'Tilbudet er gyldig til', kind: 'date' },
      { id: 'merknad', label: 'Merknader', kind: 'long' },
    ],
  },
  {
    id: 'egenerklaering',
    title: 'Egenerklæring',
    intro: 'Gjennomgang av det bedriften må bekrefte før innlevering.',
    fields: [
      { id: 'skatt', label: 'Skatt og merverdiavgift er i orden', kind: 'check' },
      { id: 'konkurs', label: 'Ikke konkurs eller avvikling', kind: 'check' },
      { id: 'hms', label: 'HMS-system kan dokumenteres', kind: 'check' },
      { id: 'kommentar', label: 'Kommentar til egenerklæringen', kind: 'long' },
    ],
  },
  {
    id: 'referanser',
    title: 'Referanseprosjekter',
    intro: 'Oppdrag som dekker kravet i konkurransen.',
    fields: [
      { id: 'prosjekt', label: 'Prosjekt og oppdragsgiver', kind: 'long' },
      { id: 'periode', label: 'Periode', kind: 'text' },
      { id: 'verdi', label: 'Kontraktssum', kind: 'text' },
      { id: 'kontakt', label: 'Referansekontakt', kind: 'text' },
    ],
  },
  {
    id: 'hms',
    title: 'HMS og kvalitet',
    intro: 'Kort redegjørelse som kan legges ved tilbudet.',
    fields: [
      { id: 'system', label: 'HMS- og kvalitetssystem', kind: 'long' },
      { id: 'organisasjon', label: 'Organisering på oppdraget', kind: 'long' },
      { id: 'avvik', label: 'Avvik og forbedring siste år', kind: 'long' },
      { id: 'vedlegg', label: 'Vedlegg av HMS-dokumentasjon', kind: 'file' },
    ],
  },
  {
    id: 'pris',
    title: 'Prissammendrag',
    intro: 'Internt sammendrag før prisen låses.',
    fields: [
      { id: 'kalkyle', label: 'Kalkylegrunnlag', kind: 'long' },
      { id: 'risiko', label: 'Risiko og forbehold', kind: 'long' },
      { id: 'sum', label: 'Sum som legges i tilbudet', kind: 'number' },
    ],
  },
];

const FILE_STATUSES = new Set(['lastet', 'portal', 'lenke', 'for-stor']);

function text(value) {
  return String(value || '').trim();
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function bidById(state, id) {
  return (state?.bids || []).find((row) => row.id === id) || null;
}

function replaceBid(state, id, next) {
  return { ...state, bids: state.bids.map((row) => (row.id === id ? next : row)) };
}

export function groundFolder() {
  return {
    id: GROUND_FOLDER_ID,
    name: 'Konkurransegrunnlag',
    parentId: null,
    locked: true,
    system: true,
    emoji: '📄',
    color: '#1099F4',
  };
}

export function qaFolder() {
  return {
    id: QA_FOLDER_ID,
    name: 'Spørsmål og svar',
    parentId: null,
    locked: true,
    system: true,
    emoji: '💬',
    color: '#0ea5e9',
  };
}

/** Systemmapper for egne opplastinger under grunnlag, Q&A og tilbudsarbeid. */
export function attachFolders() {
  return [
    {
      id: GROUND_ATTACH_FOLDER_ID,
      name: 'Egne vedlegg til grunnlaget',
      parentId: null,
      locked: false,
      system: true,
      emoji: '📎',
      color: '#1099F4',
    },
    {
      id: QA_ATTACH_FOLDER_ID,
      name: 'Vedlegg til spørsmål og svar',
      parentId: null,
      locked: false,
      system: true,
      emoji: '💬',
      color: '#0ea5e9',
    },
    {
      id: WORK_ATTACH_FOLDER_ID,
      name: 'Vedlegg til tilbudsarbeid',
      parentId: null,
      locked: false,
      system: true,
      emoji: '📂',
      color: '#0f766e',
    },
  ];
}

function noticeBody(dossier) {
  const rows = [
    dossier?.title,
    dossier?.buyer ? `Oppdragsgiver: ${dossier.buyer}` : '',
    dossier?.description,
    dossier?.procedureOutline,
    dossier?.additionalInfo,
    dossier?.procedure ? `Prosedyre: ${dossier.procedure}` : '',
    dossier?.submissionDeadline ? `Tilbudsfrist: ${dossier.submissionDeadline}` : '',
    dossier?.questionDeadline ? `Frist for spørsmål: ${dossier.questionDeadline}` : '',
    dossier?.electronicSubmission ? `Innlevering: ${dossier.electronicSubmission}` : '',
    dossier?.espd ? `ESPD: ${dossier.espd === true ? 'Egenerklæring brukes' : dossier.espd}` : '',
  ];
  return rows.map((row) => text(row)).filter(Boolean).join('\n\n');
}

function qaBody(dossier) {
  const rows = Array.isArray(dossier?.qa) ? dossier.qa : [];
  return rows.map((row) => {
    const question = text(row?.question);
    if (!question) return '';
    return `Spørsmål: ${question}\nSvar: ${text(row?.answer) || 'Ikke publisert'}`;
  }).filter(Boolean).join('\n\n');
}

export function competitionDocuments(dossier) {
  const docs = [];
  const body = noticeBody(dossier);
  if (body) {
    docs.push({
      name: 'Kunngjøring.txt',
      mimeType: 'text/plain',
      text: body,
      source: 'kunngjøring',
      status: 'lastet',
      url: text(dossier?.noticeUrl || dossier?.documentsUrl),
    });
  }
  const seen = new Set(['kunngjøring.txt']);
  for (const file of Array.isArray(dossier?.portalFiles) ? dossier.portalFiles : []) {
    const name = text(file?.name);
    const key = name.toLocaleLowerCase('nb-NO');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const downloaded = text(file?.dataUrl) || text(file?.text);
    docs.push({
      name,
      mimeType: text(file?.mimeType),
      text: text(file?.text),
      dataUrl: text(file?.dataUrl),
      url: text(file?.url || dossier?.documentsUrl),
      size: Number(file?.size) || 0,
      sizeLabel: text(file?.sizeLabel || (typeof file?.size === 'string' ? file.size : '')),
      source: 'portal',
      status: downloaded ? 'lastet' : 'portal',
    });
  }
  for (const doc of Array.isArray(dossier?.documents) ? dossier.documents : []) {
    const name = text(doc?.title) || 'Dokument';
    const key = name.toLocaleLowerCase('nb-NO');
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({
      name,
      mimeType: '',
      url: text(doc?.url),
      source: 'lenke',
      status: 'lenke',
    });
  }
  const answers = qaBody(dossier);
  if (answers) {
    docs.push({
      name: 'Spørsmål og svar.txt',
      mimeType: 'text/plain',
      text: answers,
      source: 'qa',
      status: 'lastet',
      url: '',
    });
  }
  return docs;
}

function cleanDataUrl(value) {
  const raw = text(value);
  if (!raw.startsWith('data:') || raw.length > 700000) return '';
  return raw;
}

function normalizeFile(raw, folderIds) {
  const name = text(raw?.name).slice(0, 180);
  const id = text(raw?.id);
  if (!name || !id) return null;
  const folderId = folderIds.has(raw?.folderId) ? raw.folderId : GROUND_FOLDER_ID;
  const status = FILE_STATUSES.has(raw?.status) ? raw.status : 'lenke';
  const dataUrl = cleanDataUrl(raw?.dataUrl);
  const fileText = text(raw?.text).slice(0, 200000);
  const url = text(raw?.url).slice(0, 500);
  const loaded = !!(dataUrl || fileText || url);
  return {
    id,
    folderId,
    name,
    mimeType: text(raw?.mimeType).slice(0, 120),
    text: fileText,
    dataUrl,
    url,
    storagePath: text(raw?.storagePath).slice(0, 500),
    size: Number(raw?.size) || 0,
    sizeLabel: text(raw?.sizeLabel).slice(0, 40),
    source: text(raw?.source).slice(0, 40) || 'egen',
    status: loaded ? 'lastet' : status,
    kind: raw?.kind === 'egen' ? 'egen' : 'grunnlag',
    checkId: text(raw?.checkId).slice(0, 80),
    createdAt: text(raw?.createdAt),
  };
}

function normalizeFolder(raw) {
  const id = text(raw?.id);
  const name = text(raw?.name).slice(0, 80);
  if (!id || !name || isSystemFolderId(id)) return null;
  const parentId = text(raw?.parentId) || null;
  return {
    id,
    name,
    parentId: isSystemFolderId(parentId) && parentId !== GROUND_ATTACH_FOLDER_ID && parentId !== QA_ATTACH_FOLDER_ID && parentId !== WORK_ATTACH_FOLDER_ID
      ? null
      : (parentId === GROUND_FOLDER_ID || parentId === QA_FOLDER_ID ? null : parentId),
    locked: false,
    system: false,
    emoji: text(raw?.emoji).slice(0, 4) || '📁',
    color: /^#[0-9a-fA-F]{6}$/.test(text(raw?.color)) ? text(raw.color) : '#0ea5e9',
  };
}

function normalizeCheckItem(raw, prefix) {
  const title = text(raw?.title || raw?.label).slice(0, 200);
  if (!title) return null;
  return {
    id: text(raw?.id) || createId(prefix),
    title,
    detail: text(raw?.detail || raw?.summary).slice(0, 4000),
    done: !!raw?.done,
  };
}

function normalizeExpandItem(raw, prefix) {
  const title = text(raw?.title || raw?.label).slice(0, 200);
  if (!title) return null;
  return {
    id: text(raw?.id) || createId(prefix),
    title,
    summary: text(raw?.summary).slice(0, 800),
    detail: text(raw?.detail || raw?.content).slice(0, 8000),
    weight: text(raw?.weight).slice(0, 40),
  };
}

export function normalizeWorkItem(raw) {
  const title = text(raw?.title || raw?.label).slice(0, 200);
  if (!title) return null;
  const kind = WORK_KIND_IDS.has(raw?.kind) ? raw.kind : 'annet';
  const status = WORK_STATUS_IDS.has(raw?.status) ? raw.status : 'ikke-startet';
  return {
    id: text(raw?.id) || createId('sjekk'),
    kind,
    title,
    detail: text(raw?.detail || raw?.summary).slice(0, 8000),
    status,
    ownerId: text(raw?.ownerId).slice(0, 80),
    ownerName: text(raw?.ownerName).slice(0, 120),
    note: text(raw?.note).slice(0, 4000),
    weight: text(raw?.weight).slice(0, 40),
    source: raw?.source === 'egen' ? 'egen' : 'ai',
    selected: raw?.selected === false ? false : true,
  };
}

export function workItemKindLabel(kind) {
  return WORK_ITEM_KINDS.find((row) => row.id === kind)?.label || 'Annet';
}

export function workItemStatusLabel(status) {
  return WORK_ITEM_STATUSES.find((row) => row.id === status)?.label || 'Ikke startet';
}

export function normalizeInterpretation(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    summary: text(src.summary).slice(0, 4000),
    checklist: (Array.isArray(src.checklist) ? src.checklist : []).map((row) => normalizeCheckItem(row, 'sjekk')).filter(Boolean).slice(0, 40),
    qualification: (Array.isArray(src.qualification) ? src.qualification : []).map((row) => normalizeExpandItem(row, 'kval')).filter(Boolean).slice(0, 30),
    awardCriteria: (Array.isArray(src.awardCriteria) ? src.awardCriteria : []).map((row) => normalizeExpandItem(row, 'tild')).filter(Boolean).slice(0, 30),
    deliverables: (Array.isArray(src.deliverables) ? src.deliverables : []).map((row) => normalizeWorkItem({ ...row, source: 'ai' })).filter(Boolean).slice(0, 30),
    generatedAt: text(src.generatedAt),
    engine: text(src.engine).slice(0, 40),
  };
}

export function normalizeStepNotes(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    grunnlag: text(src.grunnlag).slice(0, 20000),
    qa: text(src.qa).slice(0, 20000),
    arbeid: text(src.arbeid).slice(0, 20000),
  };
}

export function normalizeStepAi(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const one = (row) => ({
    summary: text(row?.summary).slice(0, 4000),
    generatedAt: text(row?.generatedAt),
    engine: text(row?.engine).slice(0, 40),
  });
  return {
    grunnlag: one(src.grunnlag),
    qa: one(src.qa),
  };
}

function normalizeField(raw) {
  return normalizeBuilderField(raw);
}

function normalizeTemplate(row) {
  const title = text(row?.title).slice(0, 80);
  const id = text(row?.id);
  if (!title || !id) return null;
  const fields = (Array.isArray(row.fields) ? row.fields : []).map(normalizeField).filter(Boolean).slice(0, 40);
  if (!fields.length) return null;
  return {
    id,
    title,
    intro: text(row?.intro).slice(0, 280),
    cover: cleanCover(row?.cover),
    settings: normalizeSettings(row?.settings),
    responses: normalizeResponses(row?.responses),
    fields,
  };
}

export function normalizeFormTemplates(input) {
  const source = Array.isArray(input) ? input : DEFAULT_FORM_TEMPLATES;
  return source.map(normalizeTemplate).filter(Boolean).slice(0, 80);
}

function normalizeForm(raw) {
  const id = text(raw?.id);
  const title = text(raw?.title).slice(0, 80);
  if (!id || !title) return null;
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).map(normalizeField).filter(Boolean).slice(0, 40);
  return {
    id,
    templateId: text(raw?.templateId),
    title,
    intro: text(raw?.intro).slice(0, 280),
    status: raw?.status === 'ferdig' ? 'ferdig' : 'apent',
    fields,
    updatedAt: text(raw?.updatedAt),
  };
}

function normalizeQuestion(raw) {
  const id = text(raw?.id);
  const question = text(raw?.question).slice(0, 2000);
  if (!id || !question) return null;
  return {
    id,
    question,
    answer: text(raw?.answer).slice(0, 4000),
    status: raw?.status === 'besvart' ? 'besvart' : 'apent',
    createdAt: text(raw?.createdAt),
  };
}

export function normalizeAssignment(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    personId: text(src.personId).slice(0, 80),
    personName: text(src.personName).slice(0, 120),
    unitId: text(src.unitId).slice(0, 80),
    unitName: text(src.unitName).slice(0, 160),
    unitKind: text(src.unitKind).slice(0, 40),
    companyId: text(src.companyId).slice(0, 80),
    companyName: text(src.companyName).slice(0, 160),
    note: text(src.note).slice(0, 400),
    updatedAt: text(src.updatedAt),
  };
}

export function updateBidAssignment(state, bidId, input = {}) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  return ok(replaceBid(state, bidId, {
    ...bid,
    assignment: normalizeAssignment({
      ...bid.assignment,
      ...input,
      updatedAt: new Date().toISOString(),
    }),
  }));
}

export function normalizeBidWork(raw) {
  const bid = raw && typeof raw === 'object' ? raw : {};
  const folders = [
    groundFolder(),
    qaFolder(),
    ...attachFolders(),
    ...(Array.isArray(bid.folders) ? bid.folders : []).map(normalizeFolder).filter(Boolean),
  ];
  const seenFolders = new Set();
  const uniqueFolders = [];
  for (const folder of folders) {
    if (seenFolders.has(folder.id)) continue;
    seenFolders.add(folder.id);
    const parentOk = !folder.parentId || seenFolders.has(folder.parentId) || folders.some((row) => row.id === folder.parentId);
    uniqueFolders.push(parentOk ? folder : { ...folder, parentId: null });
  }
  const folderIds = new Set(uniqueFolders.map((row) => row.id));
  const stored = (Array.isArray(bid.files) ? bid.files : []).map((row) => normalizeFile(row, folderIds)).filter(Boolean);
  const incoming = competitionDocuments(bid.dossier).map((row) => {
    const qa = row.source === 'qa';
    return {
      ...row,
      id: `${qa ? 'qa' : 'grunnlag'}_${row.name.toLocaleLowerCase('nb-NO').replace(/[^a-z0-9æøå]+/gi, '_').slice(0, 40)}`,
      folderId: qa ? QA_FOLDER_ID : GROUND_FOLDER_ID,
      kind: 'grunnlag',
      createdAt: '',
    };
  });
  const previous = new Map(stored.filter((row) => (
    row.folderId === GROUND_FOLDER_ID || row.folderId === QA_FOLDER_ID
  )).map((row) => [`${row.folderId}:${row.name.toLocaleLowerCase('nb-NO')}`, row]));
  const published = incoming.map((row) => {
    const prev = previous.get(`${row.folderId}:${row.name.toLocaleLowerCase('nb-NO')}`);
    if (!prev) return row;
    return {
      ...row,
      id: prev.id,
      text: row.text || prev.text,
      dataUrl: row.dataUrl || prev.dataUrl,
      url: row.url || prev.url,
      storagePath: row.storagePath || prev.storagePath,
      status: row.text || row.dataUrl || row.url || prev.text || prev.dataUrl || prev.url ? 'lastet' : row.status,
      size: row.size || prev.size,
      sizeLabel: row.sizeLabel || prev.sizeLabel,
    };
  });
  const own = stored.filter((row) => row.kind === 'egen' && row.folderId !== GROUND_FOLDER_ID && row.folderId !== QA_FOLDER_ID);
  return {
    ...bid,
    assignment: normalizeAssignment(bid.assignment),
    interpretation: normalizeInterpretation(bid.interpretation),
    stepNotes: normalizeStepNotes(bid.stepNotes),
    stepAi: normalizeStepAi(bid.stepAi),
    workItems: (Array.isArray(bid.workItems) ? bid.workItems : []).map(normalizeWorkItem).filter(Boolean).slice(0, 40),
    pendingWorkItems: (Array.isArray(bid.pendingWorkItems) ? bid.pendingWorkItems : []).map(normalizeWorkItem).filter(Boolean).slice(0, 40),
    folders: uniqueFolders.slice(0, 60),
    files: [...published, ...own].slice(0, 120),
    forms: (Array.isArray(bid.forms) ? bid.forms : []).map(normalizeForm).filter(Boolean).slice(0, 30),
    questions: (Array.isArray(bid.questions) ? bid.questions : []).map(normalizeQuestion).filter(Boolean).slice(0, 40),
  };
}

export function bidOverview(bid) {
  const files = bid?.files || [];
  const forms = bid?.forms || [];
  const doneForms = forms.filter((row) => row.status === 'ferdig').length;
  const assignment = normalizeAssignment(bid?.assignment);
  return {
    stage: bid?.stage || 'planlegging',
    deadline: text(bid?.dossier?.submissionDeadline),
    documents: files.filter((row) => row.kind !== 'egen').length,
    downloaded: files.filter((row) => row.status === 'lastet').length,
    ownFiles: files.filter((row) => row.kind === 'egen').length,
    folders: (bid?.folders || []).filter((row) => row.id !== GROUND_FOLDER_ID).length,
    qa: (bid?.dossier?.qa || []).length + (bid?.questions || []).length,
    forms: forms.length,
    doneForms,
    openForms: forms.length - doneForms,
    assignee: assignment.personName || assignment.unitName || assignment.companyName || '',
  };
}

/** Statusgruppe på tilbudsdesk: aktive, levert, vunnet, utgatt, avsluttet. */
export function bidDeskBucket(bid, now = new Date()) {
  const stage = bid?.stage || 'planlegging';
  if (stage === 'kontrakt') return 'vunnet';
  if (stage === 'levert') return 'levert';
  if (stage === 'tapt' || stage === 'trukket') return 'avsluttet';
  const deadline = text(bid?.dossier?.submissionDeadline);
  if (deadline && deadlinePassedAt(deadline, now)) return 'utgatt';
  return 'aktive';
}

export function bidStatusCounts(bids, now = new Date()) {
  const counts = {
    alle: 0,
    aktive: 0,
    levert: 0,
    vunnet: 0,
    utgatt: 0,
    avsluttet: 0,
    // Eldre nøkler beholdes slik at eksisterende kall ikke knekker.
    planlegging: 0,
    gjennomforing: 0,
    kontrakt: 0,
  };
  for (const bid of Array.isArray(bids) ? bids : []) {
    counts.alle += 1;
    const bucket = bidDeskBucket(bid, now);
    counts[bucket] += 1;
    const stage = bid?.stage || 'planlegging';
    if (stage === 'planlegging') counts.planlegging += 1;
    else if (stage === 'gjennomforing') counts.gjennomforing += 1;
    else if (stage === 'kontrakt') counts.kontrakt += 1;
  }
  return counts;
}

/** Rangering etter tilbudsfrist (dato + klokkeslett). Mangler frist sist. */
export function compareBidsByDeadline(a, b, direction = 'asc') {
  const ta = parseDeadline(a?.dossier?.submissionDeadline)?.getTime();
  const tb = parseDeadline(b?.dossier?.submissionDeadline)?.getTime();
  const aMissing = ta == null || Number.isNaN(ta);
  const bMissing = tb == null || Number.isNaN(tb);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const cmp = ta - tb;
  return direction === 'desc' ? -cmp : cmp;
}

export function sortBidsByDeadline(bids, direction = 'asc') {
  return [...(Array.isArray(bids) ? bids : [])].sort((a, b) => compareBidsByDeadline(a, b, direction));
}

/** Lenke for å åpne ett tilbudsarbeid i eget nettleservindu. */
export function bidWorkspacePath(bidId) {
  const id = text(bidId);
  if (!id) return '';
  return `/anbud/tilbud/${encodeURIComponent(id)}`;
}

export function childFolders(folders, parentId) {
  return (folders || []).filter((row) => (
    (row.parentId || null) === (parentId || null)
    && !isSystemFolderId(row.id)
  ));
}

/** Mapper brukeren kan jobbe i under Tilbudsarbeid (uten systemmapper). */
export function workRootFolders(folders) {
  return (folders || []).filter((row) => !row.parentId && !isSystemFolderId(row.id));
}

export function filesInFolder(files, folderId) {
  return (files || []).filter((row) => row.folderId === folderId);
}

export function filesForCheck(files, checkId) {
  const id = text(checkId);
  if (!id) return [];
  return (files || []).filter((row) => row.checkId === id);
}

function requireBid(state, bidId) {
  const bid = bidById(state, bidId);
  if (!bid) return { bid: null, error: 'Tilbudet finnes ikke.' };
  return { bid: normalizeBidWork(bid), error: '' };
}

export function createBidFolder(state, bidId, input) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const name = text(input?.name).slice(0, 80);
  if (!name) return fail(state, 'Mappen trenger et navn.');
  let parentId = text(input?.parentId) || null;
  if (parentId === GROUND_FOLDER_ID || parentId === QA_FOLDER_ID) {
    return fail(state, 'Egne mapper legges ved siden av konkurransegrunnlaget.');
  }
  if (parentId === GROUND_ATTACH_FOLDER_ID || parentId === QA_ATTACH_FOLDER_ID || parentId === WORK_ATTACH_FOLDER_ID) {
    parentId = null;
  }
  if (parentId && !bid.folders.some((row) => row.id === parentId && !isSystemFolderId(row.id))) {
    return fail(state, 'Mappen som skal ligge over, finnes ikke.');
  }
  const userFolderCount = bid.folders.filter((row) => !isSystemFolderId(row.id)).length;
  if (userFolderCount >= 40) return fail(state, 'Tilbudet har maks 40 egne mapper.');
  const folder = {
    id: createId('mappe'),
    name,
    parentId,
    locked: false,
    system: false,
    emoji: text(input?.emoji).slice(0, 4) || '📁',
    color: /^#[0-9a-fA-F]{6}$/.test(text(input?.color)) ? text(input.color) : '#0ea5e9',
  };
  return ok(replaceBid(state, bidId, { ...bid, folders: [...bid.folders, folder] }));
}

function descendantIds(folders, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function renameBidFolder(state, bidId, folderId, name) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (isSystemFolderId(folderId)) return fail(state, 'Systemmapper kan ikke døpes om.');
  const nextName = text(name).slice(0, 80);
  if (!nextName) return fail(state, 'Mappen trenger et navn.');
  if (!bid.folders.some((row) => row.id === folderId)) return fail(state, 'Mappen finnes ikke.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    folders: bid.folders.map((row) => (row.id === folderId ? { ...row, name: nextName } : row)),
  }));
}

export function deleteBidFolder(state, bidId, folderId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (isSystemFolderId(folderId)) return fail(state, 'Systemmapper kan ikke slettes.');
  if (!bid.folders.some((row) => row.id === folderId)) return fail(state, 'Mappen finnes ikke.');
  const gone = descendantIds(bid.folders, folderId);
  return ok(replaceBid(state, bidId, {
    ...bid,
    folders: bid.folders.filter((row) => !gone.has(row.id)),
    files: bid.files.filter((row) => !gone.has(row.folderId)),
  }));
}

export function addBidFile(state, bidId, folderId, input) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const folder = bid.folders.find((row) => row.id === folderId);
  if (!folder) return fail(state, 'Mappen finnes ikke.');
  if (folder.locked || folderId === GROUND_FOLDER_ID || folderId === QA_FOLDER_ID) {
    return fail(state, 'Filer i konkurransegrunnlaget hentes fra kunngjøringen. Last opp under Egne vedlegg.');
  }
  const checkId = text(input?.checkId).slice(0, 80);
  if (checkId && !(bid.workItems || []).some((row) => row.id === checkId)) {
    return fail(state, 'Sjekkpunktet finnes ikke.');
  }
  const name = text(input?.name).slice(0, 180);
  if (!name) return fail(state, 'Filen trenger et navn.');
  if (bid.files.length >= 120) return fail(state, 'Tilbudet har maks 120 filer.');
  const dataUrl = cleanDataUrl(input?.dataUrl);
  const fileText = text(input?.text).slice(0, 200000);
  const url = text(input?.url).slice(0, 500);
  const file = {
    id: createId('fil'),
    folderId,
    name,
    mimeType: text(input?.mimeType).slice(0, 120),
    text: fileText,
    dataUrl,
    url,
    storagePath: text(input?.storagePath).slice(0, 500),
    size: Number(input?.size) || 0,
    sizeLabel: text(input?.sizeLabel).slice(0, 40),
    source: 'egen',
    status: dataUrl || fileText || url ? 'lastet' : 'lenke',
    kind: 'egen',
    checkId,
    createdAt: new Date().toISOString(),
  };
  return ok(replaceBid(state, bidId, { ...bid, files: [...bid.files, file] }));
}

export function renameBidFile(state, bidId, fileId, name) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const file = bid.files.find((row) => row.id === fileId);
  if (!file) return fail(state, 'Filen finnes ikke.');
  if (file.kind !== 'egen') return fail(state, 'Konkurransedokumentet kan ikke døpes om her.');
  const nextName = text(name).slice(0, 180);
  if (!nextName) return fail(state, 'Filen trenger et navn.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    files: bid.files.map((row) => (row.id === fileId ? { ...row, name: nextName } : row)),
  }));
}

export function moveBidFile(state, bidId, fileId, folderId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const file = bid.files.find((row) => row.id === fileId);
  if (!file) return fail(state, 'Filen finnes ikke.');
  if (file.kind !== 'egen') return fail(state, 'Konkurransedokumentet kan ikke flyttes.');
  const folder = bid.folders.find((row) => row.id === folderId);
  if (!folder) return fail(state, 'Mappen finnes ikke.');
  if (folder.locked || folderId === GROUND_FOLDER_ID || folderId === QA_FOLDER_ID) {
    return fail(state, 'Kan ikke flytte filer inn i konkurransegrunnlaget.');
  }
  return ok(replaceBid(state, bidId, {
    ...bid,
    files: bid.files.map((row) => (row.id === fileId ? { ...row, folderId } : row)),
  }));
}

function fileFoldersForFocus(focus) {
  if (focus === 'grunnlag') return new Set([GROUND_FOLDER_ID, GROUND_ATTACH_FOLDER_ID]);
  if (focus === 'qa') return new Set([QA_FOLDER_ID, QA_ATTACH_FOLDER_ID]);
  return new Set([GROUND_FOLDER_ID, GROUND_ATTACH_FOLDER_ID, QA_FOLDER_ID, QA_ATTACH_FOLDER_ID]);
}

/** Samler tekst fra grunnlag, Q&A og egne vedlegg for AI-tolkning. */
export function collectBidAiSource(bid, options = {}) {
  const work = normalizeBidWork(bid);
  const dossier = work.dossier || {};
  const focus = STEP_IDS.has(options.focus) ? options.focus : 'arbeid';
  const folders = fileFoldersForFocus(focus);
  const chunks = [];
  const push = (label, value) => {
    const body = text(value);
    if (!body) return;
    chunks.push(`${label}:\n${body}`);
  };
  push('Tittel', work.title || dossier.title);
  push('Oppdragsgiver', work.buyer || dossier.buyer);
  if (focus !== 'qa') {
    push('Beskrivelse', dossier.description);
    push('Prosedyre', dossier.procedure);
    push('Prosedyreutkast', dossier.procedureOutline);
    push('Tilleggsinformasjon', dossier.additionalInfo);
    push('Tilbudsfrist', dossier.submissionDeadline || work.deadline);
    push('Frist for spørsmål', dossier.questionDeadline);
    push('Innlevering', dossier.electronicSubmission);
    push('ESPD', dossier.espd === true ? 'Egenerklæring brukes' : dossier.espd);
  }
  if (focus !== 'grunnlag') {
    for (const row of Array.isArray(dossier.qa) ? dossier.qa : []) {
      push('Publisert spørsmål', `${text(row?.question)}\nSvar: ${text(row?.answer) || 'Ikke publisert'}`);
    }
    for (const row of work.questions || []) {
      push('Eget spørsmål', `${text(row?.question)}\nSvar: ${text(row?.answer) || 'Ikke besvart'}`);
    }
  }
  if (focus === 'arbeid') {
    push('Egne notater grunnlag', work.stepNotes?.grunnlag);
    push('Egne notater spørsmål og svar', work.stepNotes?.qa);
    push('AI-oppsummering grunnlag', work.stepAi?.grunnlag?.summary);
    push('AI-oppsummering spørsmål og svar', work.stepAi?.qa?.summary);
  }
  for (const file of work.files || []) {
    if (!folders.has(file.folderId)) continue;
    if (file.text) push(`Fil ${file.name}`, String(file.text).slice(0, 12000));
    else push(`Fil ${file.name}`, `Vedlegg uten uttrekkbar tekst / OCR (${file.mimeType || 'ukjent type'}).`);
  }
  return chunks.join('\n\n').slice(0, 120000);
}

/** Lokal fallback når AI-proxy ikke er tilgjengelig. */
export function buildLocalBidInterpretation(bid) {
  const work = normalizeBidWork(bid);
  const dossier = work.dossier || {};
  const checklist = [
    { id: 'frist', title: 'Bekreft tilbudsfrist og innleveringskanal', detail: dossier.submissionDeadline || 'Frist mangler i kunngjøringen.', done: false },
    { id: 'spm', title: 'Sjekk frist for spørsmål', detail: dossier.questionDeadline || 'Ingen egen spørsmålsfrist er oppgitt.', done: false },
    { id: 'grunnlag', title: 'Gå gjennom konkurransegrunnlaget', detail: `${filesInFolder(work.files, GROUND_FOLDER_ID).length} dokumenter i grunnlaget.`, done: false },
    { id: 'vedlegg', title: 'Last opp egne underlag', detail: 'Legg inn nødvendige vedlegg under Konkurransegrunnlag og Spørsmål og svar.', done: false },
    { id: 'ansvarlig', title: 'Tildel ansvarlig', detail: work.assignment?.personName || work.assignment?.unitName || 'Ingen ansvarlig er satt ennå.', done: !!(work.assignment?.personName || work.assignment?.unitName) },
  ];
  const qualification = [];
  const awardCriteria = [];
  const blob = [
    dossier.description,
    dossier.procedureOutline,
    dossier.additionalInfo,
    ...(Array.isArray(dossier.qa) ? dossier.qa.map((row) => `${row.question} ${row.answer}`) : []),
  ].join('\n');
  const qualHints = blob.match(/(?:kvalifikasjonskrav|egnethetskrav|krav til leverandør)[^\n.!?]{0,160}/gi) || [];
  for (const hit of qualHints.slice(0, 6)) {
    qualification.push({
      id: createId('kval'),
      title: text(hit).slice(0, 120) || 'Kvalifikasjonskrav',
      summary: 'Funnet i konkurranseteksten. Utvid for mer kontekst.',
      detail: text(hit),
      weight: '',
    });
  }
  if (!qualification.length) {
    qualification.push({
      id: 'kval_generell',
      title: 'Generelle kvalifikasjonskrav',
      summary: 'Se konkurransegrunnlaget for formelle krav til leverandør.',
      detail: 'Typisk: organisasjonsform, skatt/mva, erfaring, kapasitet og eventuelle sertifikater. Bruk AI-tolkning når dokumentene er lastet inn for mer treffsikker liste.',
      weight: '',
    });
  }
  const awardHints = blob.match(/(?:tildelingskriter|evalueringskriter|pris|kvalitet|kompetanse)[^\n.!?]{0,160}/gi) || [];
  for (const hit of awardHints.slice(0, 6)) {
    awardCriteria.push({
      id: createId('tild'),
      title: text(hit).slice(0, 120) || 'Tildelingskriterium',
      summary: 'Funnet i konkurranseteksten.',
      detail: text(hit),
      weight: '',
    });
  }
  if (!awardCriteria.length) {
    awardCriteria.push({
      id: 'tild_generell',
      title: 'Tildelingskriterier',
      summary: 'Se konkurransegrunnlaget for vekt og evaluering.',
      detail: 'Typisk pris og kvalitet/kompetanse. Kjør AI-tolkning for å hente konkrete kriterier og vekting fra dokumentene.',
      weight: '',
    });
  }
  const summary = [
    work.title || dossier.title || 'Tilbud',
    work.buyer || dossier.buyer ? `Oppdragsgiver: ${work.buyer || dossier.buyer}.` : '',
    dossier.procedure ? `Prosedyre: ${dossier.procedure}.` : '',
    dossier.submissionDeadline ? `Tilbudsfrist: ${dossier.submissionDeadline}.` : '',
    'Gå gjennom sjekklisten, kvalifikasjonskrav og tildelingskriterier før innlevering.',
  ].filter(Boolean).join(' ');
  const deliverables = [
    { kind: 'tilbudsbrev', title: 'Tilbudsbrev', detail: 'Følgebrev som sendes med tilbudet.' },
    ...qualification.slice(0, 4).map((row) => ({ kind: 'kvalifikasjon', title: row.title, detail: row.detail || row.summary })),
    ...awardCriteria.slice(0, 4).map((row) => ({ kind: 'tildeling', title: row.title, detail: row.detail || row.summary, weight: row.weight })),
  ];
  return normalizeInterpretation({
    summary,
    checklist,
    qualification,
    awardCriteria,
    deliverables,
    generatedAt: new Date().toISOString(),
    engine: 'lokal',
  });
}

export function buildLocalStepSummary(bid, focus) {
  const work = normalizeBidWork(bid);
  const dossier = work.dossier || {};
  if (focus === 'qa') {
    const published = Array.isArray(dossier.qa) ? dossier.qa.length : 0;
    const own = (work.questions || []).length;
    const summary = published || own
      ? `Det er ${published} publiserte spørsmål og svar og ${own} egne spørsmål. Les svarene med tanke på om de endrer krav, frister eller hva som skal leveres.`
      : 'Ingen spørsmål og svar er registrert ennå. Last inn kunngjøringen eller skriv egne spørsmål.';
    return { summary, generatedAt: new Date().toISOString(), engine: 'lokal' };
  }
  const files = filesInFolder(work.files, GROUND_FOLDER_ID).length + filesInFolder(work.files, GROUND_ATTACH_FOLDER_ID).length;
  const summary = [
    work.title || dossier.title || 'Tilbud',
    work.buyer || dossier.buyer ? `Oppdragsgiver: ${work.buyer || dossier.buyer}.` : '',
    dossier.submissionDeadline ? `Tilbudsfrist: ${dossier.submissionDeadline}.` : '',
    files ? `${files} dokumenter ligger i konkurransegrunnlaget.` : 'Last inn filer i konkurransegrunnlaget for en rikere tolkning.',
    dossier.description ? String(dossier.description).slice(0, 500) : '',
  ].filter(Boolean).join(' ');
  return { summary, generatedAt: new Date().toISOString(), engine: 'lokal' };
}

export function proposedWorkItemsFromInterpretation(interpretation) {
  const src = normalizeInterpretation(interpretation);
  const out = [];
  const seen = new Set();
  const push = (row) => {
    const item = normalizeWorkItem({ ...row, status: 'ikke-startet', source: row?.source || 'ai', selected: true });
    if (!item) return;
    const key = item.title.toLocaleLowerCase('nb-NO');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const row of src.deliverables) push(row);
  if (!out.some((row) => row.kind === 'tilbudsbrev')) {
    push({ kind: 'tilbudsbrev', title: 'Tilbudsbrev', detail: 'Følgebrev som sendes med tilbudet.' });
  }
  for (const row of src.qualification) {
    push({ kind: 'kvalifikasjon', title: row.title, detail: row.detail || row.summary });
  }
  for (const row of src.awardCriteria) {
    push({
      kind: 'tildeling',
      title: row.title,
      detail: [row.weight ? `Vekt: ${row.weight}` : '', row.detail || row.summary].filter(Boolean).join('\n'),
      weight: row.weight,
    });
  }
  for (const row of src.checklist) {
    push({ kind: 'sjekk', title: row.title, detail: row.detail });
  }
  return out.slice(0, 40);
}

export function saveBidInterpretation(state, bidId, input) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const previous = normalizeInterpretation(bid.interpretation);
  const next = normalizeInterpretation(input);
  // Behold avkryssing når AI regenererer samme tittel.
  const doneByTitle = new Map(previous.checklist.map((row) => [row.title.toLocaleLowerCase('nb-NO'), row.done]));
  next.checklist = next.checklist.map((row) => ({
    ...row,
    done: doneByTitle.has(row.title.toLocaleLowerCase('nb-NO')) ? doneByTitle.get(row.title.toLocaleLowerCase('nb-NO')) : row.done,
  }));
  if (!next.summary && !next.checklist.length) return fail(state, 'AI-tolkningen ga tomt resultat.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    interpretation: {
      ...next,
      generatedAt: next.generatedAt || new Date().toISOString(),
    },
  }));
}

export function toggleInterpretationCheck(state, bidId, checkId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const interpretation = normalizeInterpretation(bid.interpretation);
  if (!interpretation.checklist.some((row) => row.id === checkId)) return fail(state, 'Kontrollpunktet finnes ikke.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    interpretation: {
      ...interpretation,
      checklist: interpretation.checklist.map((row) => (row.id === checkId ? { ...row, done: !row.done } : row)),
    },
  }));
}

export function saveBidStepNotes(state, bidId, step, notes) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (!STEP_IDS.has(step)) return fail(state, 'Ukjent steg.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    stepNotes: normalizeStepNotes({ ...bid.stepNotes, [step]: notes }),
  }));
}

export function saveBidStepAi(state, bidId, step, input) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (step !== 'grunnlag' && step !== 'qa') return fail(state, 'Ukjent steg for oppsummering.');
  const summary = text(input?.summary).slice(0, 4000);
  if (!summary) return fail(state, 'AI-tolkningen ga tomt resultat.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    stepAi: normalizeStepAi({
      ...bid.stepAi,
      [step]: {
        summary,
        generatedAt: text(input?.generatedAt) || new Date().toISOString(),
        engine: text(input?.engine).slice(0, 40) || 'lokal',
      },
    }),
  }));
}

export function updateBidSettings(state, bidId, input = {}) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const title = text(input.title).slice(0, 200) || bid.title;
  const buyer = input.buyer != null ? text(input.buyer).slice(0, 160) : bid.buyer;
  const deadline = input.deadline != null ? text(input.deadline).slice(0, 80) : (bid.dossier?.submissionDeadline || '');
  const questionDeadline = input.questionDeadline != null
    ? text(input.questionDeadline).slice(0, 80)
    : (bid.dossier?.questionDeadline || '');
  const description = input.description != null
    ? text(input.description).slice(0, 8000)
    : (bid.dossier?.description || '');
  return ok(replaceBid(state, bidId, {
    ...bid,
    title,
    buyer,
    deadline,
    dossier: {
      ...(bid.dossier || {}),
      title,
      buyer,
      submissionDeadline: deadline,
      questionDeadline,
      description,
    },
  }));
}

export function setPendingWorkItems(state, bidId, items) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const pendingWorkItems = (Array.isArray(items) ? items : []).map(normalizeWorkItem).filter(Boolean).slice(0, 40);
  if (!pendingWorkItems.length) return fail(state, 'Ingen forslag å vise.');
  return ok(replaceBid(state, bidId, { ...bid, pendingWorkItems }));
}

export function togglePendingWorkItem(state, bidId, itemId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (!(bid.pendingWorkItems || []).some((row) => row.id === itemId)) return fail(state, 'Forslaget finnes ikke.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    pendingWorkItems: bid.pendingWorkItems.map((row) => (
      row.id === itemId ? { ...row, selected: !row.selected } : row
    )),
  }));
}

export function discardPendingWorkItems(state, bidId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  return ok(replaceBid(state, bidId, { ...bid, pendingWorkItems: [] }));
}

export function importPendingWorkItems(state, bidId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const selected = (bid.pendingWorkItems || []).filter((row) => row.selected !== false);
  if (!selected.length) return fail(state, 'Velg minst ett forslag før import.');
  const existing = new Set((bid.workItems || []).map((row) => row.title.toLocaleLowerCase('nb-NO')));
  const imported = [];
  for (const row of selected) {
    const key = row.title.toLocaleLowerCase('nb-NO');
    if (existing.has(key)) continue;
    existing.add(key);
    imported.push(normalizeWorkItem({ ...row, source: row.source || 'ai', selected: true }));
  }
  if (!imported.length) {
    return fail(state, 'Forslagene er allerede importert.');
  }
  if ((bid.workItems || []).length + imported.length > 40) {
    return fail(state, 'Tilbudet har maks 40 sjekkpunkt.');
  }
  return ok(replaceBid(state, bidId, {
    ...bid,
    workItems: [...(bid.workItems || []), ...imported],
    pendingWorkItems: [],
  }));
}

export function addWorkItem(state, bidId, input = {}) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if ((bid.workItems || []).length >= 40) return fail(state, 'Tilbudet har maks 40 sjekkpunkt.');
  const item = normalizeWorkItem({
    ...input,
    source: 'egen',
    status: input.status || 'ikke-startet',
  });
  if (!item) return fail(state, 'Sjekkpunktet trenger et navn.');
  return ok(replaceBid(state, bidId, { ...bid, workItems: [...(bid.workItems || []), item] }));
}

export function patchWorkItem(state, bidId, itemId, input = {}) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (!(bid.workItems || []).some((row) => row.id === itemId)) return fail(state, 'Sjekkpunktet finnes ikke.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    workItems: bid.workItems.map((row) => {
      if (row.id !== itemId) return row;
      return normalizeWorkItem({
        ...row,
        ...input,
        id: row.id,
        source: row.source,
      });
    }),
  }));
}

export function removeWorkItem(state, bidId, itemId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (!(bid.workItems || []).some((row) => row.id === itemId)) return fail(state, 'Sjekkpunktet finnes ikke.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    workItems: bid.workItems.filter((row) => row.id !== itemId),
    files: bid.files.filter((row) => row.checkId !== itemId),
  }));
}

export function deleteBidFile(state, bidId, fileId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const file = bid.files.find((row) => row.id === fileId);
  if (!file) return fail(state, 'Filen finnes ikke.');
  if (file.kind !== 'egen') return fail(state, 'Konkurransedokumentet hentes på nytt fra kunngjøringen.');
  return ok(replaceBid(state, bidId, { ...bid, files: bid.files.filter((row) => row.id !== fileId) }));
}

export function saveFormTemplate(state, input) {
  const templates = normalizeFormTemplates(state?.formTemplates);
  const title = text(input?.title).slice(0, 80);
  if (!title) return fail(state, 'Malen trenger et navn.');
  const fields = (Array.isArray(input?.fields) ? input.fields : []).map((row) => normalizeField({ ...row, value: '' })).filter(Boolean);
  if (!fields.length) return fail(state, 'Malen trenger minst ett felt.');
  const id = text(input?.id) || createId('mal');
  const next = normalizeTemplate({
    id,
    title,
    intro: text(input?.intro).slice(0, 280),
    cover: input?.cover,
    settings: input?.settings,
    responses: input?.responses,
    fields,
  });
  if (!next) return fail(state, 'Malen trenger minst ett felt.');
  const exists = templates.some((row) => row.id === id);
  return ok({
    ...state,
    formTemplates: exists ? templates.map((row) => (row.id === id ? next : row)) : [...templates, next],
  });
}

export function deleteFormTemplate(state, templateId) {
  const templates = normalizeFormTemplates(state?.formTemplates);
  if (!templates.some((row) => row.id === templateId)) return fail(state, 'Malen finnes ikke.');
  return ok({ ...state, formTemplates: templates.filter((row) => row.id !== templateId) });
}

export function pullFormTemplate(state, bidId, templateId) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const template = normalizeFormTemplates(state?.formTemplates).find((row) => row.id === templateId);
  if (!template) return fail(state, 'Skjemaet finnes ikke på bedriften.');
  if (bid.forms.length >= 30) return fail(state, 'Tilbudet har maks 30 skjema.');
  const form = {
    id: createId('skjema'),
    templateId: template.id,
    title: template.title,
    intro: template.intro,
    status: 'apent',
    fields: template.fields.map((field) => ({ ...field, value: emptyAnswer(field.kind) })),
    updatedAt: new Date().toISOString(),
  };
  return ok(replaceBid(state, bidId, { ...bid, forms: [...bid.forms, form] }));
}

export function setFormValue(state, bidId, formId, fieldId, value) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const form = bid.forms.find((row) => row.id === formId);
  if (!form) return fail(state, 'Skjemaet finnes ikke i tilbudet.');
  if (form.status === 'ferdig') return fail(state, 'Skjemaet er markert ferdig. Åpne det før du endrer.');
  const field = form.fields.find((row) => row.id === fieldId);
  if (!field) return fail(state, 'Feltet finnes ikke.');
  const nextValue = coerceAnswer(field.kind, value);
  return ok(replaceBid(state, bidId, {
    ...bid,
    forms: bid.forms.map((row) => (row.id === formId ? {
      ...row,
      updatedAt: new Date().toISOString(),
      fields: row.fields.map((item) => (item.id === fieldId ? { ...item, value: nextValue } : item)),
    } : row)),
  }));
}

export function setFormStatus(state, bidId, formId, status) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (status !== 'apent' && status !== 'ferdig') return fail(state, 'Ukjent skjemastatus.');
  if (!bid.forms.some((row) => row.id === formId)) return fail(state, 'Skjemaet finnes ikke i tilbudet.');
  return ok(replaceBid(state, bidId, {
    ...bid,
    forms: bid.forms.map((row) => (row.id === formId ? { ...row, status, updatedAt: new Date().toISOString() } : row)),
  }));
}

export function addBidQuestion(state, bidId, question) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  const value = text(question).slice(0, 2000);
  if (!value) return fail(state, 'Skriv spørsmålet først.');
  if (bid.questions.length >= 40) return fail(state, 'Tilbudet har maks 40 egne spørsmål.');
  const row = { id: createId('spm'), question: value, answer: '', status: 'apent', createdAt: new Date().toISOString() };
  return ok(replaceBid(state, bidId, { ...bid, questions: [...bid.questions, row] }));
}

export function answerBidQuestion(state, bidId, questionId, answer) {
  const { bid, error } = requireBid(state, bidId);
  if (!bid) return fail(state, error);
  if (!bid.questions.some((row) => row.id === questionId)) return fail(state, 'Spørsmålet finnes ikke.');
  const value = text(answer).slice(0, 4000);
  return ok(replaceBid(state, bidId, {
    ...bid,
    questions: bid.questions.map((row) => (row.id === questionId ? { ...row, answer: value, status: value ? 'besvart' : 'apent' } : row)),
  }));
}
