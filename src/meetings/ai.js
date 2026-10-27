/**
 * AI i møter: foreslå dagsorden, rydde notater for et punkt og skrive sammendrag.
 * Alt går gjennom Cloud Function `aiMeeting` (Gemini). Svarer den ikke, lages et
 * lokalt forslag fra malbiblioteket og innholdet i møtet, merket engine: 'lokal'.
 */
import {
  agendaStats,
  attendanceCounts,
  flatItems,
  invitees,
  normalizeChapter,
  normalizeMeeting,
  shortDate,
  text,
} from './model.js';
import { agendaFromTemplate, bestTemplateFor, builtinTemplates, guessType, meetingType } from './templates.js';

const MAX_ITEM_MINUTES = 120;

function clampMinutes(value, fallback = 5) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_ITEM_MINUTES, n);
}

/** Skalerer varighetene så summen passer i møtelengden. */
export function fitAgenda(chapters, target) {
  const goal = Math.round(Number(target) || 0);
  const items = chapters.flatMap((c) => c.items);
  const sum = items.reduce((s, i) => s + (i.minutes || 0), 0);
  if (!goal || !sum || !items.length) return chapters;
  const factor = goal / sum;
  for (const item of items) item.minutes = Math.max(1, Math.round((item.minutes || 1) * factor));
  let total = items.reduce((s, i) => s + i.minutes, 0);
  const byLength = () => items.slice().sort((a, b) => b.minutes - a.minutes);
  while (total > goal && byLength()[0].minutes > 1) {
    byLength()[0].minutes -= 1;
    total -= 1;
  }
  return chapters;
}

/** Gjør et AI-svar om til gyldig dagsorden. Tomme kapitler og punkter fjernes. */
export function normalizeAgendaReply(raw = {}) {
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((chapter) => normalizeChapter({
      title: text(chapter?.title).slice(0, 120),
      items: (Array.isArray(chapter?.items) ? chapter.items : [])
        .map((item) => ({
          title: text(item?.title).slice(0, 160),
          description: String(item?.description ?? '').trim().slice(0, 1200),
          minutes: clampMinutes(item?.minutes),
        }))
        .filter((item) => item.title),
    }))
    .filter((chapter) => chapter.title && chapter.items.length)
    .slice(0, 12);
  return {
    title: text(raw.title).slice(0, 120),
    typeId: text(raw.typeId) || '',
    purpose: String(raw.purpose ?? '').trim().slice(0, 600),
    chapters,
  };
}

/** Lokal dagsorden: nærmeste mal, skalert til møtelengden. */
export function localAgenda({ description = '', typeId = '', minutes = 60, title = '' } = {}) {
  const type = typeId && typeId !== 'annet' ? typeId : guessType(description, title);
  const template = builtinTemplates().find((row) => row.typeId === type)
    || bestTemplateFor(description)
    || builtinTemplates().find((row) => row.typeId === 'kunde');
  const chapters = fitAgenda(agendaFromTemplate(template), minutes || template.durationMin);
  const firstLine = text(description).split(/[.\n]/)[0];
  return {
    title: text(title) || (firstLine && firstLine.length <= 60 ? firstLine : template.name),
    typeId: template.typeId,
    purpose: text(description),
    chapters,
    engine: 'lokal',
  };
}

