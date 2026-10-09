/**
 * Ansattdata.
 * Person og CV kan leve på brukerens profil og knyttes til ett eller flere selskap.
 * Ansettelse, avdeling og tilgang ligger på selskapet.
 */
import { normalizePhone } from '../utils/phone.js';
import { sortByStartDesc, sortCoursesDesc } from './cvFormat.js';
import {
  EMPLOYEE_VERSION,
  FORM_SECTIONS,
  PERSONNEL_KIND_OPTIONS,
  STATUS_OPTIONS,
  scalarFields,
} from './schema.js';

const DATE_PATHS = ['person.birthDate', 'company.periodFrom', 'company.periodTo'];
const EMAIL_PATHS = ['person.email', 'company.email', 'person.kinEmail'];
const PHONE_PATHS = ['person.phone', 'person.kinPhone'];

const PERSON_KEYS = [
  'firstName', 'middleName', 'lastName', 'photoUrl', 'birthDate', 'gender', 'nationalId',
  'language', 'nationality', 'maritalStatus', 'email', 'phone', 'username',
  'address1', 'address2', 'address3', 'postalCode', 'place',
  'kinName', 'kinPhone', 'kinEmail', 'kinNote',
  'examYear', 'educationLevel', 'competence',
];

function text(value) {
  return String(value ?? '').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function readPath(source, path) {
  return String(path || '').split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), source);
}

export function writePath(source, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) return source;
  let cursor = source;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return source;
}

export function setEmployeePath(employee, path, value) {
  const next = clone(employee);
  writePath(next, path, value);
  return next;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPerson() {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    photoUrl: '',
    birthDate: '',
    gender: '',
    nationalId: '',
    language: 'Norsk bokmål',
    nationality: '',
    maritalStatus: '',
    email: '',
    phone: '',
    username: '',
    address1: '',
    address2: '',
    address3: '',
    postalCode: '',
    place: '',
    kinName: '',
    kinPhone: '',
    kinEmail: '',
    kinNote: '',
    examYear: '',
    educationLevel: '',
    competence: '',
  };
}

export function emptyCompany() {
  return {
    personnelKind: 'staff',
    status: 'active',
    external: false,
    canLogin: false,
    hasLicense: false,
    departmentIds: [],
    extraDepartments: [],
    title: '',
    accessRole: '',
    permissions: [],
    canHandleLegal: false,
    employmentType: '',
    compensationType: '',
    projectRole: '',
    email: '',
    externalEmployeeNumber: '',
    workPercent: '100',
    periodFrom: '',
    periodTo: '',
    comment: '',
  };
}

export function emptyCv() {
  return {
    headline: '',
    summary: '',
    education: [],
    certifications: [],
    courses: [],
    experience: [],
    projects: [],
  };
}

export function emptyEmployee(id = '') {
  return {
    id: id || '',
    version: EMPLOYEE_VERSION,
    createdAt: '',
    updatedAt: '',
    personUid: '',
    linkStatus: 'none',
    personSyncedAt: '',
    person: emptyPerson(),
    company: emptyCompany(),
    cv: emptyCv(),
    customFields: [],
    extras: {},
  };
}

export function emptyProfile() {
  return {
    version: EMPLOYEE_VERSION,
    updatedAt: '',
    person: emptyPerson(),
    cv: emptyCv(),
    customFields: [],
    links: [],
  };
}

