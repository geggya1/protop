/**
 * Hurtigimport av medarbeidere fra en oversiktsliste (Excel, CSV).
 * Kjente kolonner fyller ansettelsen. Ja/nei-kolonner som ikke er kjente felt
 * blir rettigheter på ansettelsen. De endrer ikke hvem som er administrator i ProTop.
 */
import { readSpreadsheetTables } from '../anbud/customerImport.js';
import {
  ACCESS_OPTIONS,
  PROJECT_ROLE_OPTIONS,
} from './schema.js';
import {
  commitEmployee,
  displayName,
  emptyEmployee,
  nationalIdDigits,
  newId,
  normalizeEmployee,
  parseNbDate,
  validNationalId,
} from './model.js';

const FIELD_ALIASES = [
  ['firstName', ['fornavn', 'firstname', 'givenname']],
  ['middleName', ['mellomnavn', 'middlename']],
  ['lastName', ['etternavn', 'lastname', 'surname', 'familyname']],
  ['fullName', ['navn', 'name', 'fulltnavn', 'ansattnavn', 'displayname']],
  ['email', ['epost', 'email', 'mail', 'epostadresse', 'epostprivat', 'privateemail']],
  ['workEmail', ['epostarbeid', 'arbeidsepost', 'workemail', 'companyemail']],
  ['phone', ['mobil', 'mobiltelefon', 'mobile', 'mobilephone', 'mobilnr']],
  ['phoneAlt', ['telefon', 'tlf', 'phone', 'telefonnr', 'phonenumber']],
  ['username', ['brukernavn', 'username', 'user']],
  ['title', ['tittel', 'stilling', 'title', 'jobbtittel', 'jobtitle', 'position']],
  ['department', ['avdeling', 'department', 'enhet', 'businessunit', 'kostnadssted']],
  ['status', ['ansettelsesstatus', 'status', 'employmentstatus']],
  ['external', ['ekstern', 'eksternmedarbeider', 'external', 'eksterne']],
  ['canLogin', ['kanloggeinn', 'login', 'innlogging', 'harinnlogging']],
  ['hasLicense', ['lisens', 'lisenser', 'brukerlisens', 'brukerenlisens', 'haslicense', 'license']],
  ['employmentType', ['typeansatt', 'ansettelsestype', 'employmenttype']],
  ['compensationType', ['typelonnskompensasjon', 'lonnskompensasjon', 'lonnsform', 'compensation', 'fastlonn']],
  ['workPercent', ['arbeidsprosent', 'stillingsprosent', 'workpercent', 'employmentrate', 'prosent']],
  ['periodFrom', ['ansattfra', 'startdato', 'fromdate', 'ansettelsesdato', 'startdate']],
  ['periodTo', ['ansatttil', 'sluttdato', 'enddate', 'todate', 'sluttetdato']],
  ['externalEmployeeNumber', ['eksterntansattnummer', 'ansattnummer', 'ansattnr', 'employeenumber', 'employeeid', 'ansattid']],
  ['accessRole', ['tilgangsstyringsrolle', 'tilgangsrolle', 'rettighetsrolle', 'accessrole', 'systemrolle', 'rolle', 'role']],
  ['canHandleLegal', ['behandlejuridiskesaker', 'kanbehandlejuridiskesaker', 'juridiskesaker', 'juridisk', 'legal']],
  ['projectRole', ['standardrollepaprosjekter', 'prosjektrolle', 'projectrole', 'standardrolle']],
  ['permissionsText', ['rettigheter', 'tilganger', 'permissions', 'accessrights', 'accessright']],
  ['nationalId', ['personnummer', 'fodselsnummer', 'fnr', 'nationalid', 'ssn']],
  ['birthDate', ['fodselsdato', 'birthdate', 'fodt', 'dateofbirth']],
  ['gender', ['kjonn', 'gender']],
  ['language', ['sprak', 'language']],
  ['nationality', ['nasjonalitet', 'nationality']],
  ['maritalStatus', ['sivilstatus', 'maritalstatus']],
  ['address1', ['adresse', 'address', 'adresselinje1', 'adresselinje', 'gate']],
  ['postalCode', ['postnr', 'postnummer', 'postalcode', 'zip']],
  ['place', ['poststed', 'sted', 'city']],
  ['kinName', ['parorende', 'naermesteparorende', 'kin', 'emergencycontact']],
  ['kinPhone', ['telefonparorende', 'mobilparorende', 'kinphone']],
  ['kinEmail', ['epostparorende', 'kinemail']],
  ['comment', ['kommentar', 'merknad', 'notat', 'notes']],
  ['examYear', ['eksamensar', 'examyear']],
  ['educationLevel', ['utdanningsniva', 'educationlevel']],
  ['competence', ['kompetanse', 'competence']],
];

