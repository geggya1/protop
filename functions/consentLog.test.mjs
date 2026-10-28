import assert from 'node:assert/strict';
import { canAcceptForCompany, writeConsentLog } from './consentLog.js';

assert.equal(canAcceptForCompany({ ownerUid: 'boss' }, 'boss'), true);
assert.equal(canAcceptForCompany({ ownerUid: 'boss', adminUids: ['adm'] }, 'adm'), true);
assert.equal(canAcceptForCompany({ ownerUid: 'boss', members: ['m'] }, 'm'), false);
assert.equal(canAcceptForCompany(null, 'boss'), false);

function fakeDb() {
  const docs = new Map();
  const added = [];
  return {
    docs,
    added,
    doc(path) {
      return {
        async create(data) {
          if (docs.has(path)) {
            const err = new Error('6 ALREADY_EXISTS: Document already exists');
            err.code = 6;
            throw err;
          }
          docs.set(path, data);
        },
      };
    },
    collection(name) {
      return { async add(data) { added.push({ name, data }); } };
    },
  };
}

// Samme godkjenning to ganger: én rad, og første servertid beholdes.
const db = fakeDb();
const entry = { uid: 'u1', kind: 'terms', version: '3.0.0', clientAt: '2026-10-27T08:00:00.000Z' };
await writeConsentLog(db, entry);
await writeConsentLog(db, entry);
assert.equal(db.docs.size, 1);
const [[id, row]] = [...db.docs.entries()];
assert.equal(id, 'consentLog/u1_terms__3.0.0_20261027080000000');
assert.equal(row.kind, 'terms');
assert.ok(row.at, 'servertid');

// Uten klokkeslett fra enheten: egen rad hver gang.
await writeConsentLog(db, { uid: 'u1', kind: 'marketing', version: '3.0.0', accepted: false });
assert.equal(db.added.length, 1);
assert.equal(db.added[0].name, 'consentLog');

console.log('consentLog.test.mjs: ok');
