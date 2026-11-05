/**
 * Fraværsskjema for fravær som ikke er sykdom eller ferie: permisjon, «annet fravær med/uten lønn»,
 * legebesøk, seminar o.l. Skjemaet gir leder begrunnelsen og perioden, og kobles til dagene i
 * timelisten med formId. Dager som er ført uten skjema, gir påminnelsen «Husk fraværsskjema».
 *
 * Sykdom har eget skjema (egenmelding/sykmelding, sickLeave.js), ferie har ferieplanen.
 */
import { addAbsence, createId, deleteAbsences } from '../project/engine.js';
import { NOTICE_TYPE_ID, absenceTypeById } from './absenceCatalog.js';
import { addDays, calendarDays, isIsoDate, sickKind, todayIso } from './sickLeave.js';

/** Fraværsdager før denne datoen gir ikke påminnelse (ført før skjemaet fantes). */
export const ABSENCE_FORM_START = '2026-11-01';

/** Lengste periode ett skjema kan dekke. */
export const ABSENCE_FORM_MAX_DAYS = 366;

const FORM_TYPE_CATEGORIES = new Set(['Permisjon', 'Annet fravær']);

// Interntid og reisetid er arbeid som føres som fravær; permittering bestemmer arbeidsgiver.
const NO_FORM_IDS = new Set(['intern_admin', 'intern_smart', 'reise_uten_lonn', 'permittert', NOTICE_TYPE_ID]);
const NO_FORM_LABEL = /interntid|reisetid|permitter/i;

function text(value) {
  return String(value ?? '').trim();
}

