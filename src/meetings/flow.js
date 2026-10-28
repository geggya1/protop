/**
 * Livsløpet til et møte, som rene funksjoner. Hver overgang returnerer
 * { ok, error, meeting } og legger en linje i møtets logg.
 *
 *   utkast ──innkall──▶ innkalt ──start──▶ pågår ──ferdigstill──▶ ferdigstilt ──send──▶ sendt
 *      │                   │                 │                       │
 *      └──────avlys────────┴──────avlys──────┘                gjenåpne (ny revisjon)
 *
 * Ferdigstilt referat er låst. Retting skjer ved å gjenåpne, og neste ferdigstilling
 * får en ny revisjon. PDF-en til forrige revisjon blir liggende i historikken.
 */
import {
  agendaStats,
  attendanceCounts,
  chairOf,
  flatItems,
  invitees,
  isLocked,
  normalizeMeeting,
  secretaryOf,
  text,
} from './model.js';

function stamp(at) {
  return text(at) || new Date().toISOString();
}

function withLog(meeting, { at, by = '', byName = '' } = {}, line) {
  if (!line) return meeting;
  return { ...meeting, log: [...(meeting.log || []), { at: stamp(at), by, byName, text: line }].slice(-80) };
}

function done(meeting) {
  return { ok: true, error: null, meeting: normalizeMeeting(meeting) };
}

function fail(meeting, error) {
  return { ok: false, error, meeting };
}

/** Felt som kan endres mens møtet ikke er låst. */
export const EDITABLE_FIELDS = [
  'title', 'typeId', 'projectId', 'projectName', 'projectNumber', 'date', 'start', 'end',
  'location', 'videoUrl', 'purpose', 'visibility', 'chapters', 'participants', 'summary',
  'summarySource', 'nextDate', 'nextStart', 'nextLocation', 'recurrence',
];

/** Endrer et møte som ikke er låst. Bare felt i EDITABLE_FIELDS tas med. */
export function updateMeeting(meeting, patch, actor = {}) {
  const current = normalizeMeeting(meeting);
  if (isLocked(current)) {
    return fail(current, current.status === 'avlyst'
      ? 'Møtet er avlyst og kan ikke endres.'
      : 'Referatet er ferdigstilt. Gjenåpne det for å gjøre endringer.');
  }
  const next = { ...current };
  let changed = false;
  for (const key of EDITABLE_FIELDS) {
    if (!(key in (patch || {}))) continue;
    if (JSON.stringify(current[key]) === JSON.stringify(patch[key])) continue;
    next[key] = patch[key];
    changed = true;
  }
  if (!changed) return { ok: true, error: null, meeting: current, unchanged: true };
  next.updatedAt = stamp(actor.at);
  next.updatedBy = actor.by || current.updatedBy;
  return done(next);
}

/* ───────── Sjekker før overganger ───────── */

/** Hva som må være på plass før innkallingen sendes. */
export function invitationChecks(meeting) {
  const m = normalizeMeeting(meeting);
  const blocking = [];
  const warnings = [];
  if (!m.date) blocking.push({ id: 'date', text: 'Møtet mangler dato.' });
  if (!m.start) blocking.push({ id: 'start', text: 'Møtet mangler starttid.' });
  if (!flatItems(m).length) blocking.push({ id: 'agenda', text: 'Dagsordenen er tom.' });
  const people = invitees(m);
  if (!people.length) blocking.push({ id: 'participants', text: 'Ingen deltakere er lagt til.' });
  const noMail = people.filter((p) => !p.email);
  if (people.length && noMail.length === people.length) {
    blocking.push({ id: 'email', text: 'Ingen av deltakerne har e-post.' });
  } else if (noMail.length) {
    warnings.push({ id: 'email', text: `${noMail.length} deltaker${noMail.length === 1 ? '' : 'e'} mangler e-post og får ikke innkallingen.` });
  }
  if (!m.location && !m.videoUrl) warnings.push({ id: 'location', text: 'Sted eller videolenke er ikke satt.' });
  if (!chairOf(m)) warnings.push({ id: 'chair', text: 'Ingen møteleder er valgt.' });
  return { ok: !blocking.length, blocking, warnings };
}

