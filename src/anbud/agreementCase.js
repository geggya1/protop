/**
 * Avtalebehandling mellom to parter.
 * Utkastet låses som en versjon. Motpartens merknader og feltendringer
 * er bare synlige for motparten til de sendes i retur.
 */

import { coerceAnswer } from './formBuilder.js';

export const AGREEMENT_CASE_KINDS = [
  { id: 'oppdrag', label: 'Enkeltoppdrag' },
  { id: 'rammeavtale', label: 'Rammeavtale' },
  { id: 'avrop', label: 'Avrop' },
];

export const AGREEMENT_STATUSES = [
  { id: 'utkast', label: 'Utkast' },
  { id: 'hos-motpart', label: 'Hos motpart' },
  { id: 'merknader', label: 'Merknader i retur' },
  { id: 'signert', label: 'Signert' },
];

export const FIELD_EDITORS = [
  { id: 'fast', label: 'Fast' },
  { id: 'avsender', label: 'Avsender' },
  { id: 'motpart', label: 'Motpart' },
  { id: 'begge', label: 'Begge' },
];

const EDITOR_IDS = new Set(FIELD_EDITORS.map((row) => row.id));
const KIND_IDS = new Set(AGREEMENT_CASE_KINDS.map((row) => row.id));
const MAX_CASES = 80;
const MAX_VERSIONS = 20;
const MAX_NOTES = 200;
const MAX_EVENTS = 300;

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function iso(now) {
  if (typeof now === 'string' && now) return now.slice(0, 40);
  if (now instanceof Date) return now.toISOString();
  return new Date().toISOString();
}

