/**
 * Dokumentstyring for KS-maler i Skjemabygger og personalhåndboken i HR.
 *
 * Samme livsløp som ISO-dokumentene (src/iso/documents.js):
 *   utkast → til_gjennomgang → publisert → erstattet, og avvist → utkast.
 * En publisert revisjon er låst. Endres dokumentet etter publisering, startes en
 * ny revisjon automatisk. Den gjelder først når en godkjenner har godkjent den.
 *
 * Dokumenthodet (dokument-ID, versjon, eier, godkjent av og datoer) beregnes her.
 * Det skrives aldri inn for hånd. Revisjonsloggen bygges av revisjonene.
 *
 * Innholdet ligger der det redigeres (malen i Skjemabygger, kapitlene i HR).
 * Ved innsending lagres et øyeblikksbilde med sjekksum. Godkjenning avvises hvis
 * utkastet er endret etter innsending.
 */

export const REVISION_STATES = {
  utkast: 'Utkast',
  til_gjennomgang: 'Til godkjenning',
  avvist: 'Avvist',
  publisert: 'Gjeldende',
  erstattet: 'Erstattet',
};

export const READ_RULES = [
  { id: 'ingen', label: 'Ingen lesekrav', hint: 'Skjema som fylles ut ved behov.' },
  { id: 'info', label: 'Til informasjon', hint: 'Ansatte får se dokumentet. Bekreftelse er frivillig.' },
  { id: 'pakrevd', label: 'Påkrevd: les og bekreft', hint: 'Alle ansatte må lese og bekrefte at de har forstått.' },
  { id: 'signeres', label: 'Påkrevd: fyll ut og signer', hint: 'Hver ansatt fyller ut og signerer sitt eget, for eksempel taushetserklæring.' },
];

export const REVIEW_DECISIONS = [
  { id: 'uendret', label: 'Gjennomgått, ingen endring' },
  { id: 'revideres', label: 'Skal revideres' },
];

export const COMMENT_STATUSES = [
  { id: 'apen', label: 'Åpen' },
  { id: 'tatt_inn', label: 'Tatt inn i revisjon' },
  { id: 'avvist', label: 'Ikke tatt inn' },
];

const MAX_SNAPSHOTS = 12;
const HISTORY_MAX = 200;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function nowIso(now) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

export function todayKey(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addMonths(dateKey, months) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(months || 0), Number(match[3])));
  return date.toISOString().slice(0, 10);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Sjekksum av innholdet. Lik sjekksum betyr likt innhold. */
export function contentHash(value) {
  const input = stableJson(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function actorOf(actor) {
  return { uid: text(actor?.uid, 128), name: text(actor?.name, 120) };
}

function pushHistory(control, action, actor, note, now) {
  return [...(control?.history || []), { at: nowIso(now), by: text(actor?.name, 120), uid: text(actor?.uid, 128), action: text(action, 160), note: text(note, 600) }].slice(-HISTORY_MAX);
}

export function controlKey(kind, refId = '') {
  if (kind === 'handbook') return 'handbook';
  return `tpl_${String(refId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`;
}

/* ───────── Normalisering ───────── */

function normalizeRevision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const revision = Math.round(Number(raw.revision) || 0);
  if (revision < 1) return null;
  const state = Object.keys(REVISION_STATES).includes(raw.state) ? raw.state : 'utkast';
  return {
    revision,
    state,
    changeReason: text(raw.changeReason, 1000),
    createdAt: text(raw.createdAt, 40),
    createdBy: text(raw.createdBy, 120),
    submittedAt: text(raw.submittedAt, 40),
    submittedBy: text(raw.submittedBy, 120),
    submittedByUid: text(raw.submittedByUid, 128),
    contentHash: text(raw.contentHash, 20),
    approvedAt: text(raw.approvedAt, 40),
    approvedBy: text(raw.approvedBy, 120),
    approvedByUid: text(raw.approvedByUid, 128),
    effectiveFrom: text(raw.effectiveFrom, 10),
    rejectNote: text(raw.rejectNote, 2000),
    rejectedBy: text(raw.rejectedBy, 120),
    rejectedAt: text(raw.rejectedAt, 40),
    supersededAt: text(raw.supersededAt, 40),
    snapshot: raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : null,
  };
}

function normalizePerson(raw) {
  return { uid: text(raw?.uid, 128), name: text(raw?.name, 120) };
}

export function normalizeControl(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id, 100);
  const title = text(raw.title, 160);
  if (!id || !title) return null;
  const revisions = (Array.isArray(raw.revisions) ? raw.revisions : []).map(normalizeRevision).filter(Boolean)
    .sort((a, b) => a.revision - b.revision);
  const lastReview = raw.lastReview && typeof raw.lastReview === 'object'
    ? { at: text(raw.lastReview.at, 40), by: text(raw.lastReview.by, 120), decision: text(raw.lastReview.decision, 20), note: text(raw.lastReview.note, 1000) }
    : null;
  return {
    id,
    kind: raw.kind === 'handbook' ? 'handbook' : 'template',
    refId: text(raw.refId, 100),
    title,
    code: text(raw.code, 40),
    owner: normalizePerson(raw.owner),
    approver: normalizePerson(raw.approver),
    readRule: READ_RULES.some((row) => row.id === raw.readRule) ? raw.readRule : 'ingen',
    notify: ['standard', 'ja', 'nei'].includes(raw.notify) ? raw.notify : 'standard',
    reviewIntervalMonths: Math.max(1, Math.min(60, Math.round(Number(raw.reviewIntervalMonths) || 12))),
    nextReview: text(raw.nextReview, 10),
    lastReview,
    revisions,
    publishedRevision: Math.max(0, Math.round(Number(raw.publishedRevision) || 0)),
    createdAt: text(raw.createdAt, 40),
    createdBy: text(raw.createdBy, 120),
    updatedAt: text(raw.updatedAt, 40),
    archived: !!raw.archived,
    history: (Array.isArray(raw.history) ? raw.history : []).slice(-HISTORY_MAX),
  };
}

