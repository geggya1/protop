import assert from 'node:assert/strict';
import {
  isTransientSpeechError,
  isFatalSpeechError,
  speechErrorMessage,
  speechErrorInfo,
} from './speechErrors.js';

assert.equal(isTransientSpeechError('no-speech'), true);
assert.equal(isTransientSpeechError('aborted'), true);
assert.equal(isTransientSpeechError('network'), true);
assert.equal(isTransientSpeechError('not-allowed'), false);

assert.equal(isFatalSpeechError('not-allowed'), true);
assert.equal(isFatalSpeechError('audio-capture'), true);
assert.equal(isFatalSpeechError('language-not-supported'), true);
assert.equal(isFatalSpeechError('no-speech'), false);
assert.equal(isFatalSpeechError('weird-unknown'), true);

assert.match(speechErrorMessage('not-allowed'), /Mikrofon er blokkert/);
assert.match(speechErrorMessage('audio-capture'), /mikrofon/i);

const info = speechErrorInfo('not-allowed');
assert.equal(info.error, 'not-allowed');
assert.equal(info.fatal, true);
assert.ok(info.message.length > 10);

console.log('speechErrors.test.mjs: ok');
