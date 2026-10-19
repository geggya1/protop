import assert from 'node:assert/strict';
import {
  companyLogoOf,
  fitLogoBox,
  jpegSize,
  logoForDocument,
  isUnderenhetCompanyProfile,
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
assert.equal(mergeCompanyProfile({ navn: 'Uten' }, {}).subUnits, undefined);

const hovedenhet = {
  navn: 'CONSULT1 AS',
  organisasjonsnummer: '916538804',
  organisasjonsform: 'Aksjeselskap',
  organisasjonsformKode: 'AS',
  kind: 'enhet',
  subUnits: [{ id: 'u1', kind: 'underenhet', name: 'Sandnes', organisasjonsnummer: '916570783' }],
  aliasOrganisasjonsnummer: ['916570783'],
};
const underenhetHit = {
  navn: 'CONSULT1 AS',
  organisasjonsnummer: '916570783',
  organisasjonsform: 'Underenhet til næringsdrivende og offentlig forvaltning',
  organisasjonsformKode: 'BEDR',
  kind: 'underenhet',
  addressLabel: 'Svanholmen 7',
};
assert.equal(isUnderenhetCompanyProfile(underenhetHit), true);
assert.equal(isUnderenhetCompanyProfile(hovedenhet), false);
const kept = mergeCompanyProfile(underenhetHit, hovedenhet);
assert.equal(kept.organisasjonsnummer, '916538804');
assert.equal(kept.organisasjonsform, 'Aksjeselskap');
assert.equal(kept.organisasjonsformKode, 'AS');
assert.equal(kept.subUnits.length, 1);
assert.equal(kept.subUnits[0].organisasjonsnummer, '916570783');
assert.deepEqual(kept.aliasOrganisasjonsnummer, ['916570783']);
const refreshed = mergeCompanyProfile(
  { ...hovedenhet, telefon: '11223344', addressLabel: 'Ny gate 1' },
  hovedenhet,
);
assert.equal(refreshed.organisasjonsnummer, '916538804');
assert.equal(refreshed.telefon, '11223344');
assert.equal(refreshed.subUnits.length, 1);
const withTravel = mergeCompanyProfile(
  { navn: 'CONSULT1 AS', organisasjonsnummer: '916538804', addressLabel: '2 Etasje Svanholmen 7, 4313 SANDNES' },
  {
    ...hovedenhet,
    kjoeradresse: { gate: 'Svanholmen 7', postnummer: '4313', poststed: 'Sandnes' },
    addressLabel: 'Svanholmen 7, 4313 Sandnes',
  },
);
assert.equal(withTravel.kjoeradresse.gate, 'Svanholmen 7');
assert.equal(withTravel.addressLabel, 'Svanholmen 7, 4313 Sandnes');

const shown = presentCompanyLogo({ dataUrl: TINY });
assert.equal(shown.width, 12);
assert.equal(shown.height, 6);
assert.equal(presentCompanyLogo({ dataUrl: 'data:image/jpeg;base64,aaaa' }), null);

const box = fitLogoBox(300, 100, 150, 40);
assert.ok(box.width <= 150);
assert.ok(box.height <= 40);

console.log('companyLogo.test.mjs ok');
