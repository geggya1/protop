import assert from 'assert';
import { planOffentligPush } from './push-offentlig-plan.js';

const blockedDirty = planOffentligPush({
  dirty: true,
  headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
});
assert.strictEqual(blockedDirty.ok, false);
assert.match(blockedDirty.error, /ren/i);

const blockedEmpty = planOffentligPush({ dirty: false, headSha: '' });
assert.strictEqual(blockedEmpty.ok, false);

const alreadyLive = planOffentligPush({
  dirty: false,
  headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  remoteOffentligSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
});
assert.strictEqual(alreadyLive.ok, false);

const pending = [
  'c1 fix a',
  'c2 fix b',
];
const ready = planOffentligPush({
  dirty: false,
  headSha: 'cccccccccccccccccccccccccccccccccccccccc',
  remoteOffentligSha: 'dddddddddddddddddddddddddddddddddddddddd',
  commitsNotLive: pending,
});
assert.strictEqual(ready.ok, true);
assert.strictEqual(ready.dest, 'refs/heads/offentlig');
assert.strictEqual(
  ready.refspec,
  'cccccccccccccccccccccccccccccccccccccccc:refs/heads/offentlig',
);
assert.deepStrictEqual(ready.commitsNotLive, pending);

const first = planOffentligPush({
  dirty: false,
  headSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  remoteOffentligSha: '',
  commitsNotLive: ['eeee first'],
});
assert.strictEqual(first.ok, true);

console.log('push-offentlig-plan: ok');