function isWeekend(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/** Sammenhengende: samme dag, neste dag, eller bare helgedager imellom. */
function onlyWeekendBetween(lastDate, date) {
  if (date <= lastDate) return true;
  for (let day = addDays(lastDate, 1); day < date; day = addDays(day, 1)) {
    if (!isWeekend(day)) return false;
  }
  return true;
}

/** Om fraværstypen skal ha fraværsskjema. */
export function needsAbsenceForm(typeId, catalog) {
  const id = text(typeId);
  if (!id || NO_FORM_IDS.has(id)) return false;
  if (sickKind(id, catalog)) return false;
  const row = absenceTypeById(id, catalog);
  if (!FORM_TYPE_CATEGORIES.has(row.category)) return false;
  return !NO_FORM_LABEL.test(row.label);
}

const DETAIL_KEYS = ['childName', 'childDate', 'percent', 'relation', 'person', 'occasion', 'education', 'organ', 'holiday', 'whoFor', 'provider', 'ordered', 'childSick'];

export const WHO_FOR = [
  { id: 'selv', label: 'Meg selv' },
  { id: 'barn', label: 'Barnet mitt' },
];

export const PROVIDERS = [
  { id: 'fastlege', label: 'Fastlege / legevakt' },
  { id: 'spesialist', label: 'Spesialisthelsetjenesten / sykehus' },
  { id: 'tannlege', label: 'Tannlege' },
  { id: 'behandling', label: 'Fysioterapeut, psykolog eller annen behandling' },
];

/** Bare feltene kategorien spør om, trimmet. Ingen andre opplysninger lagres. */
export function cleanFormDetails(category, details = {}) {
  const cat = formCategory(category);
  const fields = new Set(cat?.fields || []);
  const allowed = {
    childName: fields.has('child'),
    childDate: fields.has('childDate'),
    percent: fields.has('percent'),
    relation: fields.has('relation'),
    person: fields.has('person'),
    occasion: fields.has('occasion'),
    education: fields.has('education'),
    organ: fields.has('organ'),
    holiday: fields.has('holiday'),
    whoFor: fields.has('whoFor'),
    provider: fields.has('provider'),
    ordered: fields.has('ordered'),
    childSick: fields.has('whoFor') && details?.whoFor === 'barn',
  };
  const out = {};
  for (const key of DETAIL_KEYS) {
    if (!allowed[key]) continue;
    if (key === 'ordered' || key === 'childSick') {
      if (details?.[key] === true) out[key] = true;
      continue;
    }
    const value = key === 'percent' ? Number(details?.[key] || 100) : text(details?.[key]).slice(0, 120);
    if (value !== '' && value != null) out[key] = value;
  }
  return out;
}

/** Kort linje om skjemaet for leder og oversikter. */
export function formSummary(row = {}) {
  const cat = formCategory(row.formCategory);
  const d = row.formDetails && typeof row.formDetails === 'object' ? row.formDetails : {};
  const parts = [];
  if (cat) parts.push(cat.label);
  if (d.occasion) parts.push(OCCASIONS.find((o) => o.id === d.occasion)?.label || d.occasion);
  if (d.provider) parts.push(PROVIDERS.find((r) => r.id === d.provider)?.label || d.provider);
  if (d.whoFor === 'barn') parts.push('med barn');
  if (d.ordered) parts.push('pålagt av arbeidsgiver');
  if (d.relation) parts.push(RELATIONS.find((r) => r.id === d.relation)?.label || d.relation);
  if (d.person) parts.push(d.person);
  if (d.childName) parts.push(`barn: ${d.childName}`);
  if (d.education) parts.push(d.education);
  if (d.organ) parts.push(d.organ);
  if (d.holiday) parts.push(d.holiday);
  if (d.percent && d.percent < 100) parts.push(`${d.percent} %`);
  if (text(row.formReason)) parts.push(text(row.formReason));
  return parts.join(' · ');
}

export function absenceFormId() {
  return createId('fsk');
}

/**
 * Grunnlag for fraværet. Lovfestede permisjoner etter arbeidsmiljøloven kapittel 12
 * (og trossamfunnsloven § 18), pluss velferdspermisjon, kurs og legetime etter avtale.
 * fields: hvilke opplysninger skjemaet spør om. quota: lovens dager per kalenderår.
 * notice: varslingsplikt etter aml. § 12-7 (gjelder §§ 12-2 til 12-6).
 */
export const FORM_CATEGORIES = [
  {
    id: 'foreldre',
    label: 'Foreldrepermisjon / svangerskapspermisjon',
    law: 'aml. §§ 12-2, 12-4 og 12-5',
    fields: ['child', 'childDate', 'percent'],
    notice: true,
    info: 'Foreldrepermisjon inntil 12 måneder per forelder. Foreldrepenger søkes hos NAV.',
  },
  {
    id: 'omsorg_fodsel',
    label: 'Omsorgspermisjon ved fødsel eller adopsjon',
    law: 'aml. § 12-3',
    fields: ['child', 'childDate'],
    notice: true,
    maxDays: 14,
    info: 'To uker i forbindelse med fødsel eller omsorgsovertakelse. Lønn etter avtale.',
  },
  {
    id: 'svangerskapskontroll',
    label: 'Svangerskapskontroll',
    law: 'aml. § 12-1',
    fields: [],
    info: 'Fri med lønn når kontrollen ikke kan tas utenom arbeidstiden.',
  },
  {
    id: 'ammefri',
    label: 'Ammefri',
    law: 'aml. § 12-8',
    fields: ['child', 'childDate'],
    info: 'Lønnet inntil én time per dag (ved minst 7 timers arbeidsdag) til barnet er ett år.',
  },
  {
    id: 'pleie_barn',
    label: 'Pleie av alvorlig sykt barn / barn på sykehus',
    law: 'aml. § 12-9',
    fields: ['child'],
    docs: true,
    info: 'Pleiepenger søkes hos NAV. Vanlig sykt barn meldes som egenmelding for sykt barn.',
  },
  {
    id: 'naerstaende',
    label: 'Omsorg for nærstående',
    law: 'aml. § 12-10 andre ledd',
    fields: ['relation', 'person'],
    quota: 10,
    info: 'Inntil 10 dager per kalenderår for nødvendig omsorg for foreldre, ektefelle, samboer eller partner, eller funksjonshemmet / kronisk sykt barn over 18 år. Uten lønn etter loven.',
  },
  {
    id: 'livets_sluttfase',
    label: 'Pleie av nærstående i livets sluttfase',
    law: 'aml. § 12-10 første ledd',
    fields: ['relation', 'person'],
    maxDays: 60,
    docs: true,
    info: 'Inntil 60 dager per nærstående. Pleiepenger søkes hos NAV.',
  },
  {
    id: 'utdanning',
    label: 'Utdanningspermisjon',
    law: 'aml. § 12-11',
    fields: ['education'],
    info: 'Krever minst tre år i arbeidslivet og to år hos arbeidsgiveren. Søknaden skal være skriftlig og si hva utdanningen gjelder, hvor lenge den varer og om du har fått opptak.',
  },
  {
    id: 'militaer',
    label: 'Militærtjeneste / sivilforsvar',
    law: 'aml. § 12-12',
    fields: ['organ'],
    info: 'Gjelder pliktig tjeneste og frivillig tjeneste etter loven. Legg ved innkallingen ved behov.',
  },
  {
    id: 'verv',
    label: 'Offentlig verv',
    law: 'aml. § 12-13',
    fields: ['organ'],
    info: 'Fri så langt det trengs for lovbestemt møteplikt i offentlige organer.',
  },
  {
    id: 'religios',
    label: 'Religiøs høytid',
    law: 'aml. § 12-15 / trossamfunnsloven § 18',
    fields: ['holiday'],
    quota: 2,
    noticeDays: 14,
    info: 'Inntil to selvvalgte dager per år. Varsles senest 14 dager før. Lønn trekkes ikke, men arbeidsgiver kan kreve at tiden tas igjen.',
  },
  {
    id: 'velferd',
    label: 'Velferdspermisjon',
    law: 'Tariffavtale eller avtale med arbeidsgiver',
    fields: ['occasion', 'relation'],
    info: 'For eksempel begravelse, flytting, eget bryllup, barnehage- eller skolestart. Om dagen er med lønn, følger av avtalen.',
  },
  {
    id: 'kurs',
    label: 'Kurs / seminar',
    law: 'Avtale med arbeidsgiver',
    fields: ['education', 'ordered'],
    info: 'Kurs arbeidsgiver pålegger, er arbeidstid med lønn.',
  },
  {
    id: 'lege',
    label: 'Lege, tannlege, spesialist eller behandling',
    law: 'Ingen lovfestet rett etter aml. Lønn etter tariffavtale eller avtale',
    fields: ['whoFor', 'provider'],
    health: true,
    info: 'Arbeidsmiljøloven gir ikke rett til fri for legetime. Legg timen utenom arbeidstiden når det går. Ikke skriv diagnose eller andre helseopplysninger.',
  },
  {
    id: 'annet',
    label: 'Annet',
    law: '',
    fields: [],
    reasonRequired: true,
    info: '',
  },
];

const CATEGORY_BY_ID = new Map(FORM_CATEGORIES.map((row) => [row.id, row]));

export function formCategory(id) {
  return CATEGORY_BY_ID.get(text(id)) || null;
}

export const RELATIONS = [
  { id: 'forelder', label: 'Forelder' },
  { id: 'partner', label: 'Ektefelle, samboer eller partner' },
  { id: 'barn', label: 'Barn' },
  { id: 'sosken', label: 'Søsken' },
  { id: 'besteforelder', label: 'Besteforelder / barnebarn' },
  { id: 'svigerfamilie', label: 'Svigerfamilie' },
  { id: 'annen', label: 'Annen nærstående' },
];

export const OCCASIONS = [
  { id: 'begravelse', label: 'Begravelse / dødsfall' },
  { id: 'flytting', label: 'Flytting' },
  { id: 'bryllup', label: 'Eget bryllup / partnerskap' },
  { id: 'barnehage', label: 'Tilvenning barnehage / første skoledag' },
  { id: 'annet', label: 'Annet' },
];

const PAID_TYPE = { lege: ['lege_med', 'lege_uten'], kurs: ['seminar_med', 'seminar_uten'] };

/**
 * Lønn for fraværet etter arbeidsmiljøloven og bedriftens avtale (sickRules.paidLeave).
 * Returnerer { paid, payer, basis, typeId }: typeId er fraværstypen dagene skal føres med,
 * eller '' når skjemaet ikke skal endre typen (Annet: brukeren har valgt selv).
 */
export function formPayDecision(category, details = {}, { rules, fromDate } = {}) {
  const paidLeave = rules?.paidLeave || {};
  const d = details && typeof details === 'object' ? details : {};
  const pair = PAID_TYPE[category] || ['annet_med', 'annet_uten'];
  const out = (paid, payer, basis, typeId) => ({ paid, payer, basis, typeId: typeId ?? (paid ? pair[0] : pair[1]) });
  const byAgreement = (flag, what) => (paidLeave[flag]
    ? out(true, 'arbeidsgiver', `Med lønn etter bedriftens avtale (${what}).`)
    : out(false, 'ingen', `Uten lønn: arbeidsmiljøloven gir ikke rett til lønn, og bedriftens avtale gir ikke lønn for ${what}.`));
  switch (category) {
    case 'svangerskapskontroll':
      return out(true, 'arbeidsgiver', 'Med lønn etter aml. § 12-1.');
    case 'ammefri': {
      const oneYear = isIsoDate(d.childDate) ? `${Number(d.childDate.slice(0, 4)) + 1}${d.childDate.slice(4)}` : '';
      if (oneYear && isIsoDate(fromDate) && fromDate < oneYear) {
        return out(true, 'arbeidsgiver', 'Med lønn inntil én time per dag (minst 7 timers arbeidsdag) til barnet er ett år, aml. § 12-8. Tid ut over er uten lønn.');
      }
      return out(false, 'ingen', 'Uten lønn etter at barnet har fylt ett år (aml. § 12-8), med mindre avtalen sier noe annet.');
    }
    case 'foreldre':
      return out(true, 'NAV', 'Foreldrepenger fra NAV. Arbeidsgiver kan forskuttere og kreve refusjon.', 'foreldre');
    case 'omsorg_fodsel':
      return byAgreement('omsorgFodsel', 'omsorgspermisjon');
    case 'pleie_barn':
    case 'livets_sluttfase':
      return out(false, 'NAV', 'Pleiepenger fra NAV. Ikke lønn fra arbeidsgiver.');
    case 'naerstaende':
      return out(false, 'ingen', 'Uten lønn etter aml. § 12-10.');
    case 'utdanning':
      return out(false, 'ingen', 'Uten lønn etter aml. § 12-11.');
    case 'verv':
      return out(false, 'ingen', 'Uten lønn fra arbeidsgiver. Tapt arbeidsinntekt dekkes av organet vervet gjelder.');
    case 'militaer':
      return byAgreement('militaer', 'militærtjeneste');
    case 'religios':
      return out(false, 'ingen', 'Uten lønn, men arbeidsgiver kan avtale at tiden arbeides inn i stedet for trekk (trossamfunnsloven § 18).');
    case 'velferd':
      return d.occasion === 'begravelse' ? byAgreement('begravelse', 'begravelse') : byAgreement('velferd', 'velferdspermisjon');
    case 'kurs':
      return d.ordered ? out(true, 'arbeidsgiver', 'Pålagt kurs er arbeidstid med lønn.') : byAgreement('kurs', 'kurs etter eget ønske');
    case 'lege':
      return d.whoFor === 'barn' ? byAgreement('legeBarn', 'å følge barn til lege') : byAgreement('lege', 'legetime');
    default:
      return { paid: null, payer: '', basis: '', typeId: '' };
  }
}

/** Typen skjemaet skal føre dagene med: lønnsvalget, om typen finnes hos bedriften. */
export function formTypeFor(form = {}, { rules, catalog } = {}) {
  const decision = formPayDecision(form.category, form.details, { rules, fromDate: form.fromDate });
  const list = Array.isArray(catalog) ? catalog : null;
  const known = (id) => !!id && (!list || list.some((row) => text(row.id) === id));
  if (decision.typeId && known(decision.typeId)) return { ...decision, resolvedType: decision.typeId, missingType: '' };
  return { ...decision, resolvedType: text(form.type), missingType: decision.typeId && !known(decision.typeId) ? decision.typeId : '' };
}

/** Hvilken kategori skjemaet starter med, ut fra fraværstypen. */
export function defaultFormCategory(typeId, catalog) {
  const id = text(typeId);
  if (id === 'foreldre') return 'foreldre';
  if (id === 'seminar_med' || id === 'seminar_uten') return 'kurs';
  if (id === 'lege_med' || id === 'lege_uten') return 'lege';
  const row = absenceTypeById(id, catalog);
  if (/foreldre|svangerskap/i.test(row.label)) return 'foreldre';
  if (/velferd/i.test(row.label)) return 'velferd';
  if (/seminar|kurs/i.test(row.label)) return 'kurs';
  if (/lege|tannlege/i.test(row.label)) return 'lege';
  return '';
}

function daysBetween(a, b) {
  if (!isIsoDate(a) || !isIsoDate(b)) return 0;
  return calendarDays(a, b) - 1;
}

/** Dager med samme kategori i kalenderåret, fra andre skjema enn dette. */
export function categoryDaysUsed(absences, { employeeId, category, year, excludeFormId = '' } = {}) {
  const dates = new Set();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!row || text(row.employeeId) !== text(employeeId)) continue;
    if (text(row.formCategory) !== text(category)) continue;
    if (excludeFormId && text(row.formId) === text(excludeFormId)) continue;
    if (!(Number(row.hours) > 0)) continue;
    const date = text(row.date);
    if (date.slice(0, 4) === String(year)) dates.add(date);
  }
  return dates.size;
}

