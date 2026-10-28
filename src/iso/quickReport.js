/**
 * Hurtigmelding av RUH og avvik fra telefon på byggeplass (ISO 45001 5.4 og 10.2).
 *
 * Tre trykk: type → hva skjedde (tekst eller tale) → send (foto er valgfritt).
 * Prosjektet fylles inn fra siste timeføring, og behandler velges ut fra rollene.
 * Resten (alvorlighet, konsekvens, årsak) tas i triage. Meldingen trenger ikke hele
 * ISO-tilstanden: bare oppsettet (roller og standarder) og en enkel skriving.
 * Uten nett legges meldingen i en lokal kø med fast id og sendes når nettet er tilbake.
 * Rene funksjoner: ingen React eller Firebase her.
 */
import { addDays, isoDate, newId, nextNumber, text, todayKey } from './core.js';
import { createFinding } from './findings.js';
import { autoAssignee, requirementIdsForFinding } from './integrations.js';

/** Typene i hurtigmeldingen. Store knapper; flere typer finnes i det fulle skjemaet. */
export const QUICK_TYPES = [
  { id: 'nestenulykke', label: 'RUH / nestenulykke', icon: 'warning-outline', hint: 'Noe som kunne gått galt' },
  { id: 'hms', label: 'Personskade', icon: 'medkit-outline', hint: 'Noen er skadet' },
  { id: 'miljo', label: 'Miljø', icon: 'leaf-outline', hint: 'Utslipp, søl eller avfall' },
  { id: 'prosess', label: 'Kvalitet', icon: 'construct-outline', hint: 'Feil i arbeid eller leveranse' },
  { id: 'forbedring', label: 'Forbedring', icon: 'bulb-outline', hint: 'Forslag til noe som kan bli bedre' },
];

export function quickTypeLabel(id) {
  return QUICK_TYPES.find((t) => t.id === id)?.label || 'Melding';
}

