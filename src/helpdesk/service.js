/**
 * ProTop Helpdesk — serveren bak hjelpesenteret og helpdesk-portalen.
 *
 * Én callable (`helpdesk`) med `action`. All lesing og skriving går gjennom
 * Admin SDK her, så Firestore-reglene trenger ingen åpning for klienten.
 *
 * Data:
 *   helpdeskTickets/{id}                 saken (kunde, status, triage, AI, fiks-forslag)
 *   helpdeskTickets/{id}/messages/{mid}  samtalen (role requester|agent|system, internal = internt notat)
 *   helpdeskAttachments/{id}             bilder (base64, maks 900 KB hver)
 *   helpdeskTeam/{uid}                   saksbehandlere (owner|agent)
 *   helpdeskInvites/{email}              ventende invitasjoner til teamet
 *   helpdeskMeta/counter                 løpenummer for PT-saksnummer
 *   helpdeskMeta/deflection              assistenten løste / sendte videre
 *   helpdeskArticleStats/{articleId}     visninger og «var dette nyttig?»
 *
 * AI (Gemini) triagerer, oppsummerer, foreslår svar og lager fiks-forslag.
 * Ingenting deployes automatisk: forslagene venter på godkjenning i portalen.
 */

import { CRASH_COLLECTION, groupCrashReports } from './crashReport.js';
import {
  AGENT_ROLES,
  CATEGORIES,
  LIMITS,
  MODULES,
  PRIORITIES,
  STATUSES,
  canRequesterReopen,
  computeStats,
  formatTicketNumber,
  initialPriority,
  isOpenStatus,
  isOwnerEmail,
  isValidEmail,
  normalizeReply,
  normalizeTicketInput,
  publicMessages,
  publicTicketView,
  shouldAutoClose,
  statusLabel,
  transition,
  viewCounts,
  FIX_STATES,
  HELPDESK_OWNER_EMAILS,
} from './model.js';
import {
  diagnosticsDigest,
  diagnosticsSummary,
  redactSecrets,
  ruleTriage,
  sanitizeDiagnostics,
} from './triage.js';
import {
  agentReplyMail,
  teamAlertMail,
  teamInviteMail,
  ticketCreatedMail,
  ticketSolvedMail,
} from './mailTemplates.js';
import { getArticle, knowledgeSnippets, suggestForTicket } from './articles.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const COL = {
  tickets: 'helpdeskTickets',
  attachments: 'helpdeskAttachments',
  team: 'helpdeskTeam',
  invites: 'helpdeskInvites',
  meta: 'helpdeskMeta',
  articles: 'helpdeskArticleStats',
};

export class HelpdeskError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new HelpdeskError(code, message); };

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function safeId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) fail('invalid-argument', 'Ugyldig sak.');
  return id;
}

/* ─────────── Identitet ─────────── */

function identity(auth) {
  if (!auth?.uid) fail('unauthenticated', 'Du må være innlogget.');
  const token = auth.token || {};
  return {
    uid: auth.uid,
    email: emailKey(token.email),
    verified: token.email_verified === true,
    name: cleanText(token.name || '', 120),
    provider: cleanText(token.firebase?.sign_in_provider || '', 40),
  };
}

/**
 * Er brukeren i helpdesk-teamet? Faste eiere (HELPDESK_OWNER_EMAILS) og
 * inviterte får plassen første gang de logger inn med bekreftet e-post.
 */
async function resolveAgent(db, who, now) {
  const ref = db.collection(COL.team).doc(who.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const row = snap.data() || {};
    if (row.active === false) return null;
    return { uid: who.uid, ...row };
  }
  if (!who.email || !who.verified) return null;
  if (isOwnerEmail(who.email)) {
    const row = {
      uid: who.uid, email: who.email, name: who.name || who.email, role: 'owner',
      active: true, notify: true, addedAtMs: now, addedBy: 'system',
    };
    await ref.set(row);
    return row;
  }
  const inviteRef = db.collection(COL.invites).doc(emailKey(who.email));
  const invite = await inviteRef.get();
  if (invite.exists && invite.data()?.status !== 'revoked') {
    const inv = invite.data() || {};
    const row = {
      uid: who.uid, email: who.email, name: who.name || who.email,
      role: AGENT_ROLES[inv.role] ? inv.role : 'agent',
      active: true, notify: true, addedAtMs: now, addedBy: inv.invitedBy || '',
    };
    await ref.set(row);
    await inviteRef.set({ ...inv, status: 'accepted', acceptedAtMs: now, acceptedUid: who.uid });
    return row;
  }
  return null;
}

async function requireAgent(ctx) {
  const agent = await resolveAgent(ctx.db, ctx.who, ctx.now());
  if (!agent) {
    if (ctx.who.email && !ctx.who.verified && (isOwnerEmail(ctx.who.email))) {
      fail('permission-denied', 'Bekreft e-postadressen din først, så åpnes helpdesken.');
    }
    fail('permission-denied', 'Du har ikke tilgang til ProTop Helpdesk.');
  }
  return agent;
}

async function requireOwner(ctx) {
  const agent = await requireAgent(ctx);
  if (agent.role !== 'owner') fail('permission-denied', 'Bare eiere kan endre teamet.');
  return agent;
}

async function teamRecipients(db) {
  const snap = await db.collection(COL.team).get();
  const out = new Set();
  for (const doc of snap.docs) {
    const row = doc.data() || {};
    if (row.active === false || row.notify === false) continue;
    if (isValidEmail(row.email)) out.add(row.email);
  }
  if (!out.size) {
    for (const e of HELPDESK_OWNER_EMAILS) out.add(e);
  }
  return [...out];
}