/**
 * Varsler etter loven som ikke stopper skjemaet: for sent varslet (aml. § 12-7,
 * trossamfunnsloven § 18), kvoten brukt opp, eller perioden lengre enn loven gir rett til.
 */
export function formWarnings(form = {}, { today, usedDays = 0, workDays = 0 } = {}) {
  const cat = formCategory(form.category);
  if (!cat) return [];
  const day = isIsoDate(today) ? today : todayIso();
  const toDate = text(form.toDate) || text(form.fromDate);
  const length = calendarDays(form.fromDate, toDate);
  const lead = daysBetween(day, form.fromDate);
  const out = [];
  if (cat.notice && isIsoDate(form.fromDate) && form.fromDate >= day) {
    const need = length > 365 ? 84 : length > 84 ? 28 : length > 14 ? 7 : 0;
    if (need && lead < need) {
      out.push(`Permisjon på over ${length > 365 ? 'ett år' : length > 84 ? '12 uker' : 'to uker'} skal varsles senest ${need === 7 ? 'én uke' : `${need / 7} uker`} før (aml. § 12-7).`);
    }
  }
  if (cat.noticeDays && isIsoDate(form.fromDate) && lead < cat.noticeDays) {
    out.push(`Skal varsles senest ${cat.noticeDays} dager før. Arbeidsgiver kan likevel innvilge.`);
  }
  if (cat.quota && usedDays + workDays > cat.quota) {
    out.push(`Loven gir inntil ${cat.quota} dager per år. Med dette skjemaet er ${usedDays + workDays} dager brukt. Resten må avtales med arbeidsgiver.`);
  }
  if (cat.maxDays && length > cat.maxDays) {
    out.push(`Loven gir inntil ${cat.maxDays} dager. Utover det må det avtales med arbeidsgiver.`);
  }
  return out;
}

