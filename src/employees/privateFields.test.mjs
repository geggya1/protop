import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { employeeForCache } from './localCache.js';
import { mergeEmployeeEdit, normalizeEmployee } from './model.js';
import {
  hasPrivateValues, keepStoredPrivate, privatePatch, splitEmployeePrivate, withEmployeePrivate,
} from './privateFields.js';

const row = normalizeEmployee({
  id: 'e1',
  person: {
    firstName: 'Ada', nationalId: '01019012345', kinName: 'Bror', kinPhone: '+4790000000', kinEmail: 'BROR@x.no', phone: '+4791111111',
  },
  company: { title: 'Snekker', comment: 'Internt notat', status: 'active' },
});

test('posten deles i katalogdel og skjermet del', () => {
  const { main, secret } = splitEmployeePrivate(row);
  assert.equal(main.person.nationalId, '');
  assert.equal(main.person.kinName, '');
  assert.equal(main.company.comment, '');
  assert.equal(main.person.phone, '+4791111111');
  assert.equal(main.company.title, 'Snekker');
  assert.equal(secret.person.nationalId, '01019012345');
  assert.equal(secret.person.kinEmail, 'bror@x.no');
  assert.equal(secret.company.comment, 'Internt notat');
  assert.equal(hasPrivateValues(main), false);
  assert.equal(hasPrivateValues(row), true);
});

test('lesing: skjermet del vinner, eldre verdier på posten er reserve', () => {
  const legacy = { ...row, person: { ...row.person } };
  const merged = withEmployeePrivate(legacy, { person: { nationalId: '02029012345' } });
  assert.equal(merged.person.nationalId, '02029012345');
  assert.equal(merged.person.kinName, 'Bror', 'ikke flyttet ennå: verdien på posten brukes');
  const cleared = withEmployeePrivate(legacy, { person: { kinName: '' } });
  assert.equal(cleared.person.kinName, '', 'tømt i den skjermede delen');
  assert.equal(withEmployeePrivate(legacy, null), legacy);
});

test('uten lesetilgang: eldre verdier står urørt, og bare endrede felt skrives', () => {
  const stored = { person: { nationalId: '010190 12345', firstName: 'Ada' }, company: { comment: 'Gammel' } };
  const kept = keepStoredPrivate(splitEmployeePrivate(row).main, stored);
  assert.equal(kept.person.nationalId, '010190 12345', 'rå verdi, så regelen ser den som uendret');
  assert.equal(kept.company.comment, 'Gammel');
  assert.equal(kept.person.kinName, '');
  const patch = privatePatch({ person: { kinName: '' } }, { person: { kinName: 'Søster' } });
  assert.deepEqual(patch, { person: { kinName: 'Søster' } });
  assert.deepEqual(privatePatch(row, row), {});
});

test('redigering med skjermet del lagt på gir ikke falske endringer', () => {
  const remote = normalizeEmployee(withEmployeePrivate({ ...splitEmployeePrivate(row).main }, splitEmployeePrivate(row).secret));
  const next = mergeEmployeeEdit({ remote, base: remote, next: { ...remote, person: { ...remote.person, phone: '+4792222222' } } });
  assert.equal(next.person.nationalId, '01019012345');
  assert.equal(next.person.phone, '+4792222222');
});

test('lokal kopi uten personnummer, pårørende og kommentar', () => {
  const cached = employeeForCache(row);
  const json = JSON.stringify(cached);
  assert.ok(!json.includes('01019012345'));
  assert.ok(!json.includes('Bror'));
  assert.ok(!json.includes('Internt notat'));
  assert.equal(cached.person.firstName, 'Ada');
});

test('storage: lagring skriver skjermede felt til employeesPrivate', () => {
  const src = readFileSync(new URL('./storage.js', import.meta.url), 'utf8');
  assert.match(src, /'employeesPrivate'/);
  assert.match(src, /tx\.set\(ref, parts\.main\)/);
  assert.match(src, /saveWithoutPrivateRead/);
  assert.match(src, /profileForDevice/);
});
