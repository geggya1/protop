import assert from 'node:assert/strict';
import {
  PAGE_ACCESS,
  PROCESS_ACCESS,
  accessContacts,
  areaLabel,
  condenseStepLocks,
  evaluateHelpAccess,
  lockedText,
  processStepNeed,
  stepNeed,
} from './helpAccess.js';
import { PROTOP_PROCESSES } from './protopProcesses.js';
import { PROTOP_PAGES } from './protopPages.js';
import { COMPANY_TAB_IDS, RESOURCE_IDS, standardGrants } from '../access/companyAccess.js';

// Hver bedriftsside har tilgang beskrevet, ett trinn per steg.
for (const [key, page] of Object.entries(PROTOP_PAGES)) {
  // Bedriftssider = faner som styres av tilgangsstyringen.
  const company = COMPANY_TAB_IDS.includes(page.nav.tab) || ['arbeid', 'okonomi'].includes(page.nav.tab);
  const spec = PAGE_ACCESS[key];
  if (!company) {
    assert.equal(spec, undefined, `${key}: personlig side skal ikke ha bedriftstilgang`);
    continue;
  }
  assert.ok(spec, `${key}: mangler tilgang i PAGE_ACCESS`);
  assert.ok(RESOURCE_IDS.includes(spec.res), `${key}: ukjent område ${spec.res}`);
  assert.equal(spec.steps.length, page.steps.length, `${key}: ${spec.steps.length} trinn, men ${page.steps.length} steg`);
  page.steps.forEach((step, i) => {
    const need = stepNeed(key, i);
    if (need) {
      assert.ok(RESOURCE_IDS.includes(need.resource), `${key} steg ${i + 1}: ukjent område ${need.resource}`);
      assert.ok(['see', 'read', 'write'].includes(need.action), `${key} steg ${i + 1}: ukjent trinn`);
    }
    // Import av lister krever Admin på området.
    const importStep = /^Importer/.test(step.title.nb) || (step.find || []).some((f) => /^Importer (liste|fil|Excel|fakturaer|timer|produktsalg|fra fil|prosjektutlegg)/.test(f));
    if (importStep) assert.equal(need?.action, 'write', `${key} steg ${i + 1}: import skal kreve Admin`);
  });
}
for (const key of Object.keys(PAGE_ACCESS)) assert.ok(PROTOP_PAGES[key], `PAGE_ACCESS har ukjent side ${key}`);

// Arbeidsflyter: ett trinn per steg.
for (const [id, proc] of Object.entries(PROTOP_PROCESSES)) {
  assert.ok(PROCESS_ACCESS[id], `arbeidsflyt ${id} mangler tilgang`);
  assert.equal(PROCESS_ACCESS[id].length, proc.steps.length, `arbeidsflyt ${id}: feil antall trinn`);
}
assert.deepEqual(processStepNeed('anbud-til-faktura', 8), { resource: 'hoursOthers', action: 'read' });
assert.deepEqual(processStepNeed('kunde-prosjekt', 2), { resource: 'projects', action: 'write' });
assert.equal(processStepNeed('avvik', 2), null);

assert.equal(areaLabel('tenderSettings'), 'Anbud → Innstillinger');
assert.equal(areaLabel('hrAgreements'), 'HR → Avtaler');
assert.equal(areaLabel('customers'), 'Kunder');

const ansatt = standardGrants('ansatt');
const avdeling = standardGrants('avdelingsleder');
const leder = standardGrants('leder');

// Ansatt ser ikke kunderegisteret: hele siden er stengt.
const page = evaluateHelpAccess({ grants: ansatt, pageKey: 'kunder' });
assert.equal(page.ok, false);
assert.equal(page.page, true);
assert.deepEqual(page.need, { resource: 'customers', action: 'see' });

// Avdelingsleder kan registrere kunder, men ikke importere lister.
assert.equal(evaluateHelpAccess({ grants: avdeling, pageKey: 'kunder', stepIndex: 0 }).ok, true);
const imp = evaluateHelpAccess({ grants: avdeling, pageKey: 'kunder', stepIndex: 3 });
assert.equal(imp.ok, false);
assert.deepEqual(imp.need, { resource: 'customers', action: 'write' });
assert.equal(evaluateHelpAccess({ grants: leder, pageKey: 'kunder', stepIndex: 3 }).ok, true);

// Godkjenning av andres timer følger «Andres timer».
assert.equal(evaluateHelpAccess({ grants: ansatt, pageKey: 'arbeid.godkjenning', stepIndex: 2 }).ok, false);
assert.equal(evaluateHelpAccess({ grants: leder, pageKey: 'arbeid.godkjenning', stepIndex: 2 }).ok, true);

