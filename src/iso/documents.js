/**
 * Dokumentstyring (M04 / U06 / P09).
 * utkast → til_gjennomgang → godkjent → publisert → erstattet/arkivert, avslag → utkast.
 * Publisert revisjon er skrivebeskyttet; endring lager ny revisjon (A06/T03).
 */
import {
  addDays, auditEvent, bump, checksum, fail, isoDate, newId, nextNumber, nowIso, pushHistory, text, todayKey, uniq,
} from './core.js';

export const DOC_TYPES = [
  { id: 'policy', label: 'Policy' },
  { id: 'prosedyre', label: 'Prosedyre / rutine' },
  { id: 'instruks', label: 'Arbeidsinstruks' },
  { id: 'plan', label: 'Plan' },
  { id: 'handbok', label: 'Håndbok' },
  { id: 'veileder', label: 'Veileder / opplæring' },
  { id: 'analyse', label: 'Kartlegging / analyse' },
  { id: 'register', label: 'Register / matrise' },
  { id: 'sjekkliste', label: 'Sjekkliste' },
  { id: 'skjema', label: 'Skjema' },
  { id: 'rapport', label: 'Rapport / referat' },
  { id: 'ekstern', label: 'Eksternt dokument' },
  { id: 'kravbevis', label: 'Kravbevis' },
  { id: 'mal', label: 'Mal' },
];

export const ACCESS_CLASSES = [
  { id: 'intern', label: 'Intern' },
  { id: 'begrenset', label: 'Begrenset' },
  { id: 'skjermet', label: 'Skjermet' },
];

export const REVISION_STATES = {
  utkast: 'Utkast',
  til_gjennomgang: 'Til gjennomgang',
  godkjent: 'Godkjent',
  publisert: 'Publisert',
  erstattet: 'Erstattet',
  avvist: 'Avvist',
};

export function docTypeLabel(id) {
  return DOC_TYPES.find((d) => d.id === id)?.label || 'Dokument';
}

function ev(doc, action, actor, before, now, reason = '') {
  return auditEvent({ entityType: 'document', entityId: doc.id, action, actor, before, after: doc, reason, now });
}

/* ───────── Dokumentstruktur (deler og mapper) ───────── */

/**
 * Virksomhetens egen dokumentstruktur, f.eks. «A – HMSK-system» med mappene «A-01 Politikk», «A-02 Kontekst».
 * Lagres i isoSystem.docStructure. Tom struktur = dokumentene grupperes etter type.
 */
export function normalizeDocStructure(raw) {
  const parts = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  return parts.map((p) => {
    const code = text(p?.code, 12).toUpperCase();
    if (!code || seen.has(code)) return null;
    seen.add(code);
    const folders = (Array.isArray(p?.folders) ? p.folders : []).map((f) => {
      const fc = text(f?.code, 20).toUpperCase();
      if (!fc || seen.has(fc)) return null;
      seen.add(fc);
      return { code: fc, title: text(f?.title, 120) || fc, description: text(f?.description, 600) };
    }).filter(Boolean);
    return { code, title: text(p?.title, 120) || code, description: text(p?.description, 600), folders };
  }).filter(Boolean);
}

/** «A-01» → «A-01 Politikk». Ukjent mappe gir koden. */
export function folderLabel(structure, folderCode) {
  const code = text(folderCode, 20).toUpperCase();
  if (!code) return '';
  for (const p of normalizeDocStructure(structure)) {
    if (p.code === code) return `${p.code} – ${p.title}`;
    const f = p.folders.find((x) => x.code === code);
    if (f) return `${f.code} ${f.title}`;
  }
  return code;
}

