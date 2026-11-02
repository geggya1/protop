/**
 * Helpdesk: felles regler for saker. Brukes av klienten, demo-backenden
 * og Cloud Functions (functions/helpdesk.js), så alt her er ren JS uten
 * React Native eller Firebase.
 *
 * Statusene følger Zendesk: Ny → Åpen → Venter på kunde / På vent → Løst → Lukket.
 * «Løst» kan gjenåpnes av kunden i 7 dager. Deretter lukkes og arkiveres saken.
 */

const tx = (nb, en) => ({ nb, en });

export function pickText(value, lang = 'nb') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.nb || value.en || '';
}

export const STATUSES = {
  new: { id: 'new', label: tx('Ny', 'New'), tone: 'info', open: true },
  open: { id: 'open', label: tx('Åpen', 'Open'), tone: 'warn', open: true },
  pending: { id: 'pending', label: tx('Venter på deg', 'Awaiting your reply'), agentLabel: tx('Venter på kunde', 'Awaiting customer'), tone: 'muted', open: true },
  on_hold: { id: 'on_hold', label: tx('Under arbeid', 'In progress'), agentLabel: tx('På vent', 'On hold'), tone: 'muted', open: true },
  solved: { id: 'solved', label: tx('Løst', 'Solved'), tone: 'ok', open: false },
  closed: { id: 'closed', label: tx('Lukket', 'Closed'), tone: 'ok', open: false },
};

export const STATUS_ORDER = ['new', 'open', 'pending', 'on_hold', 'solved', 'closed'];

export const PRIORITIES = {
  low: { id: 'low', label: tx('Lav', 'Low'), rank: 0, firstResponseHours: 48 },
  normal: { id: 'normal', label: tx('Normal', 'Normal'), rank: 1, firstResponseHours: 24 },
  high: { id: 'high', label: tx('Høy', 'High'), rank: 2, firstResponseHours: 8 },
  urgent: { id: 'urgent', label: tx('Haster', 'Urgent'), rank: 3, firstResponseHours: 2 },
};

export const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];

export const CATEGORIES = {
  bug: { id: 'bug', icon: 'bug-outline', label: tx('Noe virker ikke', 'Something is broken'), hint: tx('Feilmelding, hvit skjerm, knapp som ikke reagerer', 'Error, blank screen, a button that does nothing') },
  question: { id: 'question', icon: 'help-circle-outline', label: tx('Spørsmål om bruk', 'How-to question'), hint: tx('Hvordan gjør jeg …?', 'How do I …?') },
  account: { id: 'account', icon: 'person-circle-outline', label: tx('Innlogging og konto', 'Sign-in and account'), hint: tx('Passord, e-post, to-trinns, slette konto', 'Password, email, two-step, delete account') },
  access: { id: 'access', icon: 'key-outline', label: tx('Tilgang og ansatte', 'Access and employees'), hint: tx('Invitere, roller, ser ikke modulen', 'Invites, roles, a module is missing') },
  billing: { id: 'billing', icon: 'card-outline', label: tx('Faktura og abonnement', 'Invoices and subscription'), hint: tx('Betaling, faktura, PowerOffice', 'Payment, invoices, PowerOffice') },
  data: { id: 'data', icon: 'server-outline', label: tx('Data og personvern', 'Data and privacy'), hint: tx('Eksport, sletting, import, feil data', 'Export, deletion, import, wrong data') },
  feature: { id: 'feature', icon: 'bulb-outline', label: tx('Ønske eller forslag', 'Idea or request'), hint: tx('Noe du savner i ProTop', 'Something you miss in ProTop') },
  other: { id: 'other', icon: 'ellipsis-horizontal-circle-outline', label: tx('Annet', 'Other'), hint: tx('Alt annet', 'Anything else') },
};

export const CATEGORY_ORDER = ['bug', 'question', 'account', 'access', 'billing', 'data', 'feature', 'other'];

/** Hvor mye saken hindrer brukeren. Styrer prioritet sammen med AI-triage. */
export const IMPACTS = {
  blocked: { id: 'blocked', label: tx('Jeg kommer ikke videre', 'I am blocked'), priority: 'high' },
  hard: { id: 'hard', label: tx('Det er tungvint', 'It is a hassle'), priority: 'normal' },
  minor: { id: 'minor', label: tx('Bare et spørsmål eller en detalj', 'Just a question or a detail'), priority: 'low' },
};

export const IMPACT_ORDER = ['blocked', 'hard', 'minor'];

