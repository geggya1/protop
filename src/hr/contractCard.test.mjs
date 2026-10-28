/**
 * DS-14: ansattkortet er fasit for stilling, prosent og datoer i arbeidsavtalen.
 *   node --test src/hr/contractCard.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changedCardFields,
  contractDraftFromEmployee,
  contractFieldsFromEmployee,
  employeeWithContractChanges,
} from './contractCard.js';

const card = (company = {}, person = { firstName: 'Ada', lastName: 'Lovelace' }) => ({
  id: 'emp_ada',
  person,
  company: {
    title: 'Prosjektleder', workPercent: '80', employmentType: 'Fast ansatt',
    periodFrom: '01.03.2024', periodTo: '', comment: 'Intern', ...company,
  },
});
const EMPTY = {
  title: 'Arbeidsavtale', positionTitle: '', workPercent: '100', employmentType: 'Fast', startDate: '', endDate: '', employeeName: '',
};

test('ny avtale fylles fra ansattkortet', () => {
  const draft = contractDraftFromEmployee(EMPTY, card());
  assert.equal(draft.positionTitle, 'Prosjektleder');
  assert.equal(draft.workPercent, '80');
  assert.equal(draft.employmentType, 'Fast ansatt');
  assert.equal(draft.startDate, '2024-03-01');
  assert.equal(draft.endDate, '');
  assert.equal(draft.employeeName, 'Ada Lovelace');
  assert.equal(draft.title, 'Arbeidsavtale');
  // Tomme felt på kortet beholder utkastets standard.
  const bare = contractDraftFromEmployee(EMPTY, { person: {}, company: {} });
  assert.equal(bare.workPercent, '100');
  assert.equal(bare.employmentType, 'Fast');
  assert.deepEqual(contractFieldsFromEmployee(null), {});
});

test('uendret avtale skriver ikke til kortet', () => {
  const initial = contractDraftFromEmployee(EMPTY, card());
  const draft = { ...initial, salaryAmount: '650 000', holidayTerms: 'Ferieloven' };
  assert.deepEqual(changedCardFields(initial, draft), []);
  const { changed } = employeeWithContractChanges(card(), initial, draft);
  assert.deepEqual(changed, []);
});

test('bare feltene HR endret i avtalen går til kortet', () => {
  const initial = contractDraftFromEmployee(EMPTY, card());
  const draft = { ...initial, workPercent: '100 %', endDate: '31.12.2026' };
  const { employee, changed } = employeeWithContractChanges(card(), initial, draft);
  assert.deepEqual(changed, ['company.workPercent', 'company.periodTo']);
  assert.equal(employee.company.workPercent, '100');
  assert.equal(employee.company.periodTo, '2026-12-31');
  assert.equal(employee.company.title, 'Prosjektleder');
  assert.equal(employee.company.comment, 'Intern');
});

test('en eldre avtale som rettes, overskriver ikke nyere verdier på kortet', () => {
  // Avtalen fra 2022 sier «Tømrer» og 100 %; kortet er senere endret til prosjektleder 80 %.
  const old = { ...EMPTY, positionTitle: 'Tømrer', workPercent: '100', startDate: '2022-01-01', notes: '' };
  const draft = { ...old, notes: 'Signert original i arkiv' };
  const { employee, changed } = employeeWithContractChanges(card(), old, draft);
  assert.deepEqual(changed, []);
  assert.equal(employee.company.title, 'Prosjektleder');
  assert.equal(employee.company.workPercent, '80');
});

test('ansettelsesform skrives ikke tilbake, og avtalens tittel blir ikke stilling', () => {
  const initial = contractDraftFromEmployee(EMPTY, card());
  const draft = { ...initial, employmentType: 'Midlertidig', title: 'Arbeidsavtale 2026' };
  const { employee, changed } = employeeWithContractChanges(card(), initial, draft);
  assert.deepEqual(changed, []);
  assert.equal(employee.company.employmentType, 'Fast ansatt');
  assert.equal(employee.company.title, 'Prosjektleder');
});

test('navn bare når kortet mangler det, og beskrivelsen legges ikke inn to ganger', () => {
  const empty = card({ title: '', workPercent: '', periodFrom: '', comment: '' }, {});
  const initial = contractDraftFromEmployee(EMPTY, empty);
  const draft = {
    ...initial, employeeName: 'Ada Lovelace', positionTitle: 'Konsulent', startDate: '2024-03-01', roleDescription: 'Rådgivning',
  };
  const first = employeeWithContractChanges(empty, initial, draft);
  assert.equal(first.employee.person.firstName, 'Ada');
  assert.equal(first.employee.person.lastName, 'Lovelace');
  assert.equal(first.employee.company.title, 'Konsulent');
  assert.equal(first.employee.company.periodFrom, '2024-03-01');
  assert.equal(first.employee.company.comment, 'Rådgivning');
  // Samme avtale åpnet og lagret på nytt: ingenting legges til.
  const again = employeeWithContractChanges(first.employee, draft, { ...draft, notes: 'x' });
  assert.deepEqual(again.changed, []);
  assert.equal(again.employee.company.comment, 'Rådgivning');
  // Beskrivelse som allerede står i kommentaren, legges ikke inn igjen.
  const same = employeeWithContractChanges(first.employee, { ...draft, roleDescription: '' }, draft);
  assert.equal(same.employee.company.comment, 'Rådgivning');
});

test('HR-avtalen bruker kortet og skriver bare aktiv avtale tilbake', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const screen = readFileSync(join(root, 'screens/hr/HrContracts.jsx'), 'utf8');
  assert.match(screen, /contractDraftFromEmployee\(\{ \.\.\.EMPTY_CONTRACT_DRAFT \}, selected\)/);
  assert.match(screen, /keepStatus === 'active'\s*\n\s*\? employeeWithContractChanges\(selected, draftBase\.current, draft\)/);
  assert.doesNotMatch(screen, /applyContractFieldsToEmployee/);
});