function nid(ctx, prefix) {
  if (typeof ctx?.nextId === 'function') return text(ctx.nextId(prefix), 48);
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function fail(state, error) {
  return { ok: false, state, error, row: null };
}

function ok(state, row) {
  return { ok: true, state, error: null, row: row || null };
}

export function statusLabel(status) {
  return AGREEMENT_STATUSES.find((row) => row.id === status)?.label || 'Utkast';
}

export function kindCaseLabel(kind) {
  return AGREEMENT_CASE_KINDS.find((row) => row.id === kind)?.label || 'Avtale';
}

export function editorLabel(editor) {
  return FIELD_EDITORS.find((row) => row.id === editor)?.label || 'Fast';
}

function caseById(state, caseId) {
  const id = text(caseId, 48);
  return (state?.agreementCases || []).find((row) => row.id === id) || null;
}

function replaceCase(state, row) {
  const cases = state.agreementCases || [];
  const exists = cases.some((item) => item.id === row.id);
  return {
    ...state,
    agreementCases: exists
      ? cases.map((item) => (item.id === row.id ? row : item))
      : [row, ...cases].slice(0, MAX_CASES),
  };
}

function currentVersion(row) {
  const versions = row?.versions || [];
  return versions.find((item) => item.number === row.version) || versions[versions.length - 1] || null;
}

export function versionDigest(version) {
  const payload = JSON.stringify((version?.fields || []).map((field) => ({
    id: field.id,
    label: field.label,
    kind: field.kind,
    value: field.value ?? '',
  })));
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function snapshotValue(field) {
  const value = coerceAnswer(field?.kind, field?.value);
  if ((field?.kind === 'file' || field?.kind === 'image') && value && typeof value === 'object') {
    return { name: text(value.name, 180) || 'Fil' };
  }
  return value;
}

export function snapshotFields(fields) {
  return (Array.isArray(fields) ? fields : []).slice(0, 80).map((field) => ({
    id: text(field?.id, 40),
    label: text(field?.label, field?.kind === 'note' ? 1500 : 120),
    kind: text(field?.kind, 20) || 'text',
    editor: EDITOR_IDS.has(field?.editor) ? field.editor : 'fast',
    required: !!field?.required,
    help: text(field?.help, 180),
    placeholder: text(field?.placeholder, 120),
    width: field?.width === 'half' ? 'half' : 'full',
    options: (Array.isArray(field?.options) ? field.options : []).slice(0, 12).map((option) => ({
      id: text(option?.id, 40),
      label: text(option?.label, 80),
    })).filter((option) => option.label),
    value: snapshotValue(field),
  })).filter((field) => field.id && field.label);
}

function stampVersion(fields, actor, when, number) {
  const locked = {
    number,
    lockedAt: when,
    lockedByName: text(actor?.name, 120),
    lockedByUid: text(actor?.uid, 80),
    sentAt: '',
    fields: snapshotFields(fields),
  };
  locked.digest = versionDigest(locked);
  return locked;
}

function withEvent(row, event, ctx, when) {
  const released = event.released !== false;
  const entry = {
    id: nid(ctx, 'hend'),
    at: when,
    action: text(event.action, 40),
    actorName: text(event.actorName, 120),
    actorUid: text(event.actorUid, 80),
    actorParty: event.actorParty === 'motpart' ? 'motpart' : 'avsender',
    version: Number(event.version) || row.version || 1,
    detail: text(event.detail, 400),
    releasedAt: released ? when : '',
  };
  return { ...row, events: [...(row.events || []), entry].slice(-MAX_EVENTS), updatedAt: when };
}

function releaseEvents(row, party, when) {
  return {
    ...row,
    events: (row.events || []).map((event) => (
      event.actorParty === party && !event.releasedAt ? { ...event, releasedAt: when } : event
    )),
  };
}

function partyOf(actor) {
  return actor?.party === 'motpart' ? 'motpart' : 'avsender';
}

function canEditField(field, party) {
  const editor = field?.editor || 'fast';
  if (editor === 'begge') return true;
  if (editor === 'avsender') return party === 'avsender';
  if (editor === 'motpart') return party === 'motpart';
  return false;
}

export function visibleNotes(row, party) {
  const who = party === 'motpart' ? 'motpart' : 'avsender';
  return (row?.notes || []).filter((note) => {
    if (note.deletedAt) return false;
    if (note.sentAt) return true;
    return note.authorParty === who;
  });
}

export function visibleProposals(row, party) {
  const who = party === 'motpart' ? 'motpart' : 'avsender';
  return (row?.proposals || []).filter((item) => item.sentAt || item.authorParty === who);
}

export function visibleEvents(row, party) {
  const who = party === 'motpart' ? 'motpart' : 'avsender';
  return (row?.events || []).filter((event) => event.releasedAt || event.actorParty === who);
}

export function unresolvedNotes(row) {
  return (row?.notes || []).filter((note) => note.sentAt && !note.deletedAt && !note.resolvedAt);
}

function unsentOwn(row, party) {
  const who = party === 'motpart' ? 'motpart' : 'avsender';
  const notes = (row?.notes || []).filter((note) => !note.deletedAt && !note.sentAt && note.authorParty === who);
  const proposals = (row?.proposals || []).filter((item) => !item.sentAt && item.authorParty === who);
  return { notes, proposals };
}

function answerText(field) {
  const value = field?.value;
  if (value == null || value === '') return '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) {
    return value.map((id) => {
      const option = (field.options || []).find((row) => row.id === id);
      return option?.label || String(id);
    }).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return text(value.name, 180);
  return text(value, 2000);
}

export function viewFields(row, party, { locked = false } = {}) {
  const version = currentVersion(row);
  const base = locked || party === 'motpart' || row?.status === 'hos-motpart' || row?.status === 'signert'
    ? (version?.fields || [])
    : (row?.fields || version?.fields || []);
  if (party !== 'motpart') return base.map((field) => ({ ...field }));
  const drafts = row?.draftValues || {};
  return base.map((field) => (
    Object.prototype.hasOwnProperty.call(drafts, field.id)
      ? { ...field, value: drafts[field.id] }
      : { ...field }
  ));
}

function fold(value) {
  return text(value, 200).toLocaleLowerCase('nb-NO');
}

function slotValue(sources, slot) {
  const customer = sources?.customer || {};
  const company = sources?.company || {};
  const owner = sources?.owner || {};
  const map = {
    customerName: customer.name,
    customerOrgnr: customer.orgnr,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerContact: customer.contactName,
    customerAddress: customer.address,
    customerPlace: customer.place,
    companyName: company.name,
    companyOrgnr: company.orgnr,
    companyEmail: company.email,
    ownerName: owner.name,
    title: sources?.title,
    description: sources?.description,
    kind: sources?.kindLabel,
  };
  return text(map[slot], 2000);
}

function classifyLabel(label) {
  const name = fold(label);
  const supplier = /oppdragstaker|leverandør|leverandor|konsulent/.test(name);
  const buyer = /oppdragsgiver|kunde/.test(name) && !/kundenr|kundenummer/.test(name);
  if (/avtaletype|type avtale/.test(name)) return 'kind';
  if (/ansvarlig|saksbehandler/.test(name)) return 'ownerName';
  if (/kontaktperson/.test(name)) return 'customerContact';
  if (/^e-?post$|epost|e-post/.test(name) || /mail/.test(name)) return supplier ? 'companyEmail' : 'customerEmail';
  if (/telefon|mobil/.test(name)) return 'customerPhone';
  if (/org(?:anisasjon(?:s)?)?(?:\.|\s|-)*(?:nr|nummer)/.test(name)) return supplier ? 'companyOrgnr' : 'customerOrgnr';
  if (/adresse/.test(name)) return 'customerAddress';
  if (/sted|poststed/.test(name) && !/oppdragssted/.test(name)) return 'customerPlace';
  if (supplier) return 'companyName';
  if (buyer) return 'customerName';
  if (/^oppdrag$|oppdragets navn|tittel|prosjektnavn/.test(name)) return 'title';
  if (/beskrivelse/.test(name)) return 'description';
  return '';
}

/** Fyller felt fra kunde, selskap, ansvarlig, tilbud og prosjekt. Allerede utfylte felt blir stående. */
export function fillAgreementFields(fields, sources = {}) {
  const used = new Set();
  const filled = [];
  const next = (Array.isArray(fields) ? fields : []).map((field) => {
    if (!field || field.kind === 'title' || field.kind === 'note') return field;
    if (answerText(field)) return field;
    let slot = classifyLabel(field.label);
    if (slot === 'customerOrgnr' && used.has('customerOrgnr') && !used.has('companyOrgnr') && /org/.test(fold(field.label))) {
      slot = 'companyOrgnr';
    }
    if (!slot || used.has(slot)) return field;
    const value = slotValue(sources, slot);
    if (!value) return field;
    used.add(slot);
    filled.push({ id: field.id, slot, label: field.label });
    return { ...field, value: coerceAnswer(field.kind, value) };
  });
  return { fields: next, filled };
}

export function agreementTemplates(state) {
  return (state?.formTemplates || []).filter((row) => row?.category === 'avtale');
}

export function bidsAwaitingAgreement(state) {
  const taken = new Set((state?.agreementCases || []).filter((row) => row?.bidId).map((row) => row.bidId));
  return (state?.bids || []).filter((bid) => bid?.stage === 'kontrakt' && bid.id && !taken.has(bid.id));
}

export function agreementStarterTemplate() {
  const field = (label, kind, editor, extra = {}) => ({
    id: '',
    label,
    kind,
    editor,
    required: false,
    help: '',
    placeholder: '',
    width: 'full',
    options: [],
    value: '',
    ...extra,
  });
  return {
    title: 'Oppdragsavtale',
    category: 'avtale',
    intro: 'Avtale mellom oppdragstaker og oppdragsgiver. Faste felt låses. Motparten fyller bare feltene som er merket motpart.',
    fields: [
      field('Avtalen', 'title', 'fast'),
      field('Avtaletype', 'text', 'fast'),
      field('Oppdrag', 'text', 'avsender'),
      field('Beskrivelse av oppdraget', 'long', 'avsender'),
      field('Oppdragsgiver', 'text', 'fast'),
      field('Organisasjonsnummer', 'text', 'fast'),
      field('Kontaktperson', 'text', 'motpart'),
      field('E-post', 'text', 'motpart'),
      field('Telefon', 'text', 'motpart'),
      field('Adresse', 'text', 'begge'),
      field('Sted', 'text', 'begge'),
      field('Oppstart', 'date', 'begge'),
      field('Sluttdato', 'date', 'begge'),
      field('Oppdragstaker', 'text', 'fast'),
      field('Oppdragstakers organisasjonsnummer', 'text', 'fast'),
      field('Ansvarlig', 'text', 'fast'),
      field('Avtalt honorar eks. mva', 'number', 'avsender'),
      field('Avtalen er låst som denne versjonen når den sendes. Bare feltene merket for motpart kan endres av mottaker.', 'note', 'fast'),
    ],
  };
}

function normalizeNote(raw) {
  const id = text(raw?.id, 48);
  const body = text(raw?.body, 2000);
  if (!id || !body) return null;
  return {
    id,
    version: Math.max(1, Number(raw?.version) || 1),
    fieldId: text(raw?.fieldId, 40),
    kind: raw?.kind === 'melding' ? 'melding' : 'merknad',
    authorParty: raw?.authorParty === 'motpart' ? 'motpart' : 'avsender',
    authorName: text(raw?.authorName, 120),
    authorUid: text(raw?.authorUid, 80),
    body,
    createdAt: text(raw?.createdAt, 40),
    updatedAt: text(raw?.updatedAt, 40),
    deletedAt: text(raw?.deletedAt, 40),
    sentAt: text(raw?.sentAt, 40),
    resolvedAt: text(raw?.resolvedAt, 40),
  };
}

function normalizeProposal(raw) {
  const id = text(raw?.id, 48);
  const fieldId = text(raw?.fieldId, 40);
  if (!id || !fieldId) return null;
  return {
    id,
    version: Math.max(1, Number(raw?.version) || 1),
    fieldId,
    label: text(raw?.label, 120),
    before: text(raw?.before, 2000),
    after: text(raw?.after, 2000),
    authorParty: 'motpart',
    authorName: text(raw?.authorName, 120),
    authorUid: text(raw?.authorUid, 80),
    at: text(raw?.at, 40),
    sentAt: text(raw?.sentAt, 40),
    handledAt: text(raw?.handledAt, 40),
  };
}

function normalizeParty(raw, role) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    role,
    name: text(src.name, 160),
    orgnr: text(src.orgnr, 20),
    email: text(src.email, 120).toLowerCase(),
    personName: text(src.personName, 120),
    personUid: text(src.personUid, 80),
  };
}