/** Områder i ProTop. Id-ene følger shell-fanene, så AI og regler kan peke ut riktig modul. */
export const MODULES = {
  general: tx('Generelt / vet ikke', 'General / not sure'),
  login: tx('Innlogging og konto', 'Sign-in and account'),
  home: tx('Hjem og meny', 'Home and menu'),
  ansatte: tx('Ansatte', 'Employees'),
  arbeid: tx('Timeliste og arbeid', 'Timesheet and work'),
  fravaer: tx('Fravær og ferie', 'Absence and holiday'),
  hr: tx('HR', 'HR'),
  okonomi: tx('Økonomi og faktura', 'Finance and invoicing'),
  poweroffice: tx('PowerOffice', 'PowerOffice'),
  anbud: tx('Anbud', 'Tenders'),
  kontrakt: tx('Kontrakt / avtale', 'Contract / agreement'),
  kunder: tx('Kunder', 'Customers'),
  projects: tx('Prosjekt', 'Projects'),
  iso: tx('ISO / K-HMS', 'ISO / K-HMS'),
  utstyr: tx('Utstyr', 'Equipment'),
  kjorebok: tx('Kjørebok', 'Mileage log'),
  chat: tx('Chat og e-post', 'Chat and mail'),
  plan: tx('Kalender', 'Calendar'),
  private: tx('Privat område', 'Personal space'),
  mobile: tx('Mobilapp', 'Mobile app'),
};

export const MODULE_ORDER = Object.keys(MODULES);

export const AGENT_ROLES = {
  owner: { id: 'owner', label: tx('Eier', 'Owner'), canManageTeam: true },
  agent: { id: 'agent', label: tx('Saksbehandler', 'Agent'), canManageTeam: false },
};

/** Faste eiere av helpdesken. Flere legges til med invitasjon i portalen. */
export const HELPDESK_OWNER_EMAILS = ['goa@invest-as.no'];

export function isOwnerEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return !!e && HELPDESK_OWNER_EMAILS.includes(e);
}

export const FIX_STATES = {
  proposed: { id: 'proposed', label: tx('Forslag', 'Proposed'), tone: 'info' },
  approved: { id: 'approved', label: tx('Godkjent – skal lages', 'Approved – to build'), tone: 'warn' },
  rejected: { id: 'rejected', label: tx('Avvist', 'Rejected'), tone: 'muted' },
  deployed: { id: 'deployed', label: tx('Rettet og ute', 'Fixed and live'), tone: 'ok' },
};