/** Nytt styrt dokument. Første revisjon er et utkast. */
export function newControl(input, { actor = null, now = new Date() } = {}) {
  const at = nowIso(now);
  return normalizeControl({
    id: controlKey(input?.kind, input?.refId),
    kind: input?.kind,
    refId: input?.refId,
    title: input?.title,
    code: input?.code,
    owner: input?.owner || actorOf(actor),
    approver: input?.approver || {},
    readRule: input?.readRule || 'ingen',
    reviewIntervalMonths: input?.reviewIntervalMonths || 12,
    revisions: [{ revision: 1, state: 'utkast', changeReason: 'Første utgave', createdAt: at, createdBy: text(actor?.name, 120) }],
    publishedRevision: 0,
    createdAt: at,
    createdBy: text(actor?.name, 120),
    updatedAt: at,
    history: pushHistory({}, 'Opprettet', actor, '', now),
  });
}

/* ───────── Oppslag ───────── */

export function workingRevision(control) {
  return (control?.revisions || []).find((row) => ['utkast', 'til_gjennomgang', 'avvist'].includes(row.state)) || null;
}

export function publishedRevision(control) {
  return (control?.revisions || []).find((row) => row.revision === control?.publishedRevision && row.state === 'publisert') || null;
}

/** Innholdet som gjelder: øyeblikksbildet av gjeldende revisjon. */
export function publishedSnapshot(control) {
  return publishedRevision(control)?.snapshot || null;
}

export function isPublished(control) {
  return !!publishedRevision(control);
}

/* ───────── Tilgang ───────── */

export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const people = (list) => (Array.isArray(list) ? list : []).map(normalizePerson).filter((row) => row.uid).slice(0, 50);
  const approvers = people(src.approvers);
  const commentReaders = people(src.commentReaders);
  return {
    approvers,
    commentReaders,
    // Speil av uid-ene for Firestore-reglene (lister med objekter kan ikke slås opp der).
    approverUids: approvers.map((row) => row.uid),
    commentReaderUids: commentReaders.map((row) => row.uid),
    employeesCanComment: !!src.employeesCanComment,
    notifyOnPublish: src.notifyOnPublish !== false,
    fourEyes: src.fourEyes !== false,
    defaultReviewMonths: Math.max(1, Math.min(60, Math.round(Number(src.defaultReviewMonths) || 12))),
    updatedAt: text(src.updatedAt, 40),
    updatedBy: text(src.updatedBy, 120),
  };
}

/**
 * Kan personen godkjenne? Utpekt godkjenner for dokumentet, eller en av godkjennerne i
 * innstillingene. Er ingen godkjennere valgt, kan administrator godkjenne.
 * Med fire øyne kan ikke den som sendte inn, godkjenne selv.
 */
