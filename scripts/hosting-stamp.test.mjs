import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { bustExpoAssetUrls, buildRefreshScript } = require('./hosting-stamp.js');

const html = `<link rel="stylesheet" href="/_expo/static/css/app.css"><script src="/_expo/static/js/web/index-abc.js" defer></script><script src="/other.js"></script>`;
const busted = bustExpoAssetUrls(html, 'sha/1');
assert.match(busted, /href="\/_expo\/static\/css\/app\.css\?v=sha%2F1"/);
assert.match(busted, /src="\/_expo\/static\/js\/web\/index-abc\.js\?v=sha%2F1"/);
assert.match(busted, /src="\/other\.js"/);
assert.equal(bustExpoAssetUrls(busted, 'next'), busted.replaceAll('sha%2F1', 'next'));

const script = buildRefreshScript('abc');
assert.match(script, /protop_build_reload_target/);
assert.match(script, /"abc"/);
assert.doesNotMatch(script, /location\.reload\(\)\}catch/);
// Ingen ekstra lasting bare fordi forrige besøk hadde et annet bygg (HTML-en er alltid fersk).
assert.doesNotMatch(script, /getItem\(k\)|p!==id/);
assert.match(script, /j\.id!==id/);

// Selvreparasjon: et /_expo-skript som feiler (HTML lagret som JS), hentes på nytt fra
// serveren og siden lastes én gang til. Ikke for andre skript, og aldri i løkke.
function runHeal(build) {
  const listeners = [];
  const session = new Map();
  const fetched = [];
  let reloads = 0;
  const nodes = [
    { src: 'https://protop.no/_expo/static/js/web/index-a.js?v=' + build },
    { href: 'https://protop.no/_expo/static/css/app.css?v=' + build },
  ];
  const sandbox = {
    window: { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) },
    localStorage: { getItem: () => build, setItem: () => {} },
    document: { querySelectorAll: () => nodes },
    fetch: (url, opts) => { fetched.push({ url, cache: opts?.cache }); return Promise.resolve({ ok: true, json: () => ({ id: build }) }); },
    location: { hostname: 'protop.no', reload: () => { reloads += 1; } },
    Promise,
  };
  const code = buildRefreshScript(build).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  vm.runInNewContext(code, sandbox);
  const error = listeners.find((l) => l.type === 'error');
  return {
    error, fetched, reloads: () => reloads, session,
  };
}

{
  const page = runHeal('b1');
  assert.ok(page.error && page.error.capture, 'lytter på feil i capture-fasen (skript-feil bobler ikke)');
  page.error.fn({ target: { tagName: 'SCRIPT', src: 'https://protop.no/other.js' } });
  page.error.fn({ target: { tagName: 'IMG', src: 'https://protop.no/_expo/x.png' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(page.reloads(), 0, 'bare /_expo-skript og -stilark');
  const before = page.fetched.length;
  page.error.fn({ target: { tagName: 'SCRIPT', src: 'https://protop.no/_expo/static/js/web/index-a.js?v=b1' } });
  await new Promise((r) => setTimeout(r, 0));
  const healed = page.fetched.slice(before);
  assert.deepEqual(healed.map((f) => f.cache), ['reload', 'reload']);
  assert.equal(page.reloads(), 1);
  // Samme versjon feiler igjen etter innlastingen: ingen ny runde.
  page.error.fn({ target: { tagName: 'SCRIPT', src: 'https://protop.no/_expo/static/js/web/index-a.js?v=b1' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(page.reloads(), 1, 'ingen løkke');
}

console.log('hosting-stamp: ok');
