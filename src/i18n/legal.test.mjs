import assert from 'node:assert/strict';
import { DPA_VERSION, LANG_IDS, LEGAL_VERSION } from './langs.js';
import {
  LEGAL_ENTITY, entityLine, getDpa, getPrivacy, getTerms, isLegalHeading, legalDocument,
} from './legal.js';

// Ny tekst for bedrifter: brukerne må godta på nytt.
assert.notEqual(LEGAL_VERSION, '2.0.0');
assert.ok(DPA_VERSION);

// Familieappen er borte fra dokumentene på alle språk.
const FAMILY = /familieapp|familjeapp|famili(e|en)gruppe|foresatt|family (and household|planner|account)|familieplanl|perhesovell|planer rodzinny|planificador familiar|planificateur familial|Familienplaner|guardian/i;
for (const lang of LANG_IDS) {
  for (const text of [...getTerms(lang), ...getPrivacy(lang), ...getDpa(lang)]) {
    assert.doesNotMatch(text, FAMILY, `${lang}: ${text.slice(0, 80)}`);
  }
  assert.equal(legalDocument(lang).length, 2);
}

// Personvernerklæringen har det GDPR art. 13 krever, og nevner underleverandørene.
const privacy = getPrivacy('nb').join('\n');
for (const needle of [
  'behandlingsansvarlig', 'databehandler', 'support@protop.no', 'Datatilsynet', 'europe-west1',
  'Google Gemini', 'Brevo', 'Resend', 'SendGrid', 'Microsoft', 'PowerOffice', 'Peppol',
  'personnummer', 'Sykefravær', '90 dager', 'Google Fonts', 'unpkg', 'OpenStreetMap', 'EØS',
  'laste ned', 'sporings',
]) {
  assert.ok(privacy.toLowerCase().includes(needle.toLowerCase()), `personvern mangler «${needle}»`);
}
// Mottakere som var i bruk uten å stå i erklæringen (GRUNN-02), med formål og grunnlag.
for (const needle of [
  'Expo', 'push-adresse', 'Kartverket', 'Photon', 'OSRM', 'koordinatene for start og mål', 'Google Routes',
  'Talegjenkjenning', 'lyden', 'Open-Meteo', 'Meteorologisk institutt', 'tilstrekkelig beskyttelsesnivå',
]) {
  assert.ok(privacy.includes(needle), `personvern mangler «${needle}»`);
}
assert.doesNotMatch(privacy, /BigDataCloud/i, 'BigDataCloud er fjernet fra koden');
const privacyEnText = getPrivacy('en').join('\n');
for (const needle of ['Expo', 'OSRM', 'Speech recognition', 'Open-Meteo', 'Photon']) {
  assert.ok(privacyEnText.includes(needle), `privacy (en) mangler «${needle}»`);
}
// Databehandleravtalen har den samme listen.
assert.ok(getDpa('nb').join('\n').includes('Expo (650 Industries'));
assert.ok(getPrivacy('en').join('\n').includes('processor'));
assert.ok(getDpa('nb').join('\n').includes('artikkel 28'));
assert.ok(getDpa('nb')[1].includes(DPA_VERSION));
assert.ok(getTerms('nb')[1].includes(LEGAL_VERSION));

// Vilkårene lover ny aksept ved endring, slik koden gjør (ikke «fortsatt bruk = aksept»).
assert.doesNotMatch(getTerms('nb').join('\n'), /Fortsatt bruk/);

// Juridisk navn, org.nr. og adresse vises bare når de er fylt ut.
assert.equal(entityLine({ name: '', orgnr: '', address: '' }), 'ProTop');
assert.equal(
  entityLine({ name: 'ProTop AS', orgnr: '123456789', address: 'Gate 1, 4313 Sandnes' }),
  'ProTop AS, org.nr. 123 456 789, Gate 1, 4313 Sandnes',
);
assert.equal(entityLine({ name: 'ProTop AS', orgnr: '12' }, 'en'), 'ProTop AS');
if (!LEGAL_ENTITY.orgnr) assert.doesNotMatch(privacy, /org\.nr\./);
const filled = getPrivacy('nb', { ...LEGAL_ENTITY, name: 'ProTop AS', orgnr: '987654321' }).join('\n');
assert.match(filled, /ProTop AS, org\.nr\. 987 654 321/);

assert.equal(isLegalHeading('3. Opplysninger vi behandler', 5), true);
assert.equal(isLegalHeading('• Konto og profil: navn', 6), false);

// Abonnementsvilkår mangler: tydelig plassholder for jurist under «Pris og betaling» (L-33).
const terms = getTerms('nb');
const price = terms.indexOf('6. Pris og betaling');
assert.ok(price > 0);
assert.match(terms.slice(price, price + 4).join('\n'), /\[TIL JURIST – abonnementsvilkår/);
for (const needle of ['merverdiavgift', 'prøveperiode', 'bindingstid', 'sies opp', 'angrerett']) {
  assert.ok(terms.join('\n').includes(needle), `vilkårene nevner ikke «${needle}»`);
}
assert.match(getTerms('en').join('\n'), /\[FOR LEGAL REVIEW – subscription terms/);
assert.equal(isLegalHeading(terms[price + 2], price + 2), false);

console.log('legal.test.mjs: ok');
