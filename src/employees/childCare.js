/**
 * Barn og omsorgsdager for sykt barn (folketrygdloven §§ 9-5 og 9-6).
 * Den ansatte registrerer barna selv på ansattkortet. Fødselsdato og navn er skjermet
 * (employeesPrivate, som personnummer og pårørende). På ansattposten står bare fødselsårene,
 * så omsorgsdagene kan regnes ut hvert år (childCareQuota i src/arbeid/sickLeave.js).
 * Ren modul – brukes av skjerm, lagring og tester.
 */

export const CHILD_CARE_PURPOSE = 'Bedriften trenger barnas fødselsdato for å regne ut hvor mange omsorgsdager du har når barnet eller barnepasseren er syk (folketrygdloven § 9-6): 10 dager med ett eller to barn, 15 med tre eller flere, til og med året barnet fyller 12. Er du alene om omsorgen, dobles dagene. Barn med utvidet rett fra NAV (kronisk syk eller funksjonshemmet) gir 10 dager ekstra, til og med året barnet fyller 18.';

export const CHILD_CARE_PRIVACY = 'Fødselsdato og navn er skjermet som personnummer og pårørende: bare du, administrator og HR med tilgang ser dem. Kolleger ser dem ikke. Opplysningene brukes bare til omsorgsdagene, og du kan endre eller slette dem når som helst.';

function text(value) {
  return String(value ?? '').trim();
}

function isIso(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

/** «24.12.2019», «24/12/2019» eller «2019-12-24» → «2019-12-24», ellers ''. */
export function parseBirthDate(value) {
  const raw = text(value);
  if (isIso(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!isIso(iso)) return '';
  const [y, mo, d] = iso.split('-').map(Number);
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCDate() === d && back.getUTCMonth() === mo - 1 ? iso : '';
}

export function formatBirthDate(iso) {
  if (!isIso(iso)) return text(iso);
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function newKidId() {
  return `barn_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** Barna slik de lagres: id, valgfritt fornavn, fødselsdato og utvidet rett. */
export function normalizeChildCare(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const kids = (Array.isArray(src.kids) ? src.kids : [])
    .map((row) => ({
      id: text(row?.id) || newKidId(),
      name: text(row?.name).slice(0, 40),
      birthDate: parseBirthDate(row?.birthDate),
      chronic: row?.chronic === true,
    }))
    .filter((row) => row.birthDate)
    .sort((a, b) => a.birthDate.localeCompare(b.birthDate));
  return {
    kids,
    alone: src.alone === true,
    updatedAt: text(src.updatedAt),
    updatedBy: text(src.updatedBy),
  };
}

/** Feil i det som er skrevet inn (tom liste = ok). */
export function validateChildCare(input = {}, { today } = {}) {
  const errors = [];
  const day = isIso(today) ? today : new Date().toISOString().slice(0, 10);
  (Array.isArray(input.kids) ? input.kids : []).forEach((row, index) => {
    const label = text(row?.name) || `Barn ${index + 1}`;
    const iso = parseBirthDate(row?.birthDate);
    if (!iso) errors.push(`${label}: skriv fødselsdato som dd.mm.åååå.`);
    else if (iso > day) errors.push(`${label}: fødselsdatoen kan ikke være fram i tid.`);
    else if (Number(day.slice(0, 4)) - Number(iso.slice(0, 4)) > 25) errors.push(`${label}: barnet er for gammelt til å gi omsorgsdager.`);
  });
  return errors;
}

/**
 * Det som står på ansattposten: bare fødselsår (ikke dato eller navn) og om den ansatte er
 * alene om omsorgen. Nok til å regne ut omsorgsdagene for hvert år.
 */
export function childCareSummary(care) {
  const row = normalizeChildCare(care);
  return {
    birthYears: row.kids.map((kid) => Number(kid.birthDate.slice(0, 4))),
    chronicBirthYears: row.kids.filter((kid) => kid.chronic).map((kid) => Number(kid.birthDate.slice(0, 4))),
    alone: row.alone,
    selfRegistered: true,
    updatedAt: row.updatedAt,
  };
}
