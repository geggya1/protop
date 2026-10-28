/**
 * Innholdet i referatet og innkallingen som en ren struktur.
 * Forhåndsvisningen i appen og PDF-en bygger på den samme strukturen,
 * så det brukeren ser på skjermen er det som sendes.
 */
import {
  ATTENDANCE,
  agendaStats,
  attendanceCounts,
  chairOf,
  flatItems,
  invitees,
  itemSchedule,
  longDate,
  normalizeMeeting,
  roleLabel,
  secretaryOf,
  shortDate,
  text,
  timeRange,
} from './model.js';
import { meetingType } from './templates.js';

function stampDate(iso) {
  const raw = text(iso);
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
  return `${day} kl. ${time.replace(':', '.')}`;
}

function dueLabel(iso) {
  return iso ? shortDate(iso) : '';
}

export function meetingSubtitle(meeting) {
  const m = meeting;
  const type = meetingType(m.typeId).label;
  const parts = [type];
  if (m.number) parts.push(`Møte nr. ${m.number}`);
  if (m.projectName) parts.push(m.projectNumber ? `${m.projectNumber} ${m.projectName}` : m.projectName);
  return parts.join(' · ');
}

export function attendanceShort(id, role) {
  if (role === 'kopi') return 'K';
  return ATTENDANCE.find((row) => row.id === id)?.short || '–';
}

/**
 * kind: 'referat' | 'innkalling'
 * company: { name, orgNr }
 */
export function minutesDocument(input, { kind = 'referat', company = {} } = {}) {
  const meeting = normalizeMeeting(input);
  const minutes = kind === 'referat';
  const schedule = itemSchedule(meeting);
  const presenter = (id) => meeting.participants.find((p) => p.id === id)?.name || '';
  const chair = chairOf(meeting);
  const secretary = secretaryOf(meeting);
  const draft = minutes && !['ferdigstilt', 'sendt'].includes(meeting.status);

  const facts = [
    { label: 'Dato', value: meeting.date ? longDate(meeting.date) : 'Ikke satt' },
    { label: 'Tid', value: timeRange(meeting.start, meeting.end) || 'Ikke satt' },
    { label: 'Sted', value: meeting.location || (meeting.videoUrl ? 'Videomøte' : 'Ikke satt') },
    { label: 'Møteleder', value: chair?.name || '–' },
    { label: 'Referent', value: secretary?.name || '–' },
  ];
  if (minutes) {
    facts.push({
      label: 'Status',
      value: draft
        ? 'Utkast'
        : `Ferdigstilt ${stampDate(meeting.finalizedAt)}${meeting.revision > 1 ? ` · rev. ${meeting.revision}` : ''}`,
    });
  } else if (meeting.videoUrl) {
    facts.push({ label: 'Video', value: meeting.videoUrl });
  }

  const participants = (minutes ? meeting.participants : invitees(meeting).concat(
    meeting.participants.filter((p) => p.role === 'kopi'),
  )).map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    title: p.title,
    role: roleLabel(p.role),
    roleId: p.role,
    email: p.email,
    phone: p.phone,
    mark: attendanceShort(p.attendance, p.role),
    attendance: p.attendance,
  }));

  const sections = meeting.chapters
    .map((chapter, ci) => ({
      id: chapter.id,
      number: String(ci + 1),
      title: chapter.title || `Kapittel ${ci + 1}`,
      items: chapter.items.map((item, ii) => ({
        id: item.id,
        number: `${ci + 1}.${ii + 1}`,
        title: item.title || 'Uten tittel',
        presenter: presenter(item.presenterId),
        minutes: item.minutes,
        start: schedule[item.id] || '',
        description: item.description,
        notes: minutes ? item.notes : '',
        decisions: minutes ? item.decisions.map((d) => d.text) : [],
        actions: item.actions.map((a) => ({
          id: a.id,
          text: a.text,
          assignee: a.assigneeName,
          due: dueLabel(a.due),
          dueIso: a.due,
          done: a.done,
          origin: a.originNumber && a.originMeetingId !== meeting.id ? `Fra møte ${a.originNumber}` : '',
        })),
        carried: item.carried,
      })),
    }))
    .filter((section) => section.items.length);

  const actions = flatItems(meeting).flatMap(({ item, number }) => item.actions.map((a) => ({
    id: a.id,
    itemNumber: number,
    text: a.text,
    assignee: a.assigneeName,
    due: dueLabel(a.due),
    dueIso: a.due,
    done: a.done,
    origin: a.originNumber && a.originMeetingId !== meeting.id ? `Fra møte ${a.originNumber}` : '',
  }))).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueIso || '9999').localeCompare(b.dueIso || '9999'));

  const stats = agendaStats(meeting);
  const att = attendanceCounts(meeting);
  const keyline = minutes
    ? [
      `${att.tilstede} av ${invitees(meeting).length} til stede`,
      `${stats.decisions} beslutning${stats.decisions === 1 ? '' : 'er'}`,
      `${stats.openActions} åpne oppfølgingspunkt${stats.openActions === 1 ? '' : 'er'}`,
    ].join(' · ')
    : [
      `${stats.items} punkt${stats.items === 1 ? '' : 'er'} på dagsordenen`,
      stats.minutes ? `ca. ${stats.minutes} min` : '',
    ].filter(Boolean).join(' · ');

  const next = meeting.nextDate
    ? [longDate(meeting.nextDate), meeting.nextStart ? timeRange(meeting.nextStart) : '', meeting.nextLocation].filter(Boolean).join(', ')
    : '';

  const docTitle = minutes ? 'Referat' : 'Innkalling';
  const company_ = text(company.name);
  return {
    kind,
    draft,
    label: minutes ? 'REFERAT' : 'INNKALLING',
    docTitle,
    title: meeting.title,
    subtitle: meetingSubtitle(meeting),
    company: company_,
    orgNr: text(company.orgNr),
    facts,
    keyline,
    purpose: meeting.purpose,
    summary: minutes ? meeting.summary : '',
    participants,
    legend: minutes
      ? 'T = Til stede · F = Meldt forfall · IM = Ikke møtt · K = Kopi av referat'
      : 'K = Får kopi av referatet',
    sections,
    actions,
    next,
    videoUrl: meeting.videoUrl,
    revision: meeting.revision,
    reopenReason: meeting.reopenReason,
    footerLeft: [company_, `${docTitle}: ${meeting.title}${meeting.number ? ` nr. ${meeting.number}` : ''}`].filter(Boolean).join(' · '),
  };
}

