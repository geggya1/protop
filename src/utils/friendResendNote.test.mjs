import assert from 'node:assert/strict';
import test from 'node:test';
import { friendResendNote } from './friendsLogic.js';

test('«Send på nytt» sier fra når ingen e-post eller SMS sendes (L-33)', () => {
  assert.match(friendResendNote({ noReminder: true }), /sender ikke purringer/);
  assert.match(friendResendNote({ reminderLimited: true }), /høyst én gang i uken/);
  assert.equal(friendResendNote({ emailSent: true }), '');
  assert.equal(friendResendNote(null), '');
});