/* ─────────── Hjelpere ─────────── */

async function nextNumber(db) {
  const ref = db.collection(COL.meta).doc('counter');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const seq = (snap.exists ? Number(snap.data()?.seq) || 0 : 0) + 1;
    tx.set(ref, { seq }, { merge: true });
    return formatTicketNumber(seq);
  });
}

async function bump(db, col, id, field, by = 1) {
  const ref = db.collection(col).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? Number(snap.data()?.[field]) || 0 : 0;
    tx.set(ref, { [field]: cur + by }, { merge: true });
  });
}

function decodedSize(base64) {
  const s = String(base64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

function normalizeAttachments(raw, already = 0) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length + already > LIMITS.attachments) {
    fail('invalid-argument', `Du kan legge ved maks ${LIMITS.attachments} bilder per sak.`);
  }
  return list.map((row, i) => {
    let data = String(row?.data || '');
    const m = data.match(/^data:([^;]+);base64,(.*)$/);
    let type = cleanText(row?.type, 40).toLowerCase();
    if (m) { type = type || m[1]; data = m[2]; }
    data = data.replace(/\s/g, '');
    if (!IMAGE_TYPES.includes(type)) fail('invalid-argument', 'Bare bilder (JPG, PNG, WebP eller GIF) kan legges ved.');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) fail('invalid-argument', 'Bildet kunne ikke leses.');
    const size = decodedSize(data);
    if (size > LIMITS.attachmentBytes) fail('invalid-argument', 'Bildet er for stort. Prøv et mindre skjermbilde.');
    const name = cleanText(row?.name, 120).replace(/[^\w.\- æøåÆØÅ()]/g, '') || `bilde-${i + 1}.jpg`;
    return { name, type, size, data };
  });
}

async function storeAttachments(db, ticketId, uid, files, now) {
  const metas = [];
  for (const file of files) {
    const ref = db.collection(COL.attachments).doc();
    await ref.set({
      ticketId, uid, name: file.name, type: file.type, size: file.size, data: file.data, createdAtMs: now,
    });
    metas.push({ id: ref.id, name: file.name, type: file.type, size: file.size });
  }
  return metas;
}

async function loadTicket(db, id) {
  const snap = await db.collection(COL.tickets).doc(id).get();
  if (!snap.exists) fail('not-found', 'Fant ikke saken.');
  return { id: snap.id, ...snap.data() };
}

async function loadMessages(db, id) {
  const snap = await db.collection(COL.tickets).doc(id).collection('messages').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

async function addMessage(db, ticketId, msg) {
  const ref = db.collection(COL.tickets).doc(ticketId).collection('messages').doc();
  const row = { attachments: [], internal: false, ...msg };
  await ref.set(row);
  return { id: ref.id, ...row };
}

async function sendSafe(ctx, to, mail) {
  if (!to || !isValidEmail(to)) return { ok: false, error: 'mangler e-post' };
  try {
    await ctx.sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html, fromName: 'ProTop Support', replyTo: 'support@protop.no' });
    return { ok: true };
  } catch (error) {
    ctx.log('helpdesk mail failed', { message: error?.message });
    return { ok: false, error: String(error?.message || error).slice(0, 200) };
  }
}

function requesterEmail(ticket) {
  return ticket.requester?.contactEmail || ticket.requester?.email || '';
}

function listRow(t) {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    preview: cleanText(t.lastMessagePreview || t.body, 160),
    status: t.status,
    priority: t.priority,
    category: t.category,
    module: t.module,
    tags: t.tags || [],
    requester: { name: t.requester?.name || '', email: t.requester?.email || '', companyName: t.requester?.companyName || '' },
    assigneeUid: t.assigneeUid || '',
    assigneeName: t.assigneeName || '',
    createdAtMs: t.createdAtMs,
    updatedAtMs: t.updatedAtMs,
    firstResponseAtMs: t.firstResponseAtMs || null,
    solvedAtMs: t.solvedAtMs || null,
    archived: !!t.archived,
    unreadForAgent: !!t.unreadForAgent,
    hasAttachments: (t.attachments || []).length > 0,
    errorCount: t.diagnosticsSummary?.errors || 0,
    sentiment: t.ai?.sentiment || t.triage?.sentiment || 'neutral',
    aiSummary: t.ai?.summary || '',
    fixState: t.fix?.state || '',
  };
}

/* ─────────── AI ─────────── */

const AI_SYSTEM = `Du er senior supportspesialist og utvikler for ProTop (norsk forretningsplattform: timer, fravær, HR, faktura, PowerOffice, anbud, ISO/K-HMS, kunder, prosjekt; React Native/Expo web + Firebase/Cloud Functions i europe-west1).
Du triagerer en supportsak fra en bruker som ofte ikke er teknisk. Les tekst, teknisk info (konsollfeil, feilede nettverkskall, side, nettleser) og ev. skjermbilde.
Svar KUN med JSON:
{
 "summary": "én setning på norsk om hva brukeren egentlig sliter med",
 "category": "bug|question|account|access|billing|data|feature|other",
 "module": "en av: ${Object.keys(MODULES).join('|')}",
 "priority": "low|normal|high|urgent",
 "sentiment": "positive|neutral|negative",
 "tags": ["korte", "stikkord"],
 "isBug": true/false,
 "rootCause": "sannsynlig teknisk årsak, eller tom",
 "suggestedReply": "ferdig svar til brukeren på norsk, vennlig, konkret, uten tekniske ord. Start med 'Hei {navn},'. Avslutt med 'Hilsen ProTop support'",
 "articleIds": ["id-er fra kunnskapsbasen som hjelper"],
 "fix": null eller {"title": "...", "likelyCause": "...", "steps": ["konkrete steg for utvikler"], "filesToInspect": ["sannsynlige filstier i repoet, f.eks. screens/economy/..., functions/..."], "risk": "low|medium|high", "testPlan": ["hvordan verifisere"]}
}
Regler: fix kun når isBug er true. Ikke finn på funksjoner som ikke finnes. Ikke lov tidsfrister.`;

