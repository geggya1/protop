import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newCompanyFields } from './companyRegistry.js';

const company = { organisasjonsnummer: '917 103 801', navn: 'Bygg AS' };

test('ny bedrift får orgnr og selskapsdata fra start', () => {
  const fields = newCompanyFields(company, null);
  assert.equal(fields.orgnr, '917103801');
  assert.deepEqual(fields.company, company);
  assert.deepEqual(fields.cpvCodes, []);
  assert.equal(fields.cpvSource, '');
  assert.deepEqual(fields.projects, []);
  assert.deepEqual(fields.tenders, []);
});

test('CPV og navn fra Doffin tas med når de finnes', () => {
  const fields = newCompanyFields(company, { cpvCodes: ['45000000'], company: { name: 'Bygg AS (Doffin)' } });
  assert.deepEqual(fields.cpvCodes, ['45000000']);
  assert.equal(fields.cpvSource, 'doffin');
  assert.equal(fields.company.navn, 'Bygg AS (Doffin)');
  assert.equal(fields.company.organisasjonsnummer, '917 103 801');
});

test('«Opprett bedrift» skriver orgnr i samme batch som selskapet', () => {
  const flow = readFileSync(new URL('./companyJoinFlow.js', import.meta.url), 'utf8');
  const fn = flow.slice(flow.indexOf('export async function registerCompany'), flow.indexOf('export async function requestCompanyAccess'));
  assert.match(fn, /createGroup\(\{[\s\S]*fields: patch/);
  assert.equal(/updateGroup\(/.test(fn), false, 'ingen egen oppdatering etter opprettelsen');
  assert.ok(fn.indexOf('fetchCompanyCpv') < fn.indexOf('createGroup('), 'Doffin hentes før selskapet lages');

  const groups = readFileSync(new URL('../utils/groups.js', import.meta.url), 'utf8');
  const create = groups.slice(groups.indexOf('export async function createGroup'), groups.indexOf('export async function updateGroup'));
  // Ekstra felt kommer først, så eierskap, medlemmer og type ikke kan overstyres.
  assert.match(create, /\.\.\.\(fields && typeof fields === 'object' \? fields : \{\}\),\s*\.\.\.records\.family,/);
});