/** Hva som må være på plass før referatet ferdigstilles. */
export function finalizeChecks(meeting) {
  const m = normalizeMeeting(meeting);
  const blocking = [];
  const warnings = [];
  const stats = agendaStats(m);
  if (!m.date) blocking.push({ id: 'date', text: 'Møtet mangler dato.' });
  if (!stats.items) blocking.push({ id: 'agenda', text: 'Dagsordenen er tom.' });
  if (!invitees(m).length) blocking.push({ id: 'participants', text: 'Ingen deltakere er lagt til.' });
  const att = attendanceCounts(m);
  if (invitees(m).length && !att.tilstede) {
    blocking.push({ id: 'attendance', text: 'Ingen er registrert som til stede.' });
  } else if (att.ukjent) {
    warnings.push({ id: 'attendance', text: `Oppmøte mangler for ${att.ukjent} deltaker${att.ukjent === 1 ? '' : 'e'}. De føres som «ikke registrert».` });
  }
  const empty = flatItems(m).filter(({ item }) => (
    !text(item.notes) && !item.decisions.length && !item.actions.length
  ));
  if (stats.items && empty.length === stats.items) {
    blocking.push({ id: 'notes', text: 'Ingen punkter har referat, beslutning eller oppfølging.' });
  } else if (empty.length) {
    warnings.push({
      id: 'notes',
      text: `${empty.length} punkt${empty.length === 1 ? '' : 'er'} står uten referat: ${empty.slice(0, 3).map((r) => r.number).join(', ')}${empty.length > 3 ? ` og ${empty.length - 3} til` : ''}.`,
    });
  }
  const noOwner = flatItems(m).flatMap(({ item }) => item.actions).filter((a) => !a.done && !a.assigneeName);
  if (noOwner.length) warnings.push({ id: 'owner', text: `${noOwner.length} oppfølgingspunkt${noOwner.length === 1 ? '' : 'er'} mangler ansvarlig.` });
  const noDue = flatItems(m).flatMap(({ item }) => item.actions).filter((a) => !a.done && !a.due);
  if (noDue.length) warnings.push({ id: 'due', text: `${noDue.length} oppfølgingspunkt${noDue.length === 1 ? '' : 'er'} mangler frist.` });
  if (!secretaryOf(m)) warnings.push({ id: 'secretary', text: 'Ingen referent er valgt.' });
  if (!text(m.summary)) warnings.push({ id: 'summary', text: 'Sammendrag mangler. Skriv selv eller la AI foreslå.' });
  return { ok: !blocking.length, blocking, warnings };
}

/* ───────── Overganger ───────── */

export function recordInvitation(meeting, { to = [], at = '', by = '', byName = '', channel = 'epost' } = {}) {
  const m = normalizeMeeting(meeting);
  if (isLocked(m)) return fail(m, 'Møtet er låst.');
  const recipients = to.map((row) => text(row).toLowerCase()).filter(Boolean);
  const again = m.deliveries.some((d) => d.kind === 'innkalling');
  const next = {
    ...m,
    status: m.status === 'utkast' ? 'innkalt' : m.status,
    deliveries: [...m.deliveries, { kind: 'innkalling', at: stamp(at), by, byName, to: recipients, channel }],
  };
  const line = channel === 'manuell'
    ? 'Markert som innkalt'
    : `${again ? 'Oppdatert innkalling' : 'Innkalling'} sendt til ${recipients.length} mottaker${recipients.length === 1 ? '' : 'e'}`;
  return done(withLog(next, { at, by, byName }, line));
}

export function startMeeting(meeting, actor = {}) {
  const m = normalizeMeeting(meeting);
  if (isLocked(m)) return fail(m, 'Møtet er låst.');
  if (m.status === 'pagar' && !m.endedAt) return done(m);
  const next = {
    ...m,
    status: 'pagar',
    startedAt: m.startedAt || stamp(actor.at),
    endedAt: '',
    // Alle som ikke har meldt forfall, regnes som til stede når møtet starter.
    participants: m.participants.map((p) => (
      p.role !== 'kopi' && p.attendance === 'ukjent' ? { ...p, attendance: 'tilstede' } : p
    )),
  };
  return done(withLog(next, actor, m.startedAt ? 'Møtet fortsatte' : 'Møtet startet'));
}

export function endMeeting(meeting, actor = {}) {
  const m = normalizeMeeting(meeting);
  if (m.status !== 'pagar') return fail(m, 'Møtet er ikke i gang.');
  return done(withLog({ ...m, endedAt: stamp(actor.at) }, actor, 'Møtet ble avsluttet'));
}