/** Sjekker skjemaet før det føres. Returnerer feilmeldinger (tom liste = ok). */
export function validateAbsenceForm(form = {}) {
  const errors = [];
  if (!text(form.type)) errors.push('Velg fraværstype.');
  const cat = formCategory(form.category);
  if (!cat) errors.push('Velg hva fraværet gjelder.');
  const details = form.details && typeof form.details === 'object' ? form.details : {};
  const fields = cat?.fields || [];
  if (fields.includes('child') && !text(details.childName)) errors.push('Skriv barnets fornavn.');
  if (fields.includes('childDate') && !isIsoDate(details.childDate)) errors.push('Velg fødselsdato, termin eller dato for omsorgsovertakelse.');
  if (fields.includes('relation') && cat?.id !== 'velferd' && !text(details.relation)) errors.push('Velg hvem det gjelder.');
  if (fields.includes('occasion') && !text(details.occasion)) errors.push('Velg anledning.');
  if (fields.includes('education') && !text(details.education)) errors.push(cat?.id === 'kurs' ? 'Skriv navn på kurset eller seminaret.' : 'Skriv utdanning og studiested.');
  if (fields.includes('organ') && !text(details.organ)) errors.push(cat?.id === 'verv' ? 'Skriv vervet og organet.' : 'Skriv hvilken tjeneste det gjelder.');
  if (fields.includes('holiday') && !text(details.holiday)) errors.push('Skriv hvilken høytid det gjelder.');
  if (fields.includes('whoFor') && !text(details.whoFor)) errors.push('Velg om timen gjelder deg selv eller barnet ditt.');
  if (fields.includes('provider') && !text(details.provider)) errors.push('Velg type time.');
  if (fields.includes('whoFor') && details.whoFor === 'barn' && details.childSick === true) {
    errors.push('Når barnet er sykt, meldes fraværet som sykt barn (omsorgsdager). Bruk «Meld sykt barn».');
  }
  if (fields.includes('percent')) {
    const pct = Number(details.percent || 100);
    if (!(pct > 0 && pct <= 100)) errors.push('Permisjonsgraden må være mellom 1 og 100 %.');
  }
  if (form.confirmed === false) errors.push('Bekreft at opplysningene er riktige.');
  if (!isIsoDate(form.fromDate)) errors.push('Velg fra-dato.');
  const toDate = text(form.toDate) || text(form.fromDate);
  if (isIsoDate(form.fromDate) && (!isIsoDate(toDate) || toDate < form.fromDate)) {
    errors.push('Til-dato kan ikke være før fra-dato.');
  } else if (calendarDays(form.fromDate, toDate) > ABSENCE_FORM_MAX_DAYS) {
    errors.push('Perioden kan være høyst ett år.');
  }
  if ((!cat || cat.reasonRequired || text(details.occasion) === 'annet') && !text(form.reason)) errors.push('Skriv en kort begrunnelse.');
  return errors;
}

