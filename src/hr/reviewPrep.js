/**
 * Medarbeidersamtalen fra invitasjon til signert kopi (families/{id}/hrReviewPrep/{dokument-id}).
 *
 *   1. Invitasjon: lederen sender temaene i samtaleskjemaet (tabellen «Tema») til den ansatte, med
 *      tidspunkt, sted og en ønsket svarfrist. Det er frivillig å forberede seg.
 *   2. Forberedelse: den ansatte skriver stikkord per tema på Min side, lagrer underveis og sender
 *      inn når hen vil. Svarene går inn i kolonnen «Før samtalen» når lederen henter dem.
 *   3. Samtalen: de går gjennom skjemaet sammen og fyller ut «Under samtalen» og handlingsplanen.
 *   4. Signering: lederen signerer og sender til den ansatte. Skjemaet låses; den ansatte leser det
 *      på Min side, kan legge til en merknad og signerer med sin egen innlogging.
 *   5. Kopi: serveren (functions/hrReview.js) ferdigstiller skjemaet og sender PDF til begge.
 *
 * Hver samtale har én oppføring med samme id som det utfylte skjemaet. Den ansatte skriver aldri
 * direkte i den; svar og signatur går gjennom serveren.
 */
import { formProgress, tableRows } from '../anbud/formBuilder.js';

export const PREP_COLLECTION = 'hrReviewPrep';
export const ANSWER_MAX = 1200;
export const COMMENT_MAX = 1500;
export const MESSAGE_MAX = 1500;
export const MAX_TOPICS = 20;
export const COMMENT_LABEL = 'Merknad fra medarbeider';
export const EMPLOYEE_SIGN_LABEL = 'Signatur medarbeider';

export const PREP_STATES = [
  { id: 'none', label: 'Ikke sendt', tone: 'muted' },
  { id: 'sent', label: 'Sendt til medarbeider', tone: 'info' },
  { id: 'submitted', label: 'Forberedelse mottatt', tone: 'good' },
  { id: 'signing', label: 'Venter på signatur fra medarbeider', tone: 'warn' },
  { id: 'signed', label: 'Signert av begge', tone: 'good' },
];

const STATUS_IDS = new Set(['sent', 'submitted', 'signing', 'signed']);

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

/** Tekst med linjeskift (svar, melding, merknad). */
function body(value, max) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim().slice(0, max);
}

function norm(value) {
  return text(value).toLocaleLowerCase('nb-NO');
}

