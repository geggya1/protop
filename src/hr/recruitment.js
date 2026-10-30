/**
 * Rekruttering: steg, ansvarlig, scorekort, interne notater, historikk og svar til søker.
 * Rene funksjoner over søknadene i HR-tilstanden (model.js normaliserer dem).
 */
import {
  APPLICATION_STAGES,
  RECRUITMENT_CRITERIA,
  applicationScorecardAverage,
  choiceLabel,
  formatNbDate,
  localIsoDate,
  newId,
  normalizeApplication,
} from './model.js';

/** Kolonnene på tavlen: de aktive stegene og én for avsluttede. */
export const PIPELINE_COLUMNS = [
  ...APPLICATION_STAGES.filter((stage) => !stage.closed).map((stage) => ({ id: stage.id, label: stage.label })),
  { id: 'closed', label: 'Avsluttet' },
];

export const CLOSED_STAGES = APPLICATION_STAGES.filter((stage) => stage.closed);

/** Steg som krever begrunnelse før søknaden flyttes dit. */
export const REASON_STAGES = ['rejected', 'withdrawn', 'declined'];

export const RECOMMENDATIONS = [
  { id: 'yes', label: 'Gå videre' },
  { id: 'maybe', label: 'Usikker' },
  { id: 'no', label: 'Ikke gå videre' },
];

export const APPLICATION_SOURCES = ['Finn.no', 'NAV', 'LinkedIn', 'Nettside', 'E-post', 'Tips / nettverk', 'Åpen søknad'];

export function stageLabel(id) {
  return choiceLabel(APPLICATION_STAGES, id);
}

export function isClosedStage(id) {
  return CLOSED_STAGES.some((stage) => stage.id === id);
}

export function columnOf(app) {
  return isClosedStage(app?.stage) ? 'closed' : (app?.stage || 'new');
}

function actorOf(actor) {
  return { byUid: String(actor?.uid || ''), byName: String(actor?.name || '').trim() };
}

function event(action, actor, extra = {}, now = new Date()) {
  return { id: newId('hrev'), at: now.toISOString(), ...actorOf(actor), action, ...extra };
}

function touched(app, now) {
  return { ...app, updatedAt: now.toISOString() };
}

/**
 * Flytter søknaden til et steg og logger det. Avslag, trukket og takket nei krever begrunnelse
 * (fra reason eller fra søknaden). Svarer { ok, app, error, needsReason }.
 */
