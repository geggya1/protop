/**
 * Merk bedriftskalendere som har private hendelser (privateEvents: true), før firestore.rules deployes.
 *
 * Reglene skjermer hendelser for «bare utvalgte» bare i bedrifter som er merket. Appen merker selv
 * når den ser en privat hendelse (src/utils/calendarSeal.js), men en bedrift der ingen har åpnet
 * kalenderen i den nye versjonen, er ikke merket. Skriptet gjør det samme for alle bedrifter:
 * eldre hendelser uten audience får feltet (uten mottakere = hele gruppen), så merkes bedriften.
 * Se docs/utrulling-regler.md.
 *
 * Bruk:
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/seal-company-calendars.mjs
 *     Viser hvilke bedrifter som merkes og hvor mange eldre hendelser som får audience. Endrer ingenting.
 *   ... --apply
 *     Skriver endringene.
 *
 * Krever firebase-admin (functions/node_modules) og tilgang til protop-c189c.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFamilyAudience } from '../src/utils/events.js';

const apply = process.argv.slice(2).includes('--apply');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'protop-c189c',
  });
}
const db = admin.firestore();
const COMPANY_TYPES = ['company', 'organization'];

let sealed = 0;
let patched = 0;
const families = await db.collection('families').where('type', 'in', COMPANY_TYPES).get();
for (const family of families.docs) {
  if (family.data()?.privateEvents === true) continue;
  const events = await family.ref.collection('events').get();
  const rows = events.docs.map((item) => ({ id: item.id, ref: item.ref, ...item.data() }));
  if (!rows.some((row) => row.audience === 'selected')) continue;
  const legacy = rows.filter((row) => !row.audience);
  console.log(`${family.id} (${family.data()?.name || ''}): ${legacy.length} eldre hendelser får audience, bedriften merkes`);
  sealed += 1;
  patched += legacy.length;
  if (!apply) continue;
  for (let i = 0; i < legacy.length; i += 400) {
    const batch = db.batch();
    for (const row of legacy.slice(i, i + 400)) {
      batch.update(row.ref, { audience: isFamilyAudience(row) ? 'family' : 'selected' });
    }
    await batch.commit();
  }
  await family.ref.update({ privateEvents: true });
}
console.log(`${apply ? 'Merket' : 'Ville merket'} ${sealed} bedrifter, ${patched} eldre hendelser.${apply ? '' : ' Kjør med --apply for å skrive.'}`);
