/**
 * Handlingene i et møte med sideeffekter (lagring, PDF, e-post, kalender).
 * Hver handling tar ctx og returnerer { meeting, message }. Feil kastes med
 * en melding brukeren kan lese.
 *
 * ctx = { store, company: { name, orgNr }, logo, viewer: { uid, name, email }, meetings }
 */
import {
  cancelMeeting,
  endMeeting,
  finalizeMeeting,
  invitationChecks,
  recordCancellationSent,
  recordInvitation,
  recordMinutesSent,
  reopenMeeting,
  startMeeting,
} from '../../src/meetings/flow';
import {
  createMeetingId,
  nextMeetingFrom,
  nextSeriesNumber,
  normalizeMeeting,
  text,
} from '../../src/meetings/model';
import { buildMinutesPdf } from '../../src/meetings/minutesPdf';
import { minutesFileName } from '../../src/meetings/minutesDoc';
import { icsFileName, meetingIcs } from '../../src/meetings/ics';
import { friendlyCallError } from '../../src/meetings/storage';

export function actorOf(ctx) {
  return { by: ctx.viewer?.uid || '', byName: ctx.viewer?.name || '', at: new Date().toISOString() };
}

function must(result) {
  if (!result.ok) throw new Error(result.error);
  return result.meeting;
}

/** ctx.base er versjonen som sist ble lagret herfra. Den brukes til å slå sammen samtidige endringer. */
async function save(ctx, meeting) {
  const base = ctx.base && ctx.base.id === meeting.id ? ctx.base : null;
  const saved = await ctx.store.saveMeeting(meeting, base);
  if (!ctx.base || ctx.base.id === saved.id) ctx.base = saved;
  return saved;
}

export function pdfFor(ctx, meeting, kind = 'referat') {
  return buildMinutesPdf(meeting, { kind, company: ctx.company, logo: ctx.logo });
}

function sendFailure(error) {
  return new Error(friendlyCallError(error, 'E-posten ble ikke sendt.'));
}

/** Nytt møte (utkast). */
export async function createMeeting(ctx, draft) {
  const actor = actorOf(ctx);
  const meeting = normalizeMeeting({
    ...draft,
    id: draft.id || createMeetingId(),
    status: 'utkast',
    createdAt: actor.at,
    createdBy: actor.by,
    createdByName: actor.byName,
    log: [{ at: actor.at, by: actor.by, byName: actor.byName, text: draft.number ? `Møte ${draft.number} ble opprettet` : 'Møtet ble opprettet' }],
  });
  const saved = await save(ctx, meeting);
  return { meeting: saved, message: 'Møtet er opprettet som utkast.' };
}

/** Neste møte i serien fra et tidligere møte. */
export async function createNext(ctx, previous) {
  const actor = actorOf(ctx);
  let seriesId = previous.seriesId;
  let prev = previous;
  if (!seriesId) {
    // Første gang et enkeltmøte får en oppfølger: begge blir en serie.
    seriesId = createMeetingId('serie');
    prev = normalizeMeeting({ ...previous, seriesId, number: previous.number || 1 });
    await save(ctx, prev);
  }
  const number = nextSeriesNumber(ctx.meetings || [], seriesId) || (prev.number || 0) + 1;
  const draft = nextMeetingFrom(prev, { number: Math.max(number, (prev.number || 0) + 1), ...actor });
  const saved = await save(ctx, { ...draft, id: createMeetingId(), seriesId });
  return { meeting: saved, message: `Møte ${saved.number} er opprettet. Åpne oppfølgingspunkter er tatt med.` };
}

/**
 * Sender innkalling. options = { to, subject, text, attachPdf, attachIcs, calendar, manual }
 */
export async function invite(ctx, meeting, options) {
  const checks = invitationChecks(meeting);
  if (!checks.ok) throw new Error(checks.blocking[0].text);
  const actor = actorOf(ctx);
  let saved = await save(ctx, meeting);
  let to = options.to || [];
  if (!options.manual) {
    const files = [];
    if (options.attachPdf) files.push({ name: minutesFileName(saved, 'innkalling'), mime: 'application/pdf', bytes: pdfFor(ctx, saved, 'innkalling') });
    if (options.attachIcs) {
      const ics = meetingIcs(saved, { organizer: ctx.viewer?.name, organizerEmail: ctx.viewer?.email, method: 'PUBLISH' });
      files.push({ name: icsFileName(saved), mime: 'text/calendar', bytes: new TextEncoder().encode(ics) });
    }
    let result;
    try {
      result = await ctx.store.sendMail({
        meetingId: saved.id,
        kind: 'innkalling',
        to,
        subject: options.subject,
        text: options.text,
        replyTo: ctx.viewer?.email,
        fromName: [ctx.viewer?.name, ctx.company?.name].filter(Boolean).join(' – '),
        files,
      });
    } catch (error) {
      throw sendFailure(error);
    }
    if (result && result.ok === false) throw new Error(result.error || 'E-posten ble ikke sendt.');
    to = result?.to || to;
  }
  saved = must(recordInvitation(saved, { to, ...actor, channel: options.manual ? 'manuell' : 'epost' }));
  let calendarNote = '';
  if (options.calendar) {
    try {
      await ctx.store.syncCalendar(saved);
      saved = normalizeMeeting({ ...saved, calendar: true });
    } catch {
      calendarNote = ' Møtet kom ikke i kalenderen. Prøv igjen senere.';
    }
  }
  saved = await save(ctx, saved);
  const message = options.manual
    ? 'Møtet er markert som innkalt.'
    : `Innkallingen er sendt til ${to.length} ${to.length === 1 ? 'deltaker' : 'deltakere'}.${calendarNote}`;
  return { meeting: saved, message };
}