/** Tittel fra teksten: første linje eller setning, høyst 80 tegn. */
export function quickTitle(value, type = '') {
  const raw = text(value, 6000).replace(/\s+/g, ' ');
  if (!raw) return `${quickTypeLabel(type)} med foto`;
  // Setningsslutt: punktum, utrop eller spørsmål foran stor bokstav eller slutt. «3. etasje» er ikke slutt.
  let first = raw;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (!'.!?'.includes(c) || (c === '.' && /\d/.test(raw[i - 1] || ''))) continue;
    const rest = raw.slice(i + 1);
    if (!rest.trim() || /^\s+[A-ZÆØÅ]/.test(rest)) { first = raw.slice(0, i + 1); break; }
  }
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()} …` : first;
}

/**
 * Prosjektet personen førte timer på sist (de siste 45 dagene), hvis det fortsatt er aktivt.
 * Gir { id, label } eller null.
 */
export function lastProjectFromHours(timeEntries, employeeId, projects, now = new Date()) {
  const id = text(employeeId, 128);
  if (!id) return null;
  const from = addDays(todayKey(now), -45);
  const live = new Map((projects || [])
    .filter((p) => p?.id && !['arkivert', 'avsluttet'].includes(p.status))
    .map((p) => [p.id, p]));
  const mine = (timeEntries || [])
    .filter((e) => e && String(e.employeeId || '') === id && e.projectId && live.has(e.projectId))
    .filter((e) => (isoDate(e.date) || '') >= from)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  const hit = mine[0] ? live.get(mine[0].projectId) : null;
  return hit ? { id: hit.id, label: projectLabel(hit) } : null;
}

export function projectLabel(project) {
  return `${project?.number || ''} ${project?.name || ''}`.trim();
}

/** Vedlegg på saken (foto fra byggeplassen). Bare lenke og sti lagres. */
export function cleanAttachments(list) {
  return (Array.isArray(list) ? list : [])
    .map((a) => ({
      label: text(a?.label, 200) || 'Foto',
      url: text(a?.url, 2000),
      path: text(a?.path, 500),
      kind: a?.kind === 'fil' ? 'fil' : 'foto',
      at: text(a?.at, 40),
    }))
    .filter((a) => a.url)
    .slice(0, 6);
}

/**
 * Bygger saken fra hurtigmeldingen. id er fast (lokal kø): samme melding sendt to ganger gir én sak.
 * system = isoSystem/main (roller og standarder), slik at saken får behandler og krav uten hele tilstanden.
 */
export function buildQuickFinding(input, { actor, system = null, id = '', now = new Date() } = {}) {
  const type = QUICK_TYPES.some((t) => t.id === input?.type) ? input.type : '';
  if (!type) return { ok: false, error: 'Velg hva du melder.' };
  const description = text(input?.text, 6000);
  const attachments = cleanAttachments(input?.attachments);
  if (!description && !attachments.length) return { ok: false, error: 'Skriv eller si kort hva som skjedde, eller ta et bilde.' };
  const who = autoAssignee(system, type);
  const res = createFinding({
    type,
    title: quickTitle(description, type),
    description: description || 'Meldt med foto fra byggeplassen. Se bildet.',
    occurredAt: todayKey(now),
    projectId: text(input?.projectId, 120),
    projectName: text(input?.projectName, 200),
    location: text(input?.location, 300),
    injuryClass: type === 'hms' && input?.serious ? 'alvorlig' : '',
    assigneeName: who?.name || '',
    assigneeUid: who?.uid || '',
    requirementIds: requirementIdsForFinding({ system: system || {}, requirements: [] }, type),
    attachments,
    quick: true,
    anonymous: !!input?.anonymous,
    equipmentId: text(input?.equipmentId, 120),
    equipmentName: text(input?.equipmentName, 200),
  }, { actor, existing: [], now });
  if (!res.ok) return res;
  const finding = { ...res.finding, id: text(id, 120) || res.finding.id, number: nextNumber('AVV', [], now) };
  return { ...res, finding, events: res.events.map((e) => ({ ...e, entityId: finding.id })) };
}

/* ───────── Lokal kø (uten nett) ───────── */

export const QUEUE_MAX = 20;

/** Ny melding i køen: fast id, så den aldri blir to saker. */
export function queueItem(input, { actor, now = new Date() } = {}) {
  return {
    id: newId('avv'),
    queuedAt: now.toISOString(),
    actor: { uid: text(actor?.uid, 128), name: text(actor?.name, 160) },
    input: {
      type: text(input?.type, 40),
      text: text(input?.text, 6000),
      projectId: text(input?.projectId, 120),
      projectName: text(input?.projectName, 200),
      location: text(input?.location, 300),
      serious: !!input?.serious,
      anonymous: !!input?.anonymous,
      equipmentId: text(input?.equipmentId, 120),
      equipmentName: text(input?.equipmentName, 200),
      // Lokale bilder (fil-uri på telefon, data-url i nettleser) lastes opp når meldingen sendes.
      photos: (input?.photos || []).map((p) => ({ uri: text(p?.uri, 2_000_000), name: text(p?.name, 200) })).filter((p) => p.uri).slice(0, 2),
    },
    tries: 0,
    lastError: '',
  };
}

export function queueAdd(queue, item) {
  const rest = (queue || []).filter((q) => q?.id && q.id !== item.id);
  return [...rest, item].slice(-QUEUE_MAX);
}

export function queueRemove(queue, id) {
  return (queue || []).filter((q) => q?.id && q.id !== id);
}

export function queueFailed(queue, id, error) {
  return (queue || []).map((q) => (q.id === id ? { ...q, tries: (q.tries || 0) + 1, lastError: text(error, 300) } : q));
}

/**
 * Feil som betyr «ingen nett» (meldingen legges i kø), ikke «ikke lov» (vises til brukeren).
 * Firestore svarer «unavailable» eller «failed-precondition … offline»; ellers tidsavbrudd.
 */
export function isOfflineError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '').toLowerCase();
  if (code === 'permission-denied' || /permission|insufficient/.test(msg)) return false;
  return code === 'unavailable' || code === 'deadline-exceeded' || code === 'iso/offline'
    || /offline|network|failed to fetch|timeout|tidsavbrudd|unavailable/.test(msg);
}
