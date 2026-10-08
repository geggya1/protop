import assert from 'node:assert/strict';
import {
  matchesStatusFilter,
  phaseFromProjectStatus,
  projectPhaseOf,
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

console.log('statusFilter.test.mjs: ok');