export function parseNbDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const nb = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let day;
  let month;
  let year;
  if (nb) {
    day = Number(nb[1]);
    month = Number(nb[2]);
    year = Number(nb[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }
  const stamp = new Date(Date.UTC(year, month - 1, day));
  if (stamp.getUTCFullYear() !== year || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatNbDate(value) {
  const iso = parseNbDate(value);
  if (!iso) return text(value);
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function nationalIdDigits(value) {
  return text(value).replace(/\D/g, '');
}

export function validNationalId(value) {
  const digits = nationalIdDigits(value);
  if (digits.length !== 11) return false;
  const nums = [...digits].map(Number);
  const weights1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const weights2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const rest = (sum, weight) => {
    const mod = 11 - (sum % 11);
    return mod === 11 ? 0 : mod;
  };
  const k1 = rest(weights1.reduce((sum, weight, index) => sum + weight * nums[index], 0));
  if (k1 === 10 || k1 !== nums[9]) return false;
  const k2 = rest(weights2.reduce((sum, weight, index) => sum + weight * nums[index], 0));
  if (k2 === 10 || k2 !== nums[10]) return false;
  return true;
}

export function maskNationalId(value) {
  const digits = nationalIdDigits(value);
  if (digits.length < 6) return digits ? '••••••' : '';
  return `${digits.slice(0, 6)} •••••`;
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const row of value) {
    const item = text(row);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function itemId(prefix, value, index) {
  return text(value) || `${prefix}_${index + 1}`;
}

function rowText(row, key) {
  return text(row?.[key]);
}

function normalizeEducation(list) {
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('edu', row?.id, index),
    from: rowText(row, 'from'),
    to: rowText(row, 'to'),
    school: rowText(row, 'school'),
    program: rowText(row, 'program'),
  })).filter((row) => row.school || row.program || row.from || row.to);
}

function normalizeCertifications(list) {
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('cert', row?.id, index),
    title: rowText(row, 'title'),
  })).filter((row) => row.title);
}

function normalizeCourses(list) {
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('course', row?.id, index),
    date: rowText(row, 'date'),
    title: rowText(row, 'title'),
  })).filter((row) => row.title || row.date);
}

function normalizeExperience(list) {
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('exp', row?.id, index),
    employer: rowText(row, 'employer'),
    place: rowText(row, 'place'),
    from: rowText(row, 'from'),
    to: rowText(row, 'to'),
    current: bool(row?.current),
    title: rowText(row, 'title'),
    tasks: text(row?.tasks),
  })).filter((row) => row.employer || row.title || row.tasks);
}

function projectImageUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 8000);
  const compact = raw.replace(/\s+/g, '');
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(compact) && compact.length <= 700000) {
    return compact;
  }
  return '';
}

function projectImages(row) {
  const raw = [
    ...(Array.isArray(row?.images) ? row.images : []),
    row?.imageUrl,
  ];
  const images = [];
  for (const item of raw) {
    const url = projectImageUrl(item);
    if (!url || images.includes(url)) continue;
    images.push(url);
    if (images.length >= 8) break;
  }
  return images;
}

function projectLink(row) {
  const link = row?.link && typeof row.link === 'object' ? row.link : {};
  // Import knytter prosjektet til personen. owner company er reservert til senere flytting
  // inn i bedriftens prosjektregister, og beholdes hvis den allerede er satt.
  return {
    owner: link.owner === 'company' ? 'company' : 'person',
    companyProjectId: text(link.companyProjectId),
  };
}

function normalizeProjects(list) {
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('prj', row?.id, index),
    title: rowText(row, 'title'),
    images: projectImages(row),
    address: rowText(row, 'address'),
    category: rowText(row, 'category'),
    client: rowText(row, 'client'),
    object: rowText(row, 'object'),
    period: rowText(row, 'period'),
    cost: rowText(row, 'cost'),
    contact: rowText(row, 'contact'),
    phone: rowText(row, 'phone'),
    email: rowText(row, 'email').replace(/\s+/g, '').toLowerCase(),
    employer: rowText(row, 'employer'),
    roles: text(row?.roles),
    responsibility: text(row?.responsibility),
    area: rowText(row, 'area'),
    buildingClass: rowText(row, 'buildingClass'),
    description: text(row?.description),
    referenceName: rowText(row, 'referenceName'),
    contactCompany: rowText(row, 'contactCompany'),
    source: row?.source === 'cv' || row?.source === 'excel' ? row.source : 'manual',
    link: projectLink(row),
  })).filter((row) => row.title || row.client || row.responsibility || row.images.length);
}

function normalizeCustomFields(list) {
  const purposes = new Set(['required', 'cv', 'operations']);
  return (Array.isArray(list) ? list : []).map((row, index) => ({
    id: itemId('fld', row?.id, index),
    label: rowText(row, 'label'),
    value: text(row?.value),
    owner: row?.owner === 'company' ? 'company' : 'person',
    purpose: purposes.has(row?.purpose) ? row.purpose : 'operations',
  })).filter((row) => row.label);
}

