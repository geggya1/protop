import assert from 'node:assert/strict';
import { COMPANY_AI_OFF_MESSAGE, assertCompanyAiAllowed } from './aiShared.js';

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

console.log('aiCompanyGate.test.mjs: ok');
