/**
 * Sletter bedrifter som er avsluttet og der fristen på 90 dager er ute (GRUNN-03).
 * Samme logikk som callable-en purgeClosedCompanies (functions/companyClosureStore.js).
 * Se docs/drift/sletting-av-bedrift.md.
 *
 * Bruk:
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/purge-closed-companies.mjs
 *     Tørrkjøring: viser hvilke bedrifter som ville blitt slettet. Endrer ingenting.
 *   ... --company <id>
 *     Bare én bedrift.
 *   ... --confirm
 *     Sletter: dokumentet med alle underkolleksjoner, filene under families/{id}/ i begge
 *     bucketene og koblingene på toppnivå. companyClosures/{id} blir stående som bevis.
 *
 * Krever firebase-admin (functions/node_modules) og en konto med Firestore- og Storage-tilgang
 * til protop-c189c.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const companyAt = args.indexOf('--company');
const companyId = companyAt >= 0 ? String(args[companyAt + 1] || '') : '';
if (companyAt >= 0 && !companyId) {
  console.error('Mangler id etter --company.');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'protop-c189c',
  });
}
const { STORAGE_BUCKET_CANDIDATES } = await import('../functions/storageBucket.js');
const { runCompanyPurge } = await import('../functions/companyClosureStore.js');

const db = admin.firestore();
const buckets = [];
for (const name of STORAGE_BUCKET_CANDIDATES) {
  const bucket = admin.storage().bucket(name);
  const [exists] = await bucket.exists().catch(() => [false]);
  if (exists) buckets.push(bucket);
}
console.log(`Bucketer: ${buckets.map((bucket) => bucket.name).join(', ') || 'ingen'}`);

const res = await runCompanyPurge(db, buckets, { companyId, dryRun: !confirm, actorUid: 'script' });
if (!res.results.length) console.log('Ingen avsluttede bedrifter.');
for (const row of res.results) {
  const state = row.purge
    ? (res.dryRun ? 'ville blitt slettet' : (row.deleted ? `slettet (${row.files} filer, ${row.users} brukere)` : `ikke ferdig: ${row.errors.join('; ')}`))
    : `hoppes over (${row.reason})`;
  console.log(`${row.companyId}: frist ${row.deleteAfter || '–'}, ${state}`);
}
if (res.dryRun) console.log('Tørrkjøring. Kjør med --confirm for å slette.');
process.exit(res.results.some((row) => row.errors?.length) ? 1 : 0);