export function canApprove(control, actor, settings, { isAdmin = false } = {}) {
  const uid = text(actor?.uid, 128);
  if (!uid) return { ok: false, reason: 'Logg inn for å godkjenne.' };
  const s = normalizeSettings(settings);
  const work = workingRevision(control);
  if (s.fourEyes && work?.submittedByUid && work.submittedByUid === uid) {
    return { ok: false, reason: 'Du sendte inn revisjonen selv. En annen må godkjenne den.' };
  }
  if (control?.approver?.uid) {
    return control.approver.uid === uid
      ? { ok: true }
      : { ok: false, reason: `Bare ${control.approver.name || 'utpekt godkjenner'} kan godkjenne dette dokumentet.` };
  }
  if (s.approverUids.length) {
    return s.approverUids.includes(uid) ? { ok: true } : { ok: false, reason: 'Du er ikke godkjenner i dokumentstyringen.' };
  }
  return isAdmin ? { ok: true } : { ok: false, reason: 'Bare administrator kan godkjenne til godkjennere er valgt.' };
}

/** Hvem som skal ha beskjed når en revisjon venter på godkjenning. */
export function approverUidsFor(control, settings, { adminUids = [] } = {}) {
  if (control?.approver?.uid) return [control.approver.uid];
  const s = normalizeSettings(settings);
  return s.approverUids.length ? s.approverUids : (adminUids || []).filter(Boolean);
}

export function shouldNotify(control, settings) {
  if (control?.notify === 'ja') return true;
  if (control?.notify === 'nei') return false;
  return normalizeSettings(settings).notifyOnPublish && control?.readRule !== 'ingen';
}

/* ───────── Livsløp ───────── */

function touch(control, patch, now) {
  return normalizeControl({ ...control, ...patch, updatedAt: nowIso(now) });
}

function patchRevision(control, revision, patch) {
  return control.revisions.map((row) => (row.revision === revision ? { ...row, ...patch } : row));
}

/** Endre eier, godkjenner, lesekrav, varsel eller gjennomgangsintervall. */
export function updateControl(control, part, { actor = null, now = new Date() } = {}) {
  const changes = [];
  const next = { ...control };
  if (part.owner) { next.owner = normalizePerson(part.owner); changes.push(`eier ${next.owner.name || '–'}`); }
  if (part.approver) { next.approver = normalizePerson(part.approver); changes.push(`godkjenner ${next.approver.name || 'fra innstillingene'}`); }
  if (part.readRule && READ_RULES.some((row) => row.id === part.readRule)) {
    next.readRule = part.readRule;
    changes.push(`lesekrav ${READ_RULES.find((row) => row.id === part.readRule).label.toLowerCase()}`);
  }
  if (part.notify) { next.notify = part.notify; changes.push(`varsel ${part.notify}`); }
  if (part.reviewIntervalMonths) {
    next.reviewIntervalMonths = part.reviewIntervalMonths;
    changes.push(`gjennomgang hver ${part.reviewIntervalMonths}. måned`);
  }
  if (part.title) next.title = part.title;
  if (part.code != null) { next.code = part.code; changes.push(`dokument-ID ${part.code}`); }
  if (!changes.length && !part.title) return control;
  return touch(next, { history: changes.length ? pushHistory(control, `Endret ${changes.join(', ')}`, actor, '', now) : control.history }, now);
}

/** Malen er slettet. Dokumentet beholdes i registeret med historikk, men vises ikke lenger. */
export function archiveControl(control, { actor = null, now = new Date() } = {}) {
  if (!control || control.archived) return control;
  return touch(control, { archived: true, history: pushHistory(control, 'Arkivert', actor, '', now) }, now);
}

/**
 * Sørg for at det finnes en revisjon under arbeid når utkastet avviker fra gjeldende versjon.
 * Kalles når malen eller håndboken lagres, så ny versjon blir en ny revisjon av seg selv.
 */
export function ensureWorkingRevision(control, draftHash, { actor = null, now = new Date() } = {}) {
  if (!control || control.archived) return control;
  if (workingRevision(control)) return control;
  const pub = publishedRevision(control);
  if (pub && pub.contentHash === draftHash) return control;
  const revision = Math.max(0, ...control.revisions.map((row) => row.revision)) + 1;
  return touch(control, {
    revisions: [...control.revisions, { revision, state: 'utkast', changeReason: '', createdAt: nowIso(now), createdBy: text(actor?.name, 120) }],
    history: pushHistory(control, `Rev. ${revision} startet`, actor, '', now),
  }, now);
}

