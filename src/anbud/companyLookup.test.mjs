import assert from 'node:assert/strict';
import { lookupCompanyCpv } from './companyLookup.js';

const profile = await lookupCompanyCpv('917103801');
assert.equal(profile.company.orgnr, '917103801');
assert.match(profile.company.name, /Veidekke/i);
assert.ok(profile.cpvCodes.length > 0, 'forventet offentlige CPV-koder');
assert.ok(profile.cpvCodes.every((row) => /^\d{8}$/.test(row.code)));
assert.equal(profile.cpvCodes[0].source, 'doffin');
console.log(`${profile.company.name}: ${profile.cpvCodes.map((row) => row.code).join(', ')}`);

await assert.rejects(() => lookupCompanyCpv('123'), /9 siffer/);
