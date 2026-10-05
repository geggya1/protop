import assert from 'node:assert/strict';
import {
  companyLogoOf,
  fitLogoBox,
  jpegSize,
  logoForDocument,
  mergeCompanyProfile,
  normalizeCompanyLogo,
  presentCompanyLogo,
} from './companyLogo.js';

const TINY = 'data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAGAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIEAbEv/2Q==';

assert.equal(normalizeCompanyLogo(null), null);
assert.equal(normalizeCompanyLogo({ dataUrl: 'https://example.com/logo.png' }), null);
assert.equal(normalizeCompanyLogo({ dataUrl: 'data:image/png;base64,aaaa' }), null);
assert.equal(normalizeCompanyLogo({ dataUrl: `${TINY}not-base64` }), null);

const logo = normalizeCompanyLogo({ dataUrl: TINY, width: 12, height: 6, updatedAt: '2026-10-05T00:00:00.000Z' });
assert.equal(logo.width, 12);
assert.equal(logo.height, 6);
assert.equal(companyLogoOf({ logo }).dataUrl, TINY);
assert.equal(companyLogoOf({}), null);

const file = logoForDocument({ dataUrl: TINY });
assert.equal(file.width, 12);
assert.equal(file.height, 6);
assert.equal(jpegSize(file.bytes).width, 12);
assert.ok(file.bytes[0] === 0xff && file.bytes[1] === 0xd8);

const merged = mergeCompanyProfile(
  { navn: 'Ny AS', organisasjonsnummer: '999999999', telefon: '', epostadresse: 'ny@bedrift.no' },
  {
    telefon: '22334455',
    epostadresse: 'gammel@bedrift.no',
    egneNaeringskoder: ['elektro'],
    subUnits: [{ id: 'd1', kind: 'avdeling', name: 'Drift' }],
    logo,
  },
);
assert.equal(merged.telefon, '22334455');
assert.equal(merged.epostadresse, 'ny@bedrift.no');
assert.deepEqual(merged.egneNaeringskoder, ['elektro']);
assert.equal(merged.subUnits[0].name, 'Drift');
assert.equal(merged.logo.dataUrl, TINY);
assert.equal(mergeCompanyProfile({ navn: 'Uten' }, {}).logo, undefined);

const shown = presentCompanyLogo({ dataUrl: TINY });
assert.equal(shown.width, 12);
assert.equal(shown.height, 6);
assert.equal(presentCompanyLogo({ dataUrl: 'data:image/jpeg;base64,aaaa' }), null);

const box = fitLogoBox(300, 100, 150, 40);
assert.ok(box.width <= 150);
assert.ok(box.height <= 40);

console.log('companyLogo.test.mjs ok');
