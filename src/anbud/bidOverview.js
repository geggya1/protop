import { parseDeadline } from './noticeText.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Nedtelling til en frist, laget for store fristfelt.
 * tone: danger (utløpt / i dag), warn (≤ 7 dager), brand (≤ 14), ink (lenger), muted (mangler).
 */
export function deadlineCountdown(value, now = new Date()) {
  const date = parseDeadline(value);
  if (!date) {
    return { ok: false, passed: false, daysLeft: null, big: '–', unit: 'Ikke oppgitt', dateLabel: '', tone: 'muted' };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysLeft = Math.round((day - today) / 86400000);
  const time = date.getHours() || date.getMinutes() ? ` kl. ${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
  const dateLabel = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}${time}`;
  const passed = date.getTime() < now.getTime();
  if (passed) {
    return { ok: true, passed: true, daysLeft, big: 'Utløpt', unit: '', dateLabel, tone: 'danger' };
  }
  if (daysLeft <= 0) {
    return { ok: true, passed: false, daysLeft: 0, big: 'I dag', unit: '', dateLabel, tone: 'danger' };
  }
  const tone = daysLeft <= 7 ? 'warn' : daysLeft <= 14 ? 'brand' : 'ink';
  return {
    ok: true,
    passed: false,
    daysLeft,
    big: String(daysLeft),
    unit: daysLeft === 1 ? 'dag igjen' : 'dager igjen',
    dateLabel,
    tone,
  };
}

/** ISO- eller norsk frist som lesbar dato. Ukjent format vises som det er. */
export function formatDeadline(value) {
  const info = deadlineCountdown(value);
  return info.ok ? info.dateLabel : String(value || '');
}

const GROUPS = [
  { id: 'kunngjoring', name: 'Kunngjøring', test: (file) => file.source === 'kunngjøring' || /kunngj(ø|o)ring|notice/i.test(file.name) },
  { id: 'qa', name: 'Spørsmål, svar og rettelser', test: (file) => /sp(ø|o)rsm(å|a)l|svar|q\s*&\s*a|rettelse|tilleggsinfo|addend|clarif/i.test(file.name) },
  { id: 'kontrakt', name: 'Kontrakt', test: (file) => /kontrakt|avtale|contract|\bss[a-z]{1,2}\b|\bns\s?\d{4}/i.test(file.name) },
  { id: 'bilag', name: 'Bilag og vedlegg', test: (file) => /bilag|vedlegg|appendi|annex|attachment|del\s*[a-z0-9]\b/i.test(file.name) },
  { id: 'skjema', name: 'Skjema og maler', test: (file) => /skjema|egenerkl|espd|tilbudsbrev|mal\b|template|form\b|prisark/i.test(file.name) },
  { id: 'grunnlag', name: 'Konkurransegrunnlag', test: (file) => /konkurranse|grunnlag|invitasjon|tender|itt\b|rfp|beskrivelse|spesifikasjon/i.test(file.name) },
];

const OTHER = { id: 'andre', name: 'Andre dokumenter' };

// «Kap D2.01 …», «Kapittel C1 …»: grunnlag delt i kapitler (Statens vegvesen o.l.).
const CHAPTER = /^kap(?:ittel)?\.?\s*([A-H])\s*\d/i;

/** Mappen et nedlastet dokument hører hjemme i, ut fra navn og kilde. */
export function groundGroupFor(file) {
  const chapter = String(file?.name || '').match(CHAPTER)?.[1]?.toUpperCase();
  if (chapter) return { id: `kap-${chapter}`, name: `Kapittel ${chapter}` };
  return GROUPS.find((group) => group.test(file || {})) || OTHER;
}

const collator = typeof Intl !== 'undefined'
  ? new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' })
  : null;

// «Kap D2.01» og «Kapittel D0» sorteres på kapittelkoden, ikke på ordet foran.
function sortKey(name) {
  return String(name || '').replace(/^kap(?:ittel)?\.?\s*/i, '');
}

function byName(a, b) {
  const x = sortKey(a.name);
  const y = sortKey(b.name);
  return collator ? collator.compare(x, y) : x.localeCompare(y);
}

/**
 * Ordner nedlastede filer i en fast mappestruktur:
 * Kunngjøring → Konkurransegrunnlag → Bilag → Skjema → Kontrakt → Q&A → Andre.
 * Tomme mapper tas ikke med. Filene sorteres naturlig (Bilag 2 før Bilag 10).
 */
export function groundFileTree(files) {
  const buckets = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    const group = groundGroupFor(file);
    if (!buckets.has(group.id)) buckets.set(group.id, { ...group, files: [] });
    buckets.get(group.id).files.push(file);
  }
  const chapters = [...buckets.keys()].filter((id) => id.startsWith('kap-')).sort();
  return ['kunngjoring', 'grunnlag', ...chapters, 'bilag', 'skjema', 'kontrakt', 'qa', 'andre']
    .filter((id) => buckets.has(id))
    .map((id) => {
      const { test, ...group } = buckets.get(id);
      return { ...group, files: [...group.files].sort(byName) };
    });
}