function normalizeVersion(raw) {
  const number = Math.max(1, Number(raw?.number) || 1);
  const fields = snapshotFields(raw?.fields);
  const version = {
    number,
    lockedAt: text(raw?.lockedAt, 40),
    lockedByName: text(raw?.lockedByName, 120),
    lockedByUid: text(raw?.lockedByUid, 80),
    sentAt: text(raw?.sentAt, 40),
    fields,
    digest: '',
  };
  version.digest = text(raw?.digest, 16) || versionDigest(version);
  return version;
}

export function normalizeAgreementCase(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id, 48);
  const title = text(raw.title, 160);
  if (!id || !title) return null;
  const kind = KIND_IDS.has(raw.kind) ? raw.kind : 'oppdrag';
  const status = AGREEMENT_STATUSES.some((row) => row.id === raw.status) ? raw.status : 'utkast';
  const versions = (Array.isArray(raw.versions) ? raw.versions : []).map(normalizeVersion).slice(-MAX_VERSIONS);
  const version = Math.max(1, Number(raw.version) || versions[versions.length - 1]?.number || 1);
  return {
    id,
    title,
    kind,
    status,
    version,
    templateId: text(raw.templateId, 48),
    templateTitle: text(raw.templateTitle, 120),
    customerId: text(raw.customerId, 48),
    bidId: text(raw.bidId, 48),
    projectId: text(raw.projectId, 48),
    contractId: text(raw.contractId, 48),
    parentId: text(raw.parentId, 48),
    parentTitle: text(raw.parentTitle, 160),
    shareToken: text(raw.shareToken, 80),
    sender: normalizeParty(raw.sender, 'avsender'),
    counterparty: normalizeParty(raw.counterparty, 'motpart'),
    fields: snapshotFields(raw.fields),
    versions,
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(normalizeNote).filter(Boolean).slice(-MAX_NOTES),
    proposals: (Array.isArray(raw.proposals) ? raw.proposals : []).map(normalizeProposal).filter(Boolean).slice(-MAX_NOTES),
    draftValues: raw.draftValues && typeof raw.draftValues === 'object' ? raw.draftValues : {},
    signatures: (Array.isArray(raw.signatures) ? raw.signatures : []).slice(-4).map((sign) => ({
      party: sign?.party === 'motpart' ? 'motpart' : 'avsender',
      method: sign?.method === 'bankid' ? 'bankid' : 'forpliktende',
      provider: 'protop-seal',
      name: text(sign?.name, 120),
      uid: text(sign?.uid, 80),
      at: text(sign?.at, 40),
      version: Math.max(1, Number(sign?.version) || 1),
      digest: text(sign?.digest, 16),
      statement: text(sign?.statement, 400),
    })),
    events: (Array.isArray(raw.events) ? raw.events : []).slice(-MAX_EVENTS).map((event) => ({
      id: text(event?.id, 48) || 'hend',
      at: text(event?.at, 40),
      action: text(event?.action, 40),
      actorName: text(event?.actorName, 120),
      actorUid: text(event?.actorUid, 80),
      actorParty: event?.actorParty === 'motpart' ? 'motpart' : 'avsender',
      version: Math.max(1, Number(event?.version) || 1),
      detail: text(event?.detail, 400),
      releasedAt: text(event?.releasedAt, 40),
    })),
    notifyUids: (Array.isArray(raw.notifyUids) ? raw.notifyUids : []).map((id) => text(id, 80)).filter(Boolean).slice(0, 20),
    createdAt: text(raw.createdAt, 40),
    updatedAt: text(raw.updatedAt, 40),
  };
}

