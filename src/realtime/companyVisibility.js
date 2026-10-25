/**
 * Hva en person ser når hen slår opp en bedrift, og hva som skjer
 * når flere bedrifter, invitasjoner og medlemskap endres.
 * Bruker de samme rene funksjonene som appen. Ingen Firebase-kall.
 */

import {
  allows,
  allowsEconomy,
  allowsHr,
  companyTabAllowed,
  COMPANY_TAB_IDS,
  resolveActorAccess,
} from '../access/companyAccess.js';
import { companyFromBrreg } from '../project/company.js';
import {
  companyRegistrationDecision,
  manualCompany,
  organizationByOrgnr,
} from '../project/companyRegistry.js';
import {
  shapePublicCompany,
  shapePublicRoles,
  shapePublicUnits,
  storedCompanyProfile,
} from '../project/companyPublic.js';
import { publicUnitsNotRegistered } from '../project/companyUnits.js';
import {
  applyEmployeeClassification,
  canSeeSensitive,
  employeeDirectoryBucket,
  employeeShowsInSection,
  filterEmployees,
  isDeletedEmployee,
  maskNationalId,
  normalizeEmployee,
} from '../employees/model.js';
import {
  applyInviteSendResult,
  claimEmployeeSeatPlan,
  draftInviteEmployee,
  employeeRegisterUrl,
  invitesAwaitingSend,
  queueEmployeeInvite,
  unqueueEmployeeInvite,
} from '../employees/invite.js';
import { employeeVisibleSlice } from '../hr/model.js';
import { buildInviteMessage } from '../../functions/inviteMessage.js';
import {
  platformSwitchSegments,
  visibleCompanyWorkspaces,
} from '../utils/platformSwitch.js';
import { isGroupDeleted, isGroupDeactivated } from '../utils/groupLifecycleLogic.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createCompanyWorld() {
  const companies = [];
  const mail = [];
  const listeners = [];
  let seq = 0;
  const world = {
    companies,
    mail,
    nextId(prefix) {
      seq += 1;
      return `${prefix}${seq}`;
    },
    listen(companyId, sink) {
      const row = { companyId, sink };
      listeners.push(row);
      return () => {
        const index = listeners.indexOf(row);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    notify(companyId, kind) {
      for (const row of listeners) {
        if (row.companyId === companyId || row.companyId === '*') {
          row.sink.push({ companyId, kind, at: Date.now() });
        }
      }
    },
  };
  return world;
}

export function createBot(world, profile) {
  const events = [];
  const unsubs = [];
  return {
    ...profile,
    events,
    watch(companyId = '*') {
      unsubs.push(world.listen(companyId, events));
    },
    stop() {
      unsubs.forEach((unsub) => unsub());
    },
  };
}

function companyById(world, companyId) {
  return world.companies.find((row) => row.id === companyId) || null;
}

function replaceEmployee(company, employee) {
  const index = company.employees.findIndex((row) => row.id === employee.id);
  if (index < 0) company.employees.push(employee);
  else company.employees[index] = employee;
}

export function createCompanyFromLookup(world, { actorUid, raw, roles = null }) {
  const card = shapePublicCompany(raw);
  if (!card) throw new Error('company:invalid');
  const existing = organizationByOrgnr(world.companies, card.organisasjonsnummer);
  const decision = companyRegistrationDecision(existing);
  if (decision.kind === 'join') return { decision, company: existing, card };
  const stored = companyFromBrreg({
    organisasjonsnummer: card.organisasjonsnummer,
    navn: card.navn,
    organisasjonsform: card.organisasjonsform,
    naeringskode: card.naeringer[0]?.kode || '',
    naeringsbeskrivelse: card.naeringer[0]?.beskrivelse || '',
    addressLabel: card.forretning?.label || '',
    hjemmeside: card.hjemmeside,
    epostadresse: card.epostadresse,
    telefon: card.telefon,
  });
  const company = {
    id: world.nextId('co'),
    name: stored.navn,
    type: 'organization',
    active: true,
    archived: false,
    deleted: false,
    hiddenFromApp: false,
    ownerUid: actorUid,
    members: [actorUid],
    company: {
      ...stored,
      kind: card.kind,
      organisasjonsformKode: card.organisasjonsformKode,
      overordnetEnhet: card.overordnetEnhet,
    },
    publicRaw: raw,
    publicRoles: roles,
    books: { revenue: 50613141 },
    employees: [],
    hr: { memos: [], salaries: [], reviews: [], cases: [], tasks: [], contracts: [], files: [] },
    wall: [],
    policy: { version: 1, levels: {} },
  };
  world.companies.push(company);
  world.notify(company.id, 'created');
  return { decision, company, card };
}

export function createManualWorkspace(world, { actorUid, name, address }) {
  const built = manualCompany({ name, address });
  if (!built.ok) throw new Error(built.error);
  const company = {
    id: world.nextId('co'),
    name: built.company.navn,
    type: 'organization',
    active: true,
    archived: false,
    deleted: false,
    hiddenFromApp: false,
    ownerUid: actorUid,
    members: [actorUid],
    company: built.company,
    publicRaw: null,
    publicRoles: null,
    books: { revenue: 0 },
    employees: [],
    hr: { memos: [], salaries: [], reviews: [], cases: [], tasks: [], contracts: [], files: [] },
    wall: [],
    policy: { version: 1, levels: {} },
  };
  world.companies.push(company);
  world.notify(company.id, 'created');
  return company;
}

export function createUnderenhet(world, { actorUid, parent, raw }) {
  const card = shapePublicCompany(raw);
  const company = {
    id: world.nextId('co'),
    name: card.navn,
    type: 'organization',
    active: true,
    archived: false,
    deleted: false,
    hiddenFromApp: false,
    ownerUid: actorUid,
    parentCompanyId: parent.id,
    members: [actorUid],
    company: {
      ...companyFromBrreg({
        organisasjonsnummer: card.organisasjonsnummer,
        navn: card.navn,
        organisasjonsform: card.organisasjonsform,
      }),
      kind: 'underenhet',
      organisasjonsformKode: 'BEDR',
      overordnetEnhet: parent.company.organisasjonsnummer,
    },
    publicRaw: raw,
    publicRoles: null,
    books: { revenue: 0 },
    employees: [],
    hr: { memos: [], salaries: [], reviews: [], cases: [], tasks: [], contracts: [], files: [] },
    wall: [],
    policy: { version: 1, levels: {} },
  };
  world.companies.push(company);
  world.notify(company.id, 'created');
  return company;
}

export function employ(world, {
  companyId, uid, firstName, lastName, email, accessLevel, nationalId = '',
}) {
  const company = companyById(world, companyId);
  const row = normalizeEmployee({
    id: world.nextId('emp'),
    personUid: uid,
    person: { firstName, lastName, email, nationalId },
    company: { email, status: 'active', canLogin: true, accessLevel },
  });
  const placed = applyEmployeeClassification(row, { accessLevel });
  replaceEmployee(company, placed);
  if (uid && !company.members.includes(uid)) company.members.push(uid);
  world.notify(companyId, 'member');
  return placed;
}

export function queueMember(world, { companyId, actorUid, firstName, lastName, email, accessLevel }) {
  const company = companyById(world, companyId);
  assertCanInvite(company, actorUid);
  const draft = draftInviteEmployee({
    id: world.nextId('emp'),
    firstName,
    lastName,
    email,
    accessLevel,
    at: new Date().toISOString(),
  });
  const queued = queueEmployeeInvite(draft, { accessLevel, at: draft.createdAt });
  if (!queued.ok) return queued;
  replaceEmployee(company, queued.employee);
  world.notify(companyId, 'queued');
  return queued;
}

function assertCanInvite(company, actorUid) {
  if (company.ownerUid === actorUid) return;
  const access = resolveActorAccess({
    policy: company.policy,
    employees: company.employees,
    uid: actorUid,
  });
  // Begrenset redigering (read) eller Admin (write) på ansatte.
  if (!allows(access.grants, 'employees', 'read')) {
    const err = new Error('Bare administrator kan sende invitasjonen.');
    throw err;
  }
}

export function deliverInvite(world, { companyId, actorUid, employeeId, existingUser = false }) {
  const company = companyById(world, companyId);
  assertCanInvite(company, actorUid);
  const employee = company.employees.find((row) => row.id === employeeId);
  const queued = queueEmployeeInvite(employee);
  if (!queued.ok) return { ok: false, error: queued.error, mail: null };
  const url = employeeRegisterUrl({ email: queued.employee.invite.email, companyId });
  const message = buildInviteMessage({
    to: queued.employee.invite.email,
    name: `${queued.employee.person.firstName} ${queued.employee.person.lastName}`.trim(),
    familyId: companyId,
    familyName: company.name,
    groupType: 'organization',
    registerUrl: url,
    existingUser,
  });
  world.mail.push({ ...message, companyId });
  const next = applyInviteSendResult(queued.employee, { emailSent: true }, { at: new Date().toISOString() });
  replaceEmployee(company, next);
  world.notify(companyId, 'mail');
  return { ok: true, mail: message, employee: next };
}

export function failInvite(world, { companyId, employeeId }) {
  const company = companyById(world, companyId);
  const employee = company.employees.find((row) => row.id === employeeId);
  const next = applyInviteSendResult(employee, {
    emailSent: false,
    emailError: 'Kunne ikke sende invitasjon',
  });
  replaceEmployee(company, next);
  return next;
}

/** Personen trykker Godta på invitasjonen (respondGroupInvite). Uten Godta blir ingen medlem. */
export function claimInvite(world, { companyId, uid, email }) {
  const company = companyById(world, companyId);
  const plan = claimEmployeeSeatPlan({
    employees: company.employees,
    uid,
    authEmail: email,
    companyId,
    now: new Date().toISOString(),
  });
  if (plan.employeePatch && plan.employeeId) {
    const current = company.employees.find((row) => row.id === plan.employeeId);
    replaceEmployee(company, normalizeEmployee({ ...current, ...plan.employeePatch }));
    if (!company.members.includes(uid)) company.members.push(uid);
    world.notify(companyId, 'claimed');
  }
  return plan;
}

export function setMemberStatus(world, { companyId, employeeId, status }) {
  const company = companyById(world, companyId);
  const employee = company.employees.find((row) => row.id === employeeId);
  const next = applyEmployeeClassification(employee, { status });
  replaceEmployee(company, next);
  world.notify(companyId, 'status');
  return next;
}

export function removeMember(world, { companyId, employeeId }) {
  const next = setMemberStatus(world, { companyId, employeeId, status: 'deleted' });
  const company = companyById(world, companyId);
  if (next.personUid) {
    company.members = company.members.filter((uid) => uid !== next.personUid);
  }
  world.notify(companyId, 'removed');
  return next;
}

export function publishWall(world, { companyId, authorUid, body }) {
  const company = companyById(world, companyId);
  const access = resolveActorAccess({
    policy: company.policy,
    employees: company.employees,
    uid: authorUid,
    bypass: company.ownerUid === authorUid,
  });
  if (company.ownerUid !== authorUid && !allows(access.grants, 'companyPublic', 'read')) {
    throw new Error('Du kan ikke publisere på veggen.');
  }
  const post = { id: world.nextId('wall'), authorUid, body, deleted: false };
  company.wall.push(post);
  world.notify(companyId, 'wall');
  return post;
}

export function addHr(world, companyId, kind, row) {
  const company = companyById(world, companyId);
  company.hr[kind].push(row);
  world.notify(companyId, 'hr');
}

export function deactivateWorkspace(world, companyId) {
  const company = companyById(world, companyId);
  company.archived = true;
  company.active = false;
  world.notify(companyId, 'deactivated');
}

export function reactivateWorkspace(world, companyId) {
  const company = companyById(world, companyId);
  company.archived = false;
  company.active = true;
  company.deleted = false;
  company.hiddenFromApp = false;
  world.notify(companyId, 'reactivated');
}

export function deleteWorkspace(world, companyId) {
  const company = companyById(world, companyId);
  company.deleted = true;
  company.hiddenFromApp = true;
  company.active = false;
  company.archived = true;
  world.notify(companyId, 'deleted');
}

export function workspacesFor(world, uid) {
  return world.companies.filter((company) => company.members.includes(uid));
}

export function switcherFor(world, uid) {
  return visibleCompanyWorkspaces(workspacesFor(world, uid));
}

export function segmentsFor(world, uid) {
  return platformSwitchSegments(workspacesFor(world, uid));
}

function live(company) {
  return company && !isGroupDeleted(company) && !isGroupDeactivated(company);
}

export function publicSeekerView(world, orgnr) {
  const company = organizationByOrgnr(world.companies, orgnr);
  const card = company?.publicRaw
    ? shapePublicCompany(company.publicRaw)
    : storedCompanyProfile(company?.company);
  return {
    found: !!company,
    workspaceLive: live(company),
    card,
    roles: shapePublicRoles(company?.publicRoles || {}),
    employees: [],
    nationalIds: [],
    books: null,
    hr: null,
    wall: [],
    decision: companyRegistrationDecision(company),
  };
}

export function memberView(world, companyId, uid) {
  const company = companyById(world, companyId);
  if (!company || !company.members.includes(uid) || !live(company)) {
    return {
      inside: false,
      tabs: [],
      employees: [],
      nationalIds: [],
      books: null,
      hr: null,
      wall: [],
      canPublish: false,
    };
  }
  const access = resolveActorAccess({
    policy: company.policy,
    employees: company.employees,
    uid,
    bypass: company.ownerUid === uid,
  });
  const grants = access.grants;
  const lockedOut = Object.values(grants).every((value) => value === 'none');
  if (lockedOut) {
    return {
      inside: true,
      levelId: access.levelId,
      tabs: [],
      employees: [],
      nationalIds: [],
      books: null,
      hr: null,
      wall: [],
      canPublish: false,
      settings: false,
      units: false,
      grants,
    };
  }
  const admin = allowsHr(grants, 'see') || company.ownerUid === uid;
  const rows = allows(grants, 'employees', 'see')
    ? filterEmployees(company.employees, { status: 'active' })
    : [];
  const employees = rows.map((row) => {
    const name = `${row.person.firstName} ${row.person.lastName}`.trim();
    const seeId = canSeeSensitive(row, { uid, isAdmin: admin });
    return {
      id: row.id,
      name,
      email: row.person.email,
      nationalId: seeId ? row.person.nationalId : maskNationalId(row.person.nationalId),
      level: row.company.accessRole,
      section: employeeDirectoryBucket(row),
    };
  });
  const self = company.employees.find((row) => row.personUid === uid);
  let hr = null;
  if (allowsHr(grants, 'see')) hr = clone(company.hr);
  else if (self) hr = employeeVisibleSlice(company.hr, self.id);
  return {
    inside: true,
    levelId: access.levelId,
    tabs: COMPANY_TAB_IDS.filter((tab) => companyTabAllowed(tab, null, grants)),
    employees,
    nationalIds: employees.map((row) => row.nationalId),
    books: allowsEconomy(grants, 'see') ? clone(company.books) : null,
    hr,
    wall: company.wall.filter((post) => !post.deleted).map((post) => post.body),
    canPublish: company.ownerUid === uid || allows(grants, 'companyPublic', 'read'),
    settings: allows(grants, 'companyProfile', 'see') || allows(grants, 'moduleSettings', 'see') || allows(grants, 'accessControl', 'see') || company.ownerUid === uid,
    units: allows(grants, 'units', 'see'),
    grants,
  };
}

export function awaiting(company) {
  return invitesAwaitingSend(company.employees).map((row) => row.invite.email);
}

export function dropQueued(world, { companyId, employeeId }) {
  const company = companyById(world, companyId);
  const employee = company.employees.find((row) => row.id === employeeId);
  const result = unqueueEmployeeInvite(employee);
  if (result.ok) replaceEmployee(company, result.employee);
  return result;
}

export {
  employeeShowsInSection,
  isDeletedEmployee,
  publicUnitsNotRegistered,
  shapePublicUnits,
};
