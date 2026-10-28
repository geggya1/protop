/**
 * Kalenderfil (iCalendar, RFC 5545) for et møte, så deltakerne kan legge det
 * i Outlook, Google eller Apple-kalenderen. Tidene er i Europe/Oslo.
 */
import { addDays, flatItems, invitees, minutesOf, clockFromMinutes, normalizeMeeting, text } from './model.js';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Oslo',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function paramText(value) {
  const clean = String(value ?? '').replace(/["\r\n]/g, '');
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

/** Bretter linjer på 75 oktetter uten å dele et UTF-8-tegn. */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + size > limit) {
      out.push(current);
      current = ch;
      bytes = size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.map((part, index) => (index ? ` ${part}` : part)).join('\r\n');
}

function local(date, clock) {
  return `${date.replace(/-/g, '')}T${clock.replace(':', '')}00`;
}

function utcStamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return safe.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const FREQ = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', quarterly: 'FREQ=MONTHLY;INTERVAL=3' };

/**
 * method: 'PUBLISH' (fil til nedlasting) eller 'REQUEST' (innkalling på e-post).
 * Gjentakelse tas bare med når `series` er satt, så hvert møte ellers står for seg.
 */
export function meetingIcs(input, { organizer = '', organizerEmail = '', method = 'PUBLISH', series = false, stamp = '' } = {}) {
  const m = normalizeMeeting(input);
  if (!m.date) return '';
  const start = m.start || '09:00';
  const end = m.end || clockFromMinutes((minutesOf(start) || 540) + 60);
  const endDate = (minutesOf(end) ?? 0) <= (minutesOf(start) ?? 0) ? addDays(m.date, 1) : m.date;
  const agenda = flatItems(m).map(({ number, item }) => `${number} ${item.title}`).join('\n');
  const description = [m.purpose, agenda ? `Dagsorden:\n${agenda}` : '', m.videoUrl ? `Videomøte: ${m.videoUrl}` : '']
    .filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProTop//Møter//NO',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${m.id}@protop.no`,
    `DTSTAMP:${utcStamp(stamp)}`,
    `DTSTART;TZID=Europe/Oslo:${local(m.date, start)}`,
    `DTEND;TZID=Europe/Oslo:${local(endDate, end)}`,
    `SUMMARY:${escapeText(m.number ? `${m.title} (møte ${m.number})` : m.title)}`,
  ];
  if (m.location) lines.push(`LOCATION:${escapeText(m.location)}`);
  if (m.videoUrl) lines.push(`URL:${escapeText(m.videoUrl)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (series && FREQ[m.recurrence.freq]) {
    lines.push(`RRULE:${FREQ[m.recurrence.freq]}${m.recurrence.until ? `;UNTIL=${m.recurrence.until.replace(/-/g, '')}T235959Z` : ''}`);
  }
  const chair = m.participants.find((p) => p.role === 'leder');
  const orgName = text(organizer) || chair?.name || '';
  const orgMail = text(organizerEmail) || chair?.email || '';
  if (orgMail) lines.push(`ORGANIZER;CN=${paramText(orgName || orgMail)}:mailto:${orgMail}`);
  for (const p of invitees(m)) {
    if (!p.email) continue;
    const status = p.attendance === 'forfall' ? 'DECLINED' : 'NEEDS-ACTION';
    lines.push(`ATTENDEE;CN=${paramText(p.name)};ROLE=${p.role === 'leder' ? 'CHAIR' : 'REQ-PARTICIPANT'};PARTSTAT=${status}:mailto:${p.email}`);
  }
  lines.push(`STATUS:${m.status === 'avlyst' ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(m.title)}`, 'TRIGGER:-PT15M', 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export function icsFileName(meeting) {
  const m = normalizeMeeting(meeting);
  return `${[m.title, m.date].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Møte'}.ics`;
}
