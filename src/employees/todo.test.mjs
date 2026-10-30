/**
 * Gjøremål for den ansatte: dokumenter, pårørende, HMS-kort og oppgaver fra HR.
 */
import assert from 'node:assert/strict';
import { employeeTodos, kinIsMissing, openTodoCount } from './todo.js';

const today = '2026-10-30';
const ada = { id: 'e1', person: { firstName: 'Ada', kinName: '', kinPhone: '' } };
const docs = [
  { control: { id: 'tpl_a', title: 'Personverninformasjon til ansatte', readRule: 'pakrevd' }, revision: 2, required: true, done: false },
  { control: { id: 'tpl_b', title: 'Taushetserklæring', readRule: 'signeres' }, revision: 1, required: true, done: true },
  { control: { id: 'tpl_c', title: 'Avfallsinstruks', readRule: 'info' }, revision: 1, required: false, done: false },
];

{
  const todos = employeeTodos({
    employee: ada,
    docs,
    hms: { required: true, notApplicable: false, card: { number: 'HMS 1', validTo: '2026-11-10' } },
    hrTasks: [{ id: 't1', title: 'Lever timeliste', status: 'open' }, { id: 't2', title: 'Ferdig', status: 'done' }],
    today,
  });
  const ids = todos.map((row) => row.id);
  assert.equal(ids.includes('doc:tpl_c'), false, 'til informasjon er ikke et gjøremål');
  assert.equal(ids[0], 'hms', 'kort som går ut snart står først');
  assert.equal(todos[0].urgent, true);
  assert.match(todos[0].text, /Utløper 10\.11\.2026/);
  assert.equal(todos.find((row) => row.id === 'doc:tpl_a').title, 'Les og bekreft: Personverninformasjon til ansatte');
  assert.match(todos.find((row) => row.id === 'doc:tpl_a').text, /versjon 2/);
  assert.equal(todos.find((row) => row.id === 'doc:tpl_b').done, true);
  assert.equal(todos.find((row) => row.id === 'kin').done, false);
  assert.equal(openTodoCount(todos), 4, 'HMS, personvern, pårørende og oppgave fra HR');
  assert.equal(todos.at(-1).done, true, 'fullførte sist');
}

{
  // HMS-kort som ikke kreves eller er «Ikke aktuelt», står ikke.
  assert.equal(employeeTodos({ hms: { required: false } }).length, 0);
  assert.equal(employeeTodos({ hms: { required: true, notApplicable: true } }).length, 0);
  const missing = employeeTodos({ hms: { required: true, card: null }, today })[0];
  assert.match(missing.text, /Skann QR-koden eller ta bilde/);
  const scanned = employeeTodos({ hms: { required: true, card: { qrUrl: 'https://hmskort.no/v/x' } }, today })[0];
  assert.match(scanned.text, /Utløpsdato mangler\. Ta bilde av forsiden/);
  const valid = employeeTodos({ hms: { required: true, card: { number: 'HMS 1', validTo: '2028-01-01' } }, today })[0];
  assert.equal(valid.done, true);
}

assert.equal(kinIsMissing({ person: { kinName: 'Bo', kinPhone: '' } }), true);
assert.equal(kinIsMissing({ person: { kinName: 'Bo', kinPhone: '99999999' } }), false);

console.log('todo.test.mjs: ok');