function normalizeCv(raw) {
  const cv = raw && typeof raw === 'object' ? raw : {};
  return {
    headline: text(cv.headline),
    summary: text(cv.summary),
    education: normalizeEducation(cv.education),
    certifications: normalizeCertifications(cv.certifications),
    courses: normalizeCourses(cv.courses),
    experience: normalizeExperience(cv.experience),
    projects: normalizeProjects(cv.projects),
  };
}

function normalizePerson(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const person = emptyPerson();
  for (const key of PERSON_KEYS) person[key] = text(source[key]);
  person.email = person.email.toLowerCase();
  person.kinEmail = person.kinEmail.toLowerCase();
  person.phone = person.phone ? (normalizePhone(person.phone) || person.phone) : '';
  person.kinPhone = person.kinPhone ? (normalizePhone(person.kinPhone) || person.kinPhone) : '';
  person.nationalId = nationalIdDigits(person.nationalId);
  if (!person.language) person.language = 'Norsk bokmål';
  return person;
}

function statusOf(value) {
  const raw = text(value);
  if (raw === 'current') return 'active';
  if (raw === 'former') return 'inactive';
  return STATUS_OPTIONS.some((row) => row.value === raw) ? raw : 'active';
}

function personnelKindOf(source = {}) {
  const raw = text(source.personnelKind);
  if (PERSONNEL_KIND_OPTIONS.some((row) => row.value === raw)) return raw;
  const employment = text(source.employmentType).toLowerCase();
  if (/innleid|innleie/.test(employment)) return 'innleid';
  if (bool(source.external) || /ekstern/.test(employment)) return 'external';
  return 'staff';
}

export function personnelKind(employee) {
  return personnelKindOf(employee?.company || {});
}

export function personnelKindLabel(kind, companyName = '') {
  if (kind === 'innleid') return 'Innleid personell';
  if (kind === 'external') return 'Eksternt personell';
  const name = text(companyName);
  return name ? `${name}-personell` : 'Eget personell';
}

function percentOf(value) {
  const raw = text(value).replace('%', '').replace(',', '.').trim();
  if (!raw) return '';
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  const clamped = Math.max(0, Math.min(100, Math.round(num)));
  return String(clamped);
}

function normalizeCompany(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const company = emptyCompany();
  company.personnelKind = personnelKindOf(source);
  company.status = statusOf(source.status);
  company.external = company.personnelKind === 'external';
  company.canLogin = bool(source.canLogin);
  company.hasLicense = bool(source.hasLicense);
  company.departmentIds = stringList(source.departmentIds);
  company.extraDepartments = stringList(source.extraDepartments);
  company.title = text(source.title);
  company.accessRole = text(source.accessRole);
  company.permissions = stringList(source.permissions);
  company.canHandleLegal = bool(source.canHandleLegal);
  company.employmentType = text(source.employmentType);
  if (company.personnelKind === 'innleid' && !/innleid|innleie/.test(company.employmentType.toLowerCase())) {
    company.employmentType = company.employmentType || 'Innleid';
  }
  company.compensationType = text(source.compensationType);
  company.projectRole = text(source.projectRole);
  company.email = text(source.email).toLowerCase();
  company.externalEmployeeNumber = text(source.externalEmployeeNumber);
  company.workPercent = percentOf(source.workPercent);
  company.periodFrom = text(source.periodFrom);
  company.periodTo = text(source.periodTo);
  company.comment = text(source.comment);
  return company;
}

export function normalizeEmployee(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const employee = emptyEmployee(text(source.id));
  employee.version = EMPLOYEE_VERSION;
  employee.createdAt = text(source.createdAt);
  employee.updatedAt = text(source.updatedAt);
  employee.personUid = text(source.personUid);
  employee.linkStatus = employee.personUid ? 'linked' : 'none';
  employee.personSyncedAt = text(source.personSyncedAt);
  employee.person = normalizePerson(source.person);
  employee.company = normalizeCompany(source.company);
  employee.cv = normalizeCv(source.cv);
  employee.customFields = normalizeCustomFields(source.customFields);
  employee.extras = source.extras && typeof source.extras === 'object' && !Array.isArray(source.extras)
    ? clone(source.extras)
    : {};
  return employee;
}

