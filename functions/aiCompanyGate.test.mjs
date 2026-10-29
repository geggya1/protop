import assert from 'node:assert/strict';
import { COMPANY_AI_OFF_MESSAGE, assertCompanyAiAllowed, assertFamilyAdult } from './aiShared.js';

// «Tillat AI-funksjoner» per selskap (company.privacy.ai).
function fakeDb(families) {
  return {
    doc(path) {
      const id = path.split('/')[1];
      return {
        async get() {
          const data = families[id];
          return { exists: !!data, data: () => data };
        },
      };
    },
  };
}

const db = fakeDb({
  standard: { company: { navn: 'Bygg AS' } },
  av: { company: { navn: 'Stille AS', privacy: { ai: false } } },
  paa: { company: { navn: 'Aktiv AS', privacy: { ai: true, usageLog: false } } },
  familie: { name: 'Hjemme' },
});

await assertCompanyAiAllowed(db, 'standard');
await assertCompanyAiAllowed(db, 'paa');
await assertCompanyAiAllowed(db, 'familie');
await assertCompanyAiAllowed(db, '');
await assertCompanyAiAllowed(db, 'finnes-ikke');
await assert.rejects(() => assertCompanyAiAllowed(db, 'av'), (err) => {
  assert.equal(err.message, COMPANY_AI_OFF_MESSAGE);
  assert.equal(err.code, 'failed-precondition');
  return true;
});

// Foresatt som ikke er eier: snapshot.exists er en verdi i Admin SDK, ikke en funksjon.
{
  const docs = {
    'families/fam': { ownerUid: 'eier' },
    'families/fam/parents/forelder': { active: true },
    'families/fam/parents/sluttet': { active: false },
  };
  const parentsDb = {
    doc(path) {
      return { async get() { const data = docs[path]; return { exists: !!data, data: () => data }; } };
    },
  };
  assert.deepEqual(await assertFamilyAdult(parentsDb, 'eier', 'fam'), { role: 'admin' });
  assert.deepEqual(await assertFamilyAdult(parentsDb, 'forelder', 'fam'), { role: 'parent' });
  await assert.rejects(() => assertFamilyAdult(parentsDb, 'sluttet', 'fam'), /Kun foresatte/);
  await assert.rejects(() => assertFamilyAdult(parentsDb, 'ukjent', 'fam'), /Kun foresatte/);
}

console.log('aiCompanyGate.test.mjs: ok');