const NAME_FIELDS = new Set(['firstName', 'lastName', 'fullName']);
const NAME_FALLBACK = new Set(['medarbeider', 'ansatt', 'employee', 'person', 'bruker']);
const ROLE_HEADERS = new Map([
  ['administrator', 'Administrator'],
  ['admin', 'Administrator'],
  ['hovedadministrator', 'Administrator'],
  ['leder', 'Leder'],
  ['avdelingsleder', 'Leder'],
  ['manager', 'Leder'],
  ['medarbeider', 'Medarbeider'],
  ['bruker', 'Medarbeider'],
  ['lesetilgang', 'Lesetilgang'],
  ['lese', 'Lesetilgang'],
  ['readonly', 'Lesetilgang'],
  ['gjest', 'Lesetilgang'],
]);
const ROLE_RANK = ['Lesetilgang', 'Medarbeider', 'Leder', 'Administrator'];
const KNOWN_ROLE = new Map([
  ['administrator', 'Administrator'],
  ['admin', 'Administrator'],
  ['hovedadministrator', 'Administrator'],
  ['leder', 'Leder'],
  ['avdelingsleder', 'Leder'],
  ['manager', 'Leder'],
  ['medarbeider', 'Medarbeider'],
  ['bruker', 'Medarbeider'],
  ['user', 'Medarbeider'],
  ['lesetilgang', 'Lesetilgang'],
  ['lese', 'Lesetilgang'],
  ['readonly', 'Lesetilgang'],
  ['gjest', 'Lesetilgang'],
]);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function foldHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function fieldAlias(header) {
  const key = foldHeader(header);
  if (!key) return '';
  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.some((alias) => foldHeader(alias) === key)) return field;
  }
  if (/^(avdeling|department|enhet|businessunit|kostnadssted)/.test(key)) return 'department';
  return '';
}

function boolToken(value) {
  const key = foldHeader(value);
  if (!key) return null;
  if (['ja', 'yes', 'j', 'y', 'true', 'sant', 'sann', 'x', '1', 'ok', 'on'].includes(key)) return true;
  if (['nei', 'no', 'n', 'false', 'usann', '0', 'av', 'off'].includes(key)) return false;
  return undefined;
}

function splitList(value) {
  return String(value || '').split(/[;\n|]/).flatMap((part) => part.split(',')).map((part) => text(part)).filter(Boolean);
}

