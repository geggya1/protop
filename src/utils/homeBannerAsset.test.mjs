import assert from 'node:assert/strict';
import {
  resolvePersistedBannerUri,
  preparePersistedBannerUri,
  bannerDownscaleSize,
  MAX_BANNER_DATA_URI_CHARS,
  MAX_BANNER_EDGE,
  BANNER_ENCODE_QUALITY,
} from './homeBannerAsset.js';

assert.equal(MAX_BANNER_EDGE, 2200);
assert.equal(BANNER_ENCODE_QUALITY, 0.7);

{
  const iphone = bannerDownscaleSize(1320, 2868);
  assert.equal(iphone.width, 1013);
  assert.equal(iphone.height, 2200);
  assert.ok(iphone.scale < 1);
}
{
  const camera = bannerDownscaleSize(4032, 3024);
  assert.equal(camera.width, 2200);
  assert.equal(camera.height, 1650);
  assert.ok(Math.abs(camera.scale - 2200 / 4032) < 1e-12);
}
{
  const alreadySmall = bannerDownscaleSize(941, 1672);
  assert.equal(alreadySmall.scale, 1);
  assert.equal(alreadySmall.width, 941);
  assert.equal(alreadySmall.height, 1672);
}
{
  const atCap = bannerDownscaleSize(2200, 1200);
  assert.equal(atCap.scale, 1);
  assert.equal(atCap.width, 2200);
  assert.equal(atCap.height, 1200);
}

assert.equal(
  resolvePersistedBannerUri({ uri: 'file://x.jpg', base64: 'abcd', mimeType: 'image/jpeg' }),
  'data:image/jpeg;base64,abcd',
);

assert.equal(
  resolvePersistedBannerUri({ uri: 'ph://asset', base64: null }),
  'ph://asset',
);

const huge = 'a'.repeat(MAX_BANNER_DATA_URI_CHARS);
assert.equal(
  resolvePersistedBannerUri({ uri: 'file://keep', base64: huge, mimeType: 'image/jpeg' }),
  'file://keep',
);

assert.equal(resolvePersistedBannerUri({}), null);

const prepared = await preparePersistedBannerUri({
  uri: 'file://x.jpg',
  base64: 'abcd',
  mimeType: 'image/jpeg',
  width: 4032,
  height: 3024,
});
assert.equal(prepared, 'data:image/jpeg;base64,abcd');

const preparedHuge = await preparePersistedBannerUri({
  uri: 'ph://asset',
  base64: huge,
  mimeType: 'image/jpeg',
});
assert.equal(preparedHuge, 'ph://asset');

console.log('homeBannerAsset.test.mjs: ok');