/**
 * Fører skjemaet i timelisten: én fraværsrad per arbeidsdag i perioden, merket med formId.
 * Dager som allerede er ført med samme type, beholder timene og kobles til skjemaet.
 * Dager som ikke lenger er med i perioden (skjemaet er endret), fjernes.
 */
export function applyAbsenceForm(state, form, { hoursForDate, createdByUid = '', now = new Date() } = {}) {
  const errors = validateAbsenceForm(form);
  if (errors.length) return { ok: false, state, error: errors.join(' '), absenceIds: [] };
  const employeeId = text(form.employeeId);
  if (!employeeId) return { ok: false, state, error: 'Velg medarbeider.', absenceIds: [] };
  const id = text(form.id) || absenceFormId();
  const type = text(form.type);
  const fromDate = form.fromDate;
  const toDate = text(form.toDate) || fromDate;
  const reason = text(form.reason);
  const note = text(form.note);
  const category = text(form.category);
  const details = cleanFormDetails(category, form.details);
  const formAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const hoursOf = typeof hoursForDate === 'function' ? hoursForDate : () => 0;

  const absences = Array.isArray(state.absences) ? state.absences : [];
  const mine = absences.filter((a) => text(a.employeeId) === employeeId);

  let next = state;
  const stale = mine
    .filter((a) => text(a.formId) === id && (text(a.date) < fromDate || text(a.date) > toDate || text(a.type) !== type))
    .map((a) => a.id);
  if (stale.length) {
    const removed = deleteAbsences(next, stale);
    if (removed.ok) next = removed.state;
  }

  const ids = [];
  const failed = [];
  for (let day = fromDate; day && day <= toDate; day = addDays(day, 1)) {
    const origin = text(form.originType);
    const existing = mine.find((a) => text(a.date) === day && text(a.formId) === id && text(a.type) === type)
      || mine.find((a) => text(a.date) === day && !text(a.formId) && (text(a.type) === type || (origin && text(a.type) === origin)));
    // Timer per dag fra skjemaet (f.eks. legetime 2 t), ellers timene som står, ellers arbeidsplanen.
    // Dager uten arbeidstid (helg, fridag) føres ikke.
    const planned = hoursOf(day);
    const fixed = Number(form.hoursPerDay);
    const hours = fixed > 0
      ? (planned > 0 || existing ? Math.min(fixed, planned > 0 ? planned : fixed) : 0)
      : (existing ? Number(existing.hours) : planned);
    if (!(hours > 0)) continue;
    const result = addAbsence(next, {
      id: existing?.id || '',
      employeeId,
      employeeName: text(form.employeeName) || existing?.employeeName,
      date: day,
      hours,
      type,
      description: note || existing?.description || '',
      formId: id,
      formReason: reason,
      formCategory: category,
      formDetails: details,
      formAt,
      createdByUid: existing?.createdByUid || createdByUid,
    });
    if (!result.ok) {
      failed.push(`${day}: ${result.error}`);
      continue;
    }
    next = result.state;
    const saved = (next.absences || []).find((a) => text(a.employeeId) === employeeId && text(a.date) === day && text(a.formId) === id);
    if (saved) ids.push(saved.id);
  }
  if (!ids.length) {
    return { ok: false, state, error: failed[0] || 'Ingen arbeidsdager i perioden.', absenceIds: [] };
  }
  return { ok: true, state: next, error: failed.join(' '), absenceIds: ids, formId: id };
}

