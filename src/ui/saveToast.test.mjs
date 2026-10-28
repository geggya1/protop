import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAVE_TOAST_MS,
  SAVE_TOAST_TITLE,
  UNDO_LABEL,
  UNDO_TOAST_MS,
  resetSaveToastForTests,
  runToastAction,
  saveToastPayload,
  showSaveToast,
  showUndoToast,
  subscribeSaveToast,
  toastDuration,
  undoToastPayload,
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

test('angre-toasten har én handling som bare kan kjøres én gang', () => {
  resetSaveToastForTests();
  const seen = [];
  const stop = subscribeSaveToast((toast) => seen.push(toast));
  let undone = 0;
  const toast = showUndoToast('«Kontrakt.pdf» er fjernet', () => { undone += 1; });
  stop();
  assert.equal(seen.length, 1);
  assert.equal(toast.kind, 'undo');
  assert.equal(toast.title, '«Kontrakt.pdf» er fjernet');
  assert.equal(toast.action.label, UNDO_LABEL);
  assert.equal(toastDuration(toast), UNDO_TOAST_MS);
  assert.ok(UNDO_TOAST_MS > SAVE_TOAST_MS, 'angre står lenger enn en vanlig bekreftelse');
  assert.equal(runToastAction(toast), true);
  assert.equal(runToastAction(toast), false, 'andre trykk gjør ingenting');
  assert.equal(undone, 1);
  assert.equal(undoToastPayload('Fjernet', null).action, null, 'uten funksjon ingen knapp');
  assert.equal(toastDuration({ kind: 'error' }) > SAVE_TOAST_MS, true);
  assert.equal(toastDuration(saveToastPayload('x')), SAVE_TOAST_MS);
  resetSaveToastForTests();
});
