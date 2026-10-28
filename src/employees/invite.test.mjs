import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmployee } from './model.js';
import {
  applyInviteSendResult,
  claimEmployeeSeatPlan,
  declineEmployeeInvitePlan,
  inviteStatusLabel,
  inviteTimeline,
  invitesDeclined,
  draftInviteEmployee,
  employeeRegisterUrl,
  invitesAwaitingSend,
  matchEmployeeByEmail,
  queueEmployeeInvite,
  sentInviteEmployee,
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

test('e-postmatch treffer både person- og arbeidsadresse', () => {
  const geir = normalizeEmployee({
    id: 'emp_geir',
    person: {
      firstName: 'Geir Ove',
      middleName: 'Ove',
      lastName: 'Andersen',
      email: 'goa@invest-as.no',
    },
    company: {
      email: 'goa@consult1.no',
      status: 'active',
      personnelKind: 'external',
    },
  });
  assert.equal(matchEmployeeByEmail([geir], 'goa@invest-as.no')?.id, 'emp_geir');
  assert.equal(matchEmployeeByEmail([geir], 'GOA@consult1.no')?.id, 'emp_geir');
  assert.equal(matchEmployeeByEmail([geir], 'other@example.com'), null);
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

test('avslått invitasjon vises for administrator og kan sendes på nytt som ny invitasjon', () => {
  const employee = normalizeEmployee(draftInviteEmployee({
    firstName: 'Eve',
    lastName: 'Lund',
    email: 'eve@firma.no',
    accessLevel: 'ansatt',
    id: 'emp_eve',
  }));
  employee.invite.status = 'sent';
  employee.invite.parentKey = 'eve_uid';
  const other = normalizeEmployee(draftInviteEmployee({
    firstName: 'Bo', lastName: 'Berg', email: 'bo@firma.no', accessLevel: 'ansatt', id: 'emp_bo',
  }));
  other.invite.status = 'sent';
  const plan = declineEmployeeInvitePlan({
    employees: [employee, other],
    authEmail: 'EVE@firma.no',
    now: '2026-10-25T12:00:00.000Z',
  });
  assert.deepEqual(plan.map((row) => row.employeeId), ['emp_eve']);
  // REV-23: uten bekreftet e-post avslås bare posten som venter på kontoen (invitasjonens nøkkel).
  assert.deepEqual(declineEmployeeInvitePlan({ employees: [employee, other], authEmail: '', uid: 'eve_uid' })
    .map((row) => row.employeeId), ['emp_eve']);
  assert.deepEqual(declineEmployeeInvitePlan({ employees: [employee, other], authEmail: '', uid: 'bo_uid' }), []);
  const declined = normalizeEmployee({ ...employee, ...plan[0].patch });
  assert.equal(declined.invite.status, 'declined');
  assert.equal(declined.invite.declinedAt, '2026-10-25T12:00:00.000Z');
  assert.equal(inviteStatusLabel('declined'), 'Avslo invitasjonen');
  assert.match(inviteStatusLabel('sent'), /venter på at personen godtar/);
  assert.equal(invitesDeclined([declined, other]).length, 1);
  const again = queueEmployeeInvite(declined, { at: '2026-10-26T08:00:00.000Z' });
  assert.equal(again.ok, true);
  assert.equal(again.employee.invite.status, 'queued');
  assert.equal(again.employee.invite.parentKey, '', 'ny invitasjon, ikke den som er besvart');
  assert.equal(again.employee.invite.declinedAt, '');
});

test('importert ansatt uten invitasjon vises som «Ikke invitert» og kan inviteres', async () => {
  const { employeeInviteState, employeesNotInvited, employeesMissingInviteEmail, inviteLevelFor, inviteOverview } = await import('./invite.js');
  const imported = normalizeEmployee({
    id: 'emp_imp',
    person: { firstName: 'Ida', lastName: 'Import', email: 'ida@firma.no' },
    company: { status: 'active' },
  });
  const noEmail = normalizeEmployee({
    id: 'emp_noemail',
    person: { firstName: 'Per', lastName: 'Uten' },
    company: { status: 'active', accessRole: 'Avdelingsleder' },
  });
  const linked = normalizeEmployee({
    id: 'emp_me',
    personUid: 'uid_me',
    person: { firstName: 'Meg', lastName: 'Selv', email: 'meg@firma.no' },
    company: { status: 'active' },
  });
  const gone = normalizeEmployee({
    id: 'emp_gone',
    person: { firstName: 'Ola', lastName: 'Slutta', email: 'ola@firma.no' },
    company: { status: 'former' },
  });
  const sent = normalizeEmployee({
    id: 'emp_sent',
    person: { firstName: 'Siv', lastName: 'Sendt', email: 'siv@firma.no' },
    company: { status: 'active' },
    invite: { status: 'sent', email: 'siv@firma.no' },
  });

  assert.deepEqual(employeeInviteState(imported), { key: 'none', label: 'Ikke invitert' });
  assert.equal(employeeInviteState(noEmail).key, 'missingEmail');
  assert.equal(employeeInviteState(linked).key, 'member');
  assert.equal(employeeInviteState(gone).key, 'closed');
  assert.equal(employeeInviteState(sent).label, 'Invitert – venter på svar');

  const rows = [imported, noEmail, linked, gone, sent];
  assert.deepEqual(employeesNotInvited(rows).map((r) => r.id), ['emp_imp']);
  assert.deepEqual(employeesMissingInviteEmail(rows).map((r) => r.id), ['emp_noemail']);
  assert.deepEqual(inviteOverview(rows), { none: 1, missingEmail: 1, queued: 0, sent: 1, declined: 0 });

  // Uten tilgangsnivå fra import brukes Ansatt; nivå fra import beholdes.
  assert.equal(inviteLevelFor(imported), 'ansatt');
  assert.equal(inviteLevelFor(noEmail), 'avdelingsleder');
  const queued = queueEmployeeInvite(imported, { accessLevel: inviteLevelFor(imported), at: '2026-10-26T10:00:00.000Z' });
  assert.equal(queued.ok, true);
  assert.equal(queued.employee.invite.status, 'queued');
  assert.equal(queued.employee.invite.email, 'ida@firma.no');
  assert.equal(queued.employee.company.accessLevel, 'ansatt');
  assert.equal(employeeInviteState(queued.employee).key, 'queued');
});

test('sendt invitasjon på medarbeideren gjelder når plassholderen er ryddet bort', () => {
  const row = (id, status, extra = {}) => ({
    id,
    person: { firstName: 'Geir', lastName: 'Test', email: 'goa@firma.no' },
    company: { status: 'active' },
    invite: { status, email: 'goa@firma.no' },
    ...extra,
  });
  const args = (employees) => ({ employees, uid: 'ny', authEmail: 'GOA@firma.no' });
  assert.equal(sentInviteEmployee(args([row('a', 'sent')]))?.id, 'a');
  assert.equal(sentInviteEmployee(args([row('a', 'sent', { personUid: 'ny' })]))?.id, 'a', 'samme konto kan svare');
  assert.equal(sentInviteEmployee(args([row('a', 'queued')])), null, 'ikke sendt ennå');
  assert.equal(sentInviteEmployee(args([row('a', 'declined')])), null);
  assert.equal(sentInviteEmployee(args([row('a', 'accepted')])), null);
  assert.equal(sentInviteEmployee(args([row('a', 'sent', { personUid: 'annen' })])), null, 'tatt av en annen konto');
  assert.equal(sentInviteEmployee(args([row('a', 'sent', { company: { status: 'former' } })])), null, 'sluttet');
  assert.equal(sentInviteEmployee({ employees: [row('a', 'sent')], uid: 'ny', authEmail: '' }), null);
});

test('Brukerkonto viser når invitasjonen ble sendt og besvart', () => {
  const base = { id: 'a', person: { firstName: 'Ida', lastName: 'Test', email: 'ida@firma.no' }, company: { status: 'active' } };
  assert.deepEqual(inviteTimeline(base), []);
  // Mens den venter på utsending vises når den ble lagt klar.
  assert.deepEqual(
    inviteTimeline({ ...base, invite: { status: 'queued', queuedAt: '2026-10-26T10:00:00.000Z' } }).map((row) => row.id),
    ['queued'],
  );
  const sent = applyInviteSendResult(
    { ...base, invite: { status: 'queued', queuedAt: '2026-10-26T10:00:00.000Z' } },
    { emailSent: true },
    { at: '2026-10-27T09:15:00.000Z' },
  );
  assert.deepEqual(inviteTimeline(sent), [{ id: 'sent', label: 'Sendt', at: '2026-10-27T09:15:00.000Z' }]);
  const answered = { ...sent, invite: { ...sent.invite, status: 'accepted', acceptedAt: '2026-10-28T08:00:00.000Z' } };
  assert.deepEqual(inviteTimeline(answered).map((row) => row.label), ['Sendt', 'Godtatt']);
  const declined = { ...sent, invite: { ...sent.invite, status: 'declined', declinedAt: '2026-10-28T08:00:00.000Z' } };
  assert.deepEqual(inviteTimeline(declined).map((row) => row.label), ['Sendt', 'Avslått']);
});

test('FL-11: invitasjon i appen er sendt selv om e-posten feilet, og kan godtas', () => {
  const employee = normalizeEmployee(draftInviteEmployee({
    firstName: 'Eve', lastName: 'Test', email: 'eve@firma.no', accessLevel: 'avdelingsleder', id: 'emp_eve',
  }));
  const result = applyInviteSendResult(employee, {
    inviteId: 'inv_1', invitee: { uid: 'eve' }, emailSent: false, emailError: 'SMTP nede',
  }, { at: '2026-10-11T11:00:00.000Z' });
  assert.equal(result.invite.status, 'sent');
  assert.equal(result.invite.sentAt, '2026-10-11T11:00:00.000Z');
  assert.equal(result.invite.parentKey, 'eve');
  assert.match(result.invite.error, /SMTP/);
  // Eldre rader står som «queued» med personens uid: Godta knytter og gir valgt nivå.
  const queued = { ...result, invite: { ...result.invite, status: 'queued' } };
  const plan = claimEmployeeSeatPlan({ employees: [queued], uid: 'eve', authEmail: 'eve@firma.no' });
  assert.equal(plan.ok, true);
  assert.equal(plan.employeeId, 'emp_eve');
  assert.equal(plan.accessLevel, 'avdelingsleder');
  // En annen konto kan ikke bruke en kø-rad.
  assert.equal(claimEmployeeSeatPlan({ employees: [queued], uid: 'annen', authEmail: 'eve@firma.no' }).skipped, true);
});

test('invitert på brukernavn: invitasjonens nøkkel (uid) treffer selv om e-posten er en annen', () => {
  const row = normalizeEmployee({
    id: 'emp_x',
    person: { firstName: 'X', lastName: 'Y', email: 'jobb@firma.no' },
    company: { status: 'active', accessLevel: 'ansatt' },
    invite: { status: 'sent', email: 'jobb@firma.no', parentKey: 'u-x' },
  });
  const plan = claimEmployeeSeatPlan({ employees: [row], uid: 'u-x', authEmail: 'privat@gmail.com' });
  assert.equal(plan.ok, true);
  assert.equal(plan.employeeId, 'emp_x');
});

test('SEC-26: ledertilgang knyttes bare på bekreftet e-post lik invitasjonsadressen, ikke på nøkkelen alene', () => {
  const leader = (level, extra = {}) => normalizeEmployee({
    id: `emp_${level}`,
    person: { firstName: 'Sjef', email: 'sjef@firma.no' },
    company: { status: 'active', accessLevel: level, accessLevels: [level], ...extra },
    invite: { status: 'sent', email: 'sjef@firma.no', accessLevel: level, parentKey: 'eve' },
  });
  for (const level of ['administrator', 'leder', 'avdelingsleder', 'hr_ansvarlig', 'iso_rolle']) {
    // Ubekreftet e-post: bare nøkkelen treffer (et medlem kan ha skrevet den med eldre regler).
    const plan = claimEmployeeSeatPlan({ employees: [leader(level)], uid: 'eve', authEmail: '' });
    assert.equal(plan.ok, false, level);
    assert.equal(plan.code, 'email-not-verified', level);
    assert.equal(plan.employeePatch, undefined, level);
    // Bekreftet, men en annen adresse enn invitasjonen ble sendt til.
    assert.equal(claimEmployeeSeatPlan({ employees: [leader(level)], uid: 'eve', authEmail: 'eve@firma.no' }).code, 'other-email');
    // Bekreftet adresse lik invitasjonen: knyttes som før.
    const ok = claimEmployeeSeatPlan({ employees: [leader(level)], uid: 'sjef', authEmail: 'Sjef@firma.no' });
    assert.equal(ok.ok, true, level);
    assert.equal(ok.employeePatch.personUid, 'sjef');
  }
  // Invitasjonens nivå og avvik fra nivået teller også.
  const viaInvite = normalizeEmployee({
    id: 'emp_i', company: { status: 'active', accessLevel: 'ansatt' },
    invite: { status: 'sent', email: 'sjef@firma.no', accessLevel: 'Øverste leder', parentKey: 'eve' },
  });
  assert.equal(claimEmployeeSeatPlan({ employees: [viaInvite], uid: 'eve', authEmail: '' }).code, 'email-not-verified');
  const withOverrides = leader('ansatt', { accessOverrides: { accessControl: 'write' } });
  assert.equal(claimEmployeeSeatPlan({ employees: [withOverrides], uid: 'eve', authEmail: '' }).code, 'email-not-verified');
  // En vanlig ansatt invitert på brukernavn eller telefon knyttes fortsatt på nøkkelen (REV-05).
  const plain = claimEmployeeSeatPlan({ employees: [leader('ansatt')], uid: 'eve', authEmail: '' });
  assert.equal(plain.ok, true);
  assert.equal(plain.employeePatch.personUid, 'eve');
  // En lederpost som allerede er knyttet til personen (administrator koblet den), står som før.
  const linked = { ...leader('leder'), personUid: 'eve', invite: { ...leader('leder').invite, status: 'none' } };
  const kept = claimEmployeeSeatPlan({ employees: [linked], uid: 'eve', authEmail: '' });
  assert.equal(kept.ok, true);
  assert.equal(kept.employeeId, 'emp_leder');
  // Har personen også en vanlig post å knytte, knyttes den, ikke lederposten.
  const both = claimEmployeeSeatPlan({ employees: [leader('administrator'), { ...leader('ansatt'), id: 'emp_vanlig' }], uid: 'eve', authEmail: '' });
  assert.equal(both.employeeId, 'emp_vanlig');
});

test('aktiv ansettelse velges før en avsluttet med samme e-post', () => {
  const rows = [
    normalizeEmployee({ id: 'gml', person: { email: 'a@firma.no' }, company: { status: 'inactive' }, invite: { status: 'sent', email: 'a@firma.no' } }),
    normalizeEmployee({ id: 'ny', person: { email: 'a@firma.no' }, company: { status: 'active' }, invite: { status: 'sent', email: 'a@firma.no' } }),
  ];
  assert.equal(claimEmployeeSeatPlan({ employees: rows, uid: 'u', authEmail: 'a@firma.no' }).employeeId, 'ny');
});