// Personlige sider og eier: alltid tilgang.
assert.equal(evaluateHelpAccess({ grants: ansatt, pageKey: 'plan', stepIndex: 0 }).ok, true);
assert.equal(evaluateHelpAccess({ grants: ansatt, bypass: true, pageKey: 'kunder', stepIndex: 3 }).ok, true);
assert.equal(evaluateHelpAccess({ grants: null, pageKey: 'kunder', stepIndex: 3 }).ok, true, 'uten bedrift ingen sperre');

// Kontaktpersoner: nærmeste nivå over først, ikke en selv, ikke deaktiverte.
const employee = (id, first, level, extra = {}) => ({
  id,
  personUid: `uid-${id}`,
  person: { firstName: first, lastName: 'Test' },
  company: { status: 'active', accessLevel: level, ...extra },
});
const employees = [
  employee('a', 'Anne', 'administrator'),
  employee('l', 'Lars', 'leder'),
  employee('d', 'Dina', 'avdelingsleder'),
  employee('s', 'Siv', 'ansatt'),
  employee('x', 'Xena', 'administrator', { status: 'inactive' }),
];
const need = { resource: 'customers', action: 'write' };
const contacts = accessContacts({ employees, need, selfEmployeeId: 's' });
assert.deepEqual(contacts.map((c) => c.name), ['Lars Test', 'Anne Test'], 'leder før administrator, avdelingsleder har ikke Admin');
assert.equal(contacts[0].level, 'Øverste leder');
assert.deepEqual(accessContacts({ employees, need: { resource: 'customers', action: 'read' } }).map((c) => c.name), ['Dina Test', 'Lars Test']);

// Eieren har full tilgang uten nivå, og nevnes etter administratorene.
const withOwner = [...employees, { ...employee('o', 'Ove', ''), personUid: 'uid-owner' }];
assert.deepEqual(
  accessContacts({ employees: withOwner, need, selfEmployeeId: 's', ownerUids: ['uid-owner'], limit: 3 }).map((c) => `${c.name} (${c.level})`),
  ['Lars Test (Øverste leder)', 'Anne Test (Administrator)', 'Ove Test (Eier)'],
);
assert.deepEqual(
  accessContacts({ employees: [employee('s', 'Siv', 'ansatt'), { ...employee('o', 'Ove', ''), personUid: 'uid-owner' }], need, ownerUids: ['uid-owner'], lang: 'en' }).map((c) => c.level),
  ['Owner'],
  'eier uten nivå er kontakt når ingen andre har tilgangen',
);

const text = lockedText({ need, level: 'Avdelingsleder', contacts, lang: 'nb' });
assert.match(text, /krever «Admin» på «Kunder»/);
assert.match(text, /Ditt nivå: Avdelingsleder/);
assert.match(text, /Lars Test \(Øverste leder\) eller Anne Test \(Administrator\)/);
assert.match(lockedText({ need, contacts: [], lang: 'nb' }), /en administrator i bedriften/);
assert.match(lockedText({ need: { resource: 'customers', action: 'see' }, page: true, pageLabel: 'Kunder', lang: 'en' }), /You don’t have access to Kunder/);

// Flere låste steg: kort lås per steg, hvem som kan hjelpe én gang.
const gateA = { ok: false, text: 'A. Spør X.', head: 'A.', who: 'Spør X.' };
const gateB = { ok: false, text: 'B. Spør X.', head: 'B.', who: 'Spør X.' };
assert.deepEqual(condenseStepLocks([{ ok: true }, gateA, gateB]), { locks: ['', 'A.', 'B.'], who: 'Spør X.' });
assert.deepEqual(condenseStepLocks([{ ok: true }, gateA]), { locks: ['', 'A. Spør X.'], who: '' }, 'ett låst steg: hele teksten');
assert.deepEqual(condenseStepLocks([{ ok: false, text: 'C' }, gateA]), { locks: ['C', 'A. Spør X.'], who: '' }, 'uten deler: hele teksten');
const readGate = { ok: false, need: { resource: 'projects', action: 'read' }, text: 'R. Spør Kari.', head: 'R.', who: 'Spør Kari.' };
const adminGate = { ok: false, need: { resource: 'projects', action: 'write' }, text: 'W. Spør Eier.', head: 'W.', who: 'Spør Eier.' };
assert.equal(condenseStepLocks([readGate, adminGate]).who, 'Spør Eier.', 'kontaktene for det strengeste kravet');

console.log('helpAccess.test.mjs: ok');
