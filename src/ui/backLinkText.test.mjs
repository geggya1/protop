import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { backLinkA11y, backLinkText } from './backLinkText.js';
import { SHELL_DETAILS } from '../navigation/shellPaths.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('tilbakelenke (UX-20): alltid «‹ {Listenavn}»', () => {
  assert.equal(backLinkText('Prosjekter'), '‹ Prosjekter');
  assert.equal(backLinkText('  Fakturaer '), '‹ Fakturaer');
  assert.equal(backLinkText(''), '‹ Tilbake');
  assert.equal(backLinkA11y('Ansatte'), 'Tilbake til Ansatte');
  assert.deepEqual(Object.values(SHELL_DETAILS).map((d) => backLinkText(d.list)),
    ['‹ Prosjekter', '‹ Fakturaer', '‹ Ansatte', '‹ Avvik og forbedring']);
});

test('tilbakelenke: én komponent med lenkerolle og 44 px trykkflate', () => {
  const src = read('src/ui/BackLink.jsx');
  assert.match(src, /accessibilityRole="link"/);
  assert.match(src, /minHeight: touch\.min/);
  assert.match(src, /export function DetailMissing/);
  assert.match(read('src/ui/primitives.jsx'), /<BackLink label=\{back\.label\}/, 'Page({ back }) bruker BackLink');
});

test('detaljsidene har adresse og BackLink', () => {
  const views = [
    ['screens/project/ProjectWorkScreen.jsx', 'project'],
    ['screens/economy/EconomyInvoices.jsx', 'invoice'],
    ['screens/employees/EmployeesScreen.jsx', 'employee'],
    ['screens/iso/IsoFindings.jsx', 'finding'],
  ];
  for (const [file, kind] of views) {
    const src = read(file);
    assert.match(src, new RegExp(`useShellDetail\\('${kind}'`), `${file}: adresse`);
    assert.match(src, /<DetailMissing /, `${file}: melding når lenken ikke kan åpnes`);
  }
  for (const file of ['components/project/ProjectDetail.jsx', 'screens/economy/invoice/InvoicePage.jsx', 'screens/employees/EmployeePersonChrome.jsx']) {
    const src = read(file);
    assert.match(src, /<BackLink /, `${file}: BackLink`);
    assert.doesNotMatch(src, /Tilbake til listen/, `${file}: ingen egen tilbaketekst`);
  }
  assert.match(read('screens/iso/IsoFindings.jsx'), /back=\{\{ label: 'Avvik og forbedring'/);
});
