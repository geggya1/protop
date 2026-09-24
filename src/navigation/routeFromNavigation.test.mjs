import assert from 'node:assert/strict';
import { routeFromNavigation, SESSION_OVERLAY_ROUTE } from './routeFromNavigation.js';

assert.equal(routeFromNavigation(null), SESSION_OVERLAY_ROUTE);
assert.equal(routeFromNavigation({}), SESSION_OVERLAY_ROUTE);
assert.equal(
  routeFromNavigation({ getCurrentRoute: () => null, getState: () => null }),
  SESSION_OVERLAY_ROUTE,
);

assert.deepEqual(
  routeFromNavigation({
    getCurrentRoute: () => ({ key: 'r1', name: 'Login', params: { addFriend: 'geir' } }),
  }),
  { key: 'r1', name: 'Login', params: { addFriend: 'geir' } },
);

assert.deepEqual(
  routeFromNavigation({
    getCurrentRoute: () => ({ name: 'Home' }),
  }),
  { key: 'session-Home', name: 'Home', params: {} },
);

assert.deepEqual(
  routeFromNavigation({
    getCurrentRoute: () => null,
    getState: () => ({
      index: 1,
      routes: [{ name: 'Welcome' }, { key: 'h', name: 'Home', params: { x: 1 } }],
    }),
  }),
  { key: 'h', name: 'Home', params: { x: 1 } },
);

assert.equal(
  routeFromNavigation({
    getCurrentRoute: () => {
      throw new Error('not ready');
    },
  }),
  SESSION_OVERLAY_ROUTE,
);

console.log('routeFromNavigation.test.mjs: ok');
