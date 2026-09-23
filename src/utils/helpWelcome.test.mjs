import assert from 'node:assert/strict';
import { buildHelpWelcomeModule } from './helpWelcome.js';
import { getModuleConfig } from '../modules/moduleActivationRegistry.js';
import { getModuleIntro, localizeIntro } from './moduleIntros.js';

const planCatalog = getModuleConfig('plan');
const planHelp = buildHelpWelcomeModule({
  scope: 'family',
  moduleId: 'plan',
  walkthroughLabel: 'Ta meg gjennom skrittene',
  closeLabel: 'Lukk',
});

assert.ok(planHelp);
assert.equal(planHelp.headline, planCatalog.headline);
assert.equal(planHelp.pitch, planCatalog.pitch);
assert.deepEqual(planHelp.benefits, planCatalog.benefits);
assert.equal(planHelp.illustrationPath, planCatalog.illustrationPath);
assert.match(planHelp.illustrationPath, /\?v=/);
assert.equal(planHelp.activationLabel, 'Ta meg gjennom skrittene');
assert.equal(planHelp.backLabel, 'Lukk');
assert.match(planCatalog.activationLabel, /^Aktiver /);

const homeCopy = localizeIntro(getModuleIntro('family', 'home'), 'nb');
const homeHelp = buildHelpWelcomeModule({
  scope: 'family',
  moduleId: 'home',
  copy: homeCopy,
  walkthroughLabel: 'Ta meg gjennom skrittene',
  closeLabel: 'Lukk',
});
assert.ok(homeHelp);
assert.equal(homeHelp.headline, homeCopy.title);
assert.equal(homeHelp.activationLabel, 'Ta meg gjennom skrittene');
assert.ok(homeHelp.benefits.length >= 2);

const matcoachCopy = localizeIntro(getModuleIntro('family', 'matcoach'), 'nb');
const matcoachHelp = buildHelpWelcomeModule({
  scope: 'family',
  moduleId: 'matcoach',
  copy: matcoachCopy,
  walkthroughLabel: 'Ta meg gjennom skrittene',
  closeLabel: 'Lukk',
});
assert.ok(matcoachHelp);
assert.match(matcoachHelp.illustrationPath, /ai-matcoach--module-activation-illustration\.png\?v=/);
assert.equal(matcoachHelp.headline, matcoachCopy.title);

const teamWallCopy = localizeIntro(getModuleIntro('team', 'wall'), 'nb');
const teamWall = buildHelpWelcomeModule({
  scope: 'team',
  moduleId: 'wall',
  copy: teamWallCopy,
  walkthroughLabel: 'Walk me through the steps',
  closeLabel: 'Close',
});
assert.ok(teamWall);
assert.equal(teamWall.headline, teamWallCopy.title);
assert.notEqual(teamWall.headline, getModuleConfig('wall')?.headline);
assert.equal(teamWall.activationLabel, 'Walk me through the steps');

assert.equal(buildHelpWelcomeModule({ scope: 'family', moduleId: 'missing-module' }), null);

console.log('helpWelcome.test.mjs: ok');
