/**
 * Lager to utgaver av hvert bilde som lastes opp til Storage (profilbilder, bedriftslogo,
 * ansattbilder, chatbilder, prosjektbilder):
 *   <sti>.m.webp  mobilutgave, høyst 1080 px på lengste side
 *   <sti>.t.webp  liten utgave til profilbilder/ringer og lister, høyst 256 px
 *
 * Utgavene får samme nedlastingstoken som originalen, så appen finner dem ved å bytte navn i
 * originaladressen (src/utils/imageVariants.js). Originalen (fullt format) røres ikke.
 * sharp lastes først når et bilde behandles, så funksjonen ikke gjør andre funksjoner tregere.
 */
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { STORAGE_BUCKET } from './storageBucket.js';

if (!getApps().length) initializeApp();

export const VARIANTS = [
  { suffix: '.m.webp', max: 1080, quality: 80 },
  { suffix: '.t.webp', max: 256, quality: 78 },
];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
// Mappene med bilder som vises i appen. Dokumenter (PDF-er, skannede bilag) får ikke utgaver.
const IMAGE_ROOTS = /^(users|groups|families|companies|chats|projects)\//;
const SKIP = /(\.(t|m)\.webp$)|\/documents?\/|\/attachments?\//i;

/** Ja hvis objektet er et bilde som skal ha utgaver. */
export function wantsVariants({ name = '', contentType = '', size = 0 } = {}) {
  if (!name || SKIP.test(name) || !IMAGE_ROOTS.test(name)) return false;
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(String(contentType))) return false;
  return Number(size) > 0 && Number(size) <= MAX_SOURCE_BYTES;
}

export const imageVariants = onObjectFinalized(
  {
    bucket: STORAGE_BUCKET,
    // Storage-triggeren må ligge i samme region som bøtta (protop-c189c.firebasestorage.app er i
    // us-west1). europe-west1 ga «cannot listen to a bucket in region us-west1» ved deploy.
    region: process.env.STORAGE_TRIGGER_REGION || 'us-west1',
    memory: '1GiB',
    cpu: 1,
    timeoutSeconds: 120,
    maxInstances: 10,
  },
  async (event) => {
    const obj = event.data || {};
    if (!wantsVariants(obj)) return;
    const token = obj.metadata?.firebaseStorageDownloadTokens || '';
    const bucket = getStorage().bucket(obj.bucket);
    const [source] = await bucket.file(obj.name).download();
    const { default: sharp } = await import('sharp');
    for (const v of VARIANTS) {
      try {
        const out = await sharp(source, { failOn: 'none' })
          .rotate()
          .resize({ width: v.max, height: v.max, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: v.quality })
          .toBuffer();
        await bucket.file(`${obj.name}${v.suffix}`).save(out, {
          resumable: false,
          contentType: 'image/webp',
          metadata: {
            cacheControl: 'public, max-age=31536000',
            metadata: {
              variantOf: obj.name,
              ...(token ? { firebaseStorageDownloadTokens: token } : {}),
            },
          },
        });
      } catch (err) {
        logger.warn('imageVariants: kunne ikke lage utgave', { name: obj.name, suffix: v.suffix, message: err?.message });
      }
    }
  },
);