function unique(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const value = text(item);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function splitName(full) {
  const raw = text(full);
  if (!raw) return { firstName: '', middleName: '', lastName: '' };
  if (raw.includes(',')) {
    const [last, rest] = raw.split(',');
    const parts = text(rest).split(' ').filter(Boolean);
    return {
      firstName: parts[0] || '',
      middleName: parts.slice(1).join(' '),
      lastName: text(last),
    };
  }
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function excelSerial(value) {
  if (!/^\d+(\.\d+)?$/.test(value)) return '';
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return '';
  const stamp = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  const year = stamp.getUTCFullYear();
  const month = String(stamp.getUTCMonth() + 1).padStart(2, '0');
  const day = String(stamp.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function coerceDate(value) {
  const raw = text(value);
  if (!raw) return { iso: '', invalid: false };
  const serial = excelSerial(raw);
  if (serial) return { iso: serial, invalid: false };
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = parseNbDate(slash ? `${slash[1]}.${slash[2]}.${slash[3]}` : raw);
  if (!iso) return { iso: '', invalid: true };
  return { iso, invalid: false };
}

function statusOf(value) {
  const key = foldHeader(value);
  if (!key) return '';
  if (/(permisjon|leave|sykemeldt)/.test(key)) return 'leave';
  if (/(sluttet|avsluttet|inaktiv|former|tidligere)/.test(key)) return 'former';
  if (/(navaerende|current|aktiv|ansatt|employed)/.test(key)) return 'current';
  return '';
}

function percentOf(value) {
  const raw = text(value).replace('%', '').replace(',', '.').trim();
  if (!raw) return '';
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  const scaled = num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
  if (scaled < 0 || scaled > 100) return '';
  return String(scaled);
}

function normalizeAccessRole(value) {
  const raw = text(value);
  if (!raw) return '';
  const known = KNOWN_ROLE.get(foldHeader(raw));
  if (known) return known;
  return ACCESS_OPTIONS.find((option) => foldHeader(option) === foldHeader(raw)) || raw;
}

function normalizeProjectRole(value) {
  const raw = text(value);
  if (!raw) return '';
  return PROJECT_ROLE_OPTIONS.find((option) => foldHeader(option) === foldHeader(raw)) || raw;
}

function highestRole(roles) {
  let best = '';
  let rank = -1;
  for (const role of roles) {
    const index = ROLE_RANK.indexOf(role);
    if (index > rank) {
      rank = index;
      best = role;
    }
  }
  return best;
}

function headerRank(row) {
  const cells = (row || []).map(text).filter(Boolean);
  if (!cells.length) return 0;
  const aliases = cells.filter((cell) => fieldAlias(cell)).length;
  const name = cells.some((cell) => NAME_FIELDS.has(fieldAlias(cell)) || NAME_FALLBACK.has(foldHeader(cell)));
  return aliases * 10 + (name ? 5 : 0);
}

function findHeaderIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 15); index += 1) {
    const rank = headerRank(table[index]);
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 10 ? best : -1;
}

function columnValues(table, index, start) {
  const values = [];
  for (const row of table.slice(start)) {
    const value = text(row?.[index]);
    if (value) values.push(value);
  }
  return values;
}

function classifyColumns(headerRow, dataRows) {
  const columns = headerRow.map((header, index) => {
    const label = text(header);
    const field = fieldAlias(label);
    if (!label) return { index, header: '', kind: 'ignore' };
    if (field) return { index, header: label, kind: 'field', field };
    return { index, header: label, kind: 'pending' };
  });
  for (const column of columns) {
    if (column.kind !== 'pending') continue;
    const values = columnValues(dataRows, column.index, 0);
    if (!values.length) {
      column.kind = 'ignore';
      continue;
    }
    const flags = values.map(boolToken);
    if (flags.every((flag) => flag === true || flag === false)) {
      const role = ROLE_HEADERS.get(foldHeader(column.header));
      if (role) {
        column.kind = 'role';
        column.role = role;
      } else {
        column.kind = 'permission';
      }
      continue;
    }
    column.kind = 'custom';
  }
  if (!columns.some((column) => column.kind === 'field' && NAME_FIELDS.has(column.field))) {
    const fallback = columns.find((column) => (
      column.kind === 'custom' && NAME_FALLBACK.has(foldHeader(column.header))
    ));
    if (fallback) {
      fallback.kind = 'field';
      fallback.field = 'fullName';
    }
  }
  return columns;
}

function firstValue(bag, key) {
  return (bag[key] || []).map(text).find(Boolean) || '';
}

function joined(bag, key) {
  return unique((bag[key] || []).flatMap(splitList));
}

function assignDepartments(names, departments) {
  const departmentIds = [];
  const extraDepartments = [];
  for (const name of names) {
    const hit = (departments || []).find((unit) => foldHeader(unit.name) === foldHeader(name) && unit.id);
    if (hit) departmentIds.push(hit.id);
    else extraDepartments.push(name);
  }
  return { departmentIds: unique(departmentIds), extraDepartments: unique(extraDepartments) };
}

function recoverNationalId(value) {
  let digits = nationalIdDigits(value);
  if (digits.length === 10) digits = `0${digits}`;
  return digits;
}

function validEmail(value) {
  const raw = text(value);
  if (!raw) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function readRow(cells, columns) {
  const bag = {};
  const permissions = [];
  const roles = [];
  const custom = [];
  for (const column of columns) {
    const value = text(cells?.[column.index]);
    if (column.kind === 'field') {
      if (!bag[column.field]) bag[column.field] = [];
      bag[column.field].push(value);
    } else if (column.kind === 'permission' || column.kind === 'role') {
      if (boolToken(value) === true) {
        const label = column.kind === 'role' ? column.role : column.header;
        permissions.push(label);
        if (column.kind === 'role') roles.push(column.role);
      }
    } else if (column.kind === 'custom' && value) {
      custom.push({ label: column.header, value });
    }
  }
  for (const token of joined(bag, 'permissionsText')) {
    const role = normalizeAccessRole(token);
    if (ACCESS_OPTIONS.includes(role)) {
      roles.push(role);
      permissions.push(role);
    } else {
      permissions.push(token);
    }
  }
  return { bag, permissions: unique(permissions), roles: unique(roles), custom };
}

function namesFrom(bag) {
  const named = splitName(firstValue(bag, 'fullName'));
  return {
    firstName: firstValue(bag, 'firstName') || named.firstName,
    middleName: firstValue(bag, 'middleName') || named.middleName,
    lastName: firstValue(bag, 'lastName') || named.lastName,
  };
}

function matchExisting(list, draft) {
  const email = text(draft.person.email || draft.company.email).toLowerCase();
  const number = text(draft.company.externalEmployeeNumber);
  const name = displayName(draft).toLowerCase();
  if (email) {
    const hits = list.filter((row) => text(row.person?.email || row.company?.email).toLowerCase() === email);
    if (hits.length) return hits[0];
  }
  if (number) {
    const hits = list.filter((row) => text(row.company?.externalEmployeeNumber) === number);
    if (hits.length === 1) return hits[0];
  }
  if (name && name !== 'uten navn') {
    const hits = list.filter((row) => displayName(row).toLowerCase() === name);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function upsertCustom(fields, label, value) {
  const key = foldHeader(label);
  const personOwned = fields.some((field) => foldHeader(field.label) === key && field.owner === 'person');
  const id = personOwned ? `fld_co_${key}` : `fld_${key}`;
  const index = fields.findIndex((field) => field.id === id || (foldHeader(field.label) === key && field.owner === 'company'));
  const next = { id, label, value, owner: 'company', purpose: 'operations' };
  if (index >= 0) {
    fields[index] = { ...fields[index], ...next, id: fields[index].id || id };
  } else {
    fields.push(next);
  }
}

function buildDraft(existing, bag, rights, departments) {
  const warnings = [];
  const names = namesFrom(bag);
  const base = existing ? normalizeEmployee(existing) : emptyEmployee(newId('emp'));
  const person = { ...base.person };
  if (names.firstName) person.firstName = names.firstName;
  if (names.middleName) person.middleName = names.middleName;
  if (names.lastName) person.lastName = names.lastName;
  const company = { ...base.company };
  const customFields = [...base.customFields];

  const email = firstValue(bag, 'email');
  const workEmail = firstValue(bag, 'workEmail');
  if (email) {
    if (validEmail(email)) person.email = email.toLowerCase();
    else warnings.push('E-post er ikke gyldig og ble ikke importert.');
  }
  if (workEmail) {
    if (validEmail(workEmail)) company.email = workEmail.toLowerCase();
    else warnings.push('E-post arbeid er ikke gyldig og ble ikke importert.');
  }
  const phone = firstValue(bag, 'phone') || firstValue(bag, 'phoneAlt');
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) person.phone = phone;
    else warnings.push('Telefonnummeret ble ikke importert.');
  }
  for (const key of ['username', 'gender', 'language', 'nationality', 'maritalStatus', 'address1', 'postalCode', 'place', 'kinName', 'kinEmail', 'examYear', 'educationLevel', 'competence']) {
    const value = firstValue(bag, key);
    if (value) person[key] = key === 'kinEmail' ? value.toLowerCase() : value;
  }
  const kinPhone = firstValue(bag, 'kinPhone');
  if (kinPhone) person.kinPhone = kinPhone;

  let nationalBlock = '';
  const nationalRaw = firstValue(bag, 'nationalId');
  if (nationalRaw) {
    const digits = recoverNationalId(nationalRaw);
    if (!validNationalId(digits)) {
      if (existing) warnings.push('Personnummeret er ikke gyldig og ble ikke endret.');
      else nationalBlock = 'Personnummeret er ikke gyldig.';
    } else if (base.person.nationalId && base.person.nationalId !== digits) {
      warnings.push('Personnummeret i listen er et annet enn det som er lagret, og ble ikke endret.');
    } else {
      person.nationalId = digits;
    }
  }

  for (const [key, label] of [['birthDate', 'Fødselsdato'], ['periodFrom', 'Ansatt fra'], ['periodTo', 'Ansatt til']]) {
    const raw = firstValue(bag, key);
    if (!raw) continue;
    const coerced = coerceDate(raw);
    if (coerced.invalid) {
      warnings.push(`${label} ble ikke importert.`);
      continue;
    }
    if (key === 'birthDate') person.birthDate = coerced.iso;
    else company[key] = coerced.iso;
  }

  const title = firstValue(bag, 'title');
  if (title) company.title = title;
  const employmentType = firstValue(bag, 'employmentType');
  if (employmentType) company.employmentType = employmentType;
  const compensationType = firstValue(bag, 'compensationType');
  if (compensationType) company.compensationType = compensationType;
  const projectRole = normalizeProjectRole(firstValue(bag, 'projectRole'));
  if (projectRole) company.projectRole = projectRole;
  const number = firstValue(bag, 'externalEmployeeNumber');
  if (number) company.externalEmployeeNumber = number;
  const comment = firstValue(bag, 'comment');
  if (comment) company.comment = comment;
  const status = statusOf(firstValue(bag, 'status'));
  if (status) company.status = status;
  const percent = percentOf(firstValue(bag, 'workPercent'));
  if (percent) company.workPercent = percent;

  const explicitRole = normalizeAccessRole(firstValue(bag, 'accessRole'));
  const matrixRole = highestRole(rights.roles);
  if (explicitRole) company.accessRole = explicitRole;

  for (const key of ['external', 'canLogin', 'hasLicense', 'canHandleLegal']) {
    const raw = firstValue(bag, key);
    const flag = boolToken(raw);
    if (flag === true || flag === false) company[key] = flag;
  }
  if (boolToken(firstValue(bag, 'external')) == null && /ekstern|innleid/.test(foldHeader(employmentType))) {
    company.external = true;
  }

  const departmentNames = joined(bag, 'department');
  if (departmentNames.length) {
    const assigned = assignDepartments(departmentNames, departments);
    company.departmentIds = assigned.departmentIds;
    company.extraDepartments = assigned.extraDepartments;
  }

  return {
    nationalBlock,
    warnings,
    person,
    company,
    customFields,
    base,
    explicitRole,
    matrixRole,
  };
}

function skipped(name, reason, permissions = [], email = '', warnings = []) {
  return {
    action: 'skip',
    name,
    email,
    accessRole: '',
    permissions,
    warnings,
    reason,
    employee: null,
  };
}

function finishEmployee(state, rowRights, hasRights) {
  const company = { ...state.company };
  if (!state.explicitRole && state.matrixRole) company.accessRole = state.matrixRole;
  if (hasRights) company.permissions = rowRights.permissions;
  const customFields = [...state.customFields];
  for (const field of rowRights.custom) upsertCustom(customFields, field.label, field.value);
  const employee = normalizeEmployee({
    ...state.base,
    person: state.person,
    company,
    customFields,
  });
  const committed = commitEmployee(employee, { scope: 'company' });
  if (!committed.ok) {
    return { skip: true, reason: committed.errors[0] || 'Raden kan ikke importeres.', warnings: state.warnings };
  }
  return { skip: false, employee: committed.employee, warnings: state.warnings };
}

function rowLabel(bag, employee) {
  if (employee) return displayName(employee);
  const names = namesFrom(bag);
  return [names.firstName, names.middleName, names.lastName].filter(Boolean).join(' ') || 'Uten navn';
}

export async function planEmployeeImport(bytes, filename, { existing = [], departments = [] } = {}) {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables) {
    const headerIndex = findHeaderIndex(sheet.table);
    if (headerIndex < 0) continue;
    const rank = headerRank(sheet.table[headerIndex]);
    if (!best || rank > best.rank) best = { sheet, headerIndex, rank };
  }
  if (!best) {
    throw new Error('Fant ingen medarbeiderliste. Oversikten trenger en navnekolonne og minst ett felt til, for eksempel e-post, avdeling eller tilgang.');
  }
  const headerRow = best.sheet.table[best.headerIndex];
  const dataRows = best.sheet.table.slice(best.headerIndex + 1);
  const columns = classifyColumns(headerRow, dataRows);
  if (!columns.some((column) => column.kind === 'field' && NAME_FIELDS.has(column.field))) {
    throw new Error('Listen mangler en navnekolonne.');
  }
  const permissionColumns = columns.filter((column) => column.kind === 'permission' || column.kind === 'role').map((column) => column.header);
  const customColumns = columns.filter((column) => column.kind === 'custom').map((column) => column.header);
  const hasRights = columns.some((column) => column.kind === 'permission' || column.kind === 'role' || (column.kind === 'field' && column.field === 'permissionsText'));
  const working = (existing || []).map((row) => normalizeEmployee(row));
  const planned = [];
  for (const cells of dataRows) {
    if (!(cells || []).some((cell) => text(cell))) continue;
    const rights = readRow(cells, columns);
    const bag = rights.bag;
    const names = namesFrom(bag);
    if (!names.firstName || !names.lastName) {
      planned.push(skipped(rowLabel(bag), 'Mangler fornavn og etternavn.', rights.permissions));
      continue;
    }
    const probe = normalizeEmployee({
      person: {
        ...names,
        email: firstValue(bag, 'email') || firstValue(bag, 'workEmail'),
      },
      company: {
        email: firstValue(bag, 'workEmail'),
        externalEmployeeNumber: firstValue(bag, 'externalEmployeeNumber'),
      },
    });
    const current = matchExisting(working, probe);
    const built = buildDraft(current, bag, rights, departments);
    if (built.nationalBlock) {
      planned.push(skipped(rowLabel(bag), built.nationalBlock, rights.permissions, text(probe.person.email)));
      continue;
    }
    const finished = finishEmployee(built, rights, hasRights);
    if (finished.skip) {
      planned.push(skipped(
        rowLabel(bag, null),
        finished.reason,
        rights.permissions,
        text(built.person?.email || probe.person.email),
        finished.warnings || [],
      ));
      continue;
    }
    const employee = finished.employee;
    const index = working.findIndex((row) => row.id === employee.id);
    if (index >= 0) working[index] = employee;
    else working.push(employee);
    const previous = planned.find((row) => row.employee?.id === employee.id);
    const action = previous?.action === 'create' || (!current && !previous) ? 'create' : 'update';
    if (previous) planned.splice(planned.indexOf(previous), 1);
    planned.push({
      action,
      name: displayName(employee),
      email: employee.person.email || employee.company.email,
      accessRole: employee.company.accessRole,
      permissions: employee.company.permissions,
      canLogin: employee.company.canLogin,
      hasLicense: employee.company.hasLicense,
      canHandleLegal: employee.company.canHandleLegal,
      external: employee.company.external,
      warnings: finished.warnings,
      reason: '',
      employee,
    });
  }
  if (!planned.length) throw new Error('Listen har ingen rader å importere.');
  return {
    filename: filename || '',
    sheetName: best.sheet.name,
    permissionColumns,
    customColumns,
    rows: planned,
  };
}

export const EMPLOYEE_IMPORT_ACCEPT = [
  '.csv', '.txt', '.xml', '.xlsx',
  'text/csv', 'text/plain', 'application/xml', 'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');
