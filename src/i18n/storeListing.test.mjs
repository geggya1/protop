import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANG_IDS } from './langs.js';

const store = JSON.parse(readFileSync(new URL('../../store.config.json', import.meta.url), 'utf8'));
const info = store.apple.info;
assert.ok(info['en-US'], 'English (US) listing');
assert.ok(info.no, 'Norwegian listing');

const requiredLocales = ['en', 'nb', 'da', 'sv', 'fi', 'pl', 'es', 'fr', 'de'];
for (const lang of requiredLocales) {
  assert.ok(LANG_IDS.includes(lang), `${lang} is an app language`);
  const file = JSON.parse(readFileSync(new URL(`../../locales/${lang}.json`, import.meta.url), 'utf8'));
  for (const key of [
    'NSPhotoLibraryUsageDescription',
    'NSCameraUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSFaceIDUsageDescription',
    'NSMicrophoneUsageDescription',
  ]) {
    assert.ok(file.ios[key] && file.ios[key].length > 12, `${lang} ${key}`);
  }
  assert.equal(file.ios.CFBundleDisplayName, 'ProTop');
  assert.equal(file.android.app_name, 'ProTop');
}

for (const [lang, listing] of Object.entries(info)) {
  assert.ok(listing.title.length >= 2 && listing.title.length <= 30, `${lang} title`);
  assert.ok(listing.subtitle.length <= 30, `${lang} subtitle ${listing.subtitle.length}`);
  assert.ok(listing.promoText.length <= 170, `${lang} promo`);
  assert.ok(listing.description.length >= 10 && listing.description.length <= 4000, `${lang} description`);
  assert.ok(listing.keywords.join(',').length <= 100, `${lang} keywords ${listing.keywords.join(',').length}`);
  assert.equal(listing.privacyPolicyUrl, 'https://www.protop.no/personvern');
  assert.equal(listing.supportUrl, 'https://www.protop.no/kontakt');
}

const play = JSON.parse(readFileSync(new URL('../../store/play-listing.json', import.meta.url), 'utf8'));
for (const listing of Object.values(play.listings)) {
  assert.ok(listing.shortDescription.length <= 80, listing.shortDescription);
  assert.ok(listing.fullDescription.length >= 10);
}
