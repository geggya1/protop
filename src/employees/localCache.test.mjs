import assert from 'node:assert/strict';
import test from 'node:test';
import { employeeForCache, employeeListKey, isQuotaError, persistEmployeeList } from './localCache.js';

test('lokal kopi beholder flere nivå og slipper innebygde bilder', () => {
  const row = employeeForCache({
    id: 'a',
    person: {
      firstName: 'Ada',
      lastName: 'Berg',
      photoUrl: 'data:image/jpeg;base64,AAAA',
    },
    company: { accessLevels: ['ansatt', 'tilbud'], status: 'active', personnelKind: 'staff' },
    cv: {
      projects: [{
        title: 'Bro',
        images: ['data:image/png;base64,BBBB', 'https://cdn.example/a.jpg'],
      }],
    },
  });
  assert.equal(row.person.photoUrl, '');
  assert.deepEqual(row.cv.projects[0].images, ['https://cdn.example/a.jpg']);
  assert.deepEqual(row.company.accessLevels, ['ansatt', 'tilbud']);
  assert.equal(row.company.personnelKind, 'staff');
});

test('full nettleserkvote byttes ut så nivåene likevel lagres lokalt', async () => {
  const store = new Map([[employeeListKey('co'), 'x'.repeat(80)]]);
  let writes = 0;
  const storage = {
    async setItem(key, value) {
      writes += 1;
      if (writes === 1) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
  await persistEmployeeList(storage, employeeListKey('co'), [{
    id: 'a',
    person: { firstName: 'Ada', lastName: 'Berg', photoUrl: 'data:image/jpeg;base64,CCCC' },
    company: { accessLevels: ['ansatt', 'tilbud'], status: 'active' },
  }]);
  const saved = JSON.parse(store.get(employeeListKey('co')));
  assert.equal(writes, 2);
  assert.deepEqual(saved[0].company.accessLevels, ['ansatt', 'tilbud']);
  assert.equal(saved[0].person.photoUrl, '');
  assert.equal(isQuotaError(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })), true);
});
