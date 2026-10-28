/**
 * EGEN-05: sidevisninger samles på klienten, så vanlig navigasjon ikke gir 429.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  NAVIGATION_FLUSH_MS, createNavigationBatcher, isRateLimited, navigationEvent, pageLabel,
} from './usageBatch.js';
import { normalizeUsageEvent, usageEventLabel } from './usage.js';

function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    fire: () => { const all = [...timers.values()]; timers.clear(); all.forEach((t) => t.fn()); },
    count: () => timers.size,
  };
}

test('mange sideskifter blir én hendelse per minutt', async () => {
  const sent = [];
  const timers = fakeTimers();
  const batch = createNavigationBatcher({ send: (event) => sent.push(event), ...timers });
  const tabs = ['Ansatte', 'HR', 'Timer', 'HR', 'Faktura'];
  for (let i = 0; i < 40; i += 1) batch.add({ companyId: 'A', tab: tabs[i % tabs.length], subView: '' });
  assert.equal(sent.length, 0, 'ingenting sendes per side');
  assert.equal(timers.count(), 1, 'én tidtaker');
  timers.fire();
  await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'navigation');
  assert.equal(sent[0].companyId, 'A');
  assert.equal(sent[0].detail.count, 40);
  assert.equal(sent[0].detail.tab, 'Faktura');
  assert.ok(sent[0].summary.startsWith('Åpnet '));
  assert.ok(sent[0].summary.length <= 180);
  assert.ok(sent[0].detail.pages.length <= 120);
});

test('samme side to ganger etter hverandre telles én gang, og tom kø sender ingenting', async () => {
  const sent = [];
  const timers = fakeTimers();
  const batch = createNavigationBatcher({ send: (event) => sent.push(event), ...timers });
  assert.equal(batch.add({ companyId: 'A', tab: 'HR', subView: 'lonn' }), true);
  assert.equal(batch.add({ companyId: 'A', tab: 'HR', subView: 'lonn' }), false);
  assert.equal(batch.add({ companyId: 'A', tab: '', subView: '' }), false);
  await batch.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].detail.pages, 'HR › lonn');
  await batch.flush();
  assert.equal(sent.length, 1);
});

test('bytte av selskap sender sidene for det forrige selskapet først', async () => {
  const sent = [];
  const batch = createNavigationBatcher({ send: (event) => sent.push(event), ...fakeTimers() });
  batch.add({ companyId: 'A', tab: 'HR' });
  batch.add({ companyId: 'B', tab: 'Timer' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].companyId, 'A');
  await batch.flush();
  assert.equal(sent[1].companyId, 'B');
});

test('serveren beholder sidene og antallet, og etiketten viser sidene', () => {
  const event = navigationEvent('A', [{ tab: 'HR' }, { tab: 'Timer', subView: 'uke' }]);
  const stored = normalizeUsageEvent(event, { actorUid: 'u' });
  assert.equal(stored.detail.pages, 'HR, Timer › uke');
  assert.equal(stored.detail.count, 2);
  assert.equal(usageEventLabel('navigation', { pages: 'HR, Timer' }), 'Åpnet HR, Timer');
  assert.equal(usageEventLabel('navigation', { tab: 'HR' }), 'Åpnet HR');
  assert.equal(normalizeUsageEvent({ type: 'navigation', detail: { count: 'x' } }).detail.count, undefined);
  assert.equal(pageLabel({ tab: 'HR', subView: '' }), 'HR');
  assert.equal(navigationEvent('A', []), null);
});

test('«for mange forespørsler» kjennes igjen, så klienten venter', () => {
  assert.equal(isRateLimited({ code: 'functions/resource-exhausted' }), true);
  assert.equal(isRateLimited({ message: 'For mange forespørsler. Prøv igjen senere (180 per time).' }), true);
  assert.equal(isRateLimited({ message: 'Ingen tilgang' }), false);
  assert.equal(NAVIGATION_FLUSH_MS, 60000);
});

test('klienten køer sidevisninger og pauser aktivitet etter 429; serveren har egen grense for endringer', () => {
  const client = readFileSync(new URL('./usageClient.js', import.meta.url), 'utf8');
  assert.match(client, /if \(type === 'navigation'\) \{\s*const added = navigation\.add\(/);
  assert.match(client, /pausedUntil = Date\.now\(\) \+ USAGE_BACKOFF_MS/);
  const recorder = readFileSync(new URL('../../components/UsageRecorder.jsx', import.meta.url), 'utf8');
  assert.match(recorder, /addEventListener\?\.\('pagehide', onHide\)/);
  assert.match(recorder, /else flushUsage\(\);/);
  const server = readFileSync(new URL('../../functions/usageLog.js', import.meta.url), 'utf8');
  assert.match(server, /change \? 'usage-change' : 'usage'/);
});
