import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  matchesStatusFilter,
  phaseFromProjectStatus,
  projectPhaseOf,
  projectStatusLabel,
} from './statusFilter.js';

assert.equal(phaseFromProjectStatus('Under arbeid'), 'produksjon');
assert.equal(phaseFromProjectStatus('Tilbud'), 'tilbud');
assert.equal(phaseFromProjectStatus('Avsluttet'), 'avsluttet');
assert.equal(phaseFromProjectStatus('Ferdig'), 'avsluttet');
assert.equal(phaseFromProjectStatus('Pågående'), 'produksjon');
assert.equal(phaseFromProjectStatus(''), 'planlegging');

assert.equal(projectPhaseOf({ phase: 'produksjon', projectStatus: 'Tilbud' }), 'produksjon');
assert.equal(projectPhaseOf({ phase: 'ukjent', projectStatus: 'Under arbeid' }), 'produksjon');
assert.equal(projectPhaseOf({ projectStatus: 'Avsluttet' }), 'avsluttet');

assert.equal(matchesStatusFilter({ phase: 'produksjon' }, ''), true);
assert.equal(matchesStatusFilter({ phase: 'produksjon' }, 'produksjon'), true);
assert.equal(matchesStatusFilter({ phase: 'produksjon' }, 'avsluttet'), false);
assert.equal(matchesStatusFilter({ projectStatus: 'Tilbud' }, 'tilbud'), true);

// Status slik den vises: fri tekst som den er, ellers fasen på norsk (aldri rå id).
assert.equal(projectStatusLabel({ projectStatus: 'Under arbeid', phase: 'produksjon' }), 'Under arbeid');
assert.equal(projectStatusLabel({ phase: 'gjennomforing' }), 'Gjennomføring');
assert.equal(projectStatusLabel({ phase: 'produksjon' }), 'Produksjon');
assert.equal(projectStatusLabel({ phase: 'ukjentfase' }), 'Ukjentfase');
assert.equal(projectStatusLabel({}, 'Under arbeid'), 'Under arbeid');
for (const file of ['../../components/project/ProjectDetail.jsx', '../../screens/customers/CustomersScreen.jsx']) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(src, /projectStatusLabel\(/, file);
  assert.equal(/projectStatus \|\| (project|row)\.phase/.test(src), false, file);
}

console.log('statusFilter.test.mjs: ok');
