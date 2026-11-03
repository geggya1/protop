import assert from 'node:assert/strict';
import { sensitiveTopics } from './recruitmentPrivacy.js';

{
  assert.deepEqual(sensitiveTopics('Spurte om hun er gravid og har barneplaner'), ['graviditet', 'familieplaner']);
  assert.deepEqual(sensitiveTopics('Sterk faglig, god på Revit'), []);
  assert.ok(sensitiveTopics('Har en kronisk sykdom').includes('helse'));
}

console.log('recruitmentPrivacy ok');
assert.deepEqual(sensitiveTopics('Hun ønsker barn snart'), ['familieplaner']);
assert.deepEqual(sensitiveTopics('Søker til småbarnsavdeling'), []);
assert.deepEqual(sensitiveTopics('Har to småbarn'), ['barn og omsorg']);
console.log('recruitmentPrivacy words ok');
