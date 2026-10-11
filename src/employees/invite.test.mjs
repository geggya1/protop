import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmployee } from './model.js';
import {
  buildEmployeeInviteMessage,
  claimInvitePlan,
  draftInviteEmployee,
  employeeInviteUrl,
  invitesAwaitingSend,
  matchEmployeeByEmail,
  queueEmployeeInvite,
  unqueueEmployeeInvite,
} from './invite.js';

test('flere medarbeidere kan legges i kø uten at status blir sendt', () => {
  const ada = normalizeEmployee(draftInviteEmployee({
    firstName: 'Ada',
    lastName: 'Nord',
    email: 'Ada@Firma.no',
    accessLevel: 'ansatt',
    at: '2026-10-11T10:00:00.000Z',
    id: 'emp_ada',
  }));
  const bo = normalizeEmployee(draftInviteEmployee({
    firstName: 'Bo',
    lastName: 'Berg',
    email: 'bo@firma.no',
    accessLevel: 'avdelingsleder',
    id: 'emp_bo',
  }));
  assert.equal(ada.invite.status, 'queued');
  assert.equal(ada.invite.email, 'ada@firma.no');
  assert.equal(ada.company.accessLevel, 'ansatt');
  assert.equal(ada.company.accessRole, 'Ansatt');
  assert.equal(ada.company.canLogin, false);
  assert.equal(bo.company.accessRole, 'Avdelingsleder');
  assert.equal(invitesAwaitingSend([ada, bo]).length, 2);
  assert.equal(matchEmployeeByEmail([ada, bo], 'ADA@firma.no')?.id, 'emp_ada');
});

test('køen kan oppdateres og tas ut før e-post er sendt', () => {
  const row = normalizeEmployee(draftInviteEmployee({
    firstName: 'Cia',
    lastName: 'Dahl',
    email: 'cia@firma.no',
    accessLevel: 'ansatt',
    id: 'emp_cia',
  }));
  const raised = queueEmployeeInvite(row, { accessLevel: 'leder' });
  assert.equal(raised.ok, true);
  assert.equal(raised.employee.company.accessLevel, 'leder');
  assert.equal(raised.employee.invite.status, 'queued');
  const removed = unqueueEmployeeInvite(raised.employee);
  assert.equal(removed.ok, true);
  assert.equal(removed.employee.invite.status, 'none');
  assert.equal(unqueueEmployeeInvite({ ...row, invite: { ...row.invite, status: 'sent' } }).ok, false);
});

test('invitasjon uten e-post eller tilgang stoppes', () => {
  const missing = queueEmployeeInvite({
    person: { firstName: 'Dan', lastName: 'Ek' },
    company: { status: 'active' },
  });
  assert.equal(missing.ok, false);
  const noLevel = queueEmployeeInvite({
    person: { email: 'dan@firma.no' },
    company: { status: 'active' },
  });
  assert.match(noLevel.error, /tilgang/i);
});

test('e-posten peker på registrering eller innlogging og nevner rettigheten', () => {
  const fresh = employeeInviteUrl({
    email: 'ada@firma.no',
    companyId: 'fam1',
    token: 'tok_1',
    existingUser: false,
  });
  const existing = employeeInviteUrl({
    email: 'ada@firma.no',
    companyId: 'fam1',
    token: 'tok_1',
    existingUser: true,
  });
  assert.match(fresh, /^https:\/\/www\.protop\.no\/register\?/);
  assert.match(fresh, /employeeInvite=tok_1/);
  assert.match(existing, /\/login\?/);
  const message = buildEmployeeInviteMessage({
    to: 'ada@firma.no',
    name: 'Ada',
    companyName: 'Consult AS',
    accessLabel: 'Ansatt',
    registerUrl: fresh,
  });
  assert.match(message.subject, /Consult AS/);
  assert.match(message.text, /Ansatt/);
  assert.match(message.html, /employeeInvite=tok_1/);
  assert.doesNotMatch(message.html, /<script/i);
});

test('godtatt invitasjon knytter brukeren og beholder tilgangsnivået', () => {
  const employee = normalizeEmployee(draftInviteEmployee({
    firstName: 'Ada',
    lastName: 'Nord',
    email: 'ada@firma.no',
    accessLevel: 'tilbud',
    id: 'emp_ada',
  }));
  employee.invite.status = 'sent';
  const plan = claimInvitePlan({
    invite: {
      status: 'pending',
      email: 'ada@firma.no',
      companyId: 'fam1',
      employeeId: 'emp_ada',
      expiresAt: '2026-12-01T00:00:00.000Z',
    },
    employee,
    uid: 'user_1',
    authEmail: 'Ada@firma.no',
    now: '2026-10-11T12:00:00.000Z',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.employeePatch.personUid, 'user_1');
  assert.equal(plan.employeePatch.company.canLogin, true);
  assert.equal(plan.employeePatch.company.accessLevel, 'tilbud');
  assert.equal(plan.employeePatch.invite.status, 'accepted');
  assert.equal(plan.accessLevel, 'tilbud');

  const wrong = claimInvitePlan({
    invite: { status: 'pending', email: 'ada@firma.no', expiresAt: '2026-12-01T00:00:00.000Z' },
    employee,
    uid: 'user_2',
    authEmail: 'annen@firma.no',
    now: '2026-10-11T12:00:00.000Z',
  });
  assert.equal(wrong.ok, false);

  const again = claimInvitePlan({
    invite: { status: 'accepted', acceptedUid: 'user_1', companyId: 'fam1', employeeId: 'emp_ada' },
    employee,
    uid: 'user_1',
    authEmail: 'ada@firma.no',
    now: '2026-10-11T12:00:00.000Z',
  });
  assert.equal(again.already, true);
});