/** Send gjeldende utkast til godkjenning, med øyeblikksbilde og sjekksum. */
export function submitRevision(control, snapshot, { changeReason = '', actor = null, now = new Date() } = {}) {
  const base = ensureWorkingRevision(control, contentHash(snapshot), { actor, now });
  const work = workingRevision(base);
  if (!work) return fail('Innholdet er likt gjeldende versjon. Endre dokumentet før du sender det til godkjenning.');
  if (work.state === 'til_gjennomgang') return fail('Revisjonen venter allerede på godkjenning.');
  const reason = text(changeReason, 1000) || work.changeReason;
  if (work.revision > 1 && !reason) return fail('Skriv hva som er endret i denne revisjonen.');
  if (!snapshot) return fail('Dokumentet er tomt.');
  const actorRow = actorOf(actor);
  const next = touch(base, {
    revisions: patchRevision(base, work.revision, {
      state: 'til_gjennomgang',
      changeReason: reason || 'Første utgave',
      submittedAt: nowIso(now),
      submittedBy: actorRow.name,
      submittedByUid: actorRow.uid,
      contentHash: contentHash(snapshot),
      snapshot,
      rejectNote: '',
    }),
    history: pushHistory(base, `Rev. ${work.revision} sendt til godkjenning`, actor, reason, now),
  }, now);
  return { ok: true, control: next, revision: work.revision };
}

/** Trekk tilbake en innsending, for eksempel for å rette noe før godkjenning. */
export function withdrawRevision(control, { actor = null, now = new Date() } = {}) {
  const work = workingRevision(control);
  if (!work || work.state !== 'til_gjennomgang') return fail('Ingen revisjon venter på godkjenning.');
  return {
    ok: true,
    control: touch(control, {
      revisions: patchRevision(control, work.revision, { state: 'utkast', snapshot: null, contentHash: '' }),
      history: pushHistory(control, `Rev. ${work.revision} trukket tilbake`, actor, '', now),
    }, now),
  };
}

export function rejectRevision(control, note, { actor = null, settings = null, isAdmin = false, now = new Date() } = {}) {
  const allowed = canApprove(control, actor, settings, { isAdmin });
  if (!allowed.ok) return fail(allowed.reason);
  const work = workingRevision(control);
  if (!work || work.state !== 'til_gjennomgang') return fail('Ingen revisjon venter på godkjenning.');
  if (text(note).length < 5) return fail('Skriv hva som må endres.');
  return {
    ok: true,
    control: touch(control, {
      revisions: patchRevision(control, work.revision, { state: 'avvist', rejectNote: text(note, 2000), rejectedBy: text(actor?.name, 120), rejectedAt: nowIso(now) }),
      history: pushHistory(control, `Rev. ${work.revision} avvist`, actor, note, now),
    }, now),
  };
}

/**
 * Godkjenn og publiser. Forrige versjon blir «erstattet» og beholdes.
 * currentHash er sjekksummen av utkastet nå. Avviker den fra innsendt, må det sendes på nytt.
 */
export function approveRevision(control, { actor = null, settings = null, isAdmin = false, currentHash = '', effectiveFrom = '', now = new Date() } = {}) {
  const allowed = canApprove(control, actor, settings, { isAdmin });
  if (!allowed.ok) return fail(allowed.reason);
  const work = workingRevision(control);
  if (!work || work.state !== 'til_gjennomgang') return fail('Revisjonen må sendes til godkjenning først.');
  if (currentHash && work.contentHash && currentHash !== work.contentHash) {
    return fail('Utkastet er endret etter at det ble sendt til godkjenning. Send det på nytt.');
  }
  const at = nowIso(now);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ? effectiveFrom : todayKey(now);
  const actorRow = actorOf(actor);
  const published = control.revisions.filter((row) => row.state === 'publisert' || row.state === 'erstattet').map((row) => row.revision);
  // Eldste øyeblikksbilder fjernes når det blir mange. Metadata og sjekksum beholdes.
  const keep = new Set(published.slice(-(MAX_SNAPSHOTS - 1)));
  const revisions = control.revisions.map((row) => {
    if (row.revision === work.revision) {
      return { ...row, state: 'publisert', approvedAt: at, approvedBy: actorRow.name, approvedByUid: actorRow.uid, effectiveFrom: from };
    }
    const base = row.state === 'publisert' ? { ...row, state: 'erstattet', supersededAt: at } : row;
    return keep.has(base.revision) || base.revision === work.revision ? base : { ...base, snapshot: null };
  });
  const next = touch(control, {
    revisions,
    publishedRevision: work.revision,
    nextReview: addMonths(from, control.reviewIntervalMonths),
    history: pushHistory(control, `Rev. ${work.revision} godkjent og publisert`, actor, '', now),
  }, now);
  return { ok: true, control: next, revision: work.revision };
}

