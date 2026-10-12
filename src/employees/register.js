/**
 * Førstegangsregistrering av en medarbeider.
 * E-post sjekkes mot listen. Nye personer får navn, kontakt, avdeling,
 * tilgang og arbeidsplan. Velkomstmalen legger invitasjonen i kø.
 */
import {
  ACCESS_LEVELS,
  accessLevelSections,
  canonicalLevelId,
} from '../access/companyAccess.js';
import { parseNbDate } from './model.js';
import { LANGUAGE_OPTIONS } from './schema.js';
import { draftInviteEmployee, emptyInvite, matchEmployeeByEmail } from './invite.js';
import { hasValidPhone, normalizePhone } from '../utils/phone.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const WORK_PLANS = [
  { id: 'full-40', label: 'Fulltid - 40t', workPercent: '100' },
  { id: 'part-30', label: 'Deltid - 30t', workPercent: '75' },
  { id: 'part-20', label: 'Deltid - 20t', workPercent: '50' },
  { id: 'part-10', label: 'Deltid - 10t', workPercent: '25' },
];

function text(value) {
  return String(value ?? '').trim();
}

export function workPlanById(id) {
  return WORK_PLANS.find((plan) => plan.id === id) || WORK_PLANS[0];
}

export function registrationLevels(placement, { canEditAccess = true } = {}) {
  if (!canEditAccess) return ACCESS_LEVELS.filter((level) => level.id === 'ansatt');
  const sectionId = placement === 'external' ? 'external' : 'company';
  return accessLevelSections().find((section) => section.id === sectionId)?.levels || [];
}

export function defaultRegistrationLevel(placement) {
  return placement === 'external' ? 'regnskap_ekstern' : 'ansatt';
}

export function registrationEmailState(rows, email) {
  const address = text(email).toLowerCase();
  if (!address) return { status: 'empty', email: '' };
  if (!EMAIL_RE.test(address)) return { status: 'invalid', email: address };
  const existing = matchEmployeeByEmail(rows, address);
  if (existing) return { status: 'existing', email: address, employee: existing };
  return { status: 'new', email: address };
}

export function buildFirstRegistration({
  email = '',
  firstName = '',
  lastName = '',
  phone = '',
  language = '',
  externalEmployeeNumber = '',
  placement = 'internal',
  accessLevel = '',
  departmentIds = [],
  workPlan = '',
  periodFrom = '',
  sendWelcome = true,
  canEditAccess = true,
  at = '',
  id = '',
} = {}) {
  const errors = [];
  const address = text(email).toLowerCase();
  const given = text(firstName);
  const familyName = text(lastName);
  if (!EMAIL_RE.test(address)) errors.push('Skriv en gyldig e-postadresse.');
  if (!given || !familyName) errors.push('Fornavn og etternavn må fylles ut.');

  const locked = canEditAccess === false;
  const group = locked || placement !== 'external' ? 'internal' : 'external';
  const allowed = registrationLevels(group, { canEditAccess: !locked });
  const requested = canonicalLevelId(accessLevel) || defaultRegistrationLevel(group);
  const levelId = locked ? 'ansatt' : requested;
  if (!allowed.some((level) => level.id === levelId)) {
    errors.push('Tilgangsnivået hører ikke til valgt gruppe.');
  }

  let storedPhone = '';
  const phoneRaw = text(phone);
  if (phoneRaw) {
    storedPhone = normalizePhone(phoneRaw);
    if (!storedPhone || !hasValidPhone(storedPhone)) {
      errors.push('Mobiltelefon må ha minst 8 siffer.');
      storedPhone = '';
    }
  }

  const spoken = text(language) || 'Norsk bokmål';
  if (!LANGUAGE_OPTIONS.includes(spoken)) errors.push('Velg språk fra listen.');

  let started = '';
  const periodRaw = text(periodFrom);
  if (periodRaw) {
    started = parseNbDate(periodRaw) || '';
    if (!started) errors.push('Ansatt siden må skrives som dd.mm.åååå.');
  }

  const departments = [];
  const seen = new Set();
  for (const row of Array.isArray(departmentIds) ? departmentIds : []) {
    const departmentId = text(row);
    if (!departmentId || seen.has(departmentId)) continue;
    seen.add(departmentId);
    departments.push(departmentId);
  }

  if (errors.length) return { ok: false, errors, sendWelcome: sendWelcome !== false };

  const welcome = sendWelcome !== false;
  const employee = draftInviteEmployee({
    firstName: given,
    lastName: familyName,
    email: address,
    accessLevel: levelId,
    at,
    id,
  });
  employee.person.phone = storedPhone;
  employee.person.language = spoken;
  employee.company.externalEmployeeNumber = text(externalEmployeeNumber);
  employee.company.departmentIds = departments;
  employee.company.workPercent = workPlanById(workPlan).workPercent;
  employee.company.periodFrom = started;
  if (!welcome) employee.invite = emptyInvite();
  return { ok: true, errors: [], sendWelcome: welcome, employee };
}
