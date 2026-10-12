import assert from 'node:assert/strict';
import test from 'node:test';
import { commitEmployee, normalizeEmployee } from './model.js';
import { draftInviteEmployee } from './invite.js';
import {
  buildFirstRegistration,
  defaultRegistrationLevel,
  registrationEmailState,
  registrationLevels,
  workPlanById,
} from './register.js';

test('tilgangslisten følger interne og eksterne', () => {
  assert.deepEqual(registrationLevels('internal').map((level) => level.order), [3, 4, 6, 7, 8]);
  assert.deepEqual(
    registrationLevels('external').map((level) => level.id),
    ['regnskap_ekstern', 'innleie_ekstern', 'ansatt_andre_avdelinger'],
  );
  assert.deepEqual(registrationLevels('external', { canEditAccess: false }).map((level) => level.id), ['ansatt']);
  assert.equal(defaultRegistrationLevel('internal'), 'ansatt');
  assert.equal(defaultRegistrationLevel('external'), 'regnskap_ekstern');
  assert.equal(workPlanById('part-20').workPercent, '50');
  assert.equal(workPlanById('ukjent').label, 'Fulltid - 40t');
});

test('e-post skiller tom, ugyldig, ny og allerede registrert', () => {
  const ada = normalizeEmployee(draftInviteEmployee({
    firstName: 'Ada',
    lastName: 'Nord',
    email: 'ada@firma.no',
    accessLevel: 'ansatt',
    id: 'emp_ada',
  }));
  assert.equal(registrationEmailState([ada], '').status, 'empty');
  assert.equal(registrationEmailState([ada], 'ada').status, 'invalid');
  assert.equal(registrationEmailState([ada], 'ny@firma.no').status, 'new');
  assert.equal(registrationEmailState([ada], 'ADA@firma.no').employee.id, 'emp_ada');
});

test('førstegangsregistrering lagrer kontakt, avdeling, plan og velkomstkø', () => {
  const built = buildFirstRegistration({
    email: 'Frank@Firma.no',
    firstName: 'Frank',
    lastName: 'Ingvartsen',
    phone: '+4746470475',
    language: 'Norsk bokmål',
    externalEmployeeNumber: ' 44 ',
    placement: 'internal',
    accessLevel: 'ansatt',
    departmentIds: ['anlegg', 'anlegg', ''],
    workPlan: 'full-40',
    periodFrom: '12.10.2026',
    sendWelcome: true,
    at: '2026-10-12T08:00:00.000Z',
    id: 'emp_frank',
  });
  assert.equal(built.ok, true);
  const stored = commitEmployee(built.employee, { scope: 'company' });
  assert.deepEqual(stored.errors, []);
  assert.equal(stored.employee.person.email, 'frank@firma.no');
  assert.equal(stored.employee.person.phone, '+4746470475');
  assert.equal(stored.employee.person.language, 'Norsk bokmål');
  assert.equal(stored.employee.company.accessLevel, 'ansatt');
  assert.equal(stored.employee.company.personnelKind, 'staff');
  assert.equal(stored.employee.company.externalEmployeeNumber, '44');
  assert.deepEqual(stored.employee.company.departmentIds, ['anlegg']);
  assert.equal(stored.employee.company.workPercent, '100');
  assert.equal(stored.employee.company.periodFrom, '2026-10-12');
  assert.equal(stored.employee.company.canLogin, false);
  assert.equal(stored.employee.invite.status, 'queued');
  assert.equal(stored.employee.invite.email, 'frank@firma.no');
});

test('eksterne nivåer og ansatt i andre avdelinger beholder personelltypen', () => {
  const regnskap = buildFirstRegistration({
    email: 'regn@firma.no',
    firstName: 'Kari',
    lastName: 'Ness',
    placement: 'external',
    accessLevel: 'regnskap_ekstern',
  });
  assert.equal(regnskap.employee.company.personnelKind, 'external');
  const innleie = buildFirstRegistration({
    email: 'inn@firma.no',
    firstName: 'Jon',
    lastName: 'Lie',
    placement: 'external',
    accessLevel: 'innleie_ekstern',
    workPlan: 'part-30',
  });
  assert.equal(innleie.employee.company.personnelKind, 'innleid');
  assert.equal(innleie.employee.company.workPercent, '75');
  const andre = buildFirstRegistration({
    email: 'andre@firma.no',
    firstName: 'Lea',
    lastName: 'Mo',
    placement: 'external',
    accessLevel: 'ansatt_andre_avdelinger',
  });
  assert.equal(andre.employee.company.accessLevel, 'ansatt_andre_avdelinger');
  assert.equal(andre.employee.company.personnelKind, 'staff');
  const missingLevel = buildFirstRegistration({
    email: 'ute@firma.no',
    firstName: 'Ute',
    lastName: 'Dahl',
    placement: 'external',
  });
  assert.equal(missingLevel.employee.company.accessLevel, 'regnskap_ekstern');
});

test('feil gruppe, telefon, dato og språk stoppes, og velkomst kan slås av', () => {
  const crossed = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    placement: 'internal',
    accessLevel: 'regnskap_ekstern',
  });
  assert.equal(crossed.ok, false);
  assert.match(crossed.errors.join(' '), /tilgang/i);
  const phone = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    phone: '123',
  });
  assert.match(phone.errors.join(' '), /8 siffer/);
  const date = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    periodFrom: '32.13.2026',
  });
  assert.match(date.errors.join(' '), /dd\.mm/);
  const language = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    language: 'Klingon',
  });
  assert.match(language.errors.join(' '), /språk/i);
  const quiet = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    sendWelcome: false,
    language: '',
  });
  assert.equal(quiet.ok, true);
  assert.equal(quiet.sendWelcome, false);
  assert.equal(quiet.employee.invite.status, 'none');
  assert.equal(quiet.employee.person.language, 'Norsk bokmål');
  assert.equal(quiet.employee.person.email, 'a@firma.no');
  const locked = buildFirstRegistration({
    email: 'a@firma.no',
    firstName: 'A',
    lastName: 'B',
    placement: 'external',
    accessLevel: 'administrator',
    canEditAccess: false,
  });
  assert.equal(locked.ok, true);
  assert.equal(locked.employee.company.accessLevel, 'ansatt');
  assert.equal(locked.employee.company.personnelKind, 'staff');
});
