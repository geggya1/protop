/**
 * Kobling mellom maler i Skjemabygger og dokumentstyringen:
 * dokumenthodet, standard lesekrav og hvilken versjon som fylles ut.
 */
import { blankDocInfo, normalizeDocInfo } from '../anbud/formBuilder.js';
import { libraryEntry } from '../forms/ksLibrary.js';
import { controlKey, docHeader, newControl, publishedRevision, publishedSnapshot, workingRevision } from './model.js';
import { templateFromSnapshot } from './content.js';

export const DEFAULT_SYSTEM = '{{firma}} - Ledelsessystem';

/** Lesekrav som KS-malene starter med. Kan endres per dokument. */
const DEFAULT_READ_RULES = {
  taushetserklaering: 'signeres',
  branninstruks: 'pakrevd',
  'instruks-arbeidsutstyr': 'pakrevd',
  avfallsinstruks: 'info',
  'miljofyrtarn-ansvarlig': 'info',
};

export const HANDBOOK_CODE = 'C1-C-01-001';

export function defaultReadRule(libraryKey) {
  return DEFAULT_READ_RULES[libraryKey] || 'ingen';
}

export function templateControlKey(template) {
  return template?.id ? controlKey('template', template.id) : '';
}

/** Bibliotekmalens nøkkel ut fra mal-ID-en (ks_<nøkkel>). */
export function libraryKeyOf(templateOrId) {
  const id = typeof templateOrId === 'string' ? templateOrId : templateOrId?.id;
  if (typeof templateOrId === 'object' && templateOrId?.libraryKey) return templateOrId.libraryKey;
  const match = /^ks_(.+)$/.exec(String(id || ''));
  return match && libraryEntry(match[1]) ? match[1] : '';
}

/** Neste ledige dokument-ID for bedriftens egne maler: PT-001, PT-002 … */
export function nextDocCode(controls) {
  const used = (controls || []).map((row) => /^PT-(\d+)$/.exec(String(row?.code || ''))).filter(Boolean).map((m) => Number(m[1]));
  return `PT-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

/** Nytt styrt dokument for en mal. KS-maler får KS-referansen som dokument-ID. */
export function newTemplateControl(template, { controls = [], settings = null, actor = null, now = new Date() } = {}) {
  if (!template?.id) return null;
  const key = libraryKeyOf(template);
  const entry = key ? libraryEntry(key) : null;
  return newControl({
    kind: 'template',
    refId: template.id,
    title: template.title || entry?.title || 'Mal',
    code: entry?.ref || normalizeDocInfo(template.doc).docId || nextDocCode(controls),
    readRule: defaultReadRule(key),
    reviewIntervalMonths: settings?.defaultReviewMonths || 12,
  }, { actor, now });
}

/** ISO-skjema (iso_*) og skjema fra ISO-import (imp_*) godkjennes i ISO › Skjemaer og styres ikke her. */
export function isoManaged(template) {
  return /^(iso|imp)_/.test(String(template?.id || ''));
}

/** Skal malen styres automatisk? KS-maler alltid. Avtalemaler har egen flyt i Avtaler. */
export function autoControlled(template) {
  return !!libraryKeyOf(template) && template?.category !== 'avtale';
}

/**
 * Dokumenthodet som skrives ut. Med dokumentstyring beregnes det. Uten står KS-referansen,
 * men versjon og godkjenning står tomme til dokumentet faktisk er godkjent.
 */
export function headerForTemplate(template, control) {
  const own = normalizeDocInfo(template?.doc);
  const system = own.system || DEFAULT_SYSTEM;
  if (control) return normalizeDocInfo({ ...docHeader(control), system });
  if (!own.docId && !own.system) return blankDocInfo();
  return normalizeDocInfo({ ...blankDocInfo(), system, docId: own.docId, version: 'Utkast' });
}

/** Hodet for utkastet som redigeres: «Utkast n» og ingen godkjenning før den er gitt. */
export function draftHeaderForTemplate(template, control) {
  const header = headerForTemplate(template, control);
  const work = workingRevision(control);
  return work ? { ...header, version: `Utkast ${work.revision}`, approvedBy: '', approved: '' } : header;
}

/**
 * Det som fylles ut: gjeldende godkjente versjon med beregnet dokumenthode.
 * Uten godkjent versjon brukes utkastet, og approved er false så brukeren kan varsles.
 */
export function fillSource(template, control) {
  const pub = publishedRevision(control);
  const snapshot = publishedSnapshot(control);
  const base = snapshot ? templateFromSnapshot(snapshot, template) : template;
  return {
    form: { ...base, doc: headerForTemplate(template, control) },
    approved: !!pub,
    version: pub?.revision || 0,
  };
}

/** Malen slik den ble godkjent, når bare dokumentstyringen er kjent (Min side). */
export function formFromControl(control) {
  const snapshot = publishedSnapshot(control);
  if (!snapshot) return null;
  const libraryKey = libraryKeyOf(control.refId);
  return {
    ...templateFromSnapshot(snapshot, { id: control.refId, libraryKey, settings: {} }),
    doc: headerForTemplate({ doc: { docId: control.code } }, control),
  };
}