/** Kort filtype til merkelapp: PDF, DOCX, XLSX … */
export function fileTypeLabel(file) {
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (ext) return ext.toUpperCase();
  const mime = String(file?.mimeType || '');
  if (mime.includes('pdf')) return 'PDF';
  if (mime.startsWith('image/')) return 'BILDE';
  if (mime.startsWith('text/')) return 'TXT';
  return 'FIL';
}

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MONTHS_SHORT = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];

/** «14. okt. 2026». Ukjent format vises som det er. */
export function shortDate(value) {
  const date = parseDeadline(value);
  if (!date) return String(value || '');
  return `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** «9. november 2026 kl. 11:00». */
export function longDate(value) {
  const date = parseDeadline(value);
  if (!date) return String(value || '');
  const time = date.getHours() || date.getMinutes() ? ` kl. ${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}${time}`;
}

/** Nedtelling til fristen i dager, timer, minutter og sekunder. */
export function countdownParts(value, now = new Date()) {
  const date = parseDeadline(value);
  if (!date) return { ok: false, passed: false, days: 0, hours: 0, minutes: 0, seconds: 0, dateLabel: '' };
  const total = Math.max(0, Math.floor((date.getTime() - now.getTime()) / 1000));
  return {
    ok: true,
    passed: total === 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    dateLabel: longDate(value),
  };
}

const OUTCOME = { kontrakt: 'Vunnet', tapt: 'Tapt', trukket: 'Trukket' };

/**
 * Konkurransens kalender: kunngjøring → spørsmålsfrist → tilbudsfrist → tildeling.
 * state: done (passert), current (neste som skjer), todo.
 */
export function competitionTimeline({ bid, dossier, notice } = {}, now = new Date()) {
  const stage = bid?.stage || '';
  const delivered = !!bid?.submittedAt || stage === 'levert' || stage === 'kontrakt';
  const manual = !bid?.noticeId;
  const passed = (value) => {
    const date = parseDeadline(value);
    return !!date && date.getTime() <= now.getTime();
  };
  const published = dossier?.published || notice?.publishedAt || '';
  const opened = manual ? (bid?.createdAt || '') : published;
  const submission = dossier?.submissionDeadline || bid?.deadline || '';
  const rows = [
    {
      id: 'kunngjort',
      label: manual ? 'Forespørsel' : 'Kunngjøring',
      value: opened,
      done: true,
    },
    {
      id: 'sporsmal',
      label: 'Spørsmålsfrist',
      value: dossier?.questionDeadline || '',
      done: passed(dossier?.questionDeadline),
      deadline: true,
    },
    {
      id: 'tilbud',
      label: 'Tilbudsfrist',
      value: submission,
      done: delivered || passed(submission),
      note: delivered ? 'Levert' : '',
      deadline: true,
    },
    {
      id: 'tildeling',
      label: 'Tildeling',
      value: OUTCOME[stage] ? (bid?.closedAt || '') : '',
      done: !!OUTCOME[stage],
      note: OUTCOME[stage] || '',
    },
  ];
  // Et steg uten dato er passert når et senere steg er det.
  for (let index = rows.length - 2; index >= 0; index -= 1) {
    if (rows[index + 1].done) rows[index].done = true;
  }
  const next = rows.findIndex((row) => !row.done);
  return rows.map(({ value, deadline, ...row }, index) => ({
    ...row,
    when: value ? shortDate(value) : (deadline ? 'Ikke oppgitt' : (row.done ? '' : 'Venter')),
    state: row.done ? 'done' : (index === next ? 'current' : 'todo'),
  }));
}

const WORK_DONE = new Set(['klart', 'levert']);

/** Hvor langt tilbudet er kommet: sjekkpunkt, skjema og forslag som venter. */
export function workProgress(bid) {
  const items = Array.isArray(bid?.workItems) ? bid.workItems : [];
  const forms = Array.isArray(bid?.forms) ? bid.forms : [];
  return {
    items: items.length,
    done: items.filter((row) => WORK_DONE.has(row.status)).length,
    forms: forms.length,
    formsDone: forms.filter((row) => row.status === 'ferdig').length,
    pending: Array.isArray(bid?.pendingWorkItems) ? bid.pendingWorkItems.length : 0,
    started: items.length + forms.length > 0,
  };
}

/**
 * Publiserte og egne spørsmål i én liste, nummerert i rekkefølge.
 * latest: de tre siste, nyeste først.
 */
export function qaOverview(dossier, bid) {
  const published = (Array.isArray(dossier?.qa) ? dossier.qa : []).map((row, index) => ({
    id: row.id || `publisert-${index}`,
    question: String(row.question || ''),
    answered: !!String(row.answer || '').trim(),
    when: row.published ? shortDate(row.published) : '',
    own: false,
  }));
  const own = (Array.isArray(bid?.questions) ? bid.questions : []).map((row) => ({
    id: row.id,
    question: String(row.question || ''),
    answered: !!String(row.answer || '').trim(),
    when: row.createdAt ? shortDate(row.createdAt) : '',
    own: true,
  }));
  const all = [...published, ...own].map((row, index) => ({ ...row, no: index + 1 }));
  return {
    total: all.length,
    answered: all.filter((row) => row.answered).length,
    latest: all.slice(-3).reverse(),
  };
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

function countLabel(count, one, many) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** Hvem som er med: ansvarlig først, så eiere av sjekkpunkt og oppgaver. */
export function bidTeam(bid) {
  const people = new Map();
  function add(id, name, kind) {
    const label = String(name || '').trim();
    if (!label) return;
    const key = String(id || '').trim() || label.toLowerCase();
    if (!people.has(key)) people.set(key, { id: key, name: label, lead: false, items: 0, tasks: 0 });
    const row = people.get(key);
    if (kind === 'lead') row.lead = true;
    else row[kind] += 1;
  }
  add(bid?.assignment?.personId, bid?.assignment?.personName, 'lead');
  for (const item of bid?.workItems || []) add(item.ownerId, item.ownerName, 'items');
  for (const task of bid?.tasks || []) add(task.ownerId, task.ownerName, 'tasks');
  return [...people.values()].map((row) => ({
    id: row.id,
    name: row.name,
    initials: initials(row.name),
    role: [
      row.lead ? 'Ansvarlig' : '',
      row.items ? countLabel(row.items, 'sjekkpunkt', 'sjekkpunkt') : '',
      row.tasks ? countLabel(row.tasks, 'oppgave', 'oppgaver') : '',
    ].filter(Boolean).join(' · '),
  }));
}
