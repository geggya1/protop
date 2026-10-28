import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { normalizeHrState } from './model.js';
import {
  hrEmployeeIds, hrSelfDoc, hrSelfDocs, hrStateForDevice, planHrSelf, withCloudPay,
} from './selfService.js';

const state = normalizeHrState({
  contracts: [
    { id: 'c1', employeeId: 'bob', status: 'active', salaryAmount: '52000', title: 'Arbeidsavtale' },
    { id: 'c2', employeeId: 'eve', status: 'draft', salaryAmount: '60000' },
  ],
  salaries: [
    { id: 's1', employeeId: 'bob', amount: 624000, employeeVisible: true, fromDate: '2026-01-01' },
    { id: 's2', employeeId: 'eve', amount: 720000, employeeVisible: false, fromDate: '2026-01-01' },
  ],
  memos: [
    { id: 'm1', employeeId: 'eve', title: 'Advarsel', employeeVisible: false },
    { id: 'm2', employeeId: 'bob', title: 'Velkommen', employeeVisible: true },
  ],
  tasks: [{ id: 't1', employeeId: 'bob', title: 'Signer avtalen', employeeVisible: true }],
  cases: [{ id: 'k1', employeeId: 'eve', title: 'Sykefravær', employeeVisible: false }],
  applications: [{ id: 'a1', name: 'Søker', rejectionReason: 'Mangler fagbrev' }],
});

test('utsnittet inneholder bare det som er delt med personen selv', () => {
  const bob = hrSelfDoc(state, 'bob');
  assert.equal(bob.employeeId, 'bob');
  assert.deepEqual(bob.salaries.map((row) => row.id), ['s1']);
  assert.deepEqual(bob.contracts.map((row) => row.id), ['c1']);
  assert.deepEqual(bob.memos.map((row) => row.id), ['m2']);
  assert.deepEqual(bob.tasks.map((row) => row.id), ['t1']);
  const eve = hrSelfDoc(state, 'eve');
  // Lønn som ikke er delt, utkast til avtale, skjulte memo og saker er ikke med.
  assert.equal(eve.salaries.length, 0);
  assert.equal(eve.contracts.length, 0);
  assert.equal(eve.memos.length, 0);
  assert.equal(eve.cases.length, 0);
  const json = JSON.stringify(eve);
  assert.ok(!json.includes('720000') && !json.includes('Advarsel') && !json.includes('Søker'));
  assert.deepEqual(hrEmployeeIds(state).sort(), ['bob', 'eve']);
});

test('planen skriver nye og endrede utsnitt, og tømmer et utsnitt som ikke lenger har noe', () => {
  const first = planHrSelf({ state, existing: {} });
  // eve har ingenting delt og ikke noe utsnitt fra før: ingen skriving.
  assert.deepEqual(first.map((row) => row.employeeId), ['bob']);

  // Samme innhold i skyen (feltene i annen rekkefølge): ingen skriving.
  const stored = JSON.parse(JSON.stringify(hrSelfDoc(state, 'bob')));
  const reordered = Object.fromEntries(Object.entries(stored).reverse());
  assert.deepEqual(planHrSelf({ state, existing: { bob: reordered } }), []);

  const next = normalizeHrState({ ...state, tasks: [] });
  const plan = planHrSelf({ state: next, existing: hrSelfDocs(state) });
  assert.deepEqual(plan.map((row) => row.employeeId), ['bob']);
  assert.equal(plan[0].tasks.length, 0);

  // En ansatt som er tatt helt ut av HR, får et tomt utsnitt.
  const gone = normalizeHrState({ memos: [{ id: 'x', employeeId: 'eve', employeeVisible: false }] });
  const emptied = planHrSelf({ state: gone, existing: { bob: stored } });
  assert.deepEqual(emptied.map((row) => row.employeeId), ['bob']);
  assert.equal(emptied[0].salaries.length + emptied[0].tasks.length + emptied[0].contracts.length, 0);
});

test('kopien på enheten har ikke lønn, og lønnen hentes fra skyen igjen', () => {
  const device = hrStateForDevice(state);
  assert.equal(device.salaries.length, 0);
  assert.ok(device.contracts.every((row) => row.salaryAmount === '' && row.salaryExtras === ''));
  assert.ok(!JSON.stringify(device).includes('624000'));
  assert.ok(!JSON.stringify(device).includes('52000'));
  // Andre HR-data (avtaler, memo) er fortsatt med, så en lagring som ikke nådde skyen ikke går tapt.
  assert.equal(device.memos.length, 2);

  const restored = withCloudPay({ ...device, tasks: [{ id: 't2', employeeId: 'bob', title: 'Ny' }] }, state);
  assert.equal(restored.salaries.length, 2);
  assert.equal(restored.contracts.find((row) => row.id === 'c1').salaryAmount, '52000');
  assert.deepEqual(restored.tasks.map((row) => row.id), ['t2']);
});

test('storage: Min side leser utsnittet, ikke HR-dokumentet eller den lokale kopien', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'storage.js'), 'utf8');
  const start = src.indexOf('export async function loadEmployeeHrSlice');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(body, /readSelf\(companyId, empId\)/);
  assert.doesNotMatch(body, /readLocal/);
  assert.match(src, /'hrSelf'/);
  assert.match(src, /hrStateForDevice\(state\)/);
  assert.match(src, /reason === 'permission'[\s\S]{0,200}dropLocal/);
});
