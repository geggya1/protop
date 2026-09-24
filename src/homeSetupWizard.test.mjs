import assert from 'node:assert/strict';
import { HOME_LOOKS } from './homeWidgetCatalog.js';
import {
  homeSetupSteps,
  homeSetupFormSteps,
  homeSetupStepIndex,
  lookHintForRole,
} from './homeSetupWizard.js';

const withDock = homeSetupSteps({ showDock: true });
assert.deepEqual(withDock.map((s) => s.id), ['image', 'dock', 'board']);
assert.equal(withDock.length, 3);
assert.deepEqual(homeSetupFormSteps(withDock).map((s) => s.id), ['image', 'dock']);
assert.equal(withDock.find((s) => s.id === 'board')?.opensHomeEdit, true);

const noDock = homeSetupSteps({ showDock: false });
assert.deepEqual(noDock.map((s) => s.id), ['image', 'board']);
assert.deepEqual(homeSetupFormSteps(noDock).map((s) => s.id), ['image']);
assert.equal(homeSetupStepIndex(withDock, 'board'), 2);
assert.equal(homeSetupStepIndex(noDock, 'board'), 1);
assert.equal(homeSetupStepIndex(withDock, 'missing'), 0);
assert.equal(homeSetupStepIndex(withDock, 'look'), 0);

const oversikt = HOME_LOOKS.find((l) => l.id === 'oversikt');
const fokus = HOME_LOOKS.find((l) => l.id === 'fokus');
assert.match(oversikt.hint, /Dagens plan|handleliste|progresjon/i);
assert.match(fokus.hint, /Dagens plan|handleliste|progresjon/i);
assert.match(lookHintForRole(oversikt, 'child'), /Dagens plan|lekser|skole|snarveier/i);
assert.match(lookHintForRole(fokus, 'parent'), /progresjon/i);

console.log('homeSetupWizard.test.mjs: ok');
