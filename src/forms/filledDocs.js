/**
 * Utfylte dokumenter fra Skjemabygger og malbiblioteket.
 * Hvert dokument er et øyeblikksbilde av malen med svarene, slik at senere endringer
 * i malen ikke endrer det som allerede er fylt ut og signert.
 */
import {
  coerceAnswer,
  emptyAnswer,
  formProgress,
  normalizeBuilderField,
  normalizeDocInfo,
  normalizeSettings,
} from '../anbud/formBuilder.js';

export const FILLED_STATUSES = [
  { id: 'utkast', label: 'Under utfylling' },
  { id: 'ferdig', label: 'Ferdig' },
];

const MAX_FIELDS = 120;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function newFilledId() {
  return `dok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function actorOf(actor) {
  return { uid: text(actor?.uid, 128), name: text(actor?.name, 120) };
}

function normalizeSubject(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const kind = ['employee', 'project', 'customer'].includes(src.kind) ? src.kind : '';
  if (!kind) return null;
  return { kind, id: text(src.id, 80), name: text(src.name, 160) };
}

export function normalizeFilledDoc(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id, 60);
  const title = text(raw.title, 120);
  if (!id || !title) return null;
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).map(normalizeBuilderField).filter(Boolean).slice(0, MAX_FIELDS);
  if (!fields.length) return null;
  return {
    id,
    templateId: text(raw.templateId, 60),
    libraryKey: text(raw.libraryKey, 60),
    scope: raw.scope === 'hr' ? 'hr' : 'skjema',
    title,
    intro: text(raw.intro, 400),
    number: text(raw.number, 40),
    doc: normalizeDocInfo(raw.doc),
    settings: normalizeSettings(raw.settings),
    fields,
    status: raw.status === 'ferdig' ? 'ferdig' : 'utkast',
    subject: normalizeSubject(raw.subject),
    createdAt: text(raw.createdAt, 40),
    createdBy: actorOf(raw.createdBy),
    updatedAt: text(raw.updatedAt, 40),
    updatedBy: actorOf(raw.updatedBy),
    completedAt: text(raw.completedAt, 40),
    completedBy: actorOf(raw.completedBy),
  };
}

/** Nytt dokument fra en mal. Låste felt beholder den faste teksten, resten starter tomt. */
export function newFilledDoc(form, { actor = null, subject = null, scope = 'skjema', now = new Date() } = {}) {
  const at = now.toISOString();
  return normalizeFilledDoc({
    id: newFilledId(),
    templateId: form?.id || '',
    libraryKey: form?.libraryKey || '',
    scope,
    title: form?.title || 'Dokument',
    intro: form?.intro || '',
    doc: form?.doc,
    settings: form?.settings,
    fields: (form?.fields || []).map((field) => ({
      ...field,
      value: field.editor === 'fast' ? field.value : emptyAnswer(field.kind),
    })),
    status: 'utkast',
    subject,
    createdAt: at,
    createdBy: actor,
    updatedAt: at,
    updatedBy: actor,
  });
}

export function setFilledValue(doc, fieldId, value, { actor = null, now = new Date() } = {}) {
  if (!doc || doc.status === 'ferdig') return doc;
  return {
    ...doc,
    updatedAt: now.toISOString(),
    updatedBy: actorOf(actor),
    fields: doc.fields.map((field) => (field.id === fieldId && field.editor !== 'fast'
      ? { ...field, value: coerceAnswer(field.kind, value) }
      : field)),
  };
}

export function filledProgress(doc) {
  return formProgress(doc?.fields || []);
}

/** Merk som ferdig. Obligatoriske felt må være fylt ut. */
export function completeFilledDoc(doc, { actor = null, now = new Date() } = {}) {
  const progress = filledProgress(doc);
  if (!progress.ready) {
    const names = doc.fields.filter((field) => progress.missing.includes(field.id)).map((field) => field.label);
    return { ok: false, error: `Fyll ut ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` og ${names.length - 3} til` : ''}.`, missing: progress.missing };
  }
  const at = now.toISOString();
  return {
    ok: true,
    doc: { ...doc, status: 'ferdig', completedAt: at, completedBy: actorOf(actor), updatedAt: at, updatedBy: actorOf(actor) },
  };
}

export function reopenFilledDoc(doc, { actor = null, now = new Date() } = {}) {
  return { ...doc, status: 'utkast', completedAt: '', completedBy: actorOf(null), updatedAt: now.toISOString(), updatedBy: actorOf(actor) };
}

/** Kort tekst til lister: hvor langt dokumentet har kommet. */
export function filledLine(doc) {
  if (!doc) return '';
  const progress = filledProgress(doc);
  const status = doc.status === 'ferdig' ? 'Ferdig' : `${progress.filled} av ${progress.total} felt`;
  const who = doc.subject?.name ? ` · ${doc.subject.name}` : '';
  return `${status}${who}`;
}

export function sortFilled(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/** Dokumenter som hører til en mal (installert mal eller bibliotekmal). */
export function filledForTemplate(list, { templateId = '', libraryKey = '' } = {}) {
  return sortFilled(list).filter((doc) => (templateId && doc.templateId === templateId) || (libraryKey && doc.libraryKey === libraryKey));
}

export function filledForSubject(list, kind, id) {
  return sortFilled(list).filter((doc) => doc.subject?.kind === kind && doc.subject?.id === id);
}