export function normalizeAgreementCases(input) {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const next = normalizeAgreementCase(row);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    out.push(next);
    if (out.length >= MAX_CASES) break;
  }
  return out;
}

function unionById(left, right, pick) {
  const map = new Map();
  for (const row of [...(left || []), ...(right || [])]) {
    if (!row?.id) continue;
    const prev = map.get(row.id);
    map.set(row.id, prev ? pick(prev, row) : row);
  }
  return [...map.values()];
}

function noteRank(note) {
  return (note?.deletedAt ? 4 : 0) + (note?.sentAt ? 2 : 0) + (note?.resolvedAt ? 1 : 0);
}

const STATUS_RANK = { utkast: 1, 'hos-motpart': 2, merknader: 3, signert: 4 };

/** Slår sammen to utgaver av samme sak uten å miste merknader som bare den ene siden har sett. */
export function mergeAgreementCases(left, right) {
  const map = new Map();
  const rows = [...normalizeAgreementCases(left), ...normalizeAgreementCases(right)];
  for (const row of rows) {
    const prev = map.get(row.id);
    if (!prev) {
      map.set(row.id, row);
      continue;
    }
    const higher = row.version > prev.version ? row : (prev.version > row.version ? prev : null);
    const sameVersion = row.version === prev.version;
    const rowAt = Date.parse(row.updatedAt || '') || 0;
    const prevAt = Date.parse(prev.updatedAt || '') || 0;
    const newer = rowAt >= prevAt ? row : prev;
    const shell = higher || newer;
    let status = shell.status;
    if (sameVersion) {
      const leftRank = STATUS_RANK[prev.status] || 0;
      const rightRank = STATUS_RANK[row.status] || 0;
      status = rightRank > leftRank ? row.status : (leftRank > rightRank ? prev.status : newer.status);
    }
    const versions = new Map();
    for (const version of [...prev.versions, ...row.versions]) {
      const held = versions.get(version.number);
      if (!held || (version.sentAt && !held.sentAt) || (!held.sentAt && version.lockedAt >= held.lockedAt)) {
        versions.set(version.number, version);
      }
    }
    map.set(row.id, normalizeAgreementCase({
      ...shell,
      status,
      version: Math.max(prev.version, row.version),
      versions: [...versions.values()],
      notes: unionById(prev.notes, row.notes, (a, b) => (noteRank(b) > noteRank(a) ? b : (noteRank(a) > noteRank(b) ? a : ((Date.parse(b.updatedAt || '') || 0) >= (Date.parse(a.updatedAt || '') || 0) ? b : a)))),
      proposals: unionById(prev.proposals, row.proposals, (a, b) => ((b.handledAt || b.sentAt) && !(a.handledAt && !b.handledAt) ? { ...a, ...b, sentAt: b.sentAt || a.sentAt, handledAt: b.handledAt || a.handledAt } : a)),
      events: unionById(prev.events, row.events, (a, b) => (b.releasedAt && !a.releasedAt ? b : a)),
      signatures: unionById(
        prev.signatures.map((sign) => ({ ...sign, id: `${sign.party}:${sign.version}:${sign.at}` })),
        row.signatures.map((sign) => ({ ...sign, id: `${sign.party}:${sign.version}:${sign.at}` })),
        (a) => a,
      ).map(({ id, ...sign }) => sign),
      updatedAt: rowAt >= prevAt ? row.updatedAt : prev.updatedAt,
    }));
  }
  return [...map.values()].slice(0, MAX_CASES);
}

function requireCase(state, caseId) {
  const row = caseById(state, caseId);
  if (!row) return { row: null, error: 'Avtalen finnes ikke.' };
  if (row.status === 'signert') return { row: null, error: 'Avtalen er signert og kan ikke endres.' };
  return { row, error: '' };
}