/** Dokumentert gjennomgang, for eksempel i ledelsens årlige gjennomgang. */
export function markReviewed(control, { decision = 'uendret', note = '', actor = null, now = new Date() } = {}) {
  if (!REVIEW_DECISIONS.some((row) => row.id === decision)) return fail('Velg utfall av gjennomgangen.');
  const label = REVIEW_DECISIONS.find((row) => row.id === decision).label;
  let next = touch(control, {
    lastReview: { at: nowIso(now), by: text(actor?.name, 120), decision, note: text(note, 1000) },
    nextReview: addMonths(todayKey(now), control.reviewIntervalMonths),
    history: pushHistory(control, label, actor, note, now),
  }, now);
  if (decision === 'revideres' && !workingRevision(next)) {
    const revision = Math.max(0, ...next.revisions.map((row) => row.revision)) + 1;
    next = touch(next, {
      revisions: [...next.revisions, { revision, state: 'utkast', changeReason: text(note, 1000), createdAt: nowIso(now), createdBy: text(actor?.name, 120) }],
      history: pushHistory(next, `Rev. ${revision} startet etter gjennomgang`, actor, note, now),
    }, now);
  }
  return { ok: true, control: next };
}

/* ───────── Visning ───────── */

function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return match ? `${match[3]}.${match[2]}.${match[1].slice(2)}` : '';
}

/**
 * Dokumenthodet slik det står i KS-malene. Beregnes fra dokumentstyringen.
 * Uten godkjent versjon står versjonen som «Utkast» og godkjenningsfeltene er tomme.
 */
export function docHeader(control, { system = '' } = {}) {
  if (!control) return null;
  const pub = publishedRevision(control);
  const work = workingRevision(control);
  const latest = [...control.revisions].reverse().find((row) => row.submittedAt || row.createdAt);
  return {
    system,
    docId: control.code,
    owner: control.owner?.name || '',
    version: pub ? String(pub.revision) : `Utkast ${work?.revision || 1}`,
    approvedBy: pub?.approvedBy || '',
    created: shortDate(control.createdAt),
    changed: shortDate(pub?.approvedAt || latest?.submittedAt || latest?.createdAt || control.updatedAt),
    approved: shortDate(pub?.approvedAt),
  };
}

/** Revisjonslogg: én rad per godkjent versjon, nyeste først. */
export function revisionLog(control) {
  return (control?.revisions || [])
    .filter((row) => row.state === 'publisert' || row.state === 'erstattet')
    .map((row) => ({
      revision: row.revision,
      state: row.state,
      reason: row.changeReason,
      changedBy: row.submittedBy || row.createdBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      effectiveFrom: row.effectiveFrom,
    }))
    .sort((a, b) => b.revision - a.revision);
}

export function reviewDue(control, now = new Date()) {
  return !!control?.nextReview && !control.archived && control.nextReview <= todayKey(now);
}

/** Status for lister: tekst og tone (ok, warn, info). */
export function controlStatus(control, now = new Date()) {
  if (!control) return { label: 'Ikke styrt', tone: 'info' };
  const pub = publishedRevision(control);
  const work = workingRevision(control);
  if (work?.state === 'til_gjennomgang') return { label: `Rev. ${work.revision} venter på godkjenning`, tone: 'warn' };
  if (work?.state === 'avvist') return { label: `Rev. ${work.revision} avvist`, tone: 'warn' };
  if (!pub) return { label: 'Utkast, ikke godkjent', tone: 'warn' };
  if (reviewDue(control, now)) return { label: `Versjon ${pub.revision} · gjennomgang forfalt`, tone: 'warn' };
  if (work) return { label: `Versjon ${pub.revision} · rev. ${work.revision} under arbeid`, tone: 'info' };
  return { label: `Versjon ${pub.revision} gjeldende`, tone: 'ok' };
}

