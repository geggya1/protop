/** Fødselsdato er kilden. Alder og aldersbånd regnes herfra ved behov. */

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const DOT = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

export const LANG_LOCALES = {
  nb: 'nb-NO',
  en: 'en-GB',
  da: 'da-DK',
  sv: 'sv-SE',
  fi: 'fi-FI',
  pl: 'pl-PL',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseBirthday(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      return startOfDay(value.toDate());
    } catch {
      return null;
    }
  }
  const s = String(value).trim();
  const iso = s.match(ISO);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
    return null;
  }
  const dot = s.match(DOT);
  if (dot) {
    const d = Number(dot[1]);
    const m = Number(dot[2]);
    const y = Number(dot[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
  }
  return null;
}

export function toIsoDate(value) {
  const d = value instanceof Date ? startOfDay(value) : parseBirthday(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatBirthday(value, lang = 'nb') {
  const d = parseBirthday(value);
  if (!d) return '';
  const locale = LANG_LOCALES[lang] || LANG_LOCALES.nb;
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function calculateAge(value, now = new Date()) {
  const birth = parseBirthday(value);
  if (!birth) return null;
  const today = parseBirthday(now) || startOfDay(new Date());
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

export function isValidBirthday(value, now = new Date()) {
  const birth = parseBirthday(value);
  if (!birth) return false;
  if (birth > startOfDay(now)) return false;
  return calculateAge(birth, now) != null;
}

/** Snapshot-alder: foretrekk levende beregning fra fødselsdato. */
export function profileAge(person, now = new Date()) {
  if (!person) return null;
  const fromBirthday = calculateAge(person.birthday || person.birthdate, now);
  if (fromBirthday != null) return fromBirthday;
  const n = Number(person.age);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
}

/**
 * Aldersbånd til senere føringer (oppgaver, belønning, samtykke, visning).
 * Holdes synket med fødselsdato, ikke med lagret tall alene.
 */
export function ageBand(age) {
  if (age == null || Number.isNaN(Number(age))) return null;
  const n = Number(age);
  if (n < 6) return 'preschool';
  if (n < 13) return 'child';
  if (n < 16) return 'teen';
  if (n < 18) return 'youth';
  return 'adult';
}

export function isMinor(age) {
  const n = Number(age);
  return Number.isFinite(n) && n < 18;
}
