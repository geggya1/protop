import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAVE_TOAST_MS,
  SAVE_TOAST_TITLE,
  resetSaveToastForTests,
  saveToastPayload,
  showSaveToast,
  subscribeSaveToast,
} from './saveToast.js';

test('kort bekreftelse sier at endringen er lagret', () => {
  assert.equal(saveToastPayload('').title, SAVE_TOAST_TITLE);
  assert.equal(saveToastPayload('').detail, '');
  assert.equal(saveToastPayload('Lagret.').detail, '');
  assert.equal(saveToastPayload('Nivåene er lagret.').detail, '');
  assert.equal(SAVE_TOAST_MS >= 2500 && SAVE_TOAST_MS <= 5000, true);
});

test('konkret lagring vises under bekreftelsen', () => {
  const payload = saveToastPayload('Anders Rolandsen har Ansatt, Tilbud.');
  assert.equal(payload.title, 'Endring er lagret');
  assert.equal(payload.detail, 'Anders Rolandsen har Ansatt, Tilbud.');
});

test('ny lagring erstatter den forrige i lytteren', () => {
  resetSaveToastForTests();
  const seen = [];
  const stop = subscribeSaveToast((toast) => seen.push(toast));
  showSaveToast('Første');
  showSaveToast('Andre');
  stop();
  showSaveToast('Etter avmelding');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].detail, 'Første');
  assert.equal(seen[1].detail, 'Andre');
  assert.notEqual(seen[0].id, seen[1].id);
  resetSaveToastForTests();
});