/**
 * Fravær uten skjema (ferie, avspasering, interntid o.l.): én rad per arbeidsdag i perioden.
 * Står samme type allerede på dagen, endres timene på den raden.
 */
export function applyPlainAbsence(state, input, { hoursForDate, createdByUid = '' } = {}) {
  const employeeId = text(input.employeeId);
  const type = text(input.type);
  const fromDate = text(input.fromDate);
  const toDate = text(input.toDate) || fromDate;
  if (!employeeId) return { ok: false, state, error: 'Velg medarbeider.', absenceIds: [] };
  if (!type) return { ok: false, state, error: 'Velg fraværstype.', absenceIds: [] };
  if (!isIsoDate(fromDate) || !isIsoDate(toDate) || toDate < fromDate) {
    return { ok: false, state, error: 'Velg gyldig periode.', absenceIds: [] };
  }
  if (calendarDays(fromDate, toDate) > ABSENCE_FORM_MAX_DAYS) return { ok: false, state, error: 'Perioden kan være høyst ett år.', absenceIds: [] };
  const hoursOf = typeof hoursForDate === 'function' ? hoursForDate : () => 0;
  const fixed = Number(input.hoursPerDay);
  let next = state;
  const ids = [];
  const failed = [];
  for (let day = fromDate; day && day <= toDate; day = addDays(day, 1)) {
    const planned = hoursOf(day);
    if (!(planned > 0)) continue;
    const hours = fixed > 0 ? Math.min(fixed, planned) : planned;
    const existing = (next.absences || []).find((a) => text(a.employeeId) === employeeId && text(a.date) === day && text(a.type) === type);
    const result = addAbsence(next, {
      id: existing?.id || '',
      employeeId,
      employeeName: text(input.employeeName) || existing?.employeeName,
      date: day,
      hours,
      type,
      description: text(input.note) || existing?.description || '',
      createdByUid: existing?.createdByUid || createdByUid,
    });
    if (!result.ok) {
      failed.push(`${day}: ${result.error}`);
      continue;
    }
    next = result.state;
    const saved = (next.absences || []).find((a) => text(a.employeeId) === employeeId && text(a.date) === day && text(a.type) === type);
    if (saved) ids.push(saved.id);
  }
  if (!ids.length) return { ok: false, state, error: failed[0] || 'Ingen arbeidsdager i perioden.', absenceIds: [] };
  return { ok: true, state: next, error: failed.join(' '), absenceIds: ids };
}