/* ───────── Merknader ───────── */

export function normalizeComment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id, 80);
  const docKey = text(raw.docKey, 100);
  const note = text(raw.note, 2000);
  if (!id || !docKey || !note) return null;
  return {
    id,
    docKey,
    docTitle: text(raw.docTitle, 160),
    anchorId: text(raw.anchorId, 80),
    anchorLabel: text(raw.anchorLabel, 160),
    quote: text(raw.quote, 600),
    note,
    revision: Math.max(0, Math.round(Number(raw.revision) || 0)),
    authorUid: text(raw.authorUid, 128),
    authorName: text(raw.authorName, 120),
    createdAt: text(raw.createdAt, 40),
    status: COMMENT_STATUSES.some((row) => row.id === raw.status) ? raw.status : 'apen',
    resolution: text(raw.resolution, 1000),
    resolvedBy: text(raw.resolvedBy, 120),
    resolvedAt: text(raw.resolvedAt, 40),
    resolvedInRevision: Math.max(0, Math.round(Number(raw.resolvedInRevision) || 0)),
  };
}

export function newComment({ control, anchorId = '', anchorLabel = '', quote = '', note = '' }, { actor = null, now = new Date() } = {}) {
  const work = workingRevision(control);
  const pub = publishedRevision(control);
  return normalizeComment({
    id: `mrk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    docKey: control?.id,
    docTitle: control?.title,
    anchorId,
    anchorLabel,
    quote,
    note,
    revision: pub?.revision || work?.revision || 0,
    authorUid: actor?.uid,
    authorName: actor?.name,
    createdAt: nowIso(now),
    status: 'apen',
  });
}

export function resolveComment(comment, { status, resolution = '', actor = null, control = null, now = new Date() } = {}) {
  if (!COMMENT_STATUSES.some((row) => row.id === status)) return comment;
  const work = workingRevision(control);
  return normalizeComment({
    ...comment,
    status,
    resolution,
    resolvedBy: status === 'apen' ? '' : text(actor?.name, 120),
    resolvedAt: status === 'apen' ? '' : nowIso(now),
    resolvedInRevision: status === 'tatt_inn' ? (work?.revision || 0) : 0,
  });
}

/**
 * Hvem ser merknaden? Den som skrev den, utpekte lesere og godkjennere i innstillingene,
 * dokumentets eier og godkjenner, og administrator.
 */
export function canSeeComment(comment, actor, settings, { control = null, isAdmin = false } = {}) {
  const uid = text(actor?.uid, 128);
  if (!uid) return false;
  if (isAdmin || comment?.authorUid === uid) return true;
  const s = normalizeSettings(settings);
  if (s.commentReaderUids.includes(uid) || s.approverUids.includes(uid)) return true;
  return !!control && (control.owner?.uid === uid || control.approver?.uid === uid);
}

export function canReadAllComments(actor, settings, { control = null, isAdmin = false } = {}) {
  return canSeeComment({ authorUid: '' }, actor, settings, { control, isAdmin });
}

/** Kan personen skrive merknader? Ledere alltid, ansatte når det er slått på. */
export function canComment(actor, settings, { isLeader = false } = {}) {
  if (!text(actor?.uid, 128)) return false;
  return isLeader || normalizeSettings(settings).employeesCanComment;
}

/* ───────── Lesebekreftelse ───────── */

export function normalizeAck(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const docKey = text(raw.docKey, 100);
  const revision = Math.round(Number(raw.revision) || 0);
  const uid = text(raw.uid, 128);
  const employeeId = text(raw.employeeId, 80);
  if (!docKey || revision < 1 || (!uid && !employeeId)) return null;
  return { docKey, revision, uid, employeeId, name: text(raw.name, 120), at: text(raw.at, 40) };
}

export function ackFor(docKey, revision, { uid = '', employeeId = '', name = '' } = {}, now = new Date()) {
  return normalizeAck({ docKey, revision, uid, employeeId, name, at: nowIso(now) });
}

export function ackId(ack) {
  const who = ack?.uid || `emp_${ack?.employeeId || ''}`;
  return `${ack?.docKey || ''}__${who}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200);
}

function employeeUid(employee) {
  return text(employee?.personUid || employee?.uid, 128);
}

export function employeeName(employee) {
  const person = employee?.person || {};
  return text([person.firstName, person.middleName, person.lastName].map((part) => text(part)).filter(Boolean).join(' ')
    || employee?.name || employee?.displayName, 120) || 'Uten navn';
}

/** Siste bekreftelse fra en person for et dokument. */
export function latestAck(acks, docKey, { uid = '', employeeId = '' } = {}) {
  return (Array.isArray(acks) ? acks : [])
    .map(normalizeAck)
    .filter((row) => row && row.docKey === docKey && ((uid && row.uid === uid) || (employeeId && row.employeeId === employeeId)))
    .sort((a, b) => b.revision - a.revision)[0] || null;
}

/** Status per ansatt for gjeldende versjon av et dokument. */
export function ackStatus(employees, acks, control) {
  const pub = publishedRevision(control);
  if (!pub) return [];
  return (Array.isArray(employees) ? employees : []).map((employee) => {
    const latest = latestAck(acks, control.id, { uid: employeeUid(employee), employeeId: employee.id });
    return {
      employeeId: employee.id,
      uid: employeeUid(employee),
      name: employeeName(employee),
      latest,
      current: !!latest && latest.revision >= pub.revision,
    };
  });
}

/* ───────── Oversikt ───────── */

/** Rader til dokumentoversikten (dokumentlisten). */
export function overviewRows(controls, { acks = [], comments = [], employees = [], filled = [], now = new Date() } = {}) {
  return (Array.isArray(controls) ? controls : []).filter((row) => row && !row.archived).map((control) => {
    const pub = publishedRevision(control);
    const work = workingRevision(control);
    let read = null;
    if (pub && (control.readRule === 'pakrevd' || control.readRule === 'info')) {
      const status = ackStatus(employees, acks, control);
      read = { done: status.filter((row) => row.current).length, total: status.length };
    }
    if (pub && control.readRule === 'signeres') {
      const signed = new Set((filled || [])
        .filter((doc) => doc.status === 'ferdig' && doc.templateId === control.refId && doc.subject?.kind === 'employee')
        .map((doc) => doc.subject.id));
      read = { done: (employees || []).filter((employee) => signed.has(employee.id)).length, total: (employees || []).length };
    }
    return {
      id: control.id,
      kind: control.kind,
      refId: control.refId,
      code: control.code,
      title: control.title,
      version: pub ? pub.revision : 0,
      working: work ? { revision: work.revision, state: work.state } : null,
      status: controlStatus(control, now),
      owner: control.owner?.name || '',
      approver: control.approver?.name || '',
      approvedAt: pub?.approvedAt || '',
      approvedBy: pub?.approvedBy || '',
      nextReview: control.nextReview,
      reviewDue: reviewDue(control, now),
      readRule: control.readRule,
      read,
      openComments: (comments || []).filter((row) => row.docKey === control.id && row.status === 'apen').length,
    };
  }).sort((a, b) => String(a.code || a.title).localeCompare(String(b.code || b.title), 'nb'));
}

/** Det som venter på personen: godkjenninger og forfalte gjennomganger. */
export function pendingFor(controls, actor, settings, { isAdmin = false, now = new Date() } = {}) {
  const list = (Array.isArray(controls) ? controls : []).filter((row) => row && !row.archived);
  return {
    approvals: list.filter((control) => workingRevision(control)?.state === 'til_gjennomgang' && canApprove(control, actor, settings, { isAdmin }).ok),
    reviews: list.filter((control) => reviewDue(control, now)),
  };
}

/** Dokumenter den ansatte skal lese eller signere, med status. */
export function documentsForEmployee(controls, { acks = [], filled = [], uid = '', employeeId = '' } = {}) {
  return (Array.isArray(controls) ? controls : [])
    .filter((control) => control && !control.archived && isPublished(control) && control.readRule !== 'ingen')
    .map((control) => {
      const pub = publishedRevision(control);
      if (control.readRule === 'signeres') {
        const mine = (filled || []).filter((doc) => doc.templateId === control.refId && doc.subject?.kind === 'employee' && doc.subject.id === employeeId);
        const done = mine.find((doc) => doc.status === 'ferdig') || null;
        return { control, revision: pub.revision, required: true, done: !!done, doc: done || mine[0] || null };
      }
      const ack = latestAck(acks, control.id, { uid, employeeId });
      return { control, revision: pub.revision, required: control.readRule === 'pakrevd', done: !!ack && ack.revision >= pub.revision, ack };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.required) - Number(a.required) || a.control.title.localeCompare(b.control.title, 'nb'));
}
