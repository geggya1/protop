/**
 * Utlegg: prosjektvelgeren med den ansattes aktive prosjekter først.
 */
import assert from 'node:assert/strict';
import { expenseProjectOptions } from './expenseForm.js';

{
  const projects = [
    { id: 'p1', number: '10772', name: 'Prismen', client: 'Hillevågsveien 59-63 AS' },
    { id: 'p2', number: '10010', name: 'Kontorbygg' },
    { id: 'p3', number: '9001', name: 'Gammel', phase: 'avsluttet' },
    { id: 'p4', number: '8000', name: 'Arkivert', status: 'arkivert' },
    { id: 'p5', number: '10020', name: 'Annet', projectStatus: 'Under arbeid' },
  ];
  const options = expenseProjectOptions(projects, { mineIds: new Set(['p5']) });
  assert.deepEqual(options.map((row) => row.id), ['p5', 'p2', 'p1', 'p3']);
  assert.deepEqual([...new Set(options.map((row) => row.group))], ['Dine aktive prosjekter', 'Andre aktive prosjekter', 'Avsluttede prosjekter']);
  assert.equal(options[2].label, '#10772 Prismen');
  assert.equal(options[2].hint, 'Hillevågsveien 59-63 AS');
  assert.ok(options[2].keywords.includes('Hillevågsveien 59-63 AS'), 'søket treffer kunden');
  // Arkivert vises bare når utlegget allerede står på prosjektet.
  assert.ok(expenseProjectOptions(projects, { keepId: 'p4' }).some((row) => row.id === 'p4'));
  assert.deepEqual(expenseProjectOptions([], {}), []);
}
