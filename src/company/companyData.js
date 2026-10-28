/**
 * Felles oppslag for bedriftsskallet (CompanyDataProvider): personer, kunder og prosjekter.
 * Rene funksjoner uten Firebase.
 *
 * Kopiene av navn, nummer og kunde som ligger på timer, fravær, utlegg, kjøring og salg
 * slås opp på nytt når listen vises (hydrateRefs). Kopien brukes bare når originalen
 * ikke finnes lenger, for eksempel for en slettet person eller kunde.
 */
import { displayName } from '../employees/model.js';
import { employmentState, isActiveEmployee } from '../employees/employmentState.js';
import { projectLookupNumbers, projectNumberKey } from '../project/projectFields.js';


function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value).toLocaleLowerCase('nb-NO');
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const NO_NAME = 'Uten navn';

/* ───────── Personer ───────── */

function memberUid(member) {
  return text(member?.uid) || text(member?.id);
}

function memberActive(member) {
  if (!member) return false;
  return member.active !== false && member.deleted !== true && member.archived !== true && !member.leftAt;
}

function memberName(member) {
  return text(member?.name) || text(member?.displayName);
}

function memberPhoto(member) {
  return text(member?.photoURL) || text(member?.photoUrl);
}

function employeeName(employee) {
  const name = displayName(employee);
  return name === NO_NAME ? '' : name;
}

/**
 * Én rad per person: ansettelsen (employeeId) og medlemskapet (uid) for samme menneske
 * slås sammen via personUid. Navn fra ansattkortet, ellers fra medlemskapet.
 * members: families/{id}/parents (også inaktive), me: innlogget bruker (users/{uid}).
 */