export function moveApplicationStage(application, stage, { actor = null, reason = '', now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  if (!APPLICATION_STAGES.some((row) => row.id === stage)) {
    return { ok: false, app, error: 'Ukjent steg' };
  }
  if (app.stage === stage) return { ok: true, app, error: '' };
  const why = String(reason || '').trim() || (REASON_STAGES.includes(stage) ? app.rejectReason : '');
  if (REASON_STAGES.includes(stage) && !why) {
    return { ok: false, app, error: 'Skriv begrunnelse før du avslutter søknaden.', needsReason: true };
  }
  const closing = isClosedStage(stage);
  const next = {
    ...app,
    stage,
    rejectReason: REASON_STAGES.includes(stage) ? why : app.rejectReason,
    closedAt: closing ? localIsoDate(now) : '',
    offerSentAt: stage === 'offer' && !app.offerSentAt ? localIsoDate(now) : app.offerSentAt,
    history: [
      ...(app.history || []),
      event('stage', actor, { from: app.stage, to: stage, text: REASON_STAGES.includes(stage) ? why : '' }, now),
    ],
  };
  return { ok: true, app: normalizeApplication(touched(next, now)), error: '' };
}

/** Setter ansvarlig (tom uid fjerner). */
export function assignApplication(application, owner, { actor = null, now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  const ownerUid = String(owner?.uid || '');
  const ownerName = ownerUid ? String(owner?.name || '').trim() : '';
  if (app.ownerUid === ownerUid && app.ownerName === ownerName) return app;
  return normalizeApplication(touched({
    ...app,
    ownerUid,
    ownerName,
    history: [...app.history, event('owner', actor, { from: app.ownerName, to: ownerName }, now)],
  }, now));
}

export function addApplicationComment(application, textValue, { actor = null, now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  const body = String(textValue || '').trim();
  if (!body) return app;
  return normalizeApplication(touched({
    ...app,
    comments: [...app.comments, { id: newId('hrnote'), at: now.toISOString(), ...actorOf(actor), text: body }],
  }, now));
}

export function removeApplicationComment(application, commentId, { now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication(touched({
    ...app,
    comments: app.comments.filter((row) => row.id !== commentId),
  }, now));
}

/** Lagrer vurdererens eget scorekort (én per person). */
export function saveScorecard(application, { ratings = {}, comment = '', recommendation = '' } = {}, { actor = null, now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  const who = actorOf(actor);
  const mine = (row) => (who.byUid ? row.byUid === who.byUid : row.byName === who.byName);
  const others = app.scorecards.filter((row) => !mine(row));
  const card = {
    ...who,
    byName: who.byName || 'Ukjent',
    at: now.toISOString(),
    ratings,
    comment,
    recommendation,
  };
  const hadCard = app.scorecards.some(mine);
  return normalizeApplication(touched({
    ...app,
    scorecards: [...others, card],
    history: hadCard ? app.history : [...app.history, event('score', actor, {}, now)],
  }, now));
}

export function myScorecard(application, actor) {
  const who = actorOf(actor);
  return (application?.scorecards || []).find((row) => (
    who.byUid ? row.byUid === who.byUid : row.byName === who.byName
  )) || null;
}

/** Snitt per kriterium over alle scorekort. */
export function criteriaAverages(scorecards) {
  return RECRUITMENT_CRITERIA.map((criterion) => {
    const values = (scorecards || [])
      .map((card) => Number(card?.ratings?.[criterion.id]))
      .filter((n) => n >= 1 && n <= 5);
    const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    return { ...criterion, avg, count: values.length };
  });
}

export function applicationRating(app) {
  return applicationScorecardAverage(app?.scorecards);
}

/** Lager en ny søknad fra AI-lesingen av en fil. */
export function applicationFromRead(read, {
  jobId = '', stage = 'new', attachment = null, source = '', actor = null, engine = '', now = new Date(),
} = {}) {
  const candidate = read?.candidate || {};
  const assessment = read?.assessment || null;
  const app = normalizeApplication({
    jobId,
    name: candidate.name || attachment?.name || 'Søker',
    email: candidate.email || '',
    phone: candidate.phone || '',
    location: candidate.location || '',
    source,
    stage,
    appliedAt: localIsoDate(now),
    attachments: attachment ? [attachment] : [],
    profile: read?.profile || null,
    ai: assessment ? { ...assessment, engine, at: now.toISOString() } : null,
    ownerUid: actor?.uid || '',
    ownerName: actor?.uid ? String(actor?.name || '') : '',
    history: [event('created', actor, { to: stage, text: engine && engine !== 'local' ? 'Lest med OCR/AI' : '' }, now)],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return app;
}

/** Legger AI-lesingen inn i en eksisterende søknad. Utfylte kontaktfelt beholdes. */
export function applyReadToApplication(application, read, { engine = '', now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  const candidate = read?.candidate || {};
  const placeholder = !app.name || app.name === 'Søker';
  return normalizeApplication(touched({
    ...app,
    name: placeholder && candidate.name ? candidate.name : app.name,
    email: app.email || candidate.email || '',
    phone: app.phone || candidate.phone || '',
    location: app.location || candidate.location || '',
    profile: read?.profile || app.profile,
    ai: read?.assessment ? { ...read.assessment, engine, at: now.toISOString() } : app.ai,
  }, now));
}

function stamp(iso) {
  return String(iso || '').slice(0, 10);
}

export function daysSince(iso, now = new Date()) {
  const day = stamp(iso);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - start) / 86400000);
}

/** Søknaden har stått i samme steg lenge uten avgjørelse. */
export function applicationIdleDays(app, now = new Date()) {
  if (isClosedStage(app?.stage)) return null;
  const lastMove = [...(app?.history || [])].reverse().find((row) => row.action === 'stage' || row.action === 'created');
  return daysSince(lastMove?.at || app?.appliedAt, now);
}

export function filterApplications(apps, {
  jobId = '', query = '', owner = '', uid = '', showClosed = true,
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (apps || []).filter((row) => {
    if (jobId && row.jobId !== jobId) return false;
    if (!showClosed && isClosedStage(row.stage)) return false;
    if (owner === 'mine' && (!uid || row.ownerUid !== uid)) return false;
    if (owner === 'none' && row.ownerUid) return false;
    if (owner && !['mine', 'none'].includes(owner) && row.ownerUid !== owner) return false;
    if (!q) return true;
    return [
      row.name, row.email, row.phone, row.source, row.location, row.ownerName,
      row.profile?.headline, ...(row.profile?.skills || []),
    ].join(' ').toLowerCase().includes(q);
  });
}

export const SORTS = [
  { id: 'recent', label: 'Nyeste' },
  { id: 'score', label: 'Høyest score' },
  { id: 'match', label: 'Best AI-match' },
  { id: 'name', label: 'Navn' },
];

export function sortApplications(apps, sort = 'recent') {
  const list = [...(apps || [])];
  const byRecent = (a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt))
    || String(b.createdAt).localeCompare(String(a.createdAt));
  if (sort === 'score') return list.sort((a, b) => (b.score || 0) - (a.score || 0) || byRecent(a, b));
  if (sort === 'match') return list.sort((a, b) => (b.ai?.match ?? -1) - (a.ai?.match ?? -1) || byRecent(a, b));
  if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  return list.sort(byRecent);
}

export function applicationsByColumn(apps) {
  const buckets = Object.fromEntries(PIPELINE_COLUMNS.map((col) => [col.id, []]));
  for (const row of apps || []) buckets[columnOf(row)].push(row);
  return buckets;
}

/** Tall til nøkkelraden over tavlen. */
export function recruitmentOverview(apps, now = new Date()) {
  const list = apps || [];
  const active = list.filter((row) => !isClosedStage(row.stage));
  const count = (stage) => list.filter((row) => row.stage === stage).length;
  return {
    active: active.length,
    new: count('new'),
    screening: count('screening'),
    interview: count('interview') + count('references'),
    offer: count('offer'),
    hired: count('hired'),
    closedNo: count('rejected') + count('withdrawn') + count('declined'),
    unassigned: active.filter((row) => !row.ownerUid).length,
    unscored: active.filter((row) => row.stage !== 'new' && !row.scorecards?.length).length,
    unanswered: list.filter((row) => isClosedStage(row.stage) && row.stage !== 'hired' && !row.respondedAt).length,
    idle: active.filter((row) => (applicationIdleDays(row, now) ?? 0) >= 14).length,
  };
}

/** Antall aktive og totalt per stilling. */
export function jobCounts(jobs, apps) {
  return Object.fromEntries((jobs || []).map((job) => {
    const rows = (apps || []).filter((row) => row.jobId === job.id);
    return [job.id, {
      total: rows.length,
      active: rows.filter((row) => !isClosedStage(row.stage)).length,
      hired: rows.filter((row) => row.stage === 'hired').length,
    }];
  }));
}

export const RESPONSE_TEMPLATES = [
  { id: 'ack', label: 'Bekreft mottatt' },
  { id: 'interview', label: 'Innkalling til intervju' },
  { id: 'offer', label: 'Tilbud' },
  { id: 'reject', label: 'Avslag' },
];

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** Ferdig tekst til søkeren. Fylles fra søknaden og stillingen. */
export function responseTemplate(kind, { app, job, company = '', sender = '' } = {}) {
  const hi = firstName(app?.name) ? `Hei ${firstName(app.name)},` : 'Hei,';
  const role = job?.title ? `stillingen som ${job.title}` : 'stillingen';
  const sign = [sender, company].filter(Boolean).join('\n');
  const close = `\n\nVennlig hilsen\n${sign || 'Oss'}`;
  if (kind === 'ack') {
    return {
      subject: `Søknad mottatt${job?.title ? ` – ${job.title}` : ''}`,
      body: `${hi}\n\nTakk for søknaden på ${role}. Vi har mottatt den og går gjennom søknadene fortløpende. Du hører fra oss så snart vi har vurdert den.${close}`,
    };
  }
  if (kind === 'interview') {
    const when = app?.interviewDate
      ? `${formatNbDate(app.interviewDate)}${app.interviewTime ? ` kl. ${app.interviewTime}` : ''}`
      : '[dato og klokkeslett]';
    const where = app?.interviewPlace || '[sted / lenke]';
    return {
      subject: `Invitasjon til intervju${job?.title ? ` – ${job.title}` : ''}`,
      body: `${hi}\n\nTakk for søknaden på ${role}. Vi vil gjerne bli bedre kjent med deg og inviterer til intervju ${when}, ${where}.${app?.interviewers ? `\n\nTil stede fra oss: ${app.interviewers}.` : ''}\n\nGi gjerne beskjed om tidspunktet passer.${close}`,
    };
  }
  if (kind === 'offer') {
    const terms = [
      app?.offerStart ? `Oppstart: ${formatNbDate(app.offerStart)}` : '',
      app?.offerSalary ? `Lønn: ${app.offerSalary}` : '',
    ].filter(Boolean).join('\n');
    return {
      subject: `Tilbud om ${role}`,
      body: `${hi}\n\nVi har gleden av å tilby deg ${role}.${terms ? `\n\n${terms}` : ''}${app?.offerDeadline ? `\n\nVi ber om svar innen ${formatNbDate(app.offerDeadline)}.` : ''}\n\nArbeidsavtale sendes når du har takket ja.${close}`,
    };
  }
  return {
    subject: `Svar på søknad${job?.title ? ` – ${job.title}` : ''}`,
    body: `${hi}\n\nTakk for interessen for ${role} og for tiden du brukte på søknaden. Vi har nå gått gjennom søknadene, og har dessverre valgt å gå videre med andre kandidater denne gangen.\n\nVi ønsker deg lykke til videre.${close}`,
  };
}

export function mailtoHref(to, subject, body) {
  const params = [`subject=${encodeURIComponent(subject || '')}`, `body=${encodeURIComponent(body || '')}`];
  return `mailto:${encodeURIComponent(String(to || '').trim()).replace(/%40/g, '@')}?${params.join('&')}`;
}

/** Leselig linje for et historikkpunkt. */
export function historyLine(row) {
  const who = row.byName ? ` · ${row.byName}` : '';
  if (row.action === 'created') return `Søknad registrert${row.text ? ` · ${row.text}` : ''}${who}`;
  if (row.action === 'stage') return `${stageLabel(row.from)} → ${stageLabel(row.to)}${row.text ? `: ${row.text}` : ''}${who}`;
  if (row.action === 'owner') return `${row.to ? `Ansvarlig: ${row.to}` : 'Ansvarlig fjernet'}${who}`;
  if (row.action === 'score') return `Scorekort fylt ut${who}`;
  if (row.action === 'response') return `Svar sendt: ${row.text || ''}${who}`;
  if (row.action === 'ai') return `Lest med OCR/AI${row.text ? `: ${row.text}` : ''}${who}`;
  if (row.action === 'document') return `Dokument lagt til${row.text ? `: ${row.text}` : ''}${who}`;
  if (row.action === 'hired') return `Opprettet som ansatt${who}`;
  return `${row.text || row.action}${who}`;
}

/** Logger at et svar er sendt (bekreftelse eller endelig svar). */
export function markResponseSent(application, kind, { actor = null, now = new Date(), body = '' } = {}) {
  const app = normalizeApplication(application || {});
  const label = RESPONSE_TEMPLATES.find((row) => row.id === kind)?.label || 'Svar';
  const day = localIsoDate(now);
  return normalizeApplication(touched({
    ...app,
    response: body || app.response,
    acknowledgedAt: kind === 'ack' ? day : app.acknowledgedAt,
    respondedAt: kind === 'reject' || kind === 'offer' ? day : app.respondedAt,
    history: [...app.history, event('response', actor, { text: label }, now)],
  }, now));
}

export function logApplicationEvent(application, action, { actor = null, now = new Date(), text = '' } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication(touched({
    ...app,
    history: [...app.history, event(action, actor, { text }, now)],
  }, now));
}
