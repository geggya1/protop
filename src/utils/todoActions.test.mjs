import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPurgeParentTodo, todoActionError } from './todoStatus.js';
import {
  errorToastPayload, resetSaveToastForTests, showErrorToast, subscribeSaveToast,
} from '../ui/saveToast.js';

test('permanent sletting bare fra papirkurven', () => {
  assert.equal(canPurgeParentTodo({ id: 'a', deleted: true }), true);
  assert.equal(canPurgeParentTodo({ id: 'a', deleted: false }), false);
  assert.equal(canPurgeParentTodo({ id: 'a' }), false);
  assert.equal(canPurgeParentTodo(null), false);
});

test('feil i oppgavehandlinger får forklarende tekst', () => {
  assert.deepEqual(todoActionError('purge', { code: 'permission-denied' }), {
    title: 'Klarte ikke slette oppgaven.',
    detail: 'Du har ikke tilgang til å endre denne oppgaven.',
  });
  assert.match(todoActionError('toggle', { code: 'unavailable' }).detail, /nettet/);
  assert.match(todoActionError('restore', new Error('boom')).detail, /boom/);
  assert.equal(todoActionError('restore', {}).title, 'Klarte ikke gjenopprette oppgaven.');
});

test('feil vises i samme toast som lagring, merket som feil', () => {
  assert.deepEqual(errorToastPayload('Klarte ikke', ''), { kind: 'error', title: 'Klarte ikke', detail: '' });
  assert.equal(errorToastPayload('', 'x').title, 'Noe gikk galt');
  resetSaveToastForTests();
  const seen = [];
  const stop = subscribeSaveToast((toast) => seen.push(toast));
  showErrorToast('Klarte ikke slette oppgaven.', 'Ingen kontakt');
  stop();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'error');
  assert.equal(seen[0].detail, 'Ingen kontakt');
  resetSaveToastForTests();
});

test('Oppgaver: «Slett permanent» spør først, og feil svelges ikke', () => {
  const src = readFileSync(new URL('../../screens/v2/RewardsScreen.jsx', import.meta.url), 'utf8');
  const purge = src.slice(src.indexOf('const onPurgeParent'), src.indexOf('const openTask'));
  assert.match(purge, /await confirmUser\(/);
  assert.ok(purge.indexOf('confirmUser') < purge.indexOf('purgeParentTodo('), 'bekreftelse før sletting');
  assert.equal(/catch \{ \/\* ignore/.test(src.slice(src.indexOf('const onToggle ='), src.indexOf('const openTask'))), false);
  const todos = readFileSync(new URL('./todos.js', import.meta.url), 'utf8');
  const fn = todos.slice(todos.indexOf('export async function purgeParentTodo'));
  assert.ok(fn.indexOf('canPurgeParentTodo(task)') < fn.indexOf('deleteDoc('));
});
