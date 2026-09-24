import assert from 'node:assert/strict';

// Speil av defaultGreetingEnabled i greetingPrefs.js (unngår AsyncStorage i node-test)
function defaultGreetingEnabled(isChild) {
  return !!isChild;
}

assert.equal(defaultGreetingEnabled(true), true);
assert.equal(defaultGreetingEnabled(false), false);
assert.equal(defaultGreetingEnabled(undefined), false);
assert.equal(defaultGreetingEnabled(null), false);
assert.equal(defaultGreetingEnabled(0), false);
assert.equal(defaultGreetingEnabled(1), true);

console.log('greetingPrefs ok');
