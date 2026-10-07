import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceResource, withPublicInvoker } from './open-callable-invoker.mjs';

test('callable uten invoker får allUsers', () => {
  const opened = withPublicInvoker({ etag: 'abc', version: 3, bindings: [] });
  assert.deepEqual(opened.bindings, [{ role: 'roles/run.invoker', members: ['allUsers'] }]);
  assert.equal(opened.etag, 'abc');
  const again = withPublicInvoker(opened);
  assert.deepEqual(again.bindings[0].members, ['allUsers']);
});

test('eksisterende invoker-binding beholdes og får allUsers', () => {
  const opened = withPublicInvoker({
    bindings: [
      { role: 'roles/run.invoker', members: ['serviceAccount:app@protop.iam.gserviceaccount.com'] },
      { role: 'roles/run.viewer', members: ['user:a@protop.no'] },
    ],
  });
  assert.deepEqual(opened.bindings[0].members, [
    'serviceAccount:app@protop.iam.gserviceaccount.com',
    'allUsers',
  ]);
  assert.equal(opened.bindings[1].role, 'roles/run.viewer');
  assert.equal(serviceResource('protop-c189c', 'europe-west1', 'interpretimport'), 'projects/protop-c189c/locations/europe-west1/services/interpretimport');
});
