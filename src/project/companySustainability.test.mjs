import assert from 'node:assert/strict';
import { hasIsoSustainability, isoSustainability, markdownExcerpt } from './companySustainability.js';

const policyDoc = (over = {}) => ({
  id: 'dok_1',
  title: 'Policy for kvalitet, miljø og arbeidsmiljø',
  docType: 'policy',
  accessClass: 'intern',
  publishedRevision: 2,
  revisions: [
    { revision: 1, state: 'erstattet', content: 'Gammel', publishedAt: '2025-01-01' },
    { revision: 2, state: 'publisert', content: '## Miljø\n\nVi reduserer utslipp.', publishedAt: '2026-03-01' },
    { revision: 3, state: 'utkast', content: 'Utkast som ikke skal vises' },
  ],
  ...over,
});

const iso = isoSustainability({
  system: { standards: ['ISO9001', 'ISO14001'], setupAt: '2026-01-01', editions: {} },
  documents: [
    policyDoc(),
    policyDoc({ id: 'dok_2', accessClass: 'skjermet', revisions: [{ revision: 2, state: 'publisert', content: 'Skjermet', publishedAt: '2026-09-01' }] }),
    policyDoc({ id: 'dok_3', publishedRevision: 0 }),
    policyDoc({ id: 'dok_4', archived: true }),
  ],
  records: [
    { id: 'c1', register: 'sertifikat', state: 'gyldig', title: 'ISO 14001:2015', certBody: 'DNV', validTo: '2027-05-01' },
    { id: 'c2', register: 'sertifikat', state: 'utlopt', title: 'ISO 9001:2015', certBody: 'DNV' },
    { id: 'c3', register: 'sertifikat', state: 'planlagt', title: 'ISO 45001' },
    {
      id: 'g1', register: 'mal', state: 'aktiv', domain: 'Miljø', title: 'Mindre avfall til deponi',
      unit: 'tonn', direction: 'Redusere', baseline: 100, target: 60, deadline: '2026-12-31',
      measurements: [{ period: '2026-06', value: 80 }],
    },
    { id: 'g2', register: 'mal', state: 'aktiv', domain: 'Kvalitet', title: 'Færre reklamasjoner', target: 2 },
    { id: 'g3', register: 'mal', state: 'arkivert', domain: 'Miljø', title: 'Gammelt mål', target: 1 },
    { id: 'g4', register: 'mal', state: 'nådd', domain: 'Miljø', title: 'Elbil i flåten', unit: '%', target: 50 },
  ],
});

assert.deepEqual(iso.certificates.map((row) => row.id), ['c1']);
assert.equal(iso.certificates[0].body, 'DNV');
assert.equal(iso.standards.length, 2);
// Bare publisert revisjon av en policy som ikke er skjermet eller arkivert.
assert.equal(iso.policy.id, 'dok_1');
assert.equal(iso.policy.content, '## Miljø\n\nVi reduserer utslipp.');
assert.equal(iso.policy.revision, 2);
// Miljømål: aktive og nådde med område Miljø.
assert.deepEqual(iso.goals.map((row) => row.id), ['g1', 'g4']);
assert.equal(iso.goals[0].target, 'Ned til 60 tonn');
assert.equal(iso.goals[0].pct, 50);
assert.equal(iso.goals[0].reached, false);
assert.equal(iso.goals[1].reached, true);
assert.equal(hasIsoSustainability(iso), true);

// Gruppert form (ISO-tilstanden som allerede er lastet i økten) gir det samme.
const grouped = isoSustainability({
  system: {},
  documents: [],
  records: { sertifikat: [{ id: 'c1', state: 'gyldig', title: 'Miljøfyrtårn' }], mal: [] },
});
assert.equal(grouped.certificates[0].title, 'Miljøfyrtårn');
assert.deepEqual(grouped.standards, [], 'uten fullført oppsett nevnes ikke standardene');

const empty = isoSustainability(null);
assert.equal(hasIsoSustainability(empty), false);
assert.equal(hasIsoSustainability(null), false);

const long = Array.from({ length: 12 }, (_, i) => `Avsnitt ${i + 1} ${'tekst '.repeat(30)}`).join('\n\n');
const cut = markdownExcerpt(long, 900);
assert.equal(cut.clipped, true);
assert.ok(cut.text.length <= 900 * 1.6);
assert.ok(cut.text.startsWith('Avsnitt 1'));
assert.deepEqual(markdownExcerpt('Kort.'), { text: 'Kort.', clipped: false });

console.log('companySustainability.test.mjs ok');
