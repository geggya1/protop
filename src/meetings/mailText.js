/**
 * Forslag til emne og tekst for innkalling og referat på e-post.
 * Brukeren kan endre teksten før den sendes.
 */
import { flatItems, longDate, normalizeMeeting, shortDate, text, timeRange } from './model.js';

function signature({ senderName = '', companyName = '' } = {}) {
  return ['Vennlig hilsen', senderName, companyName].filter(Boolean).join('\n');
}

function numberPart(m) {
  return m.number ? ` (møte ${m.number})` : '';
}

export function invitationSubject(input) {
  const m = normalizeMeeting(input);
  const when = m.date ? ` – ${longDate(m.date)}${m.start ? ` ${timeRange(m.start)}` : ''}` : '';
  return `Innkalling: ${m.title}${numberPart(m)}${when}`;
}

export function invitationText(input, { senderName = '', companyName = '', update = false } = {}) {
  const m = normalizeMeeting(input);
  const lines = ['Hei,', ''];
  lines.push(update
    ? `Innkallingen til ${m.title}${numberPart(m)} er oppdatert.`
    : `Du er invitert til ${m.title}${numberPart(m)}.`);
  lines.push('');
  if (m.date) lines.push(`Tid: ${longDate(m.date)}${m.start ? `, ${timeRange(m.start, m.end)}` : ''}`);
  if (m.location) lines.push(`Sted: ${m.location}`);
  if (m.videoUrl) lines.push(`Video: ${m.videoUrl}`);
  if (m.purpose) lines.push('', m.purpose);
  const rows = flatItems(m);
  if (rows.length) {
    lines.push('', 'Dagsorden:');
    m.chapters.forEach((chapter, ci) => {
      if (!chapter.items.length) return;
      lines.push(`${ci + 1}. ${chapter.title}`);
      chapter.items.forEach((item, ii) => lines.push(`   ${ci + 1}.${ii + 1} ${item.title}`));
    });
  }
  lines.push('', 'Innkallingen ligger ved som PDF, sammen med en kalenderfil som legger møtet i kalenderen din.');
  lines.push('Gi beskjed om du ikke kan delta.');
  lines.push('', signature({ senderName, companyName }));
  return lines.join('\n');
}

export function minutesSubject(input) {
  const m = normalizeMeeting(input);
  const rev = m.revision > 1 ? ` (revisjon ${m.revision})` : '';
  return `Referat: ${m.title}${numberPart(m)}${m.date ? ` – ${shortDate(m.date)}` : ''}${rev}`;
}

export function minutesText(input, { senderName = '', companyName = '' } = {}) {
  const m = normalizeMeeting(input);
  const lines = ['Hei,', ''];
  lines.push(`Vedlagt er referatet fra ${m.title}${numberPart(m)}${m.date ? ` ${longDate(m.date)}` : ''}.`);
  if (m.revision > 1 && m.reopenReason) lines.push(`Referatet er rettet: ${m.reopenReason}`);
  if (text(m.summary)) lines.push('', 'Sammendrag:', m.summary);
  const open = flatItems(m).flatMap(({ number, item }) => item.actions.filter((a) => !a.done).map((a) => ({ ...a, number })));
  if (open.length) {
    lines.push('', 'Åpne oppfølgingspunkter:');
    for (const a of open.slice(0, 15)) {
      const meta = [a.assigneeName, a.due ? `frist ${shortDate(a.due)}` : ''].filter(Boolean).join(', ');
      lines.push(`- ${a.number} ${a.text}${meta ? ` (${meta})` : ''}`);
    }
    if (open.length > 15) lines.push(`… og ${open.length - 15} til i referatet.`);
  }
  if (m.nextDate) {
    lines.push('', `Neste møte: ${longDate(m.nextDate)}${m.nextStart ? ` ${timeRange(m.nextStart)}` : ''}${m.nextLocation ? `, ${m.nextLocation}` : ''}.`);
  }
  lines.push('', 'Merknader til referatet sendes til referenten innen en uke.');
  lines.push('', signature({ senderName, companyName }));
  return lines.join('\n');
}

export function cancelText(input, { reason = '', senderName = '', companyName = '' } = {}) {
  const m = normalizeMeeting(input);
  const lines = ['Hei,', '', `${m.title}${numberPart(m)}${m.date ? ` ${longDate(m.date)}` : ''} er avlyst.`];
  if (text(reason)) lines.push('', `Årsak: ${reason}`);
  lines.push('', signature({ senderName, companyName }));
  return lines.join('\n');
}
