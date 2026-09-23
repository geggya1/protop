import assert from 'node:assert/strict';
import {
  ACTIVATION_SOURCES,
  activateModuleAccess,
  applyModuleAccessPatch,
  buildActivationPlace,
  buildModuleAccessWrite,
  canActivateModule,
  canDeactivateModule,
  canManageModuleAccess,
  canUseModule,
  captureActivationContext,
  deactivateModuleAccess,
  emptyModuleAccess,
  getModuleAccess,
  hasActivationTimestamp,
  isLegacyModuleAccess,
  isModuleActivated,
  moduleAccessPatch,
  readModuleAccessMap,
  resolveFamilyModuleAccess,
  shouldShowModuleWelcome,
  shouldShowWelcome,
} from './moduleAccess.js';

{
  const map0 = readModuleAccessMap({});
  assert.deepEqual(map0, {});
  assert.equal(shouldShowWelcome(map0, 'plan'), true, 'empty map shows welcome');
  assert.equal(canUseModule(map0, 'plan'), false);
  assert.equal(shouldShowWelcome(map0, null), false);
}

{
  const family = { moduleAccessInitialized: true, moduleAccess: {} };
  assert.equal(isLegacyModuleAccess(family), false);
  assert.equal(shouldShowModuleWelcome(family, 'plan'), true, 'new family sees welcome');
}

{
  const legacy = { name: 'Andersen', lists: [{ id: '1' }], events: { count: 3 } };
  assert.equal(isLegacyModuleAccess(legacy), true);
  assert.equal(
    shouldShowModuleWelcome(legacy, 'plan'),
    true,
    'existing families without moduleAccessInitialized must still activate',
  );
  assert.equal(isModuleActivated(resolveFamilyModuleAccess(legacy, 'plan')), false);
  assert.deepEqual(legacy.lists, [{ id: '1' }], 'content must not be mutated by the check');
}

{
  const booleanTrue = {
    moduleAccessInitialized: true,
    moduleAccess: { plan: true },
    albums: ['photo-1'],
  };
  assert.equal(
    shouldShowModuleWelcome(booleanTrue, 'plan'),
    true,
    'boolean true without timestamp is not a billed activation',
  );
  assert.equal(isModuleActivated(resolveFamilyModuleAccess(booleanTrue, 'plan')), false);
  assert.deepEqual(booleanTrue.albums, ['photo-1']);
}

{
  const family = {
    moduleAccessInitialized: true,
    moduleAccess: { plan: { activatedAt: '2026-01-01T00:00:00.000Z', entitlement: 'included' } },
  };
  assert.equal(shouldShowModuleWelcome(family, 'plan'), false, 'activated skips welcome');
  assert.equal(shouldShowModuleWelcome(family, 'shop'), true, 'other modules still gated');
  assert.equal(canUseModule(readModuleAccessMap(family), 'plan'), true);
}

{
  const afterActivate = activateModuleAccess({}, 'notes', {
    nowIso: '2026-09-09T12:00:00.000Z',
    nowMs: Date.parse('2026-09-09T12:00:00.000Z'),
    timezone: 'Europe/Oslo',
    locale: 'nb-NO',
    platform: 'web',
    role: 'adult',
    source: ACTIVATION_SOURCES.welcome,
  });
  assert.equal(afterActivate.notes.activated, true);
  assert.equal(afterActivate.notes.activatedAt, '2026-09-09T12:00:00.000Z');
  assert.equal(afterActivate.notes.activatedAtMs, Date.parse('2026-09-09T12:00:00.000Z'));
  assert.equal(afterActivate.notes.entitlement, 'included');
  assert.equal(afterActivate.notes.current.timezone, 'Europe/Oslo');
  assert.equal(afterActivate.notes.current.locale, 'nb-NO');
  assert.equal(afterActivate.notes.current.platform, 'web');
  assert.equal(afterActivate.notes.current.role, 'adult');
  assert.equal(afterActivate.notes.current.source, 'welcome');
  assert.equal(afterActivate.notes.current.place.timezone, 'Europe/Oslo');
  assert.equal(shouldShowWelcome(afterActivate, 'notes'), false, 'reopen skips welcome');

  const afterDeactivate = deactivateModuleAccess(afterActivate, 'notes', {
    nowIso: '2026-09-10T08:00:00.000Z',
    nowMs: Date.parse('2026-09-10T08:00:00.000Z'),
  });
  assert.equal(afterDeactivate.notes.activated, false);
  assert.equal(afterDeactivate.notes.activatedAt, null);
  assert.equal(shouldShowWelcome(afterDeactivate, 'notes'), true, 'deactivated shows welcome again');
  assert.equal(canUseModule(afterDeactivate, 'notes'), false);
  assert.equal(afterDeactivate.notes.history.length, 1);
  assert.equal(afterDeactivate.notes.history[0].activatedAt, '2026-09-09T12:00:00.000Z');
  assert.equal(afterDeactivate.notes.history[0].deactivatedAt, '2026-09-10T08:00:00.000Z');
  assert.equal(afterDeactivate.notes.history[0].deactivatedAtMs, Date.parse('2026-09-10T08:00:00.000Z'));
  assert.equal(afterDeactivate.notes.history[0].timezone, 'Europe/Oslo');

  const afterReactivate = activateModuleAccess(afterDeactivate, 'notes', {
    nowIso: '2026-09-11T09:00:00.000Z',
    timezone: 'Europe/Oslo',
    source: 'settings',
  });
  assert.equal(afterReactivate.notes.activated, true);
  assert.equal(afterReactivate.notes.current.source, 'settings');
  assert.equal(afterReactivate.notes.history.length, 1, 'prior interval stays in history');
  assert.equal(afterReactivate.notes.history[0].deactivatedAt, '2026-09-10T08:00:00.000Z');
}

