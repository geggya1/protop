import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBootNavigation,
  bootNavigationKind,
  isProtopAppHost,
  shouldBounceApexToWww,
  urlOnCurrentHost,
} from './pwaNavigation.js';

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../App.jsx'), 'utf8');
assert.doesNotMatch(
  appSource,
  /\blaunchRev\b/,
  'a bare launchRev is erased by the minifier and crashes Safari',
);

assert.equal(isProtopAppHost('protop.no'), true);
assert.equal(isProtopAppHost('www.protop.no'), true);
assert.equal(isProtopAppHost('accounts.google.com'), false);

assert.equal(shouldBounceApexToWww({ hostname: 'protop.no', standalone: false }), true);
assert.equal(shouldBounceApexToWww({ hostname: 'protop.no', standalone: true }), false);
assert.equal(shouldBounceApexToWww({ hostname: 'www.protop.no', standalone: false }), false);

const kept = urlOnCurrentHost('https://www.protop.no/hjem?x=1', 'https://protop.no/hjem');
assert.equal(kept.hostname, 'protop.no');
assert.equal(kept.pathname, '/hjem');
assert.equal(kept.search, '?x=1');

const external = urlOnCurrentHost('https://accounts.google.com/o/oauth2', 'https://protop.no/login');
assert.equal(external.hostname, 'accounts.google.com');

assert.equal(bootNavigationKind({ standalone: true }), 'replaceState');
assert.equal(bootNavigationKind({ standalone: false }), 'replace');

const history = [];
const standaloneWin = {
  location: {
    href: 'https://protop.no/hjem',
    origin: 'https://protop.no',
    pathname: '/hjem',
    search: '',
    hash: '',
    hostname: 'protop.no',
    replace(url) { history.push(['replace', url]); },
  },
  history: {
    state: { idx: 1 },
    replaceState(_s, _t, url) { history.push(['replaceState', url]); },
  },
};
const stayed = applyBootNavigation(standaloneWin, '/', { standalone: true });
assert.equal(stayed.kind, 'replaceState');
assert.equal(stayed.href, '/');
assert.deepEqual(history, [['replaceState', '/']]);

const browser = [];
const browserWin = {
  location: {
    href: 'https://www.protop.no/hjem',
    pathname: '/hjem',
    search: '',
    hash: '',
    hostname: 'www.protop.no',
    replace(url) { browser.push(url); },
  },
  history: { state: null, replaceState() { throw new Error('should full-navigate'); } },
};
const left = applyBootNavigation(browserWin, 'https://protop.no/', { standalone: false });
assert.equal(left.kind, 'replace');
assert.equal(browser[0], 'https://www.protop.no/');

console.log('pwaNavigation.test.mjs: ok');