async function runAiTriage(ctx, ticket, { messages = [], image = null } = {}) {
  if (!ctx.ai) return null;
  const knowledge = knowledgeSnippets(`${ticket.subject} ${ticket.body}`, { limit: 5 });
  const convo = messages
    .filter((m) => m.role !== 'system')
    .slice(-8)
    .map((m) => `${m.role === 'agent' ? 'Support' : 'Bruker'}${m.internal ? ' (internt)' : ''}: ${cleanText(m.body, 800)}`)
    .join('\n');
  const prompt = [
    `Sak ${ticket.number}: ${ticket.subject}`,
    `Brukerens kategori: ${ticket.category}. Område: ${ticket.module}. Brukeren sier: ${ticket.impact || 'ukjent'}.`,
    `Beskrivelse:\n${cleanText(ticket.body, 3000)}`,
    ticket.transcript ? `Samtale med assistenten før saken:\n${cleanText(ticket.transcript, 1500)}` : '',
    convo ? `Samtalen i saken:\n${convo}` : '',
    `Teknisk info:\n${diagnosticsDigest(ticket.diagnostics)}`,
    `Kunnskapsbase:\n${knowledge.map((k) => `[${k.id}] ${k.title}\n${k.text}`).join('\n\n')}`,
  ].filter(Boolean).join('\n\n');
  const parts = [{ text: prompt }];
  if (image?.data) parts.push({ inlineData: { mimeType: image.type, data: image.data } });
  try {
    const out = await ctx.ai(AI_SYSTEM, parts);
    return normalizeAi(out, knowledge);
  } catch (error) {
    ctx.log('helpdesk ai failed', { message: error?.message });
    return null;
  }
}

function normalizeAi(raw, knowledge = []) {
  if (!raw || typeof raw !== 'object') return null;
  const known = new Set(knowledge.map((k) => k.id));
  const fix = raw.isBug && raw.fix && typeof raw.fix === 'object' ? {
    title: cleanText(raw.fix.title, 160),
    likelyCause: cleanText(raw.fix.likelyCause, 800),
    steps: (Array.isArray(raw.fix.steps) ? raw.fix.steps : []).map((s) => cleanText(s, 400)).filter(Boolean).slice(0, 10),
    filesToInspect: (Array.isArray(raw.fix.filesToInspect) ? raw.fix.filesToInspect : []).map((s) => cleanText(s, 200)).filter(Boolean).slice(0, 10),
    risk: ['low', 'medium', 'high'].includes(raw.fix.risk) ? raw.fix.risk : 'medium',
    testPlan: (Array.isArray(raw.fix.testPlan) ? raw.fix.testPlan : []).map((s) => cleanText(s, 300)).filter(Boolean).slice(0, 8),
  } : null;
  return {
    summary: cleanText(raw.summary, 300),
    category: CATEGORIES[raw.category] ? raw.category : null,
    module: MODULES[raw.module] ? raw.module : null,
    priority: PRIORITIES[raw.priority] ? raw.priority : null,
    sentiment: ['positive', 'neutral', 'negative'].includes(raw.sentiment) ? raw.sentiment : 'neutral',
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean).slice(0, 6),
    isBug: raw.isBug === true,
    rootCause: cleanText(raw.rootCause, 600),
    suggestedReply: cleanText(raw.suggestedReply, 4000),
    articleIds: (Array.isArray(raw.articleIds) ? raw.articleIds : []).map((a) => cleanText(a, 80)).filter((a) => known.has(a) || getArticle(a)).slice(0, 4),
    fix,
  };
}

/** Lokal reserve når AI ikke er tilgjengelig: triage + artikler, ingen svarutkast. */
function fallbackAi(ticket) {
  const arts = suggestForTicket({ subject: ticket.subject, body: ticket.body, limit: 3 });
  return {
    summary: '',
    category: null,
    module: null,
    priority: null,
    sentiment: ticket.triage?.sentiment || 'neutral',
    tags: [],
    isBug: ticket.category === 'bug',
    rootCause: '',
    suggestedReply: '',
    articleIds: arts.map((a) => a.id),
    fix: null,
    engine: 'regler',
  };
}

function applyAi(ticket, ai, now) {
  const patch = { ai: { ...ai, engine: ai.engine || 'gemini', atMs: now } };
  const tags = new Set([...(ticket.tags || []), ...(ai.tags || [])]);
  patch.tags = [...tags].slice(0, LIMITS.tags);
  // AI løfter prioritet, men senker den aldri under det brukeren valgte.
  if (ai.priority && PRIORITIES[ai.priority].rank > (PRIORITIES[ticket.priority] || PRIORITIES.normal).rank) {
    patch.priority = ai.priority;
  }
  if (ai.module && (!ticket.module || ticket.module === 'general')) patch.module = ai.module;
  if (ai.fix && (!ticket.fix || ticket.fix.state === 'proposed')) {
    patch.fix = { ...ai.fix, state: 'proposed', proposedAtMs: now, history: ticket.fix?.history || [] };
  }
  return patch;
}

