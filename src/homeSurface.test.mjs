import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_PHOTO_BANNER_ID,
  PLAIN_BANNER_ID,
  hasHomePhoto,
  resolveParentBannerId,
} from './homeSurface.js';
import { isImmersivePhotoShell } from './navigation/immersivePhotoShell.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('uten bilde er standard, og da er Hjem ikke fotoflaten', () => {
  assert.equal(hasHomePhoto(PLAIN_BANNER_ID), false);
  assert.equal(hasHomePhoto(''), false);
  assert.equal(hasHomePhoto(DEFAULT_PHOTO_BANNER_ID), true);
  assert.equal(hasHomePhoto('custom'), true);
  const phone = { isPhone: true, isParent: true, tab: 'home' };
  assert.equal(isImmersivePhotoShell({ ...phone, photo: hasHomePhoto(PLAIN_BANNER_ID) }), false);
  assert.equal(isImmersivePhotoShell({ ...phone, photo: hasHomePhoto('natur-fjelltopp') }), true);

  const banners = read('./homeBanners.js');
  assert.match(banners, /export const DEFAULT_HOME_BANNER_ID = PLAIN_BANNER_ID;/);
  assert.match(banners, /\{ id: 'ingen', label: 'Uten bilde'/);
  assert.match(banners, /id === PLAIN_BANNER_ID\) return null;/);
});

test('det gamle standardbildet uten eget valg blir ProTop-flaten; valgte bilder står', () => {
  assert.equal(resolveParentBannerId(DEFAULT_PHOTO_BANNER_ID), PLAIN_BANNER_ID);
  assert.equal(resolveParentBannerId(DEFAULT_PHOTO_BANNER_ID, { bannerChosen: true }), DEFAULT_PHOTO_BANNER_ID);
  assert.equal(resolveParentBannerId('natur-fjelltopp'), 'natur-fjelltopp');
  assert.equal(resolveParentBannerId('custom'), 'custom');
  assert.equal(resolveParentBannerId(PLAIN_BANNER_ID), PLAIN_BANNER_ID);

  const store = read('./utils/homeLayoutStore.js');
  assert.match(store, /if \(role === 'parent'\) bannerId = resolveParentBannerId\(bannerId, \{ bannerChosen \}\);/);
  assert.match(store, /bannerChosen,\n\s+customBannerUri/);
  // Valg under Tilpass hjem lagres som eget valg.
  assert.match(read('./hooks/useHomeLayout.js'), /persist\(\{ bannerId, customBannerUri, bannerChosen: true \}\)/);
});

test('skallet slår av fotoflaten uten bilde, og Hjem viser samme topp som på PC', () => {
  const shell = read('../components/AppShell.jsx');
  assert.match(shell, /photo: hasHomePhoto\(backdropBannerId\),/);
  const banner = read('../components/home/HomeBanner.jsx');
  assert.match(banner, /if \(!customUri && !hasHomePhoto\(bannerId\)\) \{\n\s+return <PlainHomeHeader/);
  assert.match(banner, /plainHi: \{ \.\.\.type\.h1, color: colors\.ink \}/);
  const desk = read('../components/DeskHomeDashboard.jsx');
  assert.match(desk, /hello: \{ \.\.\.type\.h1, color: colors\.ink \}/);
  assert.equal(desk.includes('deskGreetingEmoji'), false, 'hilsenen er lik på PC og telefon');
  // Velgeren har «Uten bilde».
  assert.match(read('../components/home/HomeSetupForm.jsx'), /onSelectBanner\?\.\(PLAIN_BANNER_ID, null\)/);
});
