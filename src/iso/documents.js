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

export function createDocument(input, { actor, existing = [], now = new Date() } = {}) {
  if (!text(input?.title)) return fail('Gi dokumentet en tittel.');
  if (!DOC_TYPES.some((d) => d.id === input?.docType)) return fail('Velg dokumenttype.');
  const months = Number(input.reviewIntervalMonths) || 12;
  const doc = bump({
    id: newId('dok'),
    code: text(input.code, 40) || nextNumber('DOK', existing.map((d) => ({ number: d.code })), now),
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
    revisions: [{
      revision: 1,
      state: 'utkast',
      content: text(input.content, 60000),
      attachments: [],
      changeReason: 'Første utgave',
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

export function saveDocumentDraft(doc, input, { actor, now = new Date() } = {}) {
  const work = workingRevision(doc);
  if (!work) return fail('Publisert revisjon er låst. Lag ny revisjon for å endre.');
  if (!['utkast', 'avvist'].includes(work.state)) return fail('Revisjonen er til gjennomgang og kan ikke endres.');
  const attachments = (input?.attachments || work.attachments || [])
    .map((a) => ({ label: text(a?.label, 200), url: text(a?.url, 2000) }))
    .filter((a) => a.label || a.url);
  const next = bump({
    ...doc,
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
  if (caps && !caps.admin) return fail('Bare godkjenner kan avvise.');
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
  if (caps && !caps.admin) return fail('Du har ikke fullmakt til å godkjenne dokumenter.');
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
  if (caps && !caps.admin) return fail('Bare administrator kan arkivere dokumenter.');
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
