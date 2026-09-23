import assert from 'node:assert/strict';
import {
  MODULE_ACTIVATION_EVENTS,
  buildModuleActivationPayload,
  trackModuleActivationEvent,
} from './moduleActivationAnalytics.js';

assert.equal(MODULE_ACTIVATION_EVENTS.viewed, 'module_welcome_viewed');
assert.equal(MODULE_ACTIVATION_EVENTS.clicked, 'module_activation_clicked');
assert.equal(MODULE_ACTIVATION_EVENTS.completed, 'module_activation_completed');
assert.equal(MODULE_ACTIVATION_EVENTS.back, 'module_activation_back_clicked');
assert.equal(MODULE_ACTIVATION_EVENTS.deactivated, 'module_deactivated');

const payload = buildModuleActivationPayload({
  moduleId: 'plan',
  platform: 'web',
  userRole: 'parent',
  timestamp: '2026-09-09T10:00:00.000Z',
  timezone: 'Europe/Oslo',
  subscriptionType: 'included',
});
assert.equal(payload.moduleId, 'plan');
assert.equal(payload.platform, 'web');
assert.equal(payload.userRole, 'parent');
assert.equal(payload.role, 'adult');
assert.equal(payload.timestamp, '2026-09-09T10:00:00.000Z');
assert.equal(payload.subscriptionType, 'included');
assert.equal(payload.timezone, 'Europe/Oslo');
assert.equal('email' in payload, false);
assert.equal('childId' in payload, false);
assert.equal('name' in payload, false);

const child = buildModuleActivationPayload({
  moduleId: 'chores',
  userRole: 'child',
  platform: 'native',
  timezone: 'Europe/Oslo',
});
assert.equal(child.userRole, 'child');
assert.equal(child.role, 'child');
assert.equal(child.moduleId, 'chores');
assert.equal(child.timezone, 'Europe/Oslo');

const seen = [];
globalThis.__weekplanTrack = (event, data) => seen.push({ event, data });
const tracked = trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.back, {
  moduleId: 'shop',
  platform: 'web',
  userRole: 'parent',
  timestamp: 't',
});
assert.equal(seen.length, 1);
assert.equal(seen[0].event, 'module_activation_back_clicked');
assert.equal(seen[0].data.moduleId, 'shop');
assert.equal(tracked.moduleId, 'shop');
delete globalThis.__weekplanTrack;

assert.doesNotThrow(() => trackModuleActivationEvent('x', { moduleId: 'plan' }));

console.log('moduleActivationAnalytics.test.mjs: ok');