/** Låser referatet. Hver ferdigstilling får neste revisjon. */
export function finalizeMeeting(meeting, actor = {}) {
  const m = normalizeMeeting(meeting);
  if (isLocked(m)) return fail(m, m.status === 'avlyst' ? 'Møtet er avlyst.' : 'Referatet er allerede ferdigstilt.');
  const checks = finalizeChecks(m);
  if (!checks.ok) return { ...fail(m, checks.blocking[0].text), checks };
  const at = stamp(actor.at);
  const revision = (m.revision || 0) + 1;
  const next = {
    ...m,
    status: 'ferdigstilt',
    endedAt: m.endedAt || at,
    startedAt: m.startedAt || '',
    finalizedAt: at,
    finalizedBy: actor.by || '',
    finalizedByName: actor.byName || '',
    revision,
    reopenReason: '',
  };
  return { ...done(withLog(next, actor, revision > 1 ? `Referatet ble ferdigstilt (revisjon ${revision})` : 'Referatet ble ferdigstilt')), checks };
}

export function recordMinutesSent(meeting, { to = [], at = '', by = '', byName = '', channel = 'epost' } = {}) {
  const m = normalizeMeeting(meeting);
  if (!['ferdigstilt', 'sendt'].includes(m.status)) return fail(m, 'Ferdigstill referatet før det sendes.');
  const recipients = to.map((row) => text(row).toLowerCase()).filter(Boolean);
  const next = {
    ...m,
    status: 'sendt',
    deliveries: [...m.deliveries, {
      kind: 'referat', at: stamp(at), by, byName, to: recipients, channel, revision: m.revision,
    }],
  };
  const line = channel === 'manuell'
    ? 'Referatet markert som sendt'
    : `Referat sendt til ${recipients.length} mottaker${recipients.length === 1 ? '' : 'e'}`;
  return done(withLog(next, { at, by, byName }, line));
}

export function reopenMeeting(meeting, { reason = '', at = '', by = '', byName = '' } = {}) {
  const m = normalizeMeeting(meeting);
  if (!['ferdigstilt', 'sendt'].includes(m.status)) return fail(m, 'Bare ferdigstilte referat kan gjenåpnes.');
  const why = text(reason);
  if (why.length < 3) return fail(m, 'Skriv kort hvorfor referatet gjenåpnes.');
  const next = { ...m, status: 'pagar', reopenReason: why, endedAt: m.endedAt || stamp(at) };
  return done(withLog(next, { at, by, byName }, `Referatet ble gjenåpnet: ${why}`));
}

export function cancelMeeting(meeting, { reason = '', at = '', by = '', byName = '' } = {}) {
  const m = normalizeMeeting(meeting);
  if (isLocked(m)) return fail(m, 'Møtet er allerede låst.');
  const why = text(reason);
  const next = { ...m, status: 'avlyst', cancelledAt: stamp(at), cancelReason: why };
  return done(withLog(next, { at, by, byName }, why ? `Møtet ble avlyst: ${why}` : 'Møtet ble avlyst'));
}

/** Utkast og møter som aldri ble innkalt, kan slettes. Resten avlyses. */
export function canDeleteMeeting(meeting) {
  const m = normalizeMeeting(meeting);
  return m.status === 'utkast' && !m.deliveries.length;
}

/** Hovedknappen i møtet ut fra status: { id, label, icon } */
export function primaryAction(meeting) {
  const m = normalizeMeeting(meeting);
  switch (m.status) {
    case 'utkast': return { id: 'invite', label: 'Send innkalling', icon: 'paper-plane-outline' };
    case 'innkalt': return { id: 'start', label: 'Start møtet', icon: 'play' };
    case 'pagar': return m.endedAt
      ? { id: 'finalize', label: 'Ferdigstill referat', icon: 'lock-closed-outline' }
      : { id: 'end', label: 'Avslutt møtet', icon: 'stop-circle-outline' };
    case 'ferdigstilt': return { id: 'send', label: 'Send referat', icon: 'mail-outline' };
    case 'sendt': return { id: 'send', label: 'Send på nytt', icon: 'mail-outline' };
    default: return null;
  }
}

export function recordCancellationSent(meeting, { to = [], at = '', by = '', byName = '' } = {}) {
  const m = normalizeMeeting(meeting);
  if (m.status !== 'avlyst') return fail(m, 'Møtet er ikke avlyst.');
  const recipients = to.map((row) => text(row).toLowerCase()).filter(Boolean);
  const next = { ...m, deliveries: [...m.deliveries, { kind: 'avlysning', at: stamp(at), by, byName, to: recipients, channel: 'epost' }] };
  return done(withLog(next, { at, by, byName }, `Avlysning sendt til ${recipients.length} mottaker${recipients.length === 1 ? '' : 'e'}`));
}