export function createAgreementCase(state, input = {}, ctx = {}) {
  const template = input.template;
  if (!template?.id || template.category !== 'avtale') {
    return fail(state, 'Velg en avtalemal fra skjemabyggeren.');
  }
  const fields = snapshotFields(template.fields);
  if (!fields.length) return fail(state, 'Avtalemalen har ingen felt.');
  const kind = KIND_IDS.has(input.kind) ? input.kind : 'oppdrag';
  const parentId = text(input.parentId, 48);
  if (kind === 'avrop') {
    const parentCase = (state?.agreementCases || []).find((row) => row.id === parentId);
    const parentContract = (state?.contracts || []).find((row) => row.id === parentId && !row.deletedAt);
    const parent = parentCase || parentContract;
    if (!parent || parent.kind !== 'rammeavtale') {
      return fail(state, 'Et avrop må knyttes til en rammeavtale.');
    }
  }
  const customer = input.customer || {};
  const company = input.company || {};
  if (!text(customer.name, 160) && !text(input.counterpartyName, 160)) {
    return fail(state, 'Knytt avtalen til en kunde.');
  }
  const email = text(input.counterpartyEmail || customer.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(state, 'E-postadressen til motparten er ugyldig.');
  }
  const when = iso(ctx.now);
  const actor = { name: input.actorName, uid: input.actorUid, party: 'avsender' };
  const kindLabel = kindCaseLabel(kind);
  const filled = fillAgreementFields(fields, {
    customer: {
      name: customer.name,
      orgnr: customer.orgnr,
      email: customer.email,
      phone: customer.phone,
      contactName: customer.contactName,
      address: customer.address,
      place: customer.place,
    },
    company,
    owner: { name: input.ownerName },
    title: input.title || input.bidTitle || input.projectName || template.title,
    description: input.description || '',
    kindLabel,
  });
  const title = text(input.title || input.bidTitle || input.projectName || template.title, 160) || template.title;
  const version = stampVersion(filled.fields, actor, when, 1);
  let row = {
    id: nid(ctx, 'sak'),
    title,
    kind,
    status: 'utkast',
    version: 1,
    templateId: text(template.id, 48),
    templateTitle: text(template.title, 120),
    customerId: text(customer.id || input.customerId, 48),
    bidId: text(input.bidId, 48),
    projectId: text(input.projectId, 48),
    contractId: '',
    parentId: kind === 'avrop' ? parentId : '',
    parentTitle: text(input.parentTitle, 160),
    shareToken: nid(ctx, 'tok') + nid(ctx, 'tok'),
    sender: {
      role: 'avsender',
      name: text(company.name, 160),
      orgnr: text(company.orgnr, 20),
      email: text(company.email, 120).toLowerCase(),
      personName: text(input.ownerName || actor.name, 120),
      personUid: text(input.ownerUid || actor.uid, 80),
    },
    counterparty: {
      role: 'motpart',
      name: text(customer.name || input.counterpartyName, 160),
      orgnr: text(customer.orgnr, 20),
      email,
      personName: text(customer.contactName, 120),
      personUid: '',
    },
    fields: filled.fields,
    versions: [version],
    notes: [],
    proposals: [],
    draftValues: {},
    signatures: [],
    events: [],
    notifyUids: (Array.isArray(input.notifyUids) ? input.notifyUids : [actor.uid, input.ownerUid])
      .map((id) => text(id, 80)).filter(Boolean).slice(0, 20),
    createdAt: when,
    updatedAt: when,
  };
  row = withEvent(row, {
    action: 'opprettet',
    actorName: actor.name,
    actorUid: actor.uid,
    actorParty: 'avsender',
    version: 1,
    detail: `${kindLabel} låst som utkast 1`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok({ ...state, agreementCases: [normalized, ...(state.agreementCases || [])].slice(0, MAX_CASES) }, normalized);
}

function syncOpenSnapshot(row, actor, when) {
  const version = currentVersion(row);
  if (!version || version.sentAt) return row;
  const next = stampVersion(row.fields, actor, when, version.number);
  next.lockedAt = version.lockedAt || when;
  return {
    ...row,
    versions: row.versions.map((item) => (item.number === version.number ? next : item)),
  };
}

export function setAgreementField(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  const party = partyOf(input);
  const fieldId = text(input.fieldId, 40);
  const source = party === 'motpart' ? viewFields(row, 'motpart') : (row.fields || []);
  const field = source.find((item) => item.id === fieldId);
  if (!field) return fail(state, 'Feltet finnes ikke i avtalen.');
  if (!canEditField(field, party)) return fail(state, 'Feltet er låst for denne parten.');
  if (party === 'motpart' && row.status !== 'hos-motpart') {
    return fail(state, 'Motparten kan bare endre felt mens avtalen ligger til behandling.');
  }
  if (party === 'avsender' && row.status !== 'utkast' && row.status !== 'merknader') {
    return fail(state, 'Avsender kan bare endre feltene i utkastet eller etter at merknader er kommet i retur.');
  }
  const value = snapshotValue({ ...field, value: input.value });
  const before = answerText(field);
  const after = answerText({ ...field, value });
  if (before === after) return ok(state, row);
  const when = iso(ctx.now);
  const actor = { name: input.actorName, uid: input.actorUid, party };
  if (party === 'avsender') {
    row = {
      ...row,
      fields: row.fields.map((item) => (item.id === fieldId ? { ...item, value } : item)),
    };
    row = syncOpenSnapshot(row, actor, when);
  } else {
    const proposals = (row.proposals || []).filter((item) => item.sentAt || item.fieldId !== fieldId);
    proposals.push({
      id: nid(ctx, 'end'),
      version: row.version,
      fieldId,
      label: field.label,
      before,
      after,
      authorParty: 'motpart',
      authorName: text(actor.name, 120),
      authorUid: text(actor.uid, 80),
      at: when,
      sentAt: '',
      handledAt: '',
    });
    row = {
      ...row,
      proposals,
      draftValues: { ...(row.draftValues || {}), [fieldId]: value },
    };
  }
  row = withEvent(row, {
    action: 'felt-endret',
    actorName: actor.name,
    actorUid: actor.uid,
    actorParty: party,
    version: row.version,
    detail: field.label,
    released: false,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

export function addAgreementNote(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  const row = found.row;
  const party = partyOf(input);
  if (party === 'motpart' && row.status === 'utkast') return fail(state, 'Avtalen er ikke sendt ennå.');
  if (party === 'avsender' && row.status === 'hos-motpart') {
    return fail(state, 'Avtalen ligger hos motparten. Vent på svar, eller på at den kommer i retur.');
  }
  const body = text(input.body, 2000);
  if (!body) return fail(state, 'Skriv en merknad eller en melding.');
  const when = iso(ctx.now);
  const note = {
    id: nid(ctx, 'not'),
    version: row.version,
    fieldId: text(input.fieldId, 40),
    kind: input.kind === 'melding' ? 'melding' : 'merknad',
    authorParty: party,
    authorName: text(input.actorName, 120),
    authorUid: text(input.actorUid, 80),
    body,
    createdAt: when,
    updatedAt: when,
    deletedAt: '',
    sentAt: '',
    resolvedAt: '',
  };
  const next = withEvent({ ...row, notes: [...(row.notes || []), note] }, {
    action: note.kind === 'melding' ? 'melding' : 'merknad',
    actorName: note.authorName,
    actorUid: note.authorUid,
    actorParty: party,
    version: row.version,
    detail: note.fieldId ? `Felt ${note.fieldId}` : (note.kind === 'melding' ? 'Melding' : 'Merknad'),
    released: false,
  }, ctx, when);
  const normalized = normalizeAgreementCase(next);
  return ok(replaceCase(state, normalized), normalized);
}

export function editAgreementNote(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  const row = found.row;
  const party = partyOf(input);
  const body = text(input.body, 2000);
  if (!body) return fail(state, 'Merknaden kan ikke være tom. Slett den om den skal bort.');
  const note = (row.notes || []).find((item) => item.id === input.noteId);
  if (!note || note.deletedAt) return fail(state, 'Merknaden finnes ikke.');
  if (note.authorParty !== party) return fail(state, 'Du kan bare endre egne merknader.');
  if (note.sentAt) return fail(state, 'Merknaden er sendt og ligger i loggen.');
  const when = iso(ctx.now);
  const notes = row.notes.map((item) => (item.id === note.id ? { ...item, body, updatedAt: when } : item));
  const next = withEvent({ ...row, notes }, {
    action: 'merknad-endret',
    actorName: input.actorName,
    actorUid: input.actorUid,
    actorParty: party,
    version: row.version,
    detail: note.kind === 'melding' ? 'Melding endret' : 'Merknad endret',
    released: false,
  }, ctx, when);
  const normalized = normalizeAgreementCase(next);
  return ok(replaceCase(state, normalized), normalized);
}

export function deleteAgreementNote(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  const row = found.row;
  const party = partyOf(input);
  const note = (row.notes || []).find((item) => item.id === input.noteId);
  if (!note || note.deletedAt) return fail(state, 'Merknaden finnes ikke.');
  if (note.authorParty !== party) return fail(state, 'Du kan bare slette egne merknader.');
  if (note.sentAt) return fail(state, 'En sendt merknad blir stående i loggen.');
  const when = iso(ctx.now);
  const notes = row.notes.map((item) => (item.id === note.id ? { ...item, deletedAt: when, updatedAt: when } : item));
  const next = withEvent({ ...row, notes }, {
    action: 'merknad-slettet',
    actorName: input.actorName,
    actorUid: input.actorUid,
    actorParty: party,
    version: row.version,
    detail: note.kind === 'melding' ? 'Melding slettet' : 'Merknad slettet',
    released: false,
  }, ctx, when);
  const normalized = normalizeAgreementCase(next);
  return ok(replaceCase(state, normalized), normalized);
}

export function sendAgreement(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  if (partyOf(input) !== 'avsender') return fail(state, 'Bare avsender kan sende avtalen.');
  if (row.status !== 'utkast') return fail(state, 'Avtalen er allerede sendt. Lag en ny versjon om den skal sendes på nytt.');
  const email = text(input.email || row.counterparty?.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(state, 'Motparten trenger en gyldig e-post før avtalen kan sendes.');
  }
  const when = iso(ctx.now);
  const actor = { name: input.actorName, uid: input.actorUid, party: 'avsender' };
  row = syncOpenSnapshot({ ...row, counterparty: { ...row.counterparty, email } }, actor, when);
  const version = currentVersion(row);
  row = {
    ...row,
    status: 'hos-motpart',
    versions: row.versions.map((item) => (item.number === version.number ? { ...item, sentAt: when } : item)),
    notes: (row.notes || []).map((note) => (
      note.authorParty === 'avsender' && !note.sentAt && !note.deletedAt ? { ...note, sentAt: when } : note
    )),
  };
  row = releaseEvents(row, 'avsender', when);
  row = withEvent(row, {
    action: 'sendt',
    actorName: actor.name,
    actorUid: actor.uid,
    actorParty: 'avsender',
    version: row.version,
    detail: `Versjon ${row.version} sendt til ${email}`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

export function returnAgreement(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  if (partyOf(input) !== 'motpart') return fail(state, 'Bare motparten kan sende merknader i retur.');
  if (row.status !== 'hos-motpart' && row.status !== 'merknader') {
    return fail(state, 'Det ligger ingen avtale til behandling hos motparten.');
  }
  const pending = unsentOwn(row, 'motpart');
  if (!pending.notes.length && !pending.proposals.length) {
    return fail(state, 'Ingen merknader å sende. Signer hvis avtalen er i orden.');
  }
  const when = iso(ctx.now);
  row = {
    ...row,
    status: 'merknader',
    signatures: [],
    notes: row.notes.map((note) => (
      note.authorParty === 'motpart' && !note.sentAt && !note.deletedAt ? { ...note, sentAt: when } : note
    )),
    proposals: row.proposals.map((item) => (item.sentAt ? item : { ...item, sentAt: when })),
  };
  row = releaseEvents(row, 'motpart', when);
  row = withEvent(row, {
    action: 'returnert',
    actorName: input.actorName,
    actorUid: input.actorUid,
    actorParty: 'motpart',
    version: row.version,
    detail: `${pending.notes.length} merknad${pending.notes.length === 1 ? '' : 'er'}, ${pending.proposals.length} feltendring${pending.proposals.length === 1 ? '' : 'er'}`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

export function acceptProposals(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  if (partyOf(input) !== 'avsender') return fail(state, 'Bare avsender kan ta inn motpartens forslag.');
  if (row.status !== 'merknader') return fail(state, 'Det ligger ingen merknader å ta inn.');
  const incoming = (row.proposals || []).filter((item) => item.sentAt && item.version === row.version);
  if (!incoming.length) return fail(state, 'Motparten har ikke foreslått feltendringer.');
  const when = iso(ctx.now);
  const byField = new Map(incoming.map((item) => [item.fieldId, item]));
  row = {
    ...row,
    fields: row.fields.map((field) => {
      const proposal = byField.get(field.id);
      if (!proposal) return field;
      return { ...field, value: snapshotValue({ ...field, value: proposal.after }) };
    }),
    proposals: row.proposals.map((item) => (
      item.sentAt && item.version === row.version ? { ...item, handledAt: when } : item
    )),
  };
  row = withEvent(row, {
    action: 'forslag-tatt-inn',
    actorName: input.actorName,
    actorUid: input.actorUid,
    actorParty: 'avsender',
    version: row.version,
    detail: `${incoming.length} felt tatt inn i arbeidskopien`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

export function acceptRemarks(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  if (partyOf(input) !== 'avsender') return fail(state, 'Bare avsender kan godta merknadene uten ny versjon.');
  if (!unresolvedNotes(row).length && !(row.proposals || []).some((item) => item.sentAt)) {
    return fail(state, 'Det er ingen åpne merknader.');
  }
  const when = iso(ctx.now);
  row = {
    ...row,
    notes: row.notes.map((note) => (note.sentAt && !note.resolvedAt ? { ...note, resolvedAt: when } : note)),
    proposals: row.proposals.map((item) => (item.sentAt && !item.handledAt ? { ...item, handledAt: when } : item)),
  };
  row = withEvent(row, {
    action: 'godtatt',
    actorName: input.actorName,
    actorUid: input.actorUid,
    actorParty: 'avsender',
    version: row.version,
    detail: 'Merknadene er godtatt uten ny versjon',
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

export function publishAgreementVersion(state, caseId, input = {}, ctx = {}) {
  const found = requireCase(state, caseId);
  if (!found.row) return fail(state, found.error);
  let row = found.row;
  if (partyOf(input) !== 'avsender') return fail(state, 'Bare avsender kan lage en ny versjon.');
  if (row.status !== 'merknader' && row.status !== 'utkast') {
    return fail(state, 'Ny versjon lages når merknadene er kommet i retur.');
  }
  const current = currentVersion(row);
  if (row.status === 'utkast' && current && !current.sentAt) {
    return fail(state, 'Utkastet er ikke sendt. Endringene ligger allerede i denne versjonen.');
  }
  if ((row.versions || []).length >= MAX_VERSIONS) return fail(state, 'Avtalen har nådd maks antall versjoner.');
  const when = iso(ctx.now);
  const actor = { name: input.actorName, uid: input.actorUid, party: 'avsender' };
  const number = (current?.number || row.version || 1) + 1;
  const version = stampVersion(row.fields, actor, when, number);
  row = {
    ...row,
    status: 'utkast',
    version: number,
    versions: [...(row.versions || []), version],
    signatures: [],
    draftValues: {},
    proposals: (row.proposals || []).map((item) => (item.sentAt ? item : { ...item, sentAt: when })),
    notes: (row.notes || []).map((note) => (
      note.sentAt && !note.resolvedAt ? { ...note, resolvedAt: when } : note
    )),
  };
  row = withEvent(row, {
    action: 'versjon',
    actorName: actor.name,
    actorUid: actor.uid,
    actorParty: 'avsender',
    version: number,
    detail: `Utkast ${number} låst`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(row);
  return ok(replaceCase(state, normalized), normalized);
}

function signStatement(method) {
  if (method === 'bankid') {
    return 'Forpliktende elektronisk forsegling av denne versjonen. BankID-leverandør er ikke tilkoblet, så seglet binder den innloggede identiteten, tidspunktet og versjonslåsen.';
  }
  return 'Forpliktende elektronisk forsegling av denne versjonen, med innlogget identitet, tidspunkt og versjonslås.';
}

export function signAgreement(state, caseId, input = {}, ctx = {}) {
  const row = caseById(state, caseId);
  if (!row) return fail(state, 'Avtalen finnes ikke.');
  if (row.status === 'signert') return fail(state, 'Avtalen er allerede signert.');
  if (row.status === 'utkast') return fail(state, 'Send avtalen før den signeres.');
  const party = partyOf(input);
  const pending = unsentOwn(row, party);
  if (pending.notes.length || pending.proposals.length) {
    return fail(state, 'Send eller slett merknadene før du signerer. Er alt i orden, kan avtalen signeres uten merknader.');
  }
  const open = unresolvedNotes(row).filter((note) => note.authorParty !== party);
  const openProposals = (row.proposals || []).filter((item) => (
    item.sentAt && !item.handledAt && item.authorParty !== party && item.version === row.version
  ));
  if (party === 'avsender' && (open.length || openProposals.length) && !input.acceptOpen) {
    return fail(state, 'Godta merknadene eller lag en ny versjon før du signerer.');
  }
  const version = currentVersion(row);
  if (!version?.sentAt) return fail(state, 'Versjonen må være sendt før den kan signeres.');
  if ((row.signatures || []).some((sign) => sign.party === party && sign.version === row.version)) {
    return fail(state, 'Du har allerede signert denne versjonen.');
  }
  const name = text(input.actorName, 120);
  if (!name) return fail(state, 'Signaturen trenger navnet til den som signerer.');
  const when = iso(ctx.now);
  const method = input.method === 'bankid' ? 'bankid' : 'forpliktende';
  const signature = {
    party,
    method,
    provider: 'protop-seal',
    name,
    uid: text(input.actorUid, 80),
    at: when,
    version: row.version,
    digest: version.digest,
    statement: signStatement(method),
  };
  const signatures = [...(row.signatures || []).filter((sign) => sign.version === row.version), signature];
  const both = signatures.some((sign) => sign.party === 'avsender') && signatures.some((sign) => sign.party === 'motpart');
  let next = {
    ...row,
    signatures,
    status: both ? 'signert' : row.status,
    notes: both
      ? row.notes.map((note) => (note.sentAt && !note.resolvedAt ? { ...note, resolvedAt: when } : note))
      : row.notes,
  };
  next = withEvent(next, {
    action: both ? 'forseglet' : 'signert',
    actorName: name,
    actorUid: signature.uid,
    actorParty: party,
    version: row.version,
    detail: both
      ? `Begge parter har forseglet versjon ${row.version}`
      : `${party === 'avsender' ? 'Avsender' : 'Motpart'} signerte med ${method === 'bankid' ? 'BankID-valg og forpliktende segl' : 'forpliktende segl'}`,
  }, ctx, when);
  const normalized = normalizeAgreementCase(next);
  return ok(replaceCase(state, normalized), normalized);
}

export function agreementMovements(row, party = 'avsender') {
  return visibleEvents(row, party).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function publicAgreementView(row, party) {
  const who = party === 'motpart' ? 'motpart' : 'avsender';
  const normalized = normalizeAgreementCase(row);
  if (!normalized) return null;
  return {
    ...normalized,
    notes: visibleNotes(normalized, who),
    proposals: visibleProposals(normalized, who),
    events: visibleEvents(normalized, who),
    draftValues: who === 'motpart' ? normalized.draftValues : {},
    fields: viewFields(normalized, who, { locked: who === 'avsender' && normalized.status === 'hos-motpart' }),
  };
}

/** Skiller motpartens usendte arbeid fra det avsender får lese. */
export function splitCounterpartyPrivacy(row) {
  const normalized = normalizeAgreementCase(row);
  if (!normalized) return { stored: null, pending: null };
  const pending = {
    notes: normalized.notes.filter((note) => !note.sentAt && !note.deletedAt && note.authorParty === 'motpart'),
    proposals: normalized.proposals.filter((item) => !item.sentAt),
    draftValues: normalized.draftValues || {},
    events: normalized.events.filter((event) => !event.releasedAt && event.actorParty === 'motpart'),
  };
  const stored = normalizeAgreementCase({
    ...normalized,
    notes: normalized.notes.filter((note) => note.sentAt || note.authorParty !== 'motpart'),
    proposals: normalized.proposals.filter((item) => item.sentAt),
    draftValues: {},
    events: normalized.events.filter((event) => event.releasedAt || event.actorParty !== 'motpart'),
  });
  return { stored, pending };
}

export function composeCounterpartyCase(row, pending = {}) {
  const normalized = normalizeAgreementCase(row);
  if (!normalized) return null;
  return normalizeAgreementCase({
    ...normalized,
    notes: [...normalized.notes, ...(pending.notes || [])],
    proposals: [...normalized.proposals, ...(pending.proposals || [])],
    draftValues: pending.draftValues || {},
    events: [...normalized.events, ...(pending.events || [])],
  });
}

export function applyAgreementOp(state, input = {}, ctx = {}) {
  const op = text(input.op, 40);
  const caseId = input.caseId;
  if (op === 'create') return createAgreementCase(state, input, ctx);
  if (op === 'setField') return setAgreementField(state, caseId, input, ctx);
  if (op === 'addNote') return addAgreementNote(state, caseId, input, ctx);
  if (op === 'editNote') return editAgreementNote(state, caseId, input, ctx);
  if (op === 'deleteNote') return deleteAgreementNote(state, caseId, input, ctx);
  if (op === 'send') return sendAgreement(state, caseId, input, ctx);
  if (op === 'return') return returnAgreement(state, caseId, input, ctx);
  if (op === 'acceptProposals') return acceptProposals(state, caseId, input, ctx);
  if (op === 'acceptRemarks') return acceptRemarks(state, caseId, input, ctx);
  if (op === 'publish') return publishAgreementVersion(state, caseId, input, ctx);
  if (op === 'sign') return signAgreement(state, caseId, input, ctx);
  return fail(state, 'Ukjent handling i avtalebehandlingen.');
}

export function agreementNoticeText(row, action) {
  const title = row?.title || 'Avtale';
  const version = row?.version || 1;
  const map = {
    sendt: `Versjon ${version} av «${title}» er sendt til behandling.`,
    returnert: `Motparten har sendt merknader på «${title}».`,
    signert: `En part har signert versjon ${version} av «${title}».`,
    forseglet: `«${title}» er forseglet av begge parter.`,
    versjon: `Ny versjon ${version} av «${title}» er låst som utkast.`,
  };
  return map[action] || `Det er en ny bevegelse på «${title}».`;
}
