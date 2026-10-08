/** Dokumentmapper, opplastede filer og bedriftsskjema i ett tilbudsarbeid. */

import { coerceAnswer, emptyAnswer, normalizeBuilderField, normalizeResponses, normalizeSettings, cleanCover } from './formBuilder.js';
import { deadlinePassedAt, parseDeadline } from './noticeText.js';

export const GROUND_FOLDER_ID = 'grunnlag';

export const BID_STEPS = [
  { id: 'grunnlag', label: '1 Konkurransegrunnlag' },
  { id: 'qa', label: '2 Spørsmål og svar' },
  { id: 'arbeid', label: '3 Tilbudsarbeid' },
];

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
    emoji: '📄',
    color: '#1099F4',
  };
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
  return {
    id,
    folderId,
    name,
    mimeType: text(raw?.mimeType).slice(0, 120),
    text: text(raw?.text).slice(0, 200000),
    dataUrl: cleanDataUrl(raw?.dataUrl),
    url: text(raw?.url).slice(0, 500),
    size: Number(raw?.size) || 0,
    sizeLabel: text(raw?.sizeLabel).slice(0, 40),
    source: text(raw?.source).slice(0, 40) || 'egen',
    status: cleanDataUrl(raw?.dataUrl) || text(raw?.text) ? 'lastet' : status,
    kind: raw?.kind === 'egen' ? 'egen' : 'grunnlag',
    createdAt: text(raw?.createdAt),
  };
}

function normalizeFolder(raw) {
  const id = text(raw?.id);
  const name = text(raw?.name).slice(0, 80);
  if (!id || !name || id === GROUND_FOLDER_ID) return null;
  return {
    id,
    name,
    parentId: text(raw?.parentId) || null,
    locked: false,
    emoji: text(raw?.emoji).slice(0, 4) || '📁',
    color: /^#[0-9a-fA-F]{6}$/.test(text(raw?.color)) ? text(raw.color) : '#0ea5e9',
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
  const folders = [groundFolder(), ...(Array.isArray(bid.folders) ? bid.folders : []).map(normalizeFolder).filter(Boolean)];
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
  const incoming = competitionDocuments(bid.dossier).map((row) => ({
    ...row,
    id: `grunnlag_${row.name.toLocaleLowerCase('nb-NO').replace(/[^a-z0-9æøå]+/gi, '_').slice(0, 40)}`,
    folderId: GROUND_FOLDER_ID,
    kind: 'grunnlag',
    createdAt: '',
  }));
  const previous = new Map(stored.filter((row) => row.folderId === GROUND_FOLDER_ID).map((row) => [row.name.toLocaleLowerCase('nb-NO'), row]));
  const ground = incoming.map((row) => {
    const prev = previous.get(row.name.toLocaleLowerCase('nb-NO'));
    if (!prev) return row;
    return {
      ...row,
      id: prev.id,
      text: row.text || prev.text,
      dataUrl: row.dataUrl || prev.dataUrl,
      url: row.url || prev.url,
      status: row.text || row.dataUrl || prev.text || prev.dataUrl ? 'lastet' : row.status,
      size: row.size || prev.size,
      sizeLabel: row.sizeLabel || prev.sizeLabel,
    };
  });
  const own = stored.filter((row) => row.kind === 'egen' && row.folderId !== GROUND_FOLDER_ID);
  return {
    ...bid,
    assignment: normalizeAssignment(bid.assignment),
    folders: uniqueFolders.slice(0, 40),
    files: [...ground, ...own].slice(0, 80),
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
  return (folders || []).filter((row) => (row.parentId || null) === (parentId || null) && row.id !== GROUND_FOLDER_ID);
}

export function filesInFolder(files, folderId) {
  return (files || []).filter((row) => row.folderId === folderId);
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
  const parentId = text(input?.parentId) || null;
  if (parentId === GROUND_FOLDER_ID) return fail(state, 'Egne mapper legges ved siden av konkurransegrunnlaget.');
  if (parentId && !bid.folders.some((row) => row.id === parentId)) return fail(state, 'Mappen som skal ligge over, finnes ikke.');
  if (bid.folders.length >= 40) return fail(state, 'Tilbudet har maks 40 mapper.');
  const folder = {
    id: createId('mappe'),
    name,
    parentId,
    locked: false,
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
  if (folderId === GROUND_FOLDER_ID) return fail(state, 'Konkurransegrunnlaget kan ikke døpes om.');
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
  if (folderId === GROUND_FOLDER_ID) return fail(state, 'Konkurransegrunnlaget kan ikke slettes.');
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
  if (folder.locked) return fail(state, 'Filer i konkurransegrunnlaget hentes fra kunngjøringen.');
  const name = text(input?.name).slice(0, 180);
  if (!name) return fail(state, 'Filen trenger et navn.');
  if (bid.files.length >= 80) return fail(state, 'Tilbudet har maks 80 filer.');
  const dataUrl = cleanDataUrl(input?.dataUrl);
  const file = {
    id: createId('fil'),
    folderId,
    name,
    mimeType: text(input?.mimeType).slice(0, 120),
    text: text(input?.text).slice(0, 200000),
    dataUrl,
    url: text(input?.url).slice(0, 500),
    size: Number(input?.size) || 0,
    sizeLabel: '',
    source: 'egen',
    status: dataUrl || text(input?.text) ? 'lastet' : 'lenke',
    kind: 'egen',
    createdAt: new Date().toISOString(),
  };
  return ok(replaceBid(state, bidId, { ...bid, files: [...bid.files, file] }));
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
