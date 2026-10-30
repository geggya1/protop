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
export function criteriaAverages(scorecards, criteria = RECRUITMENT_CRITERIA) {
  return (criteria?.length ? criteria : RECRUITMENT_CRITERIA).map((criterion) => {
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
    // Mottatt for mer enn tre dager siden uten bekreftelse til søkeren.
    unacknowledged: active.filter((row) => !row.acknowledgedAt && (daysSince(row.appliedAt, now) ?? 0) > 3).length,
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
      body: `${hi}\n\nTakk for søknaden på ${role}. Vi har mottatt den og går gjennom søknadene fortløpende. Du hører fra oss så snart vi har vurdert den.\n\nVi bruker et verktøy med AI-støtte til å lese CV og søknad. Alle vurderinger og avgjørelser tas av mennesker. Søknaden slettes når rekrutteringen er avsluttet, med mindre du samtykker til at vi beholder den.${close}`,
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
  if (row.action === 'reference') return `Referanse: ${row.text || ''}${who}`;
  if (row.action === 'ai-review') return `AI-lesingen kontrollert${who}`;
  if (row.action === 'copied') return `Kopiert ${row.text ? `fra ${row.text}` : 'fra en annen stilling'}${who}`;
  if (row.action === 'bulk-close') return `Avsluttet da rekrutteringen ble avsluttet${row.text ? `: ${row.text}` : ''}${who}`;
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

/** Et menneske bekrefter at AI-lesingen er kontrollert mot dokumentet. */
export function markAiReviewed(application, { actor = null, now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication(touched({
    ...app,
    aiReviewedBy: String(actor?.name || '').trim() || 'Ukjent',
    aiReviewedAt: now.toISOString(),
    history: [...app.history, event('ai-review', actor, {}, now)],
  }, now));
}

export function addReference(application, ref, { actor = null, now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  if (!String(ref?.name || '').trim()) return app;
  const row = { ...ref, id: newId('hrref'), ...actorOf(actor) };
  return normalizeApplication(touched({
    ...app,
    references: [...app.references, row],
    history: [...app.history, event('reference', actor, { text: String(ref.name).trim() }, now)],
  }, now));
}

export function updateReference(application, id, patch, { now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication(touched({
    ...app,
    references: app.references.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  }, now));
}

export function removeReference(application, id, { now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication(touched({ ...app, references: app.references.filter((row) => row.id !== id) }, now));
}

/** Andre søknader fra samme person (e-post), f.eks. på andre stillinger. */
export function otherApplications(app, apps) {
  const email = String(app?.email || '').toLowerCase();
  if (!email) return [];
  return (apps || []).filter((row) => row.id !== app.id && row.email === email);
}

/** Kopi av søkeren til en annen stilling (talentbank). Starter i «Mottatt». */
export function copyApplicationToJob(application, jobId, { actor = null, fromJobTitle = '', now = new Date() } = {}) {
  const app = normalizeApplication(application || {});
  return normalizeApplication({
    jobId,
    name: app.name,
    email: app.email,
    phone: app.phone,
    location: app.location,
    source: app.source,
    attachments: app.attachments,
    profile: app.profile,
    stage: 'new',
    appliedAt: localIsoDate(now),
    ownerUid: actor?.uid || '',
    ownerName: actor?.uid ? String(actor?.name || '') : '',
    copiedFrom: app.id,
    history: [event('copied', actor, { text: fromJobTitle }, now)],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

/**
 * Avslutter rekrutteringen for en stilling: stillingen lukkes og alle aktive søkere
 * avslås med samme begrunnelse. Svarer { applications, jobs, rejected } for HR-tilstanden.
 */
export function closeRecruitment(state, jobId, { reason = '', actor = null, now = new Date() } = {}) {
  const why = String(reason || '').trim() || 'Stillingen er besatt';
  const rejected = [];
  const applications = (state?.applications || []).map((row) => {
    if (row.jobId !== jobId || isClosedStage(row.stage)) return row;
    const moved = moveApplicationStage(row, 'rejected', { actor, reason: why, now });
    if (!moved.ok) return row;
    rejected.push(moved.app);
    const last = moved.app.history.at(-1);
    return normalizeApplication({
      ...moved.app,
      history: [...moved.app.history.slice(0, -1), { ...last, action: 'bulk-close' }],
    });
  });
  const jobs = (state?.jobs || []).map((row) => (
    row.id === jobId ? { ...row, status: 'closed', updatedAt: now.toISOString() } : row
  ));
  return { applications, jobs, rejected };
}

/** E-post til mange søkere med blindkopi, så de ikke ser hverandre. */
export function bccMailtoHref(emails, subject, body) {
  const list = [...new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
  const params = [`bcc=${list.join(',')}`, `subject=${encodeURIComponent(subject || '')}`, `body=${encodeURIComponent(body || '')}`];
  return `mailto:?${params.join('&')}`;
}

function icsText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

/** «9:05», «09.05» og «0905» blir [9, 5]. Ugyldig tid gir 09:00. */
function parseClock(time) {
  const m = String(time || '').trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? [h, min] : [9, 0];
}

function icsStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

/** Kalenderinvitasjon (.ics) for intervjuet, i lokal tid. Tom streng uten gyldig dato. */
export function interviewIcs(app, { job = null, company = '', minutes = 60, now = new Date() } = {}) {
  const day = String(app?.interviewDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!day) return '';
  const [h, min] = parseClock(app.interviewTime);
  // UTC brukes bare som regnestykke for lokal tid (ingen tidssone i filen).
  const start = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), h, min));
  const end = new Date(start.getTime() + minutes * 60000);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const title = `Intervju: ${app.name}${job?.title ? ` – ${job.title}` : ''}`;
  const desc = [
    job?.title ? `Stilling: ${job.title}` : '',
    app.email ? `E-post: ${app.email}` : '',
    app.phone ? `Telefon: ${app.phone}` : '',
    app.interviewers ? `Intervjuere: ${app.interviewers}` : '',
    company ? `${company}` : '',
  ].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProTop//Rekruttering//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${app.id}-intervju@protop.no`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(title)}`,
    app.interviewPlace ? `LOCATION:${icsText(app.interviewPlace)}` : '',
    desc ? `DESCRIPTION:${icsText(desc)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function csvCell(value) {
  const raw = String(value ?? '');
  // Formler i regneark (=, +, -, @) skal ikke kjøres når filen åpnes.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Søkerliste som CSV (semikolon, for norsk Excel). */
export function applicantsCsv(apps, jobs = []) {
  const jobTitle = Object.fromEntries((jobs || []).map((row) => [row.id, row.title]));
  const header = ['Navn', 'E-post', 'Telefon', 'Bosted', 'Stilling', 'Steg', 'Søkt', 'Kilde', 'Ansvarlig', 'Score', 'AI-match', 'Begrunnelse'];
  const rows = (apps || []).map((row) => [
    row.name, row.email, row.phone, row.location, jobTitle[row.jobId] || 'Åpen søknad', stageLabel(row.stage),
    formatNbDate(row.appliedAt), row.source, row.ownerName,
    row.scorecards?.length ? String(row.score).replace('.', ',') : '',
    row.ai?.match != null ? String(row.ai.match).replace('.', ',') : '',
    isClosedStage(row.stage) ? row.rejectReason : '',
  ]);
  return `\uFEFF${[header, ...rows].map((cols) => cols.map(csvCell).join(';')).join('\r\n')}`;
}

function median(values) {
  const list = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
}

function dayDiff(from, to) {
  const a = String(from || '').slice(0, 10);
  const b = String(to || '').slice(0, 10);
  if (!a || !b) return null;
  const ms = Date.UTC(...b.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)))
    - Date.UTC(...a.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

const FUNNEL = ['new', 'screening', 'interview', 'references', 'offer', 'hired'];

/** Høyeste steg søknaden har nådd (fra historikken og steget den står i nå). */
function reachedIndex(app) {
  const seen = [app.stage, ...(app.history || []).flatMap((row) => [row.from, row.to])];
  let best = 0;
  for (const stage of seen) {
    const index = FUNNEL.indexOf(stage);
    if (index > best) best = index;
  }
  // Takket nei har nådd tilbud.
  if (app.stage === 'declined') best = Math.max(best, FUNNEL.indexOf('offer'));
  return best;
}

/**
 * Nøkkeltall for rekrutteringen: tid til ansettelse, tid til besatt stilling,
 * tilbudsaksept, kilder og konvertering mellom stegene.
 */
export function recruitmentAnalytics(apps, jobs = []) {
  const list = apps || [];
  const hired = list.filter((row) => row.stage === 'hired');
  const timeToHire = median(hired.map((row) => dayDiff(row.appliedAt, row.closedAt)));
  const jobsById = Object.fromEntries((jobs || []).map((row) => [row.id, row]));
  const timeToFill = median(hired.map((row) => dayDiff(jobsById[row.jobId]?.publishedAt, row.closedAt)));
  const offered = list.filter((row) => row.stage === 'offer' || row.stage === 'declined' || row.stage === 'hired');
  const decided = list.filter((row) => row.stage === 'declined' || row.stage === 'hired');
  const offerAcceptance = decided.length ? Math.round((hired.length / decided.length) * 100) : null;
  const reached = FUNNEL.map((stage, index) => ({
    id: stage,
    label: stageLabel(stage),
    count: list.filter((row) => reachedIndex(row) >= index).length,
  }));
  const funnel = reached.map((row, index) => ({
    ...row,
    pct: index === 0 || !reached[0].count ? (reached[0].count ? 100 : 0) : Math.round((row.count / reached[0].count) * 100),
  }));
  const bySource = {};
  for (const row of list) {
    const key = row.source || 'Ukjent';
    bySource[key] = bySource[key] || { source: key, applicants: 0, hired: 0, interviewed: 0 };
    bySource[key].applicants += 1;
    if (row.stage === 'hired') bySource[key].hired += 1;
    if (reachedIndex(row) >= FUNNEL.indexOf('interview')) bySource[key].interviewed += 1;
  }
  const withdrawn = list.filter((row) => row.stage === 'withdrawn').length;
  return {
    total: list.length,
    hired: hired.length,
    offered: offered.length,
    timeToHire,
    timeToFill,
    offerAcceptance,
    withdrawn,
    funnel,
    sources: Object.values(bySource).sort((a, b) => b.hired - a.hired || b.applicants - a.applicants),
  };
}

/** Søknadsfristen: dager igjen (negativ når passert), eller null uten frist. */
export function deadlineDays(job, now = new Date()) {
  if (!job?.closesAt) return null;
  return dayDiff(localIsoDate(now), job.closesAt);
}
