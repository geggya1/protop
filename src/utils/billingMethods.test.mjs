import assert from 'node:assert/strict';
import { billingMethodIdsForPlatform } from './billingMethods.js';

assert.deepEqual(billingMethodIdsForPlatform('ios'), ['appstore']);
assert.deepEqual(billingMethodIdsForPlatform('android'), ['googleplay']);
assert.deepEqual(billingMethodIdsForPlatform('web'), ['card', 'vipps']);
assert.equal(billingMethodIdsForPlatform('ios').includes('vipps'), false);
assert.equal(billingMethodIdsForPlatform('ios').includes('card'), false);
assert.equal(billingMethodIdsForPlatform('android').includes('card'), false);