/**
 * Valgene i «Registrer fravær», i den rekkefølgen en ansatt tenker: hva skjedde?
 * kind: 'sick' (egenmeldingsskjemaet), 'plain' (bare timer), 'form' (fraværsskjema med
 * grunnlag) eller 'pick' (velg blant undervalgene / bedriftens øvrige typer).
 */
export const WIZARD_GROUPS = [
  { id: 'syk', icon: 'medkit-outline', label: 'Syk selv', help: 'Egenmelding eller sykmelding. Går til leder og HR.', kind: 'sick', sick: 'self' },
  { id: 'sykt_barn', icon: 'happy-outline', label: 'Sykt barn', help: 'Barnet eller barnepasseren er syk. Omsorgsdager med lønn (ftrl. § 9-5).', kind: 'sick', sick: 'child' },
  { id: 'ferie', icon: 'sunny-outline', label: 'Ferie', help: 'Ferie fra feriesaldoen.', kind: 'plain', type: 'ferie' },
  { id: 'avspasering', icon: 'swap-horizontal-outline', label: 'Avspasering', help: 'Fri som trekkes fra timebanken.', kind: 'plain', type: 'avspasering' },
  { id: 'lege', icon: 'medical-outline', label: 'Lege, tannlege eller spesialist', help: 'Egen time eller med barnet. Lønn etter bedriftens avtale.', kind: 'form', category: 'lege' },
  {
    id: 'familie',
    icon: 'people-outline',
    label: 'Graviditet, fødsel og småbarn',
    help: 'Svangerskapskontroll, foreldrepermisjon, ammefri og pleie av sykt barn.',
    kind: 'pick',
    options: ['svangerskapskontroll', 'foreldre', 'omsorg_fodsel', 'ammefri', 'pleie_barn'],
  },
  {
    id: 'permisjon',
    icon: 'briefcase-outline',
    label: 'Permisjon og velferd',
    help: 'Begravelse, flytting, omsorg for familie, religiøs høytid, verv, militærtjeneste, utdanning.',
    kind: 'pick',
    options: ['velferd', 'naerstaende', 'livets_sluttfase', 'religios', 'verv', 'militaer', 'utdanning'],
  },
  { id: 'kurs', icon: 'school-outline', label: 'Kurs eller seminar', help: 'Pålagt kurs er arbeidstid. Kurs etter eget ønske etter avtale.', kind: 'form', category: 'kurs' },
  { id: 'annet', icon: 'ellipsis-horizontal-circle-outline', label: 'Annet', help: 'Interntid, reisetid, permittering og bedriftens egne fraværstyper.', kind: 'pick', options: 'types' },
];