export function buildCompanyDirectory({ employees = [], members = [], me = null } = {}) {
  const memberByUid = new Map();
  for (const member of Array.isArray(members) ? members : []) {
    const uid = memberUid(member);
    if (!uid) continue;
    const current = memberByUid.get(uid);
    // Aktivt medlemskap vinner over en gammel invitasjon eller et avsluttet medlemskap.
    if (!current || (!memberActive(current) && memberActive(member))) memberByUid.set(uid, member);
  }
  const meUid = text(me?.uid) || text(me?.id);
  const rows = [];
  const usedUids = new Set();
  for (const employee of Array.isArray(employees) ? employees : []) {
    const employeeId = text(employee?.id);
    if (!employeeId) continue;
    const uid = text(employee.personUid);
    const member = uid ? memberByUid.get(uid) || null : null;
    const self = uid && uid === meUid ? me : null;
    const state = employmentState(employee);
    rows.push({
      key: employeeId,
      employeeId,
      uid,
      name: employeeName(employee) || memberName(member) || text(self?.displayName),
      photo: text(employee.person?.photoUrl) || memberPhoto(member) || text(self?.photoURL),
      email: text(employee.company?.email) || text(employee.person?.email) || text(member?.email),
      state,
      active: isActiveEmployee(employee),
      levelIds: Array.isArray(employee.company?.accessLevels) ? employee.company.accessLevels.filter(Boolean) : [],
      admin: member?.admin === true,
      employee,
      member,
    });
    if (uid) usedUids.add(uid);
  }
  for (const [uid, member] of memberByUid) {
    if (usedUids.has(uid)) continue;
    const self = uid === meUid ? me : null;
    rows.push({
      key: uid,
      employeeId: '',
      uid,
      name: memberName(member) || text(self?.displayName),
      photo: memberPhoto(member) || text(self?.photoURL),
      email: text(member.email),
      state: memberActive(member) ? 'active' : 'inactive',
      active: memberActive(member),
      levelIds: [],
      admin: member.admin === true,
      employee: null,
      member,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  return indexDirectory(rows);
}

function indexDirectory(rows) {
  const byEmployeeId = new Map();
  const byUid = new Map();
  for (const row of rows) {
    if (row.employeeId) byEmployeeId.set(row.employeeId, row);
    if (!row.uid) continue;
    const current = byUid.get(row.uid);
    // Samme uid på flere ansettelser (gammel og ny): den aktive vinner.
    if (!current || (!current.active && row.active)) byUid.set(row.uid, row);
  }
  for (const row of rows) {
    const docId = text(row.member?.docId) || text(row.member?.id);
    if (docId && !byUid.has(docId)) byUid.set(docId, row);
  }
  return { rows, byEmployeeId, byUid };
}

// Indekser bygget fra en Map eller liste, så samme kilde ikke indekseres på nytt for hver rad.
const built = new WeakMap();

function cached(source, build) {
  if (typeof source !== 'object') return null;
  if (!built.has(source)) built.set(source, build());
  return built.get(source);
}

function directoryFrom(source) {
  if (!source) return null;
  if (source.byEmployeeId instanceof Map) return source;
  // Map eller liste med ansattkort (som hydrateHourEntry fikk før).
  return cached(source, () => buildCompanyDirectory({
    employees: source instanceof Map ? [...source.values()] : (Array.isArray(source) ? source : []),
  }));
}

/** Personen bak en id, enten det er ansatt-id eller uid. null når ingen treffer. */
export function resolvePerson(id, directory) {
  const wanted = text(id);
  const index = directoryFrom(directory);
  if (!wanted || !index) return null;
  return index.byEmployeeId.get(wanted) || index.byUid.get(wanted) || null;
}

/** Visningsnavn for id-en, ellers reserven (kopien på raden). */
export function personName(id, directory, fallback = '') {
  return resolvePerson(id, directory)?.name || text(fallback);
}

/* ───────── Kunder ───────── */

export function indexCustomers(list = []) {
  const rows = (Array.isArray(list) ? list : []).filter((row) => row && text(row.id));
  const byId = new Map();
  const byNumber = new Map();
  const byOrgnr = new Map();
  const byName = new Map();
  for (const row of rows) {
    byId.set(text(row.id), row);
    const number = text(row.customerNumber);
    if (number && !byNumber.has(number)) byNumber.set(number, row);
    const org = digits(row.orgnr);
    if (org && !byOrgnr.has(org)) byOrgnr.set(org, row);
    const name = fold(row.name);
    if (name && !byName.has(name)) byName.set(name, row);
  }
  return { list: rows, byId, byNumber, byOrgnr, byName };
}

function customersFrom(source) {
  if (!source) return null;
  if (source.byId instanceof Map && source.byNumber instanceof Map) return source;
  return cached(source, () => indexCustomers(source instanceof Map ? [...source.values()] : source));
}

/**
 * Kunden en rad, et prosjekt eller et utkast peker på: id, kundenummer, org.nr. eller navn
 * (samme rekkefølge som billingReady.customerForProject). ref kan også være en tekst (id).
 */
export function resolveCustomer(ref, customers) {
  const index = customersFrom(customers);
  if (!index || ref == null || ref === '') return null;
  if (typeof ref !== 'object') {
    const key = text(ref);
    return index.byId.get(key) || index.byNumber.get(key) || index.byOrgnr.get(digits(key)) || null;
  }
  const id = text(ref.customerId);
  if (id && index.byId.has(id)) return index.byId.get(id);
  const number = text(ref.customerNumber);
  if (number && index.byNumber.has(number)) return index.byNumber.get(number);
  const org = digits(ref.orgnr);
  if (org && index.byOrgnr.has(org)) return index.byOrgnr.get(org);
  const name = fold(ref.client || ref.customerName);
  if (name && index.byName.has(name)) return index.byName.get(name);
  return null;
}

/* ───────── Prosjekter ───────── */

export function indexProjects(list = []) {
  const rows = (Array.isArray(list) ? list : []).filter((row) => row && text(row.id));
  const byId = new Map();
  const byNumber = new Map();
  for (const row of rows) {
    byId.set(text(row.id), row);
    for (const number of projectLookupNumbers(row)) {
      // Eget nummer går foran nummer funnet i navnet til et annet prosjekt.
      if (!byNumber.has(number) || projectNumberKey(row.number) === number) byNumber.set(number, row);
    }
  }
  return { list: rows, byId, byNumber };
}

function projectsFrom(source) {
  if (!source) return null;
  if (source.byId instanceof Map && source.byNumber instanceof Map) return source;
  return cached(source, () => indexProjects(source instanceof Map ? [...source.values()] : source));
}

/** Prosjektet en rad peker på: projectId, ellers prosjektnummer. ref kan være id eller nummer. */
export function resolveProject(ref, projects) {
  const index = projectsFrom(projects);
  if (!index || ref == null || ref === '') return null;
  if (typeof ref !== 'object') {
    const key = text(ref);
    return index.byId.get(key) || index.byNumber.get(projectNumberKey(key)) || null;
  }
  const id = text(ref.projectId);
  if (id && index.byId.has(id)) return index.byId.get(id);
  const number = projectNumberKey(ref.projectNumber);
  if (number && index.byNumber.has(number)) return index.byNumber.get(number);
  return null;
}

/* ───────── Oppslag på rader ───────── */

const DEFAULT_FIELDS = {
  personId: 'employeeId',
  personName: 'employeeName',
  customerId: 'customerId',
  customerName: 'customerName',
  customerNumber: 'customerNumber',
  projectId: 'projectId',
  projectName: 'projectName',
  projectNumber: 'projectNumber',
};

/**
 * Raden med navn, nummer og kunde fra registrene (hydrateHourEntry gjort generell).
 * refs: { directory, customers, projects } fra useCompanyDirectory/useCustomers/useProjects,
 * eller Map/liste. Uten treff står kopien på raden. Uendret rad gis tilbake som den er,
 * så den kan brukes i useMemo før filtrering og sortering.
 * fields: andre feltnavn, f.eks. { personId: 'ownerUid', personName: 'ownerName' }.
 */
export function hydrateRefs(row, { directory = null, customers = null, projects = null } = {}, fields = null) {
  if (!row || typeof row !== 'object') return row;
  const f = fields ? { ...DEFAULT_FIELDS, ...fields } : DEFAULT_FIELDS;
  const people = directoryFrom(directory);
  const customerIndex = customersFrom(customers);
  const projectIndex = projectsFrom(projects);

  const before = {
    personName: text(row[f.personName]),
    customerName: text(row[f.customerName]),
    customerNumber: text(row[f.customerNumber]),
    projectName: text(row[f.projectName]),
    projectNumber: text(row[f.projectNumber]),
  };
  const next = { ...before };

  if (people) {
    const person = resolvePerson(row[f.personId], people);
    if (person?.name) next.personName = person.name;
  }

  const projectId = text(row[f.projectId]);
  const customerId = text(row[f.customerId]);
  const project = projectIndex && projectId ? projectIndex.byId.get(projectId) || null : null;
  if (project) {
    next.projectNumber = text(project.number) || next.projectNumber;
    next.projectName = text(project.name) || next.projectName;
    // Uten kunde på raden: kunden til prosjektet.
    if (!customerId) {
      const fromProject = customerIndex ? resolveCustomer(project, customerIndex) : null;
      if (fromProject) {
        next.customerName = text(fromProject.name) || next.customerName;
        next.customerNumber = text(fromProject.customerNumber) || next.customerNumber;
      } else if (text(project.client) && ((project.customerId && customerIndex) || !next.customerName)) {
        next.customerName = text(project.client);
      }
    }
  }
  if (customerId && customerIndex) {
    const customer = customerIndex.byId.get(customerId);
    if (customer) {
      next.customerName = text(customer.name) || next.customerName;
      next.customerNumber = text(customer.customerNumber) || next.customerNumber;
    }
  }
  if (project && !next.customerName && text(project.client)) next.customerName = text(project.client);

  const changed = Object.keys(before).filter((key) => next[key] !== before[key]);
  if (!changed.length) return row;
  const out = { ...row };
  for (const key of changed) out[f[key]] = next[key];
  return out;
}

/** hydrateRefs på en liste. Samme liste tilbake når ingen rader endres. */
export function hydrateRows(rows, refs, fields = null) {
  const list = Array.isArray(rows) ? rows : [];
  let changed = false;
  const out = list.map((row) => {
    const next = hydrateRefs(row, refs, fields);
    if (next !== row) changed = true;
    return next;
  });
  return changed ? out : list;
}

/**
 * Prosjektlisten en skjerm har lastet, med ferske versjoner fra sanntidslytteren.
 * En rad byttes bare når lytterens versjon er minst like ny (updatedAt), så egne
 * endringer som ikke er lagret ennå, blir stående. Rader bare skjermen har, beholdes.
 */
export function freshRows(rows, live) {
  const list = Array.isArray(rows) ? rows : [];
  const index = live?.byId instanceof Map ? live.byId : (live instanceof Map ? live : null);
  if (!index || !index.size) return list;
  let changed = false;
  const out = list.map((row) => {
    const fresh = row?.id ? index.get(row.id) : null;
    if (!fresh || fresh === row) return row;
    const mine = text(row.updatedAt);
    const theirs = text(fresh.updatedAt);
    if (mine && theirs && theirs < mine) return row;
    changed = true;
    return fresh;
  });
  return changed ? out : list;
}

/**
 * Kundelisten fra registeret når lytteren har svart fra skyen, ellers listen skjermen
 * selv har lastet (f.eks. fra anbud/state).
 */
export function liveCustomerList(slice, fallback = []) {
  if (slice?.ready && slice.source === 'remote') return slice.customers;
  return Array.isArray(fallback) && fallback.length ? fallback : (slice?.customers || []);
}