/** Ferdig oppdrag til Claude Code / utvikler, med alt som trengs for å reprodusere. */
export function developerBrief(ticket, messages = []) {
  const fix = ticket.fix || {};
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `- ${m.role === 'agent' ? 'Support' : 'Bruker'}${m.internal ? ' (internt notat)' : ''}: ${cleanText(m.body, 600).replace(/\n/g, ' ')}`)
    .join('\n');
  return [
    `# ${ticket.number}: ${ticket.subject}`,
    '',
    `Kategori: ${ticket.category} · Område: ${ticket.module} · Prioritet: ${ticket.priority} · Status: ${ticket.status}`,
    ticket.ai?.summary ? `AI-sammendrag: ${ticket.ai.summary}` : '',
    '',
    '## Brukerens beskrivelse',
    cleanText(ticket.body, 3000),
    '',
    '## Teknisk info',
    '```',
    diagnosticsDigest(ticket.diagnostics, { maxConsole: 15, maxNetwork: 12 }),
    '```',
    convo ? `\n## Samtale\n${convo}` : '',
    fix.title ? `\n## Forslag til fiks: ${fix.title}` : '',
    fix.likelyCause ? `Sannsynlig årsak: ${fix.likelyCause}` : '',
    fix.steps?.length ? `Steg:\n${fix.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    fix.filesToInspect?.length ? `Filer å se på: ${fix.filesToInspect.join(', ')}` : '',
    fix.testPlan?.length ? `Test:\n${fix.testPlan.map((s) => `- ${s}`).join('\n')}` : '',
    '',
    '## Oppdrag',
    'Reproduser feilen, finn årsaken i koden, lag en rettelse med test, og åpne en PR mot main. Ikke merge før saken er gjennomgått i helpdesken.',
  ].filter((l) => l !== '').join('\n');
}

/* ─────────── Handlinger: kunde ─────────── */

async function createTicket(ctx, data) {
  const { db, who } = ctx;
  const now = ctx.now();
  const input = normalizeTicketInput(data);
  const files = normalizeAttachments(data.attachments);
  await ctx.rateLimit(`create:${who.uid}`, 8, 60 * 60 * 1000);
  const diagnostics = input.shareDiagnostics ? sanitizeDiagnostics(data.diagnostics) : null;
  const triage = ruleTriage({ subject: input.subject, body: input.body, diagnostics, category: input.category });
  const priority = initialPriority({ impact: input.impact, category: input.category, triagePriority: triage.priority });
  const company = await ctx.companyContext(data.companyId, who.uid);
  const number = await nextNumber(db);
  const ref = db.collection(COL.tickets).doc();
  const requester = {
    uid: who.uid,
    email: who.email,
    emailVerified: who.verified,
    contactEmail: input.contactEmail && input.contactEmail !== who.email ? input.contactEmail : '',
    name: cleanText(data.name || who.name || '', 120) || who.email || 'Ukjent',
    phone: input.phone,
    provider: who.provider,
    companyId: company?.id || '',
    companyName: company?.name || '',
    role: cleanText(data.role, 40),
    workspace: diagnostics?.page?.workspace || cleanText(data.workspace, 20),
    lang: input.lang,
  };
  const attachments = await storeAttachments(db, ref.id, who.uid, files, now);
  const ticket = {
    number,
    subject: input.subject,
    body: input.body,
    transcript: input.transcript,
    status: 'new',
    priority,
    impact: input.impact,
    category: input.category === 'other' ? triage.category : input.category,
    userCategory: input.category,
    module: input.module === 'general' ? triage.module : input.module,
    tags: triage.tags,
    channel: input.transcript ? 'assistent' : 'skjema',
    requester,
    requesterUid: who.uid,
    assigneeUid: '',
    assigneeName: '',
    diagnostics,
    diagnosticsSummary: diagnosticsSummary(diagnostics),
    triage,
    viewedArticleIds: input.viewedArticleIds,
    attachments,
    createdAtMs: now,
    updatedAtMs: now,
    lastPublicAtMs: now,
    lastMessagePreview: input.body.slice(0, 160),
    firstResponseAtMs: null,
    solvedAtMs: null,
    closedAtMs: null,
    archived: false,
    unreadForAgent: true,
    unreadForRequester: false,
    messageCount: 1,
    fix: null,
    ai: null,
    csat: null,
    emails: [],
  };
  await ref.set(ticket);
  await addMessage(db, ref.id, {
    role: 'requester', authorUid: who.uid, authorName: requester.name, body: input.body, attachments, createdAtMs: now,
  });
  const saved = { id: ref.id, ...ticket };

  // AI-triage. Feiler den, brukes regler og artikkelsøk.
  const ai = (await runAiTriage(ctx, saved, { image: files[0] })) || fallbackAi(saved);
  const aiPatch = applyAi(saved, ai, ctx.now());
  await ref.update(aiPatch);
  Object.assign(saved, aiPatch);

  const articles = (ai.articleIds?.length ? ai.articleIds : suggestForTicket({ subject: saved.subject, body: saved.body }).map((a) => a.id))
    .map((id) => getArticle(id))
    .filter(Boolean)
    .slice(0, 3);
  const receipt = await sendSafe(ctx, requesterEmail(saved), ticketCreatedMail(saved, { articles }));
  const team = await teamRecipients(db);
  const digest = diagnosticsDigest(saved.diagnostics);
  const alerts = [];
  for (const to of team) alerts.push(await sendSafe(ctx, to, teamAlertMail(saved, { kind: 'new', digest })));
  await ref.update({
    emails: [{ kind: 'receipt', to: requesterEmail(saved), ok: receipt.ok, atMs: ctx.now() }],
  });
  await addMessage(db, ref.id, {
    role: 'system',
    internal: true,
    body: `Kvittering ${receipt.ok ? 'sendt' : 'IKKE sendt'} til ${requesterEmail(saved) || 'ukjent e-post'}${receipt.ok ? '' : ` (${receipt.error})`}. Teamet varslet: ${alerts.filter((a) => a.ok).length}/${team.length}.`,
    createdAtMs: ctx.now(),
  });
  return {
    id: ref.id,
    number,
    status: 'new',
    receiptSent: receipt.ok,
    email: requesterEmail(saved),
    articles: articles.map((a) => ({ id: a.id, title: a.title })),
  };
}

async function myTickets(ctx) {
  const snap = await ctx.db.collection(COL.tickets).where('requesterUid', '==', ctx.who.uid).get();
  const now = ctx.now();
  const rows = [];
  for (const doc of snap.docs) {
    const t = { id: doc.id, ...doc.data() };
    if (shouldAutoClose(t, now)) {
      const patch = transition(t, 'closed', { by: 'system', now });
      await doc.ref.update(patch);
      Object.assign(t, patch);
    }
    rows.push(publicTicketView(t));
  }
  return { tickets: rows.sort((a, b) => (b.lastPublicAtMs || 0) - (a.lastPublicAtMs || 0)) };
}

async function ownTicket(ctx, id) {
  const ticket = await loadTicket(ctx.db, safeId(id));
  if (ticket.requesterUid !== ctx.who.uid) fail('not-found', 'Fant ikke saken.');
  return ticket;
}

async function myTicket(ctx, data) {
  const ticket = await ownTicket(ctx, data.id);
  if (ticket.unreadForRequester) {
    await ctx.db.collection(COL.tickets).doc(ticket.id).update({ unreadForRequester: false });
  }
  const messages = await loadMessages(ctx.db, ticket.id);
  return {
    ticket: { ...publicTicketView(ticket), canReopen: canRequesterReopen(ticket, ctx.now()) },
    messages: publicMessages(messages),
  };
}

async function myReply(ctx, data) {
  const ticket = await ownTicket(ctx, data.id);
  const now = ctx.now();
  if (ticket.status === 'closed') fail('failed-precondition', 'Saken er lukket. Opprett en ny sak og vis til saksnummeret.');
  if (ticket.status === 'solved' && !canRequesterReopen(ticket, now)) {
    fail('failed-precondition', 'Fristen for å gjenåpne er ute. Opprett en ny sak.');
  }
  const reply = normalizeReply({ body: data.body, attachments: data.attachments });
  const files = normalizeAttachments(data.attachments);
  const attachments = await storeAttachments(ctx.db, ticket.id, ctx.who.uid, files, now);
  const msg = await addMessage(ctx.db, ticket.id, {
    role: 'requester', authorUid: ctx.who.uid, authorName: ticket.requester?.name || '', body: reply.body, attachments, createdAtMs: now,
  });
  const reopened = ticket.status === 'solved' || ticket.status === 'pending';
  const patch = {
    ...(reopened ? transition(ticket, 'open', { by: 'requester', now }) : {}),
    updatedAtMs: now,
    lastPublicAtMs: now,
    lastMessagePreview: reply.body.slice(0, 160),
    unreadForAgent: true,
    messageCount: (ticket.messageCount || 1) + 1,
    attachments: [...(ticket.attachments || []), ...attachments],
  };
  await ctx.db.collection(COL.tickets).doc(ticket.id).update(patch);
  const updated = { ...ticket, ...patch };
  const team = ticket.assigneeUid
    ? [(await ctx.db.collection(COL.team).doc(ticket.assigneeUid).get()).data()?.email].filter(Boolean)
    : await teamRecipients(ctx.db);
  for (const to of team) await sendSafe(ctx, to, teamAlertMail(updated, { kind: 'reply', message: msg }));
  return { ok: true, status: updated.status };
}

async function mySolve(ctx, data) {
  const ticket = await ownTicket(ctx, data.id);
  if (!isOpenStatus(ticket.status)) return { ok: true, status: ticket.status };
  const now = ctx.now();
  const patch = transition(ticket, 'solved', { by: 'requester', now });
  await ctx.db.collection(COL.tickets).doc(ticket.id).update(patch);
  await addMessage(ctx.db, ticket.id, { role: 'system', body: 'Kunden markerte saken som løst.', createdAtMs: now });
  return { ok: true, status: 'solved' };
}

async function rate(ctx, data) {
  const ticket = await ownTicket(ctx, data.id);
  const rating = data.rating === 'good' ? 'good' : data.rating === 'bad' ? 'bad' : null;
  if (!rating) fail('invalid-argument', 'Velg bra eller ikke bra.');
  const csat = { rating, comment: cleanText(data.comment, 1000), atMs: ctx.now() };
  await ctx.db.collection(COL.tickets).doc(ticket.id).update({ csat, unreadForAgent: true });
  return { ok: true };
}

async function attachment(ctx, data) {
  const id = safeId(data.attachmentId);
  const snap = await ctx.db.collection(COL.attachments).doc(id).get();
  if (!snap.exists) fail('not-found', 'Fant ikke vedlegget.');
  const row = snap.data();
  if (row.uid !== ctx.who.uid) {
    const ticket = await loadTicket(ctx.db, row.ticketId);
    if (ticket.requesterUid !== ctx.who.uid) await requireAgent(ctx);
  }
  return { name: row.name, type: row.type, data: row.data };
}

async function articleFeedback(ctx, data) {
  const id = cleanText(data.articleId, 80);
  if (!id || !getArticle(id)) fail('invalid-argument', 'Ukjent artikkel.');
  const field = data.kind === 'view' ? 'views' : data.helpful ? 'helpful' : 'notHelpful';
  await bump(ctx.db, COL.articles, id, field);
  return { ok: true };
}

async function assistantOutcome(ctx, data) {
  await bump(ctx.db, COL.meta, 'deflection', data.resolved ? 'resolved' : 'escalated');
  return { ok: true };
}

async function popular(ctx) {
  const snap = await ctx.db.collection(COL.articles).get();
  const views = {};
  for (const doc of snap.docs) views[doc.id] = Number(doc.data()?.views) || 0;
  return { views };
}

async function session(ctx) {
  const agent = await resolveAgent(ctx.db, ctx.who, ctx.now());
  return {
    uid: ctx.who.uid,
    email: ctx.who.email,
    verified: ctx.who.verified,
    isAgent: !!agent,
    role: agent?.role || null,
    name: agent?.name || ctx.who.name || '',
    needsVerification: !agent && !ctx.who.verified && isOwnerEmail(ctx.who.email),
  };
}

/* ─────────── Handlinger: helpdesk-team ─────────── */

async function agentTickets(ctx, { archived }) {
  const snap = await ctx.db.collection(COL.tickets).where('archived', '==', archived).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), ref: d.ref }));
}

async function agentList(ctx, data) {
  const agent = await requireAgent(ctx);
  const now = ctx.now();
  const active = await agentTickets(ctx, { archived: false });
  // Løste saker over fristen lukkes og arkiveres.
  for (const t of active) {
    if (shouldAutoClose(t, now)) {
      const patch = transition(t, 'closed', { by: 'system', now });
      await t.ref.update(patch);
      await addMessage(ctx.db, t.id, { role: 'system', internal: true, body: 'Lukket automatisk 7 dager etter at saken ble løst.', createdAtMs: now });
      Object.assign(t, patch);
    }
  }
  const archivedRows = data.view === 'archive' || data.includeArchive
    ? await agentTickets(ctx, { archived: true })
    : [];
  const all = [...active, ...archivedRows].map(({ ref, ...t }) => t);
  return {
    me: { uid: agent.uid, name: agent.name, role: agent.role, email: agent.email },
    tickets: all.map(listRow),
    counts: viewCounts(all, { agentUid: agent.uid, now }),
    archiveLoaded: archivedRows.length > 0 || data.view === 'archive',
  };
}

async function agentGet(ctx, data) {
  await requireAgent(ctx);
  const ticket = await loadTicket(ctx.db, safeId(data.id));
  if (ticket.unreadForAgent) await ctx.db.collection(COL.tickets).doc(ticket.id).update({ unreadForAgent: false });
  const messages = await loadMessages(ctx.db, ticket.id);
  const others = await ctx.db.collection(COL.tickets).where('requesterUid', '==', ticket.requesterUid).get();
  const history = others.docs
    .filter((d) => d.id !== ticket.id)
    .map((d) => listRow({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, 10);
  const articles = (ticket.ai?.articleIds || []).map((id) => getArticle(id)).filter(Boolean)
    .map((a) => ({ id: a.id, title: a.title, summary: a.summary }));
  return {
    ticket: { ...ticket, unreadForAgent: false },
    messages,
    history,
    articles,
    brief: developerBrief(ticket, messages),
  };
}

async function patchTicket(ctx, ticket, patch, { note = '', agent }) {
  const now = ctx.now();
  const full = { ...patch, updatedAtMs: now };
  await ctx.db.collection(COL.tickets).doc(ticket.id).update(full);
  if (note) {
    await addMessage(ctx.db, ticket.id, {
      role: 'system', internal: true, authorUid: agent.uid, authorName: agent.name, body: note, createdAtMs: now,
    });
  }
  return { ...ticket, ...full };
}

async function notifyStatus(ctx, before, after, { note = '' } = {}) {
  if (before.status === after.status) return null;
  if (after.status === 'solved' || (after.status === 'closed' && before.status !== 'solved')) {
    return sendSafe(ctx, requesterEmail(after), ticketSolvedMail(after, { note }));
  }
  if (after.status === 'closed') {
    return sendSafe(ctx, requesterEmail(after), ticketSolvedMail(after, { note }));
  }
  return null;
}

async function agentReply(ctx, data) {
  const agent = await requireAgent(ctx);
  const ticket = await loadTicket(ctx.db, safeId(data.id));
  if (ticket.status === 'closed' && !data.internal) fail('failed-precondition', 'Saken er lukket og arkivert.');
  const reply = normalizeReply({ body: data.body, attachments: data.attachments, internal: data.internal });
  const now = ctx.now();
  const files = normalizeAttachments(data.attachments);
  const attachments = await storeAttachments(ctx.db, ticket.id, agent.uid, files, now);
  const msg = await addMessage(ctx.db, ticket.id, {
    role: 'agent', authorUid: agent.uid, authorName: agent.name || 'ProTop support', body: reply.body,
    internal: reply.internal, attachments, createdAtMs: now,
  });
  const patch = {};
  if (!reply.internal) {
    const nextStatus = STATUSES[data.status] ? data.status : 'pending';
    Object.assign(patch, transition(ticket, nextStatus, { by: 'agent', now }));
    patch.lastPublicAtMs = now;
    patch.lastMessagePreview = reply.body.slice(0, 160);
    patch.unreadForRequester = true;
    patch.messageCount = (ticket.messageCount || 1) + 1;
    if (!ticket.firstResponseAtMs) patch.firstResponseAtMs = now;
    if (!ticket.assigneeUid) { patch.assigneeUid = agent.uid; patch.assigneeName = agent.name || agent.email; }
  }
  const updated = await patchTicket(ctx, ticket, patch, { agent });
  let mail = null;
  if (!reply.internal) {
    mail = ['solved', 'closed'].includes(updated.status)
      ? await sendSafe(ctx, requesterEmail(updated), ticketSolvedMail(updated, { note: reply.body }))
      : await sendSafe(ctx, requesterEmail(updated), agentReplyMail(updated, msg));
    await addMessage(ctx.db, ticket.id, {
      role: 'system', internal: true,
      body: `E-post til kunden ${mail.ok ? 'sendt' : `IKKE sendt (${mail.error})`}.`, createdAtMs: ctx.now(),
    });
  }
  return { ok: true, status: updated.status, emailSent: mail ? mail.ok : null };
}

async function agentUpdate(ctx, data) {
  const agent = await requireAgent(ctx);
  const ticket = await loadTicket(ctx.db, safeId(data.id));
  const now = ctx.now();
  const patch = {};
  const notes = [];
  if (data.status && data.status !== ticket.status) {
    Object.assign(patch, transition(ticket, data.status, { by: 'agent', now }));
    notes.push(`Status: ${statusLabel(ticket.status, { agent: true })} → ${statusLabel(data.status, { agent: true })}`);
  }
  if (data.priority && PRIORITIES[data.priority] && data.priority !== ticket.priority) {
    patch.priority = data.priority;
    notes.push(`Prioritet: ${data.priority}`);
  }
  if (data.category && CATEGORIES[data.category] && data.category !== ticket.category) {
    patch.category = data.category;
    notes.push(`Kategori: ${data.category}`);
  }
  if (data.module && MODULES[data.module] && data.module !== ticket.module) {
    patch.module = data.module;
    notes.push(`Område: ${data.module}`);
  }
  if (data.assigneeUid !== undefined && data.assigneeUid !== ticket.assigneeUid) {
    if (data.assigneeUid) {
      const member = await ctx.db.collection(COL.team).doc(safeId(data.assigneeUid)).get();
      if (!member.exists) fail('invalid-argument', 'Ukjent saksbehandler.');
      patch.assigneeUid = data.assigneeUid;
      patch.assigneeName = member.data()?.name || member.data()?.email || '';
      notes.push(`Tildelt ${patch.assigneeName}`);
    } else {
      patch.assigneeUid = '';
      patch.assigneeName = '';
      notes.push('Tildeling fjernet');
    }
  }
  if (Array.isArray(data.tags)) {
    patch.tags = data.tags.map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean).slice(0, LIMITS.tags);
  }
  if (!Object.keys(patch).length) return { ok: true, unchanged: true };
  const updated = await patchTicket(ctx, ticket, patch, { agent, note: notes.length ? `${agent.name || agent.email}: ${notes.join(' · ')}` : '' });
  const mail = await notifyStatus(ctx, ticket, updated, { note: cleanText(data.note, 2000) });
  if (mail) {
    await addMessage(ctx.db, ticket.id, {
      role: 'system', internal: true,
      body: `Beskjed til kunden om ${statusLabel(updated.status)}: ${mail.ok ? 'sendt' : `IKKE sendt (${mail.error})`}.`,
      createdAtMs: ctx.now(),
    });
  }
  return { ok: true, status: updated.status, emailSent: mail ? mail.ok : null };
}

async function agentAi(ctx, data) {
  await requireAgent(ctx);
  const ticket = await loadTicket(ctx.db, safeId(data.id));
  const messages = await loadMessages(ctx.db, ticket.id);
  let image = null;
  const firstImage = (ticket.attachments || [])[0];
  if (firstImage) {
    const snap = await ctx.db.collection(COL.attachments).doc(firstImage.id).get();
    if (snap.exists) image = { type: snap.data().type, data: snap.data().data };
  }
  const ai = await runAiTriage(ctx, ticket, { messages, image });
  if (!ai) fail('unavailable', 'AI svarte ikke. Prøv igjen om litt.');
  const patch = applyAi(ticket, ai, ctx.now());
  await ctx.db.collection(COL.tickets).doc(ticket.id).update(patch);
  return { ok: true, ai: patch.ai, fix: patch.fix || ticket.fix || null };
}

async function agentFix(ctx, data) {
  const agent = await requireAgent(ctx);
  const ticket = await loadTicket(ctx.db, safeId(data.id));
  const state = String(data.state || '');
  if (!FIX_STATES[state]) fail('invalid-argument', 'Ukjent status for fiks.');
  const now = ctx.now();
  const fix = ticket.fix || { title: cleanText(data.title, 160) || ticket.subject, steps: [], filesToInspect: [], history: [] };
  const entry = { state, byUid: agent.uid, byName: agent.name || agent.email, note: cleanText(data.note, 1000), atMs: now };
  const next = {
    ...fix,
    state,
    prUrl: cleanText(data.prUrl, 300) || fix.prUrl || '',
    decidedAtMs: now,
    history: [...(fix.history || []), entry].slice(-20),
  };
  await patchTicket(ctx, ticket, { fix: next }, {
    agent,
    note: `Fiks-forslag: ${FIX_STATES[state].label.nb}${entry.note ? ` – ${entry.note}` : ''}`,
  });
  return { ok: true, fix: next };
}

async function agentStats(ctx) {
  await requireAgent(ctx);
  const [active, archived, deflectionSnap] = await Promise.all([
    agentTickets(ctx, { archived: false }),
    agentTickets(ctx, { archived: true }),
    ctx.db.collection(COL.meta).doc('deflection').get(),
  ]);
  const all = [...active, ...archived].map(({ ref, ...t }) => t);
  const deflection = deflectionSnap.exists ? deflectionSnap.data() : null;
  const articleSnap = await ctx.db.collection(COL.articles).get();
  const articles = articleSnap.docs.map((d) => ({ id: d.id, title: getArticle(d.id)?.title || d.id, ...d.data() }))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);
  return {
    stats: computeStats(all, { now: ctx.now(), days: 30, deflection }),
    deflection: deflection || { resolved: 0, escalated: 0 },
    articles,
  };
}

/** Krasjrapporter fra appen (crashReports), gruppert per feil. Bare helpdesk-teamet. */
async function agentCrashes(ctx, data) {
  await requireAgent(ctx);
  const days = Math.min(30, Math.max(1, Math.round(Number(data?.days) || 7)));
  const since = ctx.now() - days * 24 * 3600 * 1000;
  const col = ctx.db.collection(CRASH_COLLECTION);
  const snap = typeof col.orderBy === 'function'
    ? await col.where('createdAtMs', '>=', since).orderBy('createdAtMs', 'desc').limit(500).get()
    : await col.get();
  const rows = snap.docs.map((d) => d.data() || {}).filter((r) => (Number(r.createdAtMs) || 0) >= since);
  return { days, total: rows.length, groups: groupCrashReports(rows).slice(0, 100) };
}

async function teamList(ctx) {
  const me = await requireAgent(ctx);
  const [team, invites] = await Promise.all([
    ctx.db.collection(COL.team).get(),
    ctx.db.collection(COL.invites).get(),
  ]);
  return {
    me: { uid: me.uid, role: me.role },
    members: team.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((m) => m.active !== false),
    invites: invites.docs.map((d) => ({ email: d.id, ...d.data() })).filter((i) => i.status === 'pending'),
  };
}

async function teamInvite(ctx, data) {
  const owner = await requireOwner(ctx);
  const email = emailKey(data.email);
  if (!isValidEmail(email)) fail('invalid-argument', 'Skriv en gyldig e-postadresse.');
  const role = AGENT_ROLES[data.role] ? data.role : 'agent';
  await ctx.rateLimit(`invite:${owner.uid}`, 20, 60 * 60 * 1000);
  const existing = await ctx.db.collection(COL.team).where('email', '==', email).get();
  if (existing.docs.some((d) => d.data()?.active !== false)) fail('already-exists', 'Personen er allerede med i teamet.');
  await ctx.db.collection(COL.invites).doc(email).set({
    email, role, status: 'pending', invitedBy: owner.uid, invitedByName: owner.name || owner.email, createdAtMs: ctx.now(),
  });
  const mail = await sendSafe(ctx, email, teamInviteMail({ email, invitedByName: owner.name || owner.email, role }));
  return { ok: true, emailSent: mail.ok };
}

async function teamRemove(ctx, data) {
  await requireOwner(ctx);
  if (data.email && !data.uid) {
    const email = emailKey(data.email);
    await ctx.db.collection(COL.invites).doc(email).set({ status: 'revoked', revokedAtMs: ctx.now() }, { merge: true });
    return { ok: true };
  }
  const uid = safeId(data.uid);
  if (uid === ctx.who.uid) fail('failed-precondition', 'Du kan ikke fjerne deg selv.');
  const ref = ctx.db.collection(COL.team).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'Fant ikke personen.');
  if (isOwnerEmail(snap.data()?.email)) fail('failed-precondition', 'Faste eiere kan ikke fjernes her.');
  await ref.set({ active: false, removedAtMs: ctx.now() }, { merge: true });
  const invite = ctx.db.collection(COL.invites).doc(emailKey(snap.data()?.email));
  await invite.set({ status: 'revoked', revokedAtMs: ctx.now() }, { merge: true });
  return { ok: true };
}

async function teamSettings(ctx, data) {
  const me = await requireAgent(ctx);
  const patch = {};
  if (typeof data.notify === 'boolean') patch.notify = data.notify;
  if (data.name) patch.name = cleanText(data.name, 80);
  if (Object.keys(patch).length) await ctx.db.collection(COL.team).doc(me.uid).set(patch, { merge: true });
  return { ok: true };
}

const ACTIONS = {
  session,
  createTicket,
  myTickets,
  myTicket,
  myReply,
  mySolve,
  rate,
  attachment,
  articleFeedback,
  assistantOutcome,
  popular,
  agentList,
  agentGet,
  agentReply,
  agentUpdate,
  agentAi,
  agentFix,
  agentStats,
  agentCrashes,
  teamList,
  teamInvite,
  teamRemove,
  teamSettings,
};

export const HELPDESK_ACTIONS = Object.keys(ACTIONS);

/**
 * deps: { db, sendMail(message), ai(system, parts) → JSON, rateLimit(key, limit, windowMs),
 *         companyContext(companyId, uid) → {id,name}|null, now(), log() }
 */
export async function handleHelpdesk(data, auth, deps) {
  const action = String(data?.action || '');
  const fn = ACTIONS[action];
  if (!fn) fail('invalid-argument', 'Ukjent handling.');
  const ctx = {
    db: deps.db,
    who: identity(auth),
    sendMail: deps.sendMail || (async () => { throw new Error('E-post er ikke satt opp.'); }),
    ai: deps.ai || null,
    rateLimit: deps.rateLimit || (async () => {}),
    companyContext: deps.companyContext || (async () => null),
    now: deps.now || (() => Date.now()),
    log: deps.log || (() => {}),
  };
  return fn(ctx, data || {});
}

export { redactSecrets };