export async function start(ctx, meeting) {
  const saved = await save(ctx, must(startMeeting(meeting, actorOf(ctx))));
  return { meeting: saved, message: 'Møtet er i gang. Notatene lagres mens du skriver.' };
}

export async function end(ctx, meeting) {
  const saved = await save(ctx, must(endMeeting(meeting, actorOf(ctx))));
  return { meeting: saved, message: 'Møtet er avsluttet. Se over referatet og ferdigstill det.' };
}

/** Låser referatet, lager PDF og arkiverer den. */
export async function finalize(ctx, meeting) {
  const actor = actorOf(ctx);
  const result = finalizeMeeting(meeting, actor);
  if (!result.ok) throw new Error(result.error);
  let locked = result.meeting;
  let archiveNote = '';
  try {
    const bytes = pdfFor(ctx, locked, 'referat');
    const file = await ctx.store.archiveFile(locked.id, minutesFileName(locked, 'referat'), bytes, 'application/pdf');
    locked = normalizeMeeting({ ...locked, archive: [...locked.archive, { ...file, revision: locked.revision }] });
  } catch {
    archiveNote = ' PDF-en ble ikke arkivert, men kan lastes ned.';
  }
  const saved = await save(ctx, locked);
  return { meeting: saved, message: `Referatet er ferdigstilt og låst.${archiveNote}` };
}

/** Sender ferdigstilt referat. options = { to, subject, text, manual } */
export async function sendMinutes(ctx, meeting, options) {
  const actor = actorOf(ctx);
  let to = options.to || [];
  if (!options.manual) {
    const archived = meeting.archive.find((row) => row.revision === meeting.revision && row.storagePath);
    const file = archived
      ? { name: archived.name, mime: 'application/pdf', storagePath: archived.storagePath, url: archived.url }
      : { name: minutesFileName(meeting, 'referat'), mime: 'application/pdf', bytes: pdfFor(ctx, meeting, 'referat') };
    let result;
    try {
      result = await ctx.store.sendMail({
        meetingId: meeting.id,
        kind: 'referat',
        to,
        subject: options.subject,
        text: options.text,
        replyTo: ctx.viewer?.email,
        fromName: [ctx.viewer?.name, ctx.company?.name].filter(Boolean).join(' – '),
        files: [file],
      });
    } catch (error) {
      throw sendFailure(error);
    }
    if (result && result.ok === false) throw new Error(result.error || 'E-posten ble ikke sendt.');
    to = result?.to || to;
  }
  const saved = await save(ctx, must(recordMinutesSent(meeting, { to, ...actor, channel: options.manual ? 'manuell' : 'epost' })));
  return {
    meeting: saved,
    message: options.manual ? 'Referatet er markert som sendt.' : `Referatet er sendt til ${to.length} ${to.length === 1 ? 'mottaker' : 'mottakere'}.`,
  };
}

export async function reopen(ctx, meeting, reason) {
  const saved = await save(ctx, must(reopenMeeting(meeting, { reason, ...actorOf(ctx) })));
  return { meeting: saved, message: 'Referatet er åpnet for retting. Neste ferdigstilling får ny revisjon.' };
}

/** Avlyser. options = { reason, notify, to, text } */
export async function cancel(ctx, meeting, options = {}) {
  const actor = actorOf(ctx);
  let saved = await save(ctx, must(cancelMeeting(meeting, { reason: options.reason, ...actor })));
  await ctx.store.syncCalendar(saved).catch(() => {});
  if (options.notify && (options.to || []).length) {
    try {
      const result = await ctx.store.sendMail({
        meetingId: saved.id,
        kind: 'avlysning',
        to: options.to,
        subject: `Avlyst: ${saved.title}`,
        text: options.text,
        replyTo: ctx.viewer?.email,
        fromName: [ctx.viewer?.name, ctx.company?.name].filter(Boolean).join(' – '),
      });
      saved = await save(ctx, must(recordCancellationSent(saved, { to: result?.to || options.to, ...actor })));
    } catch (error) {
      return { meeting: saved, message: `Møtet er avlyst, men e-posten ble ikke sendt: ${friendlyCallError(error)}` };
    }
  }
  return { meeting: saved, message: 'Møtet er avlyst.' };
}

export async function remove(ctx, meeting) {
  await ctx.store.deleteMeeting(meeting.id);
  return { meeting: null, message: 'Utkastet er slettet.' };
}

/** Kalenderfil til nedlasting. */
export function icsBytes(ctx, meeting) {
  const ics = meetingIcs(meeting, { organizer: ctx.viewer?.name, organizerEmail: ctx.viewer?.email });
  return text(ics) ? new TextEncoder().encode(ics) : null;
}
