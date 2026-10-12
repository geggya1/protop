import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmployee } from './model.js';
import {
  applyInviteSendResult,
  claimEmployeeSeatPlan,
  draftInviteEmployee,
  employeeRegisterUrl,
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
  assert.equal(ada.invite.parentKey, '');
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

test('registreringslenken er den vanlige, og mislykket e-post beholder køen', () => {
  const url = employeeRegisterUrl({ email: 'ada@firma.no', companyId: 'fam 1' });
  assert.equal(url, 'https://www.protop.no/register?email=ada%40firma.no&familyId=fam%201');
  const employee = normalizeEmployee(draftInviteEmployee({
    firstName: 'Ada',
    lastName: 'Nord',
    email: 'ada@firma.no',
    accessLevel: 'ansatt',
    id: 'emp_ada',
  }));
  const failed = applyInviteSendResult(employee, {
    key: 'adafirma',
    emailSent: false,
    emailError: 'Kunne ikke sende e-post',
  }, { at: '2026-10-11T11:00:00.000Z' });
  assert.equal(failed.invite.status, 'queued');
  assert.equal(failed.invite.parentKey, 'adafirma');
  assert.match(failed.invite.error, /e-post/i);
  const sent = applyInviteSendResult(failed, {
    key: 'adafirma',
    emailSent: true,
  }, { at: '2026-10-11T12:00:00.000Z' });
  assert.equal(sent.invite.status, 'sent');
  assert.equal(sent.invite.parentKey, 'adafirma');
  assert.equal(sent.invite.error, '');
  const existing = applyInviteSendResult(employee, {
    existingUser: true,
    invitee: { uid: 'user_9' },
    emailSent: true,
  });
  assert.equal(existing.invite.parentKey, 'user_9');
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
  const queued = normalizeEmployee(draftInviteEmployee({
    firstName: 'Bo',
    lastName: 'Berg',
    email: 'bo@firma.no',
    accessLevel: 'ansatt',
    id: 'emp_bo',
  }));
  const plan = claimEmployeeSeatPlan({
    employees: [employee, queued],
    uid: 'user_1',
    authEmail: 'Ada@firma.no',
    now: '2026-10-11T12:00:00.000Z',
    companyId: 'fam1',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.skipped, false);
  assert.equal(plan.employeePatch.personUid, 'user_1');
  assert.equal(plan.employeePatch.company.canLogin, true);
  assert.equal(plan.employeePatch.company.accessLevel, 'tilbud');
  assert.equal(plan.employeePatch.invite.status, 'accepted');
  assert.equal(plan.accessLevel, 'tilbud');

  const waiting = claimEmployeeSeatPlan({
    employees: [queued],
    uid: 'user_2',
    authEmail: 'bo@firma.no',
    now: '2026-10-11T12:00:00.000Z',
    companyId: 'fam1',
  });
  assert.equal(waiting.skipped, true);

  const stranger = claimEmployeeSeatPlan({
    employees: [employee],
    uid: 'user_2',
    authEmail: 'annen@firma.no',
    now: '2026-10-11T12:00:00.000Z',
    companyId: 'fam1',
  });
  assert.equal(stranger.skipped, true);

  const again = claimEmployeeSeatPlan({
    employees: [{
      ...employee,
      personUid: 'user_1',
      invite: { ...employee.invite, status: 'accepted', acceptedUid: 'user_1' },
    }],
    uid: 'user_1',
    authEmail: 'ada@firma.no',
    now: '2026-10-11T12:00:00.000Z',
    companyId: 'fam1',
  });
  assert.equal(again.already, true);
});