export const SOLVED_AUTO_CLOSE_DAYS = 7;
export const LIMITS = {
  subject: 140,
  body: 6000,
  reply: 6000,
  attachments: 4,
  attachmentBytes: 900 * 1024,
  tags: 12,
  consoleEntries: 40,
  networkEntries: 25,
  breadcrumbs: 25,
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export function statusLabel(status, { lang = 'nb', agent = false } = {}) {
  const row = STATUSES[status] || STATUSES.open;
  return pickText(agent && row.agentLabel ? row.agentLabel : row.label, lang);
}

export function priorityLabel(priority, lang = 'nb') {
  return pickText((PRIORITIES[priority] || PRIORITIES.normal).label, lang);
}

export function categoryLabel(category, lang = 'nb') {
  return pickText((CATEGORIES[category] || CATEGORIES.other).label, lang);
}

export function moduleLabel(moduleId, lang = 'nb') {
  return pickText(MODULES[moduleId] || MODULES.general, lang);
}

export function isOpenStatus(status) {
  return !!(STATUSES[status] || STATUSES.open).open;
}

/** Saksnummer fra løpenummer: PT-1001, PT-1002 … */
export function formatTicketNumber(seq) {
  const n = Math.max(1, Math.floor(Number(seq) || 1));
  return `PT-${1000 + n}`;
}

export function parseTicketNumber(text) {
  const m = String(text || '').match(/\bPT-?(\d{4,7})\b/i);
  return m ? `PT-${m[1]}` : null;
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, max);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

/**
 * Validerer det brukeren sender inn. Kaster Error med norsk tekst
 * (functions gjør den om til HttpsError).
 */
export function normalizeTicketInput(raw = {}) {
  const subject = clean(raw.subject, LIMITS.subject + 40);
  const body = clean(raw.body, LIMITS.body + 200);
  if (subject.length < 3) throw new Error('Skriv en kort tittel på saken (minst 3 tegn).');
  if (subject.length > LIMITS.subject) throw new Error(`Tittelen kan være maks ${LIMITS.subject} tegn.`);
  if (body.length < 10) throw new Error('Beskriv problemet med noen flere ord (minst 10 tegn).');
  if (body.length > LIMITS.body) throw new Error(`Beskrivelsen kan være maks ${LIMITS.body} tegn.`);
  const category = CATEGORIES[raw.category] ? raw.category : 'other';
  const impact = IMPACTS[raw.impact] ? raw.impact : 'hard';
  const moduleId = MODULES[raw.module] ? raw.module : 'general';
  const phone = clean(raw.phone, 30).replace(/[^\d+ ()-]/g, '');
  const contactEmail = clean(raw.contactEmail, 160).toLowerCase();
  if (contactEmail && !isValidEmail(contactEmail)) throw new Error('E-postadressen ser ikke riktig ut.');
  const fromAssistant = clean(raw.transcript, 4000);
  return {
    subject,
    body,
    category,
    impact,
    module: moduleId,
    phone,
    contactEmail,
    transcript: fromAssistant,
    lang: raw.lang === 'en' ? 'en' : 'nb',
    shareDiagnostics: raw.shareDiagnostics !== false,
    viewedArticleIds: Array.isArray(raw.viewedArticleIds)
      ? raw.viewedArticleIds.map((id) => clean(id, 80)).filter(Boolean).slice(0, 10)
      : [],
  };
}

export function normalizeReply(raw = {}) {
  const body = clean(raw.body, LIMITS.reply + 100);
  const attachments = Array.isArray(raw.attachments) ? raw.attachments.length : 0;
  if (!body && !attachments) throw new Error('Skriv et svar eller legg ved et bilde.');
  if (body.length > LIMITS.reply) throw new Error(`Svaret kan være maks ${LIMITS.reply} tegn.`);
  return { body, internal: raw.internal === true };
}

/** Prioritet ved opprettelse: det brukeren sier, løftet av alvorlige funn. */
export function initialPriority({ impact, category, triagePriority } = {}) {
  let p = (IMPACTS[impact] || IMPACTS.hard).priority;
  if (category === 'feature') p = 'low';
  if (triagePriority && PRIORITIES[triagePriority] && PRIORITIES[triagePriority].rank > PRIORITIES[p].rank) {
    p = triagePriority;
  }
  return p;
}

/** Frist for første svar (SLA) ut fra prioritet. */
export function firstResponseDueMs(createdAtMs, priority) {
  const hours = (PRIORITIES[priority] || PRIORITIES.normal).firstResponseHours;
  return Number(createdAtMs || 0) + hours * HOUR;
}

export function slaState(ticket, now = Date.now()) {
  if (!ticket || !isOpenStatus(ticket.status)) return { state: 'none' };
  if (ticket.firstResponseAtMs) return { state: 'met' };
  const due = firstResponseDueMs(ticket.createdAtMs, ticket.priority);
  const left = due - now;
  if (left < 0) return { state: 'breached', dueMs: due, leftMs: left };
  if (left < 2 * HOUR) return { state: 'soon', dueMs: due, leftMs: left };
  return { state: 'ok', dueMs: due, leftMs: left };
}

/**
 * Statusovergang. Returnerer feltene som skal oppdateres på saken.
 * `by` = 'agent' | 'requester' | 'system'.
 */
export function transition(ticket, nextStatus, { by = 'agent', now = Date.now() } = {}) {
  if (!STATUSES[nextStatus]) throw new Error('Ukjent status.');
  const current = ticket?.status || 'new';
  if (current === 'closed' && nextStatus !== 'closed') {
    throw new Error('Saken er lukket. Opprett en ny sak med henvisning til saksnummeret.');
  }
  if (by === 'requester' && !['open', 'solved'].includes(nextStatus)) {
    throw new Error('Du kan bare gjenåpne eller markere saken som løst.');
  }
  const patch = { status: nextStatus, updatedAtMs: now };
  if (nextStatus === 'solved') {
    patch.solvedAtMs = now;
    patch.autoCloseAtMs = now + SOLVED_AUTO_CLOSE_DAYS * DAY;
  }
  if (nextStatus === 'closed') {
    patch.closedAtMs = now;
    patch.archived = true;
    if (!ticket?.solvedAtMs) patch.solvedAtMs = now;
  }
  if (['new', 'open', 'pending', 'on_hold'].includes(nextStatus)) {
    patch.solvedAtMs = null;
    patch.autoCloseAtMs = null;
    patch.archived = false;
  }
  return patch;
}

/** Kunden kan gjenåpne en løst sak innen fristen. */
export function canRequesterReopen(ticket, now = Date.now()) {
  if (!ticket || ticket.status !== 'solved') return false;
  return !ticket.autoCloseAtMs || now < ticket.autoCloseAtMs;
}

/** Løste saker over fristen skal lukkes og arkiveres. */
export function shouldAutoClose(ticket, now = Date.now()) {
  return !!ticket && ticket.status === 'solved' && !!ticket.autoCloseAtMs && now >= ticket.autoCloseAtMs;
}

/* ─────────── Visninger i portalen (Zendesk «views») ─────────── */

export const AGENT_VIEWS = [
  { id: 'open', icon: 'file-tray-full-outline', label: tx('Alle åpne', 'All open') },
  { id: 'mine', icon: 'person-outline', label: tx('Mine saker', 'My tickets') },
  { id: 'unassigned', icon: 'help-buoy-outline', label: tx('Ikke tildelt', 'Unassigned') },
  { id: 'urgent', icon: 'flame-outline', label: tx('Haster / over frist', 'Urgent / overdue') },
  { id: 'bugs', icon: 'bug-outline', label: tx('Feil og bugs', 'Bugs') },
  { id: 'pending', icon: 'hourglass-outline', label: tx('Venter på kunde', 'Awaiting customer') },
  { id: 'solved', icon: 'checkmark-done-outline', label: tx('Løst', 'Solved') },
  { id: 'archive', icon: 'archive-outline', label: tx('Arkiv', 'Archive') },
];

export function matchesView(ticket, viewId, { agentUid = '', now = Date.now() } = {}) {
  if (!ticket) return false;
  const open = isOpenStatus(ticket.status);
  const archived = ticket.archived === true || ticket.status === 'closed';
  switch (viewId) {
    case 'open': return open && !archived;
    case 'mine': return open && !archived && !!agentUid && ticket.assigneeUid === agentUid;
    case 'unassigned': return open && !archived && !ticket.assigneeUid;
    case 'urgent': {
      if (!open || archived) return false;
      const sla = slaState(ticket, now).state;
      return ticket.priority === 'urgent' || sla === 'breached' || sla === 'soon';
    }
    case 'bugs': return open && !archived && ticket.category === 'bug';
    case 'pending': return ['pending', 'on_hold'].includes(ticket.status) && !archived;
    case 'solved': return ticket.status === 'solved' && !archived;
    case 'archive': return archived;
    case 'all': return true;
    default: return open && !archived;
  }
}

export function ticketSearchText(ticket = {}) {
  return [
    ticket.number,
    ticket.subject,
    ticket.body,
    ticket.requester?.name,
    ticket.requester?.email,
    ticket.requester?.uid,
    ticket.requester?.companyName,
    ticket.category,
    ticket.module,
    ...(ticket.tags || []),
    ticket.ai?.summary,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function filterTickets(tickets = [], {
  view = 'open', query = '', agentUid = '', category = '', priority = '', now = Date.now(),
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  const words = q ? q.split(/\s+/).filter(Boolean) : [];
  return tickets.filter((t) => {
    if (!matchesView(t, view, { agentUid, now })) return false;
    if (category && t.category !== category) return false;
    if (priority && t.priority !== priority) return false;
    if (!words.length) return true;
    const hay = ticketSearchText(t);
    return words.every((w) => hay.includes(w));
  });
}

/** Sortering: haster og brudd på frist først, så nyeste aktivitet. */
export function sortTickets(tickets = [], { by = 'smart', now = Date.now() } = {}) {
  const rows = [...tickets];
  if (by === 'newest') return rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  if (by === 'updated') return rows.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  const slaRank = { breached: 3, soon: 2, ok: 1, met: 0, none: 0 };
  return rows.sort((a, b) => {
    const pa = (PRIORITIES[a.priority] || PRIORITIES.normal).rank;
    const pb = (PRIORITIES[b.priority] || PRIORITIES.normal).rank;
    const sa = slaRank[slaState(a, now).state] || 0;
    const sb = slaRank[slaState(b, now).state] || 0;
    if (sb !== sa) return sb - sa;
    if (pb !== pa) return pb - pa;
    return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  });
}

export function viewCounts(tickets = [], { agentUid = '', now = Date.now() } = {}) {
  const out = {};
  for (const view of AGENT_VIEWS) {
    out[view.id] = tickets.filter((t) => matchesView(t, view.id, { agentUid, now })).length;
  }
  return out;
}

/* ─────────── Statistikk ─────────── */

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function computeStats(tickets = [], { now = Date.now(), days = 30, deflection = null } = {}) {
  const since = now - days * DAY;
  const recent = tickets.filter((t) => (t.createdAtMs || 0) >= since);
  const open = tickets.filter((t) => isOpenStatus(t.status) && !t.archived);
  const solvedRecent = tickets.filter((t) => (t.solvedAtMs || 0) >= since);
  const firstResponse = recent
    .filter((t) => t.firstResponseAtMs)
    .map((t) => t.firstResponseAtMs - t.createdAtMs);
  const resolution = solvedRecent
    .filter((t) => t.solvedAtMs && t.createdAtMs)
    .map((t) => t.solvedAtMs - t.createdAtMs);
  const ratings = tickets.filter((t) => t.csat?.rating).map((t) => t.csat.rating);
  const good = ratings.filter((r) => r === 'good').length;
  const byCategory = {};
  for (const t of recent) byCategory[t.category || 'other'] = (byCategory[t.category || 'other'] || 0) + 1;
  const byModule = {};
  for (const t of recent) byModule[t.module || 'general'] = (byModule[t.module || 'general'] || 0) + 1;
  const breached = open.filter((t) => slaState(t, now).state === 'breached').length;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const createdToday = tickets.filter((t) => (t.createdAtMs || 0) >= startOfToday.getTime()).length;
  let deflectionRate = null;
  if (deflection && (deflection.resolved || deflection.escalated)) {
    const total = (deflection.resolved || 0) + (deflection.escalated || 0);
    deflectionRate = total ? Math.round(((deflection.resolved || 0) / total) * 100) : null;
  }
  return {
    days,
    open: open.length,
    unassigned: open.filter((t) => !t.assigneeUid).length,
    breached,
    createdToday,
    created: recent.length,
    solved: solvedRecent.length,
    medianFirstResponseMs: median(firstResponse),
    medianResolutionMs: median(resolution),
    csatPercent: ratings.length ? Math.round((good / ratings.length) * 100) : null,
    csatCount: ratings.length,
    byCategory,
    byModule,
    fixProposals: tickets.filter((t) => t.fix && t.fix.state === 'proposed').length,
    deflectionRate,
  };
}

export function formatDuration(ms, lang = 'nb') {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const min = Math.round(ms / 60000);
  if (min < 60) return lang === 'en' ? `${min} min` : `${min} min`;
  const h = Math.round(min / 6) / 10;
  if (h < 48) return lang === 'en' ? `${h} h` : `${String(h).replace('.', ',')} t`;
  const d = Math.round(h / 2.4) / 10;
  return lang === 'en' ? `${d} days` : `${String(d).replace('.', ',')} døgn`;
}

export function formatWhen(ms, { now = Date.now(), lang = 'nb' } = {}) {
  if (!ms) return '';
  const diff = now - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return lang === 'en' ? 'just now' : 'nå nettopp';
  if (min < 60) return lang === 'en' ? `${min} min ago` : `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'en' ? `${h} h ago` : `${h} t siden`;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Det kunden får se av en sak (aldri interne notater, AI eller fiks-forslag). */
export function publicTicketView(ticket = {}) {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    body: ticket.body,
    status: ticket.status,
    category: ticket.category,
    module: ticket.module,
    priority: ticket.priority,
    createdAtMs: ticket.createdAtMs,
    updatedAtMs: ticket.updatedAtMs,
    solvedAtMs: ticket.solvedAtMs || null,
    closedAtMs: ticket.closedAtMs || null,
    autoCloseAtMs: ticket.autoCloseAtMs || null,
    unreadForRequester: !!ticket.unreadForRequester,
    attachments: (ticket.attachments || []).map((a) => ({ id: a.id, name: a.name, type: a.type, size: a.size })),
    csat: ticket.csat || null,
    lastPublicAtMs: ticket.lastPublicAtMs || ticket.updatedAtMs || ticket.createdAtMs,
    assigneeName: ticket.assigneeName || '',
  };
}

export function publicMessages(messages = []) {
  return messages
    .filter((m) => !m.internal)
    .map((m) => ({
      id: m.id,
      role: m.role,
      authorName: m.role === 'agent' ? (m.authorName || 'ProTop support') : m.authorName || '',
      body: m.body,
      attachments: m.attachments || [],
      createdAtMs: m.createdAtMs,
    }));
}