/** Neste ledige dokumentkode i en mappe: A-01 → A-01-004 (løpenummer med tre siffer). */
export function nextDocumentCode(folder, docs = []) {
  const head = `${text(folder, 20).toUpperCase()}-`;
  if (head === '-') return '';
  let max = 0;
  for (const d of docs || []) {
    const code = String(d?.code || '').toUpperCase();
    if (!code.startsWith(head)) continue;
    const n = Number(code.slice(head.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${head}${String(max + 1).padStart(3, '0')}`;
}

/** Dokumentkoden er unik blant dokumenter som ikke er arkivert (ISO 7.5.2 identifikasjon). */
export function codeTaken(code, docs = [], exceptId = '') {
  const c = text(code, 40).toUpperCase();
  return !!c && (docs || []).some((d) => !d.archived && d.id !== exceptId && String(d.code || '').toUpperCase() === c);
}

/** Vedlegg: lenke eller opplastet fil i ProTop. */
export function cleanAttachment(a) {
  const label = text(a?.label, 200);
  const url = text(a?.url, 2000);
  if (!label && !url) return null;
  const out = { label: label || url.split('/').pop() || 'Vedlegg', url };
  if (a?.path) out.path = text(a.path, 500);
  if (a?.contentType) out.contentType = text(a.contentType, 120);
  if (Number(a?.size) > 0) out.size = Math.round(Number(a.size));
  if (['fil', 'lenke', 'original'].includes(a?.kind)) out.kind = a.kind;
  return out;
}

function cleanAttachments(list) {
  return (Array.isArray(list) ? list : []).map(cleanAttachment).filter(Boolean).slice(0, 40);
}

/** Revisjonshistorikk fra tidligere system (vises som historikk, ikke som ProTop-revisjoner). */
export function cleanLegacyRevisions(list) {
  return (Array.isArray(list) ? list : []).map((r) => ({
    rev: text(r?.rev, 20),
    date: isoDate(r?.date) || text(r?.date, 20),
    reason: text(r?.reason, 500),
    by: text(r?.by, 120),
  })).filter((r) => r.rev || r.reason).slice(0, 60);
}

/** Hvor dokumentet kommer fra (import fra tidligere system). */
export function cleanSource(src) {
  if (!src || typeof src !== 'object') return null;
  const out = {
    system: text(src.system, 120),
    path: text(src.path, 600),
    url: text(src.url, 2000),
    originalCode: text(src.originalCode, 80),
    originalCreated: text(src.originalCreated, 40),
    originalVersion: text(src.originalVersion, 40),
    note: text(src.note, 2000),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

export function createDocument(input, { actor, existing = [], now = new Date() } = {}) {
  if (!text(input?.title)) return fail('Gi dokumentet en tittel.');
  if (!DOC_TYPES.some((d) => d.id === input?.docType)) return fail('Velg dokumenttype.');
  const months = Number(input.reviewIntervalMonths) || 12;
  const folder = text(input.folder, 20).toUpperCase();
  const code = text(input.code, 40)
    || (folder ? nextDocumentCode(folder, existing) : nextNumber('DOK', existing.map((d) => ({ number: d.code })), now));
  if (codeTaken(code, existing)) return fail(`Dokument-ID ${code} er allerede i bruk.`);
  const legacy = cleanLegacyRevisions(input.legacyRevisions);
  const source = cleanSource(input.source);
  const doc = bump({
    id: newId('dok'),
    code,
    folder,
    title: text(input.title, 200),
    docType: input.docType,
    ownerName: text(input.ownerName, 160) || text(actor?.name, 160),
    ownerUid: text(input.ownerUid, 128) || text(actor?.uid, 128),
    approverName: text(input.approverName, 160),
    accessClass: ACCESS_CLASSES.some((c) => c.id === input.accessClass) ? input.accessClass : 'intern',
    tags: uniq(input.tags),
    requirementIds: uniq(input.requirementIds),
    processIds: uniq(input.processIds),
    reviewIntervalMonths: months,
    nextReview: '',
    readAckRequired: !!input.readAckRequired,
    ...(legacy.length ? { legacyRevisions: legacy } : {}),
    ...(source ? { source } : {}),
    revisions: [{
      revision: 1,
      state: 'utkast',
      content: text(input.content, 60000),
      attachments: cleanAttachments(input.attachments),
      changeReason: text(input.changeReason, 1000) || 'Første utgave',
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
    }],
    publishedRevision: 0,
    readAcks: [],
    createdAt: nowIso(now),
    history: pushHistory({}, 'Opprettet', actor, '', now),
    rev: 0,
  }, actor, now);
  return { ok: true, document: doc, events: [ev(doc, 'iso.document.created', actor, null, now)] };
}

export function workingRevision(doc) {
  return (doc?.revisions || []).find((r) => ['utkast', 'til_gjennomgang', 'godkjent', 'avvist'].includes(r.state)) || null;
}

export function publishedRevisionOf(doc) {
  return (doc?.revisions || []).find((r) => r.revision === doc?.publishedRevision && r.state === 'publisert') || null;
}

export function revisionOf(doc, revision) {
  return (doc?.revisions || []).find((r) => r.revision === Number(revision)) || null;
}

function patchRevision(doc, revision, patch) {
  return (doc.revisions || []).map((r) => (r.revision === revision ? { ...r, ...patch } : r));
}

export function saveDocumentDraft(doc, input, { actor, now = new Date(), existing = null } = {}) {
  const work = workingRevision(doc);
  if (!work) return fail('Publisert revisjon er låst. Lag ny revisjon for å endre.');
  if (!['utkast', 'avvist'].includes(work.state)) return fail('Revisjonen er til gjennomgang og kan ikke endres.');
  const attachments = cleanAttachments(input?.attachments || work.attachments || []);
  const code = input?.code != null ? (text(input.code, 40) || doc.code) : doc.code;
  if (existing && code !== doc.code && codeTaken(code, existing, doc.id)) return fail(`Dokument-ID ${code} er allerede i bruk.`);
  const next = bump({
    ...doc,
    code,
    folder: input?.folder != null ? text(input.folder, 20).toUpperCase() : (doc.folder || ''),
    tags: input?.tags ? uniq(input.tags) : (doc.tags || []),
    processIds: input?.processIds ? uniq(input.processIds) : (doc.processIds || []),
    docType: input?.docType && DOC_TYPES.some((d) => d.id === input.docType) ? input.docType : doc.docType,
    title: input?.title != null ? (text(input.title, 200) || doc.title) : doc.title,
    ownerName: input?.ownerName != null ? text(input.ownerName, 160) : doc.ownerName,
    approverName: input?.approverName != null ? text(input.approverName, 160) : doc.approverName,
    accessClass: input?.accessClass || doc.accessClass,
    requirementIds: input?.requirementIds ? uniq(input.requirementIds) : doc.requirementIds,
    readAckRequired: input?.readAckRequired != null ? !!input.readAckRequired : doc.readAckRequired,
    reviewIntervalMonths: Number(input?.reviewIntervalMonths) || doc.reviewIntervalMonths,
    revisions: patchRevision(doc, work.revision, {
      content: input?.content != null ? text(input.content, 60000) : work.content,
      changeReason: input?.changeReason != null ? text(input.changeReason, 1000) : work.changeReason,
      attachments,
      state: 'utkast',
      savedAt: nowIso(now),
    }),
  }, actor, now);
  return { ok: true, document: next, events: [] };
}

export function submitDocument(doc, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å sende dokumenter til gjennomgang.');
  const work = workingRevision(doc);
  if (!work || !['utkast', 'avvist'].includes(work.state)) return fail('Ingen utkast å sende.');
  if (!text(work.content) && !(work.attachments || []).length) return fail('Dokumentet er tomt.');
  if (work.revision > 1 && !text(work.changeReason)) return fail('Beskriv hva som er endret i denne revisjonen.');
  const next = bump({
    ...doc,
    revisions: patchRevision(doc, work.revision, {
      state: 'til_gjennomgang',
      submittedAt: nowIso(now),
      submittedBy: text(actor?.name, 160),
      contentHash: checksum({ c: work.content, a: work.attachments }),
    }),
    history: pushHistory(doc, `Rev. ${work.revision} sendt til gjennomgang`, actor, '', now),
  }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.submitted', actor, doc, now)] };
}

export function rejectDocument(doc, note, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Bare godkjenner kan avvise.');
  const work = workingRevision(doc);
  if (!work || work.state !== 'til_gjennomgang') return fail('Ingen revisjon venter på gjennomgang.');
  if (text(note).length < 5) return fail('Skriv hva som må endres.');
  const next = bump({
    ...doc,
    revisions: patchRevision(doc, work.revision, { state: 'avvist', rejectNote: text(note, 2000), rejectedBy: text(actor?.name, 160), rejectedAt: nowIso(now) }),
    history: pushHistory(doc, `Rev. ${work.revision} avvist`, actor, note, now),
  }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.rejected', actor, doc, now, note)] };
}

/** Godkjenn og publiser. Forrige publiserte revisjon blir «erstattet» og beholdes uendret. */
export function approveAndPublishDocument(doc, { actor, caps, now = new Date(), effectiveFrom = '' } = {}) {
  if (caps && !caps.approve) return fail('Du har ikke fullmakt til å godkjenne dokumenter.');
  const work = workingRevision(doc);
  if (!work || work.state !== 'til_gjennomgang') return fail('Revisjonen må sendes til gjennomgang først.');
  if (work.contentHash && work.contentHash !== checksum({ c: work.content, a: work.attachments })) {
    return fail('Innholdet er endret etter innsending. Send på nytt.');
  }
  const stamp = nowIso(now);
  const from = isoDate(effectiveFrom) || todayKey(now);
  const revisions = (doc.revisions || []).map((r) => {
    if (r.revision === work.revision) {
      return { ...r, state: 'publisert', approvedAt: stamp, approvedBy: text(actor?.name, 160), publishedAt: stamp, effectiveFrom: from };
    }
    if (r.state === 'publisert') return { ...r, state: 'erstattet', supersededAt: stamp };
    return r;
  });
  const next = bump({
    ...doc,
    revisions,
    publishedRevision: work.revision,
    nextReview: addDays(from, Math.round((doc.reviewIntervalMonths || 12) * 30.4)),
    history: pushHistory(doc, `Rev. ${work.revision} godkjent og publisert`, actor, '', now),
  }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.published', actor, doc, now)] };
}

export function newDocumentRevision(doc, reason, { actor, now = new Date() } = {}) {
  if (workingRevision(doc)) return fail('Det finnes allerede en revisjon under arbeid.');
  const base = publishedRevisionOf(doc) || (doc.revisions || []).at(-1);
  const revision = Math.max(0, ...(doc.revisions || []).map((r) => r.revision)) + 1;
  const next = bump({
    ...doc,
    revisions: [...doc.revisions, {
      revision,
      state: 'utkast',
      content: base?.content || '',
      attachments: base?.attachments || [],
      changeReason: text(reason, 1000),
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
    }],
    history: pushHistory(doc, `Rev. ${revision} startet`, actor, reason, now),
  }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.new_revision', actor, doc, now, reason)] };
}

export function archiveDocument(doc, reason, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Bare en godkjenner kan arkivere dokumenter.');
  if (text(reason).length < 5) return fail('Begrunn arkiveringen.');
  const next = bump({ ...doc, archived: true, archivedAt: nowIso(now), archiveReason: text(reason, 1000), history: pushHistory(doc, 'Arkivert', actor, reason, now) }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.archived', actor, doc, now, reason)] };
}

export function acknowledgeRead(doc, { actor, now = new Date() } = {}) {
  const pub = publishedRevisionOf(doc);
  if (!pub) return fail('Dokumentet er ikke publisert.');
  const uid = text(actor?.uid, 128);
  if (!uid) return fail('Mangler bruker.');
  if ((doc.readAcks || []).some((a) => a.uid === uid && a.revision === pub.revision)) return { ok: true, document: doc, events: [], already: true };
  const next = bump({
    ...doc,
    readAcks: [...(doc.readAcks || []), { revision: pub.revision, uid, name: text(actor?.name, 160), at: nowIso(now) }].slice(-2000),
  }, actor, now);
  return { ok: true, document: next, events: [ev(next, 'iso.document.read_ack', actor, doc, now)] };
}

export function hasAcknowledged(doc, uid) {
  const pub = publishedRevisionOf(doc);
  if (!pub) return false;
  return (doc.readAcks || []).some((a) => a.uid === uid && a.revision === pub.revision);
}

export function documentsDueForReview(docs, now = new Date()) {
  const today = todayKey(now);
  return (docs || []).filter((d) => !d.archived && d.nextReview && d.nextReview <= today);
}

export function documentsAwaitingApproval(docs) {
  return (docs || []).filter((d) => !d.archived && workingRevision(d)?.state === 'til_gjennomgang');
}
