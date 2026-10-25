import assert from 'node:assert/strict';
import { PROTOP_PAGES } from './protopPages.js';
import {
  PROTOP_PROCESSES, getProcess, listProcesses, processTour, processesForPage,
} from './protopProcesses.js';

const both = (v) => !!(v && v.nb && v.en);

assert.ok(listProcesses().length >= 6);
for (const proc of listProcesses()) {
  assert.ok(both(proc.title) && both(proc.pitch), `${proc.id}: tittel/pitch`);
  assert.ok(proc.steps.length >= 4, `${proc.id}: minst fire steg`);
  proc.steps.forEach((s, i) => {
    assert.ok(PROTOP_PAGES[s.page], `${proc.id} steg ${i + 1}: ukjent side ${s.page}`);
    assert.ok(both(s.title) && s.nb && s.en, `${proc.id} steg ${i + 1}: tekst`);
  });
  const tour = processTour(proc.id);
  assert.equal(tour.length, proc.steps.length);
  tour.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.deepEqual(s.go, PROTOP_PAGES[s.page].nav, `${proc.id} steg ${i + 1}: navigasjon`);
    assert.equal(s.scene, 'hub');
  });
}

// Hele løpet fra anbud til faktura følger rekkefølgen i appen.
const flow = getProcess('anbud-til-faktura').steps.map((s) => s.page);
const order = ['anbud.varsling', 'anbud.vurdering', 'anbud.tilbud', 'kontrakt', 'projects', 'arbeid.timeliste', 'arbeid.godkjenning', 'okonomi.fakturagrunnlag', 'okonomi.faktura'];
let last = -1;
for (const page of order) {
  const at = flow.indexOf(page);
  assert.ok(at > last, `${page} kommer i riktig rekkefølge`);
  last = at;
}

assert.deepEqual(processesForPage('okonomi.faktura').map((p) => p.id), ['anbud-til-faktura']);
assert.ok(processesForPage('kunder').some((p) => p.id === 'kunde-prosjekt'));
assert.deepEqual(processesForPage('finnes.ikke'), []);
assert.equal(getProcess('nope'), null);
assert.deepEqual(processTour('nope'), []);

// Sider som sier de er del av en flyt, finnes i flyten.
for (const [key, page] of Object.entries(PROTOP_PAGES)) {
  if (!page.process) continue;
  assert.ok(PROTOP_PROCESSES[page.process], `${key}: ukjent flyt ${page.process}`);
}

console.log(`protopProcesses.test.mjs: ok (${listProcesses().length} arbeidsflyter)`);