function firstSentence(value, max = 180) {
  const clean = String(value || '').replace(/^\s*[-*]\s+/gm, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = clean.match(/^(.+?[.!?])(\s|$)/);
  const sentence = (m ? m[1] : clean).trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}

function lowerFirst(value) {
  const s = text(value);
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Lokalt sammendrag fra beslutninger, notater og åpne oppfølgingspunkter. */
export function localSummary(input) {
  const meeting = normalizeMeeting(input);
  const rows = flatItems(meeting);
  const att = attendanceCounts(meeting);
  const stats = agendaStats(meeting);
  const parts = [];
  parts.push(`${meetingType(meeting.typeId).label} med ${att.tilstede} av ${invitees(meeting).length} til stede. ${stats.items} saker ble behandlet.`);
  const decisions = rows.flatMap(({ item }) => item.decisions.map((d) => d.text)).filter(Boolean);
  if (decisions.length) {
    parts.push(`Beslutninger: ${decisions.slice(0, 4).map((d) => lowerFirst(d).replace(/\.$/, '')).join('; ')}.`);
  }
  const notes = rows
    .filter(({ item }) => text(item.notes))
    .map(({ item }) => firstSentence(item.notes))
    .filter(Boolean)
    .slice(0, 3);
  if (notes.length) parts.push(notes.join(' '));
  const open = rows.flatMap(({ item }) => item.actions.filter((a) => !a.done));
  if (open.length) {
    const first = open[0];
    const who = [first.assigneeName, first.due ? `frist ${shortDate(first.due)}` : ''].filter(Boolean).join(', ');
    parts.push(`${open.length} oppfølgingspunkt${open.length === 1 ? ' er' : 'er er'} åpne${open.length > 1 ? ', blant annet' : ':'} «${first.text}»${who ? ` (${who})` : ''}.`);
  } else if (stats.actions) {
    parts.push('Alle oppfølgingspunkter er utført.');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Lokal opprydding av notater: setninger på egne linjer og forslag fra stikkord. */
export function localTidyItem({ notes = '' } = {}) {
  const lines = String(notes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const decisions = [];
  const actions = [];
  const keep = [];
  for (const line of lines) {
    const clean = line.replace(/^[-*•]\s*/, '');
    const dec = clean.match(/^(?:besl(?:utning|uttet)?|vedtak|vedtatt)\s*[:-]\s*(.+)$/i);
    const act = clean.match(/^(?:aksjon|oppfølging|todo|oppgave)\s*[:-]\s*(.+)$/i);
    if (dec) decisions.push(dec[1].replace(/^./, (c) => c.toUpperCase()));
    else if (act) actions.push({ text: act[1].replace(/^./, (c) => c.toUpperCase()), assigneeName: '', due: '' });
    else keep.push(clean.replace(/^./, (c) => c.toUpperCase()).replace(/([^.!?:])$/, '$1.'));
  }
  return { notes: keep.join('\n'), decisions, actions, engine: 'lokal' };
}

/** Kompakt utdrag av møtet til AI-en (uten e-post og telefon). */
export function meetingForAi(input) {
  const m = normalizeMeeting(input);
  const name = (id) => m.participants.find((p) => p.id === id)?.name || '';
  return {
    title: m.title,
    type: meetingType(m.typeId).label,
    number: m.number || null,
    date: m.date,
    project: m.projectName,
    purpose: m.purpose.slice(0, 600),
    participants: m.participants.map((p) => ({ name: p.name, company: p.company, role: p.role, attendance: p.attendance })).slice(0, 40),
    items: flatItems(m).slice(0, 60).map(({ number, item }) => ({
      number,
      title: item.title,
      presenter: name(item.presenterId),
      notes: item.notes.slice(0, 1500),
      decisions: item.decisions.map((d) => d.text).slice(0, 10),
      actions: item.actions.map((a) => ({ text: a.text, assignee: a.assigneeName, due: a.due, done: a.done })).slice(0, 15),
    })),
  };
}

async function callAi(payload, timeout = 60000) {
  const { guardedCallable } = await import('../utils/guardedCallable.js');
  const data = await guardedCallable('aiMeeting', payload, { timeout, softFail: true });
  if (!data || data.ok === false) {
    const error = new Error(data?.error || 'AI svarte ikke.');
    error.rateLimited = !!data?.rateLimited;
    throw error;
  }
  return data;
}

/**
 * Foreslår dagsorden. Returnerer { title, typeId, purpose, chapters, engine, note }.
 * `companyId` brukes til bruksgrensen på serveren.
 */
export async function suggestAgenda({ description, typeId = '', minutes = 60, title = '', companyId = '', projectName = '' } = {}, { remote = true } = {}) {
  const fallback = () => localAgenda({ description, typeId, minutes, title });
  if (!remote) return fallback();
  try {
    const data = await callAi({
      action: 'agenda',
      familyId: companyId,
      description: text(description).slice(0, 2000),
      type: typeId ? meetingType(typeId).label : '',
      minutes: Math.round(Number(minutes) || 60),
      title: text(title).slice(0, 120),
      project: text(projectName).slice(0, 120),
    }, 90000);
    const reply = normalizeAgendaReply(data.agenda || data);
    if (!reply.chapters.length) throw new Error('Tomt svar');
    fitAgenda(reply.chapters, minutes);
    return {
      ...reply,
      title: reply.title || text(title),
      typeId: reply.typeId || typeId || guessType(description, title),
      purpose: reply.purpose || text(description),
      engine: data.engine || 'gemini',
    };
  } catch (error) {
    return { ...fallback(), note: error?.rateLimited ? error.message : 'AI svarte ikke. Forslaget er laget fra nærmeste møtemal.' };
  }
}

/** Sammendrag av gjennomført møte. Returnerer { summary, engine, note }. */
export async function summarizeMeeting(meeting, { companyId = '' } = {}, { remote = true } = {}) {
  if (!remote) return { summary: localSummary(meeting), engine: 'lokal' };
  try {
    const data = await callAi({ action: 'summary', familyId: companyId, meeting: meetingForAi(meeting) }, 90000);
    const summary = String(data.summary || '').trim();
    if (!summary) throw new Error('Tomt svar');
    return { summary: summary.slice(0, 3000), engine: data.engine || 'gemini' };
  } catch (error) {
    return { summary: localSummary(meeting), engine: 'lokal', note: error?.rateLimited ? error.message : 'AI svarte ikke. Sammendraget er laget lokalt fra beslutninger og notater.' };
  }
}

/**
 * Rydder stikkordsnotater for ett punkt til ferdig referattekst og foreslår
 * beslutninger og oppfølgingspunkter. Returnerer { notes, decisions, actions, engine }.
 */
export async function tidyItemNotes({ meeting, itemId, companyId = '' }, { remote = true } = {}) {
  const m = normalizeMeeting(meeting);
  const row = flatItems(m).find((r) => r.item.id === itemId);
  if (!row) return { notes: '', decisions: [], actions: [], engine: 'lokal' };
  const local = () => localTidyItem({ notes: row.item.notes });
  if (!remote || !text(row.item.notes)) return local();
  try {
    const data = await callAi({
      action: 'item',
      familyId: companyId,
      meeting: { title: m.title, type: meetingType(m.typeId).label, participants: m.participants.map((p) => p.name).slice(0, 40) },
      item: { number: row.number, title: row.item.title, description: row.item.description.slice(0, 800), notes: row.item.notes.slice(0, 4000) },
    }, 60000);
    return {
      notes: String(data.notes || '').trim().slice(0, 4000) || row.item.notes,
      decisions: (Array.isArray(data.decisions) ? data.decisions : []).map((d) => text(d)).filter(Boolean).slice(0, 8),
      actions: (Array.isArray(data.actions) ? data.actions : []).map((a) => ({
        text: text(a?.text).slice(0, 300),
        assigneeName: text(a?.assignee).slice(0, 80),
        due: /^\d{4}-\d{2}-\d{2}$/.test(text(a?.due)) ? text(a.due) : '',
      })).filter((a) => a.text).slice(0, 8),
      engine: data.engine || 'gemini',
    };
  } catch (error) {
    return { ...local(), note: error?.rateLimited ? error.message : 'AI svarte ikke. Notatene er ryddet lokalt.' };
  }
}
