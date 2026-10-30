/**
 * DS-17: company.navn er fasit for selskapsnavnet. «Gi nytt navn» endrer begge feltene,
 * og en underenhet viser morselskapets navn slik det er nå.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyDisplayName, parentCompanyDisplayName, readableCompanyName, renameGroupPatch,
} from './companyName.js';
import { inviteFromPlaceholder } from './groupInviteLogic.js';

const company = { id: 'A', type: 'organization', name: 'Gammelt AS', company: { navn: 'Nytt Bygg AS' } };

assert.equal(companyDisplayName(company), 'Nytt Bygg AS', 'company.navn går foran name');
assert.equal(companyDisplayName({ name: 'Familien Hansen' }), 'Familien Hansen', 'grupper uten selskap');
assert.equal(companyDisplayName(null, 'Selskap'), 'Selskap');

assert.equal(readableCompanyName('CONSULT1 AS'), 'Consult1 AS', 'registernavn i overskrifter');
assert.equal(readableCompanyName('BYGG OG ANLEGG SØR-VEST AS'), 'Bygg og Anlegg Sør-Vest AS');
assert.equal(readableCompanyName('Nytt Bygg AS'), 'Nytt Bygg AS', 'egen skrivemåte står');
assert.equal(readableCompanyName(''), '');

assert.deepEqual(renameGroupPatch(company, '  Berg Bygg AS '), { name: 'Berg Bygg AS', 'company.navn': 'Berg Bygg AS' });
assert.deepEqual(renameGroupPatch({ name: 'Familien' }, 'Familien Berg'), { name: 'Familien Berg' });

const unit = { id: 'B', parentCompanyId: 'A', parentCompanyName: 'Gammelt AS' };
assert.equal(parentCompanyDisplayName(unit, [company, unit]), 'Nytt Bygg AS', 'slått opp via parentCompanyId');
assert.equal(parentCompanyDisplayName(unit, [unit]), 'Gammelt AS', 'kopien når morselskapet ikke er i listen');
assert.equal(parentCompanyDisplayName({ id: 'C' }, [company]), '');

// Invitasjonen bruker selskapsnavnet, ikke et gammelt gruppenavn.
const invite = inviteFromPlaceholder({ placeholder: { email: 'a@b.no' }, family: company, familyId: 'A', now: '2026-10-28T10:00:00Z' });
assert.equal(invite.familyName, 'Nytt Bygg AS');

// «Gi nytt navn» skriver begge feltene.
const dashboard = readFileSync(new URL('../../screens/FamilyDashboardScreen.jsx', import.meta.url), 'utf8');
assert.match(dashboard, /renameGroupPatch\(familyDoc, trimmed\)/);

console.log('companyName.test.mjs: ok');
