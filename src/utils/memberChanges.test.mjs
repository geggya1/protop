/**
 * REV-02: å fjerne et barn skal ikke stoppe halvveis.
 * Reglene er testet i tests/rules/regressions.rules.test.mjs med de samme skrivingene.
 * Her sjekkes at appen skriver dem i den rekkefølgen og i de batchene reglene forventer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const groups = readFileSync(new URL('./groups.js', import.meta.url), 'utf8');

function body(name) {
  const start = groups.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, name);
  const end = groups.indexOf('\nexport ', start + 10);
  return groups.slice(start, end > start ? end : undefined);
}

test('fjerning av medlem: medlemsdokument og medlemslister i én batch, og feilen sies fra', () => {
  const fn = body('removeMemberFromGroup');
  const batch = fn.indexOf('writeBatch(db)');
  const commit = fn.indexOf('await batch.commit()');
  assert.ok(batch >= 0 && commit > batch);
  assert.ok(fn.indexOf('batch.delete(memberRef)') > batch && fn.indexOf('batch.delete(memberRef)') < commit);
  assert.ok(fn.indexOf("batch.update(doc(db, 'families', familyId), familyRevokePatch(id))") < commit,
    'barnet tas ut av medlemslistene i samme batch');
  assert.ok(fn.indexOf("batch.set(doc(db, 'children', id)") < commit, 'speilprofilen i samme batch');
  assert.match(fn, /catch \(cause\) \{\s*const error = new Error\('Medlemmet ble ikke fjernet/);
  assert.ok(fn.indexOf("collection(db, 'families', familyId, 'children', id, 'todos')") > commit,
    'oppgavene slettes først når fjerningen er gjort');
});