{
  const backDoesNotActivate = { moduleAccessInitialized: true, moduleAccess: {} };
  assert.equal(shouldShowModuleWelcome(backDoesNotActivate, 'chat'), true);
  assert.equal(getModuleAccess({}, 'chat').activatedAt, null);
}

{
  const unavailable = { chat: emptyModuleAccess('chat', { entitlement: 'unavailable' }) };
  assert.equal(shouldShowWelcome(unavailable, 'chat'), false);
  assert.equal(canActivateModule(unavailable.chat, { isChild: false }), false);
  assert.equal(canActivateModule({ entitlement: 'paid' }, { isChild: true }), false);
}

{
  const patch = moduleAccessPatch('plan', emptyModuleAccess('plan', { activatedAt: '2026-09-09T12:00:00.000Z' }));
  assert.equal(patch['moduleAccess.plan'].moduleId, 'plan');
  assert.equal(patch['moduleAccess.plan'].activatedAt, '2026-09-09T12:00:00.000Z');
  assert.equal(patch['moduleAccess.plan'].activated, true);
}

{
  const family = {
    name: 'old',
    lists: ['keep-me'],
    calendarEvents: [{ id: 'evt-1' }],
  };
  const write = buildModuleAccessWrite(family, 'shop', emptyModuleAccess('shop', { activatedAt: null }));
  assert.equal(write.moduleAccessInitialized, true);
  assert.equal(write.moduleAccess, undefined, 'must not replace the whole moduleAccess map');
  assert.equal(write['moduleAccess.shop'].activated, false);
  const live = applyModuleAccessPatch(family, write);
  assert.deepEqual(live.lists, ['keep-me'], 'deactivate/require-activation must not clear module data');
  assert.deepEqual(live.calendarEvents, [{ id: 'evt-1' }]);
  assert.equal(shouldShowModuleWelcome(live, 'shop'), true);
  assert.equal(shouldShowModuleWelcome(live, 'plan'), true, 'other modules stay gated');
}

{
  const family = { id: 'F', moduleAccessInitialized: true, moduleAccess: {} };
  const patched = applyModuleAccessPatch(
    family,
    moduleAccessPatch('mail', emptyModuleAccess('mail', { activatedAt: '2026-09-09T12:00:00.000Z' })),
  );
  assert.equal(patched.moduleAccess.mail.activatedAt, '2026-09-09T12:00:00.000Z');
}

{
  const legacy = { name: 'Andersen', photos: ['p1'] };
  const activated = activateModuleAccess({}, 'shop', {
    nowIso: '2026-09-09T12:00:00.000Z',
    timezone: 'Europe/Oslo',
    locale: 'nb-NO',
    platform: 'web',
    role: 'adult',
    source: 'welcome',
  });
  const write = buildModuleAccessWrite(legacy, 'shop', activated.shop);
  const live = applyModuleAccessPatch(legacy, write);
  assert.equal(live.moduleAccessInitialized, true);
  assert.equal(shouldShowModuleWelcome(live, 'shop'), false);
  assert.equal(shouldShowModuleWelcome(live, 'plan'), true, 'activating one module does not unlock others');
  assert.deepEqual(live.photos, ['p1'], 'family content stays');
  assert.equal(live.moduleAccess.shop.current.timezone, 'Europe/Oslo');
}

{
  const ctx = captureActivationContext({
    platform: 'ios',
    role: 'parent',
    timezone: 'Europe/Oslo',
    locale: 'nb-NO',
    family: { language: 'nb' },
    profileLocation: { label: 'Oslo', city: 'Oslo', country: 'NO', lat: 59.91, lng: 10.75 },
  });
  assert.equal(ctx.platform, 'ios');
  assert.equal(ctx.role, 'adult');
  assert.equal(ctx.timezone, 'Europe/Oslo');
  assert.equal(ctx.place.city, 'Oslo');
  assert.equal(ctx.place.lat, 59.91);
  assert.equal('email' in ctx.place, false);
}

{
  const place = buildActivationPlace({
    timezone: 'Europe/Oslo',
    locale: 'nb-NO',
    profileLocation: { label: 'geir@example.com', lat: 1, lng: 2 },
  });
  assert.equal(place.label, undefined, 'do not store emails in place');
  assert.equal(place.lat, 1);
}

assert.equal(hasActivationTimestamp('legacy'), false);
assert.equal(hasActivationTimestamp(true), false);
assert.equal(hasActivationTimestamp('2026-09-09T12:00:00.000Z'), true);

assert.equal(canManageModuleAccess({ isParent: true, isChild: false }), true);
assert.equal(canDeactivateModule({ isParent: true, isChild: true }), false);
assert.equal(canDeactivateModule({ isParent: true, isActingAsChild: true }), false);
assert.equal(canManageModuleAccess({ isAdmin: true }), true);
assert.equal(canManageModuleAccess({}), false);

console.log('moduleAccess.test.mjs: ok');