export function minutesFileName(meeting, kind = 'referat') {
  const m = normalizeMeeting(meeting);
  const base = [
    kind === 'referat' ? 'Referat' : 'Innkalling',
    m.title,
    m.number ? `nr ${m.number}` : '',
    m.date,
    kind === 'referat' && m.revision > 1 ? `rev${m.revision}` : '',
  ].filter(Boolean).join(' ');
  return `${base.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()}.pdf`;
}

/** Ren tekst til e-post. */
export function minutesPlainText(input, { kind = 'referat', company = {} } = {}) {
  const doc = minutesDocument(input, { kind, company });
  const lines = [];
  lines.push(`${doc.docTitle}: ${doc.title}`);
  lines.push(doc.subtitle);
  lines.push('');
  for (const fact of doc.facts) lines.push(`${fact.label}: ${fact.value}`);
  if (doc.summary) {
    lines.push('', 'Sammendrag', doc.summary);
  }
  if (doc.purpose && kind !== 'referat') {
    lines.push('', 'Formål', doc.purpose);
  }
  lines.push('', kind === 'referat' ? 'Saker' : 'Dagsorden');
  for (const section of doc.sections) {
    lines.push(`${section.number}. ${section.title}`);
    for (const item of section.items) {
      const meta = [item.start ? `kl. ${item.start.replace(':', '.')}` : '', item.presenter].filter(Boolean).join(', ');
      lines.push(`  ${item.number} ${item.title}${meta ? ` (${meta})` : ''}`);
      if (kind === 'referat') {
        for (const d of item.decisions) lines.push(`     Beslutning: ${d}`);
      }
    }
  }
  if (kind === 'referat' && doc.actions.some((a) => !a.done)) {
    lines.push('', 'Oppfølging');
    for (const a of doc.actions.filter((row) => !row.done)) {
      lines.push(`  ${a.itemNumber} ${a.text}${a.assignee ? ` – ${a.assignee}` : ''}${a.due ? `, frist ${a.due}` : ''}`);
    }
  }
  if (doc.next) lines.push('', `Neste møte: ${doc.next}`);
  return lines.join('\n');
}
