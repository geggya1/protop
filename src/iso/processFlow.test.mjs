import assert from 'node:assert/strict';
import test from 'node:test';
import { processSteps } from './processFlow.js';

const n = (id, type, label, x, y = 40) => ({ id, type, label, x, y, w: 160, h: 64 });
const e = (from, to, condition = 'always', label = '') => ({ id: `${from}-${to}`, from, to, condition, label });

const diagram = {
  lanes: [{ id: 'l1', label: 'Kunde', y: 0, h: 160 }, { id: 'l2', label: 'Daglig leder', y: 160, h: 160 }],
  nodes: [
    n('s', 'start', 'Henvendelse', 0),
    n('a', 'activity', 'Motta henvendelse', 200),
    n('d', 'decision', 'Ta oppdraget?', 400, 200),
    n('t', 'activity', 'Lag tilbud', 600, 200),
    n('r', 'activity', 'Registrer tapt salg', 600, 360),
    n('k', 'approval', 'Kontroller tilbud', 800, 200),
    n('x', 'end', 'Tilbud sendt', 1000, 200),
    n('løs', 'activity', 'Løs boks', 1200, 40),
  ],
  edges: [
    e('s', 'a'), e('a', 'd'), e('d', 't', 'yes'), e('d', 'r', 'no'), e('t', 'k'),
    e('k', 'x', 'approved'), e('k', 't', 'rejected'), e('r', 'x'),
  ],
};

test('prosessflyt: rekkefølge fra start, nummer, rolle og slutt sist', () => {
  const steps = processSteps(diagram);
  assert.deepEqual(steps.map((s) => s.node.id), ['s', 'a', 'd', 't', 'k', 'r', 'løs', 'x']);
  assert.deepEqual(steps.map((s) => s.number), [null, 1, 2, 3, 4, 5, 6, null]);
  assert.equal(steps[0].kind, 'start');
  assert.equal(steps.at(-1).kind, 'end');
  assert.equal(steps[1].role, 'Kunde');
  assert.equal(steps[2].role, 'Daglig leder');
  assert.ok(steps.some((s) => s.node.id === 'løs'), 'bokser uten kobling vises også');
});

test('prosessflyt: beslutning og godkjenning viser veiene, også tilbake', () => {
  const steps = processSteps(diagram);
  const d = steps.find((s) => s.node.id === 'd');
  assert.deepEqual(d.branches.map((b) => [b.label, b.toNumber, b.toLabel]), [['Ja', 3, 'Lag tilbud'], ['Nei', 5, 'Registrer tapt salg']]);
  const k = steps.find((s) => s.node.id === 'k');
  assert.deepEqual(k.branches.map((b) => [b.label, b.toKind, b.back]), [['Godkjent', 'end', false], ['Avvist', 'step', true]]);
  const r = steps.find((s) => s.node.id === 'r');
  assert.equal(r.jump.toKind, 'end', 'tapt salg går rett til slutt: vises som hopp');
  const a = steps.find((s) => s.node.id === 'a');
  assert.equal(a.jump, null, 'vanlig neste steg trenger ingen pil');
});

test('prosessflyt: uten startboks brukes boksene uten innkommende pil', () => {
  const steps = processSteps({ nodes: [n('b', 'activity', 'B', 300), n('a', 'activity', 'A', 0)], edges: [e('a', 'b')] });
  assert.deepEqual(steps.map((s) => s.node.label), ['A', 'B']);
  assert.deepEqual(processSteps({ nodes: [], edges: [] }), []);
});
