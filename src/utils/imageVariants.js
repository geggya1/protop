/**
 * Tre utgaver per opplastet bilde i Firebase Storage:
 *   original          fullt format (det brukeren lastet opp)
 *   <sti>.m.webp      mobilutgave, høyst 1080 px på lengste side
 *   <sti>.t.webp      liten utgave (profilbilde/ring, miniatyrer), høyst 256 px
 *
 * Utgavene lages av Cloud Function `imageVariants` (functions/imageVariants.js) når bildet er
 * lagret, med samme nedlastingstoken som originalen. Derfor kan appen regne ut adressen til en
 * utgave fra originaladressen, også for bilder som er lastet opp før. Finnes ikke utgaven (ennå),
 * viser StorageImage originalen.
 */

export const VARIANT_SUFFIX = { thumb: '.t.webp', mobile: '.m.webp' };
export const VARIANT_MAX_PX = { thumb: 256, mobile: 1080 };

const STORAGE_HOST = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)(\?.*)?$/;

/** Ja hvis adressen er et bilde i vår Storage som kan ha utgaver. */
export function hasVariants(url) {
  const m = String(url || '').match(STORAGE_HOST);
  if (!m) return false;
  let path = '';
  try { path = decodeURIComponent(m[1]); } catch { return false; }
  if (/\.(t|m)\.webp$/i.test(path)) return false;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(path) || !/\.[a-z0-9]{2,5}$/i.test(path);
}

/** Adressen til en utgave (thumb | mobile) av et Storage-bilde, eller originalen. */
export function imageVariantUrl(url, variant) {
  const suffix = VARIANT_SUFFIX[variant];
  if (!suffix || !hasVariants(url)) return url;
  const m = String(url).match(STORAGE_HOST);
  const path = decodeURIComponent(m[1]);
  const base = url.slice(0, url.indexOf('/o/') + 3);
  return `${base}${encodeURIComponent(`${path}${suffix}`)}${m[2] || ''}`;
}

/**
 * Velger utgave ut fra hvor stort bildet vises (punkter) og skjermtettheten:
 * små visninger (profilbilder, lister) får thumb, mellomstore mobile, store originalen.
 */
export function variantForSize(displayPx, pixelRatio = 2) {
  const px = Number(displayPx || 0) * Math.max(1, Number(pixelRatio) || 1);
  if (!px) return null;
  if (px <= VARIANT_MAX_PX.thumb) return 'thumb';
  if (px <= VARIANT_MAX_PX.mobile) return 'mobile';
  return null;
}
