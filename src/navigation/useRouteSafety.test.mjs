import assert from 'node:assert/strict';
import React, { useContext, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { NavigationRouteContext, useRoute } from '@react-navigation/core';

function StrictRoute() {
  useRoute();
  return createElement('div', null, 'ok');
}

function OptionalRoute() {
  const route = useContext(NavigationRouteContext);
  return createElement('div', null, route ? `route:${route.name}` : 'no-route');
}

let threw = false;
try {
  renderToString(createElement(StrictRoute));
} catch (err) {
  threw = String(err?.message || '').includes("Couldn't find a route object");
}
assert.equal(threw, true, 'useRoute must throw the live crash message outside a screen');

assert.equal(
  renderToString(createElement(OptionalRoute)),
  '<div>no-route</div>',
);

assert.equal(
  renderToString(createElement(
    NavigationRouteContext.Provider,
    { value: { key: 'k', name: 'Home', params: {} } },
    createElement(OptionalRoute),
  )),
  '<div>route:Home</div>',
);

assert.equal(
  renderToString(createElement(
    NavigationRouteContext.Provider,
    { value: { key: 'k', name: 'Home', params: {} } },
    createElement(StrictRoute),
  )),
  '<div>ok</div>',
);

console.log('useRouteSafety.test.mjs: ok');
