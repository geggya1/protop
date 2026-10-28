/**
 * SEC-21: barnepassord lagres ikke i klartekst, og appen viser ikke en lagret kopi.
 * Serveren er testet i functions/membership.emulator.test.mjs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('setMemberPassword skriver aldri passordet til Firestore', () => {
  const src = read('functions/authCallables.js');
  const fn = src.slice(src.indexOf('export async function writeMemberPasswordCopies'), src.indexOf('export const setMemberPassword'));
  assert.match(fn, /const keep = \{ password: FieldValue\.delete\(\), passwordSetAt:/);
  assert.doesNotMatch(fn, /\{ password[,\s}]/, 'ingen kopi av selve passordet');
  const call = src.slice(src.indexOf('await writeMemberPasswordCopies(db'), src.indexOf("logger.info('[setMemberPassword] passord satt'"));
  assert.doesNotMatch(call, /password/);
});

test('foresatte ser bare at passordet er satt, og et nytt passord bare én gang', () => {
  const settings = read('screens/ChildSettingsScreen.jsx');
  assert.doesNotMatch(settings, /loaded\.password|password: d\.password/);
  assert.match(settings, /setPasswordSet\(!!\(d\.passwordSetAt \|\| d\.password\)\)/);
  assert.match(settings, /password: deleteField\(\)/, 'en gammel kopi slettes når den finnes');
  const profile = read('screens/ChildProfileScreen.jsx');
  assert.doesNotMatch(profile, /useState\(child\.password/);
  assert.doesNotMatch(profile, /setPassword\(child\.password/);
});
