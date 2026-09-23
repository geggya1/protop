/** Client helpers for lekseplan-import (AI-read, not timetable). */

import { resolveHomeworkSubjectId } from './homeworkModel.js';

const HOMEWORK_HINT_RE = /oppgave|les\s+(teksten|side|kap|\d+\s*min)|skriv|øv(e)?\b|gåte|gloser|arbeidsark|læringsmål|kapittel|innlever|forbered|hjemme(arbeid)?|rektors?\s+quiz|classroom|leksebok|kriterielisten/i;

const SUBJECT_LINE_RE = /^(norsk|matematikk|matte|regning|lesing|skriving|lese|engelsk|naturfag|samfunnsfag|kunst|musikk|kroppsøving|krle)\s*[:\\-–—|]/i;

const HUSK_RE = /husk|svømmetøy|gymtøy|gymsko|levering|postmappe|går på tur|klær etter vær/i;

export function isHomeworkFocus(value) {
  return String(value || '').trim().toLowerCase() === 'homework';
}

export function isHomeworkLikeSuggestion(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.kind === 'homework') return true;
  if (String(raw.category || '').toLowerCase() === 'lekser') return true;
  if (raw.kind === 'todo' && raw.type === 'once') return true;
  const title = String(raw.title || raw.subject || '').trim();
  const desc = String(raw.description || '').trim();
  const blob = `${title} ${desc}`;
  if (SUBJECT_LINE_RE.test(title)) return true;
  if (HOMEWORK_HINT_RE.test(blob)) return true;
  return false;
}

/**
 * Keep homework items and huskelapper; drop timetable slots and timed events.
 */
export function applyHomeworkFocusToSuggestions(suggestions = []) {
  const out = [];
  (suggestions || []).forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;

    const kind = raw.kind;
    const hasTime = !!(raw.time || raw.endTime);
    const title = String(raw.title || raw.subject || '').trim();
    const homeworkLike = isHomeworkLikeSuggestion(raw);
    const isHusk = raw.prepTask
      || raw.prepWhen
      || String(raw.category || '').toLowerCase() === 'gjøremål'
      || HUSK_RE.test(`${title} ${raw.description || ''}`);

    if (kind === 'schedule_slot' && hasTime && !homeworkLike) return;
    if (kind === 'event' && hasTime && !homeworkLike) return;
    if (kind === 'note') {
      out.push({ ...raw, selected: false });
      return;
    }

    if (!title) return;

    if (isHusk && !SUBJECT_LINE_RE.test(title) && !/^(norsk|matte|matematikk|regning|lesing|skriving|engelsk)\s*:/i.test(title)) {
      out.push({
        ...raw,
        kind: 'todo',
        title,
        type: 'once',
        category: 'gjøremål',
        time: null,
        endTime: null,
        recurrenceWeeks: null,
        prepTask: raw.prepTask === true || /svømme|gymtøy|gymsko|badetøy/i.test(title),
        prepWhen: raw.prepWhen || (/svømme|gymtøy|gymsko|badetøy/i.test(title) ? 'morning' : null),
        selected: raw.selected !== false,
        points: raw.points || 5,
      });
      return;
    }

    out.push({
      ...raw,
      kind: 'homework',
      title,
      subject: resolveHomeworkSubjectId(raw.subject, title),
      type: 'once',
      category: 'lekser',
      daysOfWeek: [],
      time: null,
      endTime: null,
      day: null,
      recurrenceWeeks: null,
      prepTask: false,
      prepWhen: null,
      selected: raw.selected !== false,
      points: null,
    });
  });
  return out;
}
