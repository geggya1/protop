/**
 * PendingAddFriendPrompt mounts AddFriendModal from SessionOverlays (outside
 * any Screen). useRoute() throws there — useOptionalRoute must not.
 */
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationRouteContext, useRoute } from '@react-navigation/core';
import useOptionalRoute from './useOptionalRoute.js';

function ThrowsRoute() {
  useRoute();
  return createElement('span', null, 'x');
}

let threw = false;
try {
  renderToStaticMarkup(createElement(ThrowsRoute));
} catch (e) {
  threw = /Couldn't find a route object/i.test(String(e?.message || e));
}
assert.equal(threw, true);

function Probe({ onRoute }) {
  const route = useOptionalRoute();
  onRoute(route);
  return createElement('span', null, route ? 'has-route' : 'no-route');
}

let seen;
assert.equal(
  renderToStaticMarkup(createElement(Probe, { onRoute: (r) => { seen = r; } })),
  '<span>no-route</span>',
);
assert.equal(seen, undefined);

const fakeRoute = { key: 'x', name: 'AddFriend', params: { username: 'goa' } };
seen = null;
assert.equal(
  renderToStaticMarkup(
    createElement(
      NavigationRouteContext.Provider,
      { value: fakeRoute },
      createElement(Probe, { onRoute: (r) => { seen = r; } }),
    ),
  ),
  '<span>has-route</span>',
);
assert.equal(seen?.params?.username, 'goa');

console.log('useOptionalRoute tests ok');
