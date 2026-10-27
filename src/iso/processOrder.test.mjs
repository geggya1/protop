import assert from 'node:assert/strict';
import test from 'node:test';
import { reorderProcesses } from './processes.js';

test('reorderProcesses: nytt nummer bare der rekkefølgen endres, uten ny versjon', () => {
  const p = (id, order) => ({ id, order, rev: 3, publishedVersion: 1, versions: [{ version: 1, state: 'publisert' }] });
  const list = [p('markedsforing', 1), p('tilbud', 2), p('anbud', 3), p('kontrakt', 4)];
  const out = reorderProcesses(list, ['markedsforing', 'anbud', 'tilbud', 'kontrakt'], { actor: { uid: 'u1', name: 'Kari' } });
  assert.deepEqual(out.map((r) => [r.process.id, r.process.order]), [['anbud', 2], ['tilbud', 3]]);
  for (const { process, event } of out) {
    assert.equal(process.rev, 4, 'revisjonen øker');
    assert.equal(process.publishedVersion, 1, 'publisert versjon står');
    assert.deepEqual(process.versions, list[0].versions, 'versjonene røres ikke');
    assert.equal(event.action, 'iso.process.reordered');
  }
  assert.equal(reorderProcesses(list, ['markedsforing', 'tilbud', 'anbud', 'kontrakt']).length, 0, 'uendret gir ingenting');
});