export function normalizeProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const profile = emptyProfile();
  profile.updatedAt = text(source.updatedAt);
  profile.person = normalizePerson(source.person);
  profile.cv = normalizeCv(source.cv);
  profile.customFields = normalizeCustomFields(source.customFields).filter((row) => row.owner === 'person');
  const seen = new Set();
  profile.links = (Array.isArray(source.links) ? source.links : []).map((row) => ({
    companyId: text(row?.companyId),
    employeeId: text(row?.employeeId),
    companyName: text(row?.companyName),
  })).filter((row) => {
    if (!row.companyId || !row.employeeId) return false;
    const key = `${row.companyId}:${row.employeeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return profile;
}

export function displayName(employee) {
  const person = employee?.person || {};
  const parts = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean);
  return parts.join(' ') || 'Uten navn';
}

export function initials(employee) {
  const person = employee?.person || {};
  const first = text(person.firstName).charAt(0);
  const last = text(person.lastName).charAt(0);
  return `${first}${last}`.toUpperCase() || '?';
}

export function contactLine(employee) {
  const person = employee?.person || {};
  const company = employee?.company || {};
  return [person.phone, company.email || person.email].map(text).filter(Boolean).join(' · ');
}

export function cardSubtitle(employee, companyName = '') {
  const kind = personnelKind(employee);
  if (kind === 'external') return `Eksternt personell · ${text(companyName) || 'Selskapet'}`;
  if (kind === 'innleid') return 'Innleid personell';
  return text(employee?.company?.title) || personnelKindLabel('staff', companyName);
}

export function periodLabel(employee) {
  const from = formatNbDate(employee?.company?.periodFrom);
  const to = formatNbDate(employee?.company?.periodTo);
  if (!from && !to) return '';
  return `${from || '…'} – ${to || 'nåværende'}`;
}

export function departmentLabels(employee, departments = []) {
  const ids = new Set(employee?.company?.departmentIds || []);
  const named = (departments || [])
    .filter((row) => ids.has(row.id))
    .map((row) => text(row.name))
    .filter(Boolean);
  return [...named, ...(employee?.company?.extraDepartments || [])];
}

export function statusLabel(status) {
  return STATUS_OPTIONS.find((row) => row.value === statusOf(status))?.label || 'Aktiv';
}

export function employeeNumberLabel(employee) {
  const number = text(employee?.company?.externalEmployeeNumber);
  return number ? `Ansattnr ${number}` : '';
}

export function isInnleidEmployee(employee) {
  return personnelKind(employee) === 'innleid';
}

export function isDeletedEmployee(employee) {
  return statusOf(employee?.company?.status) === 'deleted';
}

export function applyEmployeeClassification(employee, patch = {}) {
  const next = normalizeEmployee(employee);
  const company = { ...next.company };
  if (Object.prototype.hasOwnProperty.call(patch, 'personnelKind') && patch.personnelKind) {
    const allowed = PERSONNEL_KIND_OPTIONS.some((row) => row.value === patch.personnelKind);
    if (allowed) {
      company.personnelKind = patch.personnelKind;
      company.external = patch.personnelKind === 'external';
      if (patch.personnelKind === 'innleid') {
        if (!/innleid|innleie/.test(text(company.employmentType).toLowerCase())) {
          company.employmentType = 'Innleid';
        }
      } else if (/innleid|innleie/.test(text(company.employmentType).toLowerCase())) {
        company.employmentType = patch.personnelKind === 'staff' ? 'Fast ansatt' : '';
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status') && patch.status) {
    const mapped = statusOf(patch.status);
    if (STATUS_OPTIONS.some((row) => row.value === mapped)) company.status = mapped;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'canLogin')) {
    company.canLogin = bool(patch.canLogin);
  }
  // Bakoverkompatibilitet for eldre kall som bruker innleid/external.
  if (Object.prototype.hasOwnProperty.call(patch, 'innleid') && !Object.prototype.hasOwnProperty.call(patch, 'personnelKind')) {
    company.personnelKind = patch.innleid ? 'innleid' : (company.personnelKind === 'innleid' ? 'staff' : company.personnelKind);
    if (company.personnelKind === 'innleid') company.employmentType = 'Innleid';
    else if (/innleid|innleie/.test(text(company.employmentType).toLowerCase())) company.employmentType = 'Fast ansatt';
    company.external = company.personnelKind === 'external';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'external') && !Object.prototype.hasOwnProperty.call(patch, 'personnelKind')) {
    company.personnelKind = patch.external ? 'external' : (company.personnelKind === 'external' ? 'staff' : company.personnelKind);
    company.external = company.personnelKind === 'external';
  }
  next.company = company;
  return normalizeEmployee(next);
}

function haystack(employee, departments) {
  const labels = departmentLabels(employee, departments);
  return [
    displayName(employee),
    employee?.person?.email,
    employee?.person?.phone,
    employee?.person?.username,
    employee?.company?.email,
    employee?.company?.title,
    employee?.company?.accessRole,
    employee?.company?.externalEmployeeNumber,
    employee?.cv?.headline,
    ...labels,
  ].map(text).join(' ').toLowerCase();
}

export function filterEmployees(list, {
  query = '',
  kind = 'all',
  status = 'active',
  departments = [],
} = {}) {
  const q = text(query).toLowerCase();
  // Eldre kall brukte status=innleid/external som kategori.
  let kindFilter = kind;
  let statusFilter = status;
  if (status === 'innleid' || status === 'external') {
    kindFilter = status;
    statusFilter = 'all';
  } else if (status === 'current') {
    statusFilter = 'active';
  } else if (status === 'former') {
    statusFilter = 'inactive';
  }
  const filtered = (list || []).filter((row) => {
    const rowKind = personnelKind(row);
    const rowStatus = statusOf(row.company?.status);
    if (kindFilter && kindFilter !== 'all' && rowKind !== kindFilter) return false;
    if (statusFilter && statusFilter !== 'all' && rowStatus !== statusFilter) return false;
    if (!q) return true;
    return haystack(row, departments).includes(q);
  });
  return sortEmployees(filtered);
}

export function sortEmployees(list) {
  return [...(list || [])].sort((a, b) => {
    const byName = displayName(a).localeCompare(displayName(b), 'nb');
    if (byName) return byName;
    return text(a?.company?.externalEmployeeNumber).localeCompare(
      text(b?.company?.externalEmployeeNumber),
      'nb',
      { numeric: true },
    );
  });
}

export function directoryStats(list) {
  const rows = list || [];
  return {
    total: rows.length,
    login: rows.filter((row) => row.company?.canLogin && personnelKind(row) !== 'external').length,
    staff: rows.filter((row) => personnelKind(row) === 'staff').length,
    external: rows.filter((row) => personnelKind(row) === 'external').length,
    innleid: rows.filter((row) => personnelKind(row) === 'innleid').length,
    active: rows.filter((row) => statusOf(row.company?.status) === 'active').length,
    inactive: rows.filter((row) => statusOf(row.company?.status) === 'inactive').length,
    leave: rows.filter((row) => statusOf(row.company?.status) === 'leave').length,
    deleted: rows.filter((row) => statusOf(row.company?.status) === 'deleted').length,
    licenses: rows.filter((row) => row.company?.hasLicense).length,
  };
}

function filled(value, type) {
  if (type === 'bool' || type === 'photo' || type === 'departments' || type === 'member' || type === 'tags') return true;
  return !!text(value);
}

export function gapReport(employee) {
  const row = normalizeEmployee(employee);
  const missing = [];
  for (const field of scalarFields()) {
    if (!field.requiredFor || field.requiredFor === 'contact') continue;
    if (field.type === 'departments' || field.type === 'member' || field.type === 'photo' || field.type === 'bool') continue;
    if (!filled(readPath(row, field.key), field.type)) {
      missing.push({
        key: field.key,
        label: field.label,
        owner: field.owner,
        requiredFor: field.requiredFor,
      });
    }
  }
  const hasContact = [row.person.email, row.person.phone, row.company.email].some((value) => text(value));
  if (!hasContact) {
    missing.push({
      key: 'contact',
      label: 'E-post eller mobil',
      owner: 'person',
      requiredFor: 'register',
    });
  }
  for (const section of FORM_SECTIONS) {
    if (!section.repeatable || section.requiredFor !== 'cv') continue;
    const items = readPath(row, section.collection);
    if (!Array.isArray(items) || !items.length) {
      missing.push({
        key: section.collection,
        label: section.title,
        owner: section.owner,
        requiredFor: 'cv',
      });
    }
  }
  const cvCustom = row.customFields.filter((field) => field.purpose === 'cv' && !text(field.value));
  for (const field of cvCustom) {
    missing.push({
      key: `custom:${field.id}`,
      label: field.label,
      owner: field.owner,
      requiredFor: 'cv',
    });
  }
  return {
    register: missing.filter((item) => item.requiredFor === 'register'),
    person: missing.filter((item) => item.requiredFor === 'person'),
    cv: missing.filter((item) => item.requiredFor === 'cv'),
  };
}

function validEmail(value) {
  const raw = text(value);
  if (!raw) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function validPhone(value) {
  const raw = text(value);
  if (!raw) return true;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function commitEmployee(draft, { scope = 'company' } = {}) {
  const errors = [];
  const next = clone(draft) || emptyEmployee();
  for (const path of DATE_PATHS) {
    const raw = text(readPath(next, path));
    if (!raw) {
      writePath(next, path, '');
      continue;
    }
    const iso = parseNbDate(raw);
    if (!iso) {
      const field = scalarFields().find((item) => item.key === path);
      errors.push(`${field?.label || 'Dato'} må skrives som dd.mm.åååå.`);
      writePath(next, path, '');
    } else {
      writePath(next, path, iso);
    }
  }
  for (const path of EMAIL_PATHS) {
    const raw = text(readPath(next, path));
    if (raw && !validEmail(raw)) {
      const field = scalarFields().find((item) => item.key === path);
      errors.push(`${field?.label || 'E-post'} er ikke en gyldig adresse.`);
    }
  }
  for (const project of next.cv?.projects || []) {
    if (text(project.email) && !validEmail(project.email)) {
      errors.push('E-post på referanseprosjekt er ikke gyldig.');
    }
  }
  for (const path of PHONE_PATHS) {
    const raw = text(readPath(next, path));
    if (raw && !validPhone(raw)) {
      const field = scalarFields().find((item) => item.key === path);
      errors.push(`${field?.label || 'Telefon'} må ha minst 8 siffer.`);
    }
  }
  const nationalId = text(next.person?.nationalId);
  if (nationalId && nationalIdDigits(nationalId).length !== 11) {
    errors.push('Personnummer må ha 11 siffer.');
  } else if (nationalId && !validNationalId(nationalId)) {
    errors.push('Personnummeret er ikke gyldig.');
  }
  const percentRaw = text(next.company?.workPercent);
  if (percentRaw && percentOf(percentRaw) === '' ) {
    errors.push('Arbeidsprosent må være et tall mellom 0 og 100.');
  }
  const employee = normalizeEmployee(next);
  if (!employee.id) employee.id = newId('emp');
  if (!employee.createdAt) employee.createdAt = new Date().toISOString();
  const gaps = gapReport(employee);
  if (scope === 'company') {
    for (const gap of gaps.register) errors.push(`${gap.label} må fylles ut.`);
  } else if (!text(employee.person.firstName) || !text(employee.person.lastName)) {
    errors.push('Fornavn og etternavn må fylles ut.');
  }
  return { ok: errors.length === 0, errors, employee };
}

export function presentEmployee(employee) {
  const next = normalizeEmployee(employee);
  for (const path of DATE_PATHS) writePath(next, path, formatNbDate(readPath(next, path)));
  return next;
}

export function linkClash(list, employee) {
  const uid = text(employee?.personUid);
  if (!uid) return null;
  return (list || []).find((row) => row.id !== employee.id && text(row.personUid) === uid) || null;
}

export function hasPersonContent(profile) {
  const row = normalizeProfile(profile);
  const person = row.person;
  const ignored = new Set(['language']);
  for (const key of PERSON_KEYS) {
    if (ignored.has(key)) continue;
    if (text(person[key])) return true;
  }
  if (text(row.cv.headline) || text(row.cv.summary)) return true;
  return ['education', 'certifications', 'courses', 'experience', 'projects']
    .some((key) => row.cv[key].length > 0);
}

function copyFilledPerson(target, source) {
  const next = { ...target };
  for (const key of PERSON_KEYS) {
    if (text(source[key])) next[key] = source[key];
  }
  return next;
}

function overlayCv(base, incoming, mode) {
  const cv = { ...base };
  if (text(incoming.headline) && (mode === 'replace' || !text(base.headline))) cv.headline = incoming.headline;
  if (text(incoming.summary) && (mode === 'replace' || !text(base.summary))) cv.summary = incoming.summary;
  for (const key of ['education', 'certifications', 'courses', 'experience', 'projects']) {
    if (mode === 'replace') {
      if (incoming[key].length) cv[key] = incoming[key];
    } else if (!base[key].length && incoming[key].length) {
      cv[key] = incoming[key];
    }
  }
  return cv;
}

export function applyProfessionalProfile(employee, profile, at = '') {
  const base = normalizeEmployee(employee);
  const prof = normalizeProfile(profile);
  const incoming = { ...prof.person };
  if (!text(profile?.person?.language)) incoming.language = '';
  const personCustom = prof.customFields.filter((field) => field.owner === 'person');
  const kept = base.customFields.filter((field) => (
    field.owner === 'company' || !personCustom.some((row) => row.id === field.id || row.label === field.label)
  ));
  return normalizeEmployee({
    ...base,
    person: copyFilledPerson(base.person, incoming),
    cv: overlayCv(base.cv, prof.cv, 'replace'),
    customFields: [...kept, ...personCustom.filter((field) => !kept.some((row) => row.id === field.id))],
    personSyncedAt: at || prof.updatedAt || new Date().toISOString(),
    linkStatus: base.personUid ? 'linked' : base.linkStatus,
  });
}

export function absorbCompanyIntoProfile(profile, employee) {
  const prof = normalizeProfile(profile);
  const row = normalizeEmployee(employee);
  const person = { ...prof.person };
  for (const key of PERSON_KEYS) {
    if (key === 'language') continue;
    if (!text(person[key]) && text(row.person[key])) person[key] = row.person[key];
  }
  if (!text(profile?.person?.language) && text(row.person.language)) person.language = row.person.language;
  const custom = [...prof.customFields];
  for (const field of row.customFields.filter((item) => item.owner === 'person')) {
    if (!custom.some((item) => item.id === field.id || item.label === field.label)) custom.push(field);
  }
  return normalizeProfile({
    ...prof,
    person,
    cv: overlayCv(prof.cv, row.cv, 'fill'),
    customFields: custom,
  });
}

export function profileFromEmployee(employee) {
  const row = normalizeEmployee(employee);
  return normalizeProfile({
    person: row.person,
    cv: row.cv,
    customFields: row.customFields.filter((field) => field.owner === 'person'),
    updatedAt: row.personSyncedAt || row.updatedAt,
    links: [],
  });
}

export function rememberLink(profile, link) {
  const next = normalizeProfile(profile);
  const companyId = text(link?.companyId);
  const employeeId = text(link?.employeeId);
  if (!companyId || !employeeId) return next;
  next.links = next.links.filter((row) => !(row.companyId === companyId && row.employeeId === employeeId));
  next.links.push({
    companyId,
    employeeId,
    companyName: text(link?.companyName),
  });
  return next;
}

export function canSeeSensitive(employee, { uid = '', isAdmin = false } = {}) {
  if (isAdmin) return true;
  return !!text(uid) && text(employee?.personUid) === text(uid);
}

export function blankRepeatItem(section) {
  const item = { id: newId(section.id.slice(0, 3) || 'row') };
  for (const field of section.fields || []) {
    if (field.type === 'bool') item[field.key] = false;
    else if (field.type === 'photos') item[field.key] = [];
    else item[field.key] = '';
  }
  return item;
}

export function taskLines(value) {
  return text(value).split(/\r?\n/).map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
}

export function buildCv(employee, { companyName = '' } = {}) {
  const row = normalizeEmployee(employee);
  const employer = text(companyName);
  const facts = [
    ['Født', formatNbDate(row.person.birthDate)],
    ['Sivil status', row.person.maritalStatus],
    ['Nasjonalitet', row.person.nationality],
    ['Språk', row.person.language],
    ['Arbeidsgiver', employer],
  ].filter(([, value]) => text(value));
  const yearSpan = (from, to, current) => {
    const end = current ? 'd.d.' : text(to);
    if (!text(from) && !end) return '';
    return [text(from), end].filter(Boolean).join(' – ');
  };
  const education = sortByStartDesc(row.cv.education, (item) => item.from).map((item) => ({
    id: item.id,
    when: yearSpan(item.from, item.to, false),
    school: item.school,
    program: item.program,
    from: item.from,
  }));
  const courses = sortCoursesDesc(row.cv.courses).map((item) => ({
    id: item.id,
    when: item.date,
    title: item.title,
  }));
  const experience = sortByStartDesc(row.cv.experience, (item) => item.from).map((item) => ({
    id: item.id,
    employer: item.employer,
    place: item.place,
    when: yearSpan(item.from, item.to, item.current),
    title: item.title,
    tasks: taskLines(item.tasks),
  }));
  return {
    name: displayName(row),
    title: text(row.cv.headline) || text(row.company.title),
    employer,
    photoUrl: row.person.photoUrl,
    facts,
    summary: row.cv.summary,
    education,
    certifications: row.cv.certifications.map((item) => item.title),
    courses,
    experience,
    projects: row.cv.projects,
    custom: row.customFields.filter((field) => field.purpose === 'cv' && text(field.value)),
    gaps: gapReport(row).cv,
  };
}

export function cvPlainText(cv) {
  const lines = ['CURRICULUM VITAE', cv?.name || '', cv?.title || '', ''];
  lines.push('Profil');
  for (const [label, value] of cv?.facts || []) lines.push(`${label}: ${value}`);
  if (cv?.employer && !(cv.facts || []).some(([label]) => label === 'Arbeidsgiver')) {
    lines.push(`Arbeidsgiver: ${cv.employer}`);
  }
  lines.push('', 'Oppsummering og nøkkelkvalifikasjoner', cv?.summary || '');
  lines.push('', 'Utdanning');
  for (const row of cv?.education || []) {
    lines.push([row.when, [row.school, row.program].filter(Boolean).join(' – ')].filter(Boolean).join('  '));
  }
  lines.push('', 'Sertifiseringer');
  for (const title of cv?.certifications || []) lines.push(`- ${title}`);
  lines.push('', 'Kurs');
  for (const row of cv?.courses || []) lines.push([row.when, row.title].filter(Boolean).join('  '));
  lines.push('', 'Erfaringer');
  for (const row of cv?.experience || []) {
    lines.push([row.employer, row.place].filter(Boolean).join(', '));
    lines.push([row.when, row.title].filter(Boolean).join('  '));
    for (const task of row.tasks || []) lines.push(`- ${task}`);
  }
  lines.push('', 'Referanseprosjekter');
  for (const row of cv?.projects || []) {
    lines.push(row.title || 'Prosjekt');
    if (row.address) lines.push(row.address);
    for (const url of row.images || []) {
      if (/^https?:\/\//i.test(url)) lines.push(`Prosjektbilde: ${url}`);
    }
    const bits = [
      ['Kategori', row.category],
      ['Kunde', row.client],
      ['Objekt', row.object],
      ['Periode', row.period],
      ['Kostnad', row.cost],
      ['Kontakt', row.contact],
      ['Telefon', row.phone],
      ['E-post', row.email],
      ['Arbeidsgiver', row.employer],
    ];
    for (const [label, value] of bits) {
      if (String(value || '').trim()) lines.push(`${label}: ${value}`);
    }
    if (row.roles) lines.push(`Roller: ${row.roles}`);
    if (row.responsibility) lines.push(`Ansvar: ${row.responsibility}`);
    lines.push('');
  }
  for (const field of cv?.custom || []) lines.push(`${field.label}: ${field.value}`);
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim();
}

export function choiceLabel(options, value) {
  if (Array.isArray(options) && options.length && typeof options[0] === 'object') {
    return options.find((row) => row.value === value)?.label || text(value);
  }
  return text(value);
}