const WIZARD_TYPES_SKIP = new Set(['ferie', 'avspasering', 'foreldre', 'lege_med', 'lege_uten', 'seminar_med', 'seminar_uten', NOTICE_TYPE_ID]);

/** Bedriftens øvrige fraværstyper under «Annet» (ikke sykdom og ikke typer som har egne valg over). */
export function wizardOtherTypes(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .filter((row) => row && !row.legacy && !WIZARD_TYPES_SKIP.has(text(row.id)) && !sickKind(row.id, catalog) && row.category !== 'Ferie')
    .map((row) => ({ id: text(row.id), label: text(row.label) || text(row.id), needsForm: needsAbsenceForm(row.id, catalog) }));
}

/** Kort linje om fraværet på én dag (for linjen «Fravær» i timelisten). */
export function dayAbsenceSummary(rows, catalog) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.hours) > 0);
  if (!list.length) return '';
  const names = [...new Set(list.map((row) => absenceTypeById(row.type, catalog).label))];
  return names.join(', ');
}

/** Skjemaet slik det står på dagene i timelisten (for å åpne og endre det). */
export function absenceFormFromRows(absences, formId) {
  const id = text(formId);
  if (!id) return null;
  const rows = (Array.isArray(absences) ? absences : []).filter((a) => text(a.formId) === id);
  if (!rows.length) return null;
  const dates = rows.map((a) => text(a.date)).sort();
  const first = rows[0];
  return {
    id,
    employeeId: text(first.employeeId),
    type: text(first.type),
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
    reason: text(first.formReason),
    category: text(first.formCategory),
    details: first.formDetails && typeof first.formDetails === 'object' ? { ...first.formDetails } : {},
    confirmed: true,
    note: text(first.description),
    formAt: text(first.formAt),
    days: rows.length,
  };
}

/**
 * Fravær som er ført uten fraværsskjema, samlet i sammenhengende perioder per type
 * (helg og røde dager imellom bryter ikke perioden).
 */
export function missingAbsenceForms(absences, employeeId, { catalog, startDate = ABSENCE_FORM_START, today } = {}) {
  const emp = text(employeeId);
  const start = isIsoDate(startDate) ? startDate : '';
  const byType = new Map();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!row || (emp && text(row.employeeId) !== emp)) continue;
    if (text(row.formId) || !(Number(row.hours) > 0)) continue;
    const date = text(row.date);
    if (!isIsoDate(date) || (start && date < start)) continue;
    if (!needsAbsenceForm(row.type, catalog)) continue;
    const type = text(row.type);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(row);
  }
  const out = [];
  for (const [type, rows] of byType) {
    rows.sort((a, b) => text(a.date).localeCompare(text(b.date)));
    let current = null;
    for (const row of rows) {
      const date = text(row.date);
      if (current && onlyWeekendBetween(current.toDate, date)) {
        if (date > current.toDate) current.toDate = date;
        current.absenceIds.push(row.id);
        current.days += 1;
        continue;
      }
      current = { type, employeeId: text(row.employeeId), fromDate: date, toDate: date, days: 1, absenceIds: [row.id] };
      out.push(current);
    }
  }
  const day = isIsoDate(today) ? today : todayIso();
  // Det som har startet først, så det som kommer.
  return out.sort((a, b) => {
    const pa = a.fromDate <= day ? 0 : 1;
    const pb = b.fromDate <= day ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return pa === 0 ? b.fromDate.localeCompare(a.fromDate) : a.fromDate.localeCompare(b.fromDate);
  });
}