function isoDate(value) {
  const v = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function clock(value) {
  const v = text(value, 5).replace('.', ':');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '';
}

function actorOf(raw) {
  return { uid: text(raw?.uid, 128), name: text(raw?.name, 120) };
}

function signatureOf(raw) {
  if (!raw || typeof raw !== 'object' || !text(raw.name)) return null;
  return { name: text(raw.name, 120), uid: text(raw.uid, 128), at: text(raw.at, 40) };
}

/* ───────── Temaene i skjemaet ───────── */

/** Tabellen med temaene: «Tema», ellers første tabell med en kolonne for «Før samtalen». */
export function topicTable(doc) {
  const tables = (doc?.fields || []).filter((f) => f.kind === 'table');
  return tables.find((f) => norm(f.label) === 'tema')
    || tables.find((f) => (f.columns || []).some((c) => norm(c.label).startsWith('før')))
    || null;
}

/** Kolonnene i tematabellen: tema (fast tekst), før og under samtalen. */
export function topicColumns(field) {
  const cols = field?.columns || [];
  const find = (test) => cols.find((c) => test(norm(c.label)))?.id || '';
  return {
    pos: find((l) => l === 'pos' || l === 'nr' || l === 'nr.'),
    topic: find((l) => l === 'tema' || l.startsWith('tema')),
    before: find((l) => l.startsWith('før')),
    during: find((l) => l.startsWith('under')),
  };
}

/** Første linje er temaet, punktene under er spørsmålene. */
export function splitTopic(value) {
  const lines = String(value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const [title = '', ...rest] = lines;
  return { title, prompts: rest.map((l) => l.replace(/^[•\-*]\s*/, '')).filter(Boolean) };
}

/** Temaene slik den ansatte ser dem: [{ id, no, title, prompts }]. */
export function reviewTopics(doc) {
  const field = topicTable(doc);
  if (!field) return [];
  const cols = topicColumns(field);
  return tableRows(field)
    .filter((row) => !row.group && !row.added)
    .map((row) => {
      const cells = { ...(row.preset || {}), ...(row.cells || {}) };
      const { title, prompts } = splitTopic(cells[cols.topic]);
      return { id: row.id, no: text(cells[cols.pos], 8), title: text(title, 200), prompts: prompts.slice(0, 12).map((p) => text(p, 300)) };
    })
    .filter((row) => row.title)
    .slice(0, MAX_TOPICS);
}

/* ───────── Oppføringen ───────── */

function normalizeTopics(list) {
  return (Array.isArray(list) ? list : []).map((row) => ({
    id: text(row?.id, 40),
    no: text(row?.no, 8),
    title: text(row?.title, 200),
    prompts: (Array.isArray(row?.prompts) ? row.prompts : []).map((p) => text(p, 300)).filter(Boolean).slice(0, 12),
  })).filter((row) => row.id && row.title).slice(0, MAX_TOPICS);
}

/** Bare svar på temaene som finnes, og ikke lengre enn en celle i skjemaet. */
export function cleanAnswers(answers, topics) {
  const ids = new Set((topics || []).map((t) => t.id));
  const out = {};
  for (const [key, value] of Object.entries(answers && typeof answers === 'object' ? answers : {})) {
    if (!ids.has(key)) continue;
    const v = body(value, ANSWER_MAX);
    if (v) out[key] = v;
  }
  return out;
}

export function normalizePrep(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const docId = text(raw.docId || raw.id, 60);
  if (!docId) return null;
  const topics = normalizeTopics(raw.topics);
  const status = STATUS_IDS.has(raw.status) ? raw.status : 'sent';
  const signing = raw.signing && typeof raw.signing === 'object' && raw.signing.doc
    ? {
      doc: raw.signing.doc,
      requestedAt: text(raw.signing.requestedAt, 40),
      requestedBy: actorOf(raw.signing.requestedBy),
    }
    : null;
  return {
    id: docId,
    docId,
    employeeId: text(raw.employeeId, 80),
    employeeUid: text(raw.employeeUid, 128),
    employeeName: text(raw.employeeName, 160),
    leaderUid: text(raw.leaderUid, 128),
    leaderName: text(raw.leaderName, 120),
    meetingDate: isoDate(raw.meetingDate),
    meetingTime: clock(raw.meetingTime),
    place: text(raw.place, 160),
    respondBy: isoDate(raw.respondBy),
    message: body(raw.message, MESSAGE_MAX),
    topics,
    answers: cleanAnswers(raw.answers, topics),
    status,
    sentAt: text(raw.sentAt, 40),
    updatedAt: text(raw.updatedAt, 40),
    submittedAt: text(raw.submittedAt, 40),
    signing: status === 'signing' || status === 'signed' ? signing : null,
    leaderSignature: signatureOf(raw.leaderSignature),
    employeeSignature: signatureOf(raw.employeeSignature),
    comment: body(raw.comment, COMMENT_MAX),
    mail: raw.mail && typeof raw.mail === 'object'
      ? {
        sentAt: text(raw.mail.sentAt, 40),
        to: (Array.isArray(raw.mail.to) ? raw.mail.to : []).map((r) => text(r, 200)).filter(Boolean).slice(0, 6),
        failed: (Array.isArray(raw.mail.failed) ? raw.mail.failed : []).map((r) => text(r, 200)).filter(Boolean).slice(0, 6),
      }
      : null,
  };
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Ønsket svarfrist: to dager før samtalen, men ikke før i dag. */
export function defaultRespondBy(meetingDate, today = '') {
  const meeting = isoDate(meetingDate);
  if (!meeting) return '';
  const wanted = addDays(meeting, -2);
  const now = isoDate(today);
  if (now && wanted < now) return now <= meeting ? now : meeting;
  return wanted;
}

/**
 * Ny invitasjon (eller ny utsending av en som ikke er besvart). Svar den ansatte allerede har
 * skrevet, beholdes når temaene er de samme.
 */
export function invitationPrep(doc, {
  employee = null, leader = null, meetingDate = '', meetingTime = '', place = '', respondBy = '', message = '',
  previous = null, now = new Date(),
} = {}) {
  const topics = reviewTopics(doc);
  const before = normalizePrep(previous);
  const at = now.toISOString();
  return normalizePrep({
    docId: doc?.id,
    employeeId: employee?.id || doc?.subject?.id,
    employeeUid: employee?.personUid,
    employeeName: employee?.name || doc?.subject?.name,
    leaderUid: leader?.uid,
    leaderName: leader?.name,
    meetingDate,
    meetingTime,
    place,
    respondBy: respondBy || defaultRespondBy(meetingDate, at.slice(0, 10)),
    message,
    topics,
    answers: before ? cleanAnswers(before.answers, topics) : {},
    status: before?.status === 'submitted' ? 'submitted' : 'sent',
    sentAt: at,
    updatedAt: at,
    submittedAt: before?.submittedAt || '',
  });
}

export function prepState(prep) {
  const id = prep?.status || 'none';
  return PREP_STATES.find((s) => s.id === id) || PREP_STATES[0];
}

export function answerCount(prep) {
  return Object.values(prep?.answers || {}).filter((v) => text(v)).length;
}

/** Den ansatte kan skrive og sende inn til lederen sender skjemaet til signering. */
export function canAnswer(prep) {
  return prep?.status === 'sent' || prep?.status === 'submitted';
}

/** Lagre utkast eller sende inn (serveren). Svar: neste oppføring. */
export function withAnswers(prep, answers, { submit = false, now = new Date() } = {}) {
  if (!canAnswer(prep)) return null;
  const at = now.toISOString();
  return {
    ...prep,
    answers: cleanAnswers(answers, prep.topics),
    status: submit || prep.status === 'submitted' ? 'submitted' : 'sent',
    submittedAt: submit ? at : prep.submittedAt,
    updatedAt: at,
  };
}

/**
 * Sett den ansattes forberedelse inn i kolonnen «Før samtalen». Celler som allerede har tekst,
 * endres ikke, med mindre overwrite er satt. Svar: { doc, filled, kept }.
 */
export function applyPrepAnswers(doc, prep, { overwrite = false } = {}) {
  const field = topicTable(doc);
  const cols = topicColumns(field);
  if (!field || !cols.before || doc?.status === 'ferdig') return { doc, filled: 0, kept: 0 };
  const value = field.value && typeof field.value === 'object' ? field.value : { cells: {}, added: [] };
  const cells = { ...(value.cells || {}) };
  let filled = 0;
  let kept = 0;
  for (const [rowId, answer] of Object.entries(prep?.answers || {})) {
    if (!(field.rows || []).some((r) => r.id === rowId && !r.group)) continue;
    const current = text(cells[rowId]?.[cols.before]);
    if (current === text(answer)) continue;
    if (current && !overwrite) {
      kept += 1;
      continue;
    }
    cells[rowId] = { ...(cells[rowId] || {}), [cols.before]: body(answer, ANSWER_MAX) };
    filled += 1;
  }
  if (!filled) return { doc, filled, kept };
  return {
    doc: {
      ...doc,
      fields: doc.fields.map((f) => (f.id === field.id ? { ...f, value: { ...value, cells } } : f)),
    },
    filled,
    kept,
  };
}

/* ───────── Signering ───────── */

const EMPLOYEE_SIGN = /medarbeider|arbeidstaker|ansatt/i;

export function employeeSignField(doc) {
  return (doc?.fields || []).find((f) => f.kind === 'sign' && EMPLOYEE_SIGN.test(f.label || '')) || null;
}

/**
 * Bare den ansatte signerer sitt eget felt (på Min side). I lederens skjema er feltet låst, også i
 * eldre samtaler og bedriftens egne varianter av malen.
 */
export function lockEmployeeSign(doc) {
  const field = employeeSignField(doc);
  if (!field || field.editor === 'fast') return doc;
  return { ...doc, fields: doc.fields.map((f) => (f.id === field.id ? { ...f, editor: 'fast' } : f)) };
}

/** Lederens signatur: første signaturfelt som ikke er den ansattes. */
export function leaderSignField(doc) {
  return (doc?.fields || []).find((f) => f.kind === 'sign' && !EMPLOYEE_SIGN.test(f.label || '')) || null;
}

/**
 * Lederen signerer (om hen ikke har gjort det) og skjemaet gjøres klart til den ansatte.
 * Alle obligatoriske felt må være fylt ut. Svar: { ok, doc, error }.
 */
export function signAsLeader(doc, { actor = null, now = new Date() } = {}) {
  if (!doc || doc.status === 'ferdig') return { ok: false, error: 'Skjemaet er allerede ferdig.' };
  const employeeField = employeeSignField(doc);
  const leaderField = leaderSignField(doc);
  const rest = (doc.fields || []).filter((f) => f.id !== employeeField?.id && f.id !== leaderField?.id);
  const progress = formProgress(rest);
  if (!progress.ready) {
    const names = rest.filter((f) => progress.missing.includes(f.id)).map((f) => f.label);
    return { ok: false, error: `Fyll ut ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` og ${names.length - 3} til` : ''} først.` };
  }
  if (!leaderField) return { ok: true, doc };
  if (leaderField.value?.name) return { ok: true, doc };
  const name = text(actor?.name, 120);
  if (!name) return { ok: false, error: 'Navnet ditt mangler på profilen. Signer feltet for bedriften selv først.' };
  const signature = { name, uid: text(actor?.uid, 128), at: now.toISOString(), place: '' };
  return {
    ok: true,
    doc: { ...doc, fields: doc.fields.map((f) => (f.id === leaderField.id ? { ...f, value: signature } : f)) },
  };
}

/** Oppføringen når skjemaet sendes til signering. doc er skjemaet slik den ansatte skal signere det. */
export function signingPrep(prep, doc, { actor = null, now = new Date() } = {}) {
  const leader = signatureOf(leaderSignField(doc)?.value);
  const at = now.toISOString();
  return {
    ...prep,
    status: 'signing',
    signing: { doc, requestedAt: at, requestedBy: actorOf(actor) },
    leaderSignature: leader,
    employeeSignature: null,
    comment: '',
    updatedAt: at,
  };
}

/** Trekk tilbake før den ansatte har signert: skjemaet kan endres igjen. */
export function withdrawSigning(prep, { now = new Date() } = {}) {
  if (prep?.status !== 'signing') return prep;
  return {
    ...prep,
    status: prep.submittedAt ? 'submitted' : 'sent',
    signing: null,
    leaderSignature: null,
    updatedAt: now.toISOString(),
  };
}

/**
 * Skjemaet etter at den ansatte har signert: signaturen og merknaden står i skjemaet, og det er
 * ferdig. Mangler malen feltene, legges de til nederst (merknaden før signaturene).
 */
export function signedDoc(doc, { signature, comment = '', now = new Date() } = {}) {
  const at = now.toISOString();
  const sig = { name: text(signature?.name, 120), uid: text(signature?.uid, 128), at: text(signature?.at, 40) || at, place: '' };
  let fields = [...(doc?.fields || [])];
  const note = body(comment, COMMENT_MAX);
  const commentField = fields.find((f) => f.kind === 'long' && norm(f.label) === norm(COMMENT_LABEL));
  if (commentField) {
    fields = fields.map((f) => (f.id === commentField.id ? { ...f, value: note } : f));
  } else if (note) {
    const firstSign = fields.findIndex((f) => f.kind === 'sign');
    const added = {
      id: 'merknad_medarbeider', kind: 'long', label: COMMENT_LABEL, required: false, help: '', placeholder: '',
      width: 'full', editor: 'avsender', options: [], value: note,
    };
    fields.splice(firstSign >= 0 ? firstSign : fields.length, 0, added);
  }
  const employeeField = fields.find((f) => f.kind === 'sign' && EMPLOYEE_SIGN.test(f.label || ''));
  if (employeeField) {
    fields = fields.map((f) => (f.id === employeeField.id ? { ...f, value: sig } : f));
  } else {
    fields.push({
      id: 'signatur_medarbeider', kind: 'sign', label: EMPLOYEE_SIGN_LABEL, required: false, help: '', placeholder: '',
      width: 'full', editor: 'avsender', options: [], value: sig,
    });
  }
  return {
    ...doc,
    fields,
    status: 'ferdig',
    completedAt: at,
    completedBy: { uid: sig.uid, name: sig.name },
    updatedAt: at,
    updatedBy: { uid: sig.uid, name: sig.name },
  };
}

/**
 * Det den ansatte leser før hen signerer: temaene med notatene, handlingsplanen og signaturene.
 * { facts: [{ label, value }], topics: [{ id, no, title, before, during }], plan: [{ tiltak, ansvar, frist }] }
 */
export function reviewSummary(doc) {
  const field = topicTable(doc);
  const cols = topicColumns(field);
  const topics = field
    ? tableRows(field).filter((row) => !row.group).map((row) => {
      const cells = { ...(row.preset || {}), ...(row.cells || {}) };
      return {
        id: row.id,
        no: text(cells[cols.pos], 8),
        title: splitTopic(cells[cols.topic]).title,
        before: body(cells[cols.before], ANSWER_MAX),
        during: body(cells[cols.during], ANSWER_MAX),
      };
    }).filter((row) => row.title || row.before || row.during)
    : [];
  const plan = (doc?.fields || []).filter((f) => f.kind === 'table' && norm(f.label) === 'handlingsplan').flatMap((f) => {
    const col = (name) => (f.columns || []).find((c) => norm(c.label) === name)?.id || '';
    return tableRows(f).filter((row) => !row.group).map((row) => {
      const cells = { ...(row.preset || {}), ...(row.cells || {}) };
      return { tiltak: text(cells[col('tiltak')], ANSWER_MAX), ansvar: text(cells[col('ansvar')], 120), frist: isoDate(cells[col('frist')]) };
    }).filter((row) => row.tiltak);
  });
  const facts = (doc?.fields || [])
    .filter((f) => ['text', 'date'].includes(f.kind) && text(f.value))
    .map((f) => ({ label: text(f.label, 120), value: f.kind === 'date' ? nbDate(f.value) || text(f.value) : text(f.value) }));
  return { facts, topics, plan };
}

/* ───────── Visning og e-post ───────── */

function nbDate(iso) {
  const v = isoDate(iso);
  return v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : '';
}

/** «12.03.2026 kl. 10.00 · Møterom 2» */
export function meetingLine(prep) {
  return [
    nbDate(prep?.meetingDate),
    prep?.meetingTime ? `kl. ${prep.meetingTime.replace(':', '.')}` : '',
  ].filter(Boolean).join(' ') + (prep?.place ? ` · ${prep.place}` : '');
}

/** Tidsstempel for signaturer i norsk tid: «12.03.2026 kl. 10.42». */
export function stampLine(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.day}.${parts.month}.${parts.year} kl. ${parts.hour}.${parts.minute}`;
}

/** Varselet til den ansatte når temaene sendes. */
export function invitationNotice(prep) {
  const when = meetingLine(prep);
  return {
    title: 'Forbered medarbeidersamtalen',
    body: [
      `${prep?.leaderName || 'Lederen din'} har sendt temaene for medarbeidersamtalen${when ? ` ${when}` : ''}.`,
      'Skriv gjerne stikkord på Min side før samtalen. Det er frivillig.',
      prep?.respondBy ? `Fint om du sender inn innen ${nbDate(prep.respondBy)}.` : '',
    ].filter(Boolean).join(' '),
  };
}

export function signingNotice(prep) {
  return {
    title: 'Signer medarbeidersamtalen',
    body: `${prep?.leaderName || 'Lederen din'} har signert medarbeidersamtalen. Les gjennom og signer på Min side. Du får en kopi på e-post når begge har signert.`,
  };
}

/** Filnavn for den signerte kopien. */
export function copyFileName(prep) {
  const who = text(prep?.employeeName || 'medarbeider').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `Medarbeidersamtale-${who || 'medarbeider'}-${prep?.meetingDate || 'signert'}.pdf`;
}

/** E-posten med den signerte kopien (samme tekst til begge). */
export function copyMail(prep, { companyName = '' } = {}) {
  const date = nbDate(prep?.meetingDate) || nbDate(prep?.employeeSignature?.at?.slice(0, 10));
  const lines = [
    'Hei,',
    '',
    `Vedlagt er den signerte medarbeidersamtalen mellom ${prep?.leaderName || 'leder'} og ${prep?.employeeName || 'medarbeider'}${date ? ` ${date}` : ''}${companyName ? ` i ${companyName}` : ''}.`,
    '',
    'Begge har signert digitalt:',
    prep?.leaderSignature ? `• ${prep.leaderSignature.name}, ${stampLine(prep.leaderSignature.at)}` : '',
    prep?.employeeSignature ? `• ${prep.employeeSignature.name}, ${stampLine(prep.employeeSignature.at)}` : '',
    prep?.comment ? '' : null,
    prep?.comment ? `Merknad fra medarbeider: ${prep.comment}` : null,
    '',
    'Samtalen er fortrolig. Den er lagret i ProTop under HR › Oppfølging, og den ansatte finner den på Min side.',
  ].filter((line) => line !== null && line !== undefined);
  const textBody = lines.filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  return {
    subject: `Medarbeidersamtale${date ? ` ${date}` : ''} – signert kopi`,
    text: textBody,
  };
}
