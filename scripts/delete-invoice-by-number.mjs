/**
 * Slett én faktura i Firestore på tvers av families/*/invoices via collection group.
 *
 * Bruk:
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/delete-invoice-by-number.mjs 16714
 *
 * Krever firebase-admin (functions/node_modules) og tilgang til protop-c189c.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const invoiceNumber = String(process.argv[2] || '').trim();
if (!invoiceNumber) {
  console.error('Bruk: node scripts/delete-invoice-by-number.mjs <fakturanummer>');
  process.exit(1);
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

const db = admin.firestore();
const snap = await db.collectionGroup('invoices')
  .where('invoiceNumber', '==', invoiceNumber)
  .limit(10)
  .get();

if (snap.empty) {
  // Fallback: dokument-id inv_{nr}
  const families = await db.collection('families').limit(50).get();
  let deleted = 0;
  for (const family of families.docs) {
    const ref = family.ref.collection('invoices').doc(`inv_${invoiceNumber}`);
    const doc = await ref.get();
    if (!doc.exists) continue;
    console.log('Sletter', ref.path);
    await ref.delete();
    deleted += 1;
  }
  if (!deleted) {
    console.error(`Fant ingen faktura ${invoiceNumber}`);
    process.exit(2);
  }
  console.log(`Slettet ${deleted} dokument(er) for faktura ${invoiceNumber}`);
  process.exit(0);
}

for (const doc of snap.docs) {
  const data = doc.data() || {};
  console.log('Sletter', doc.ref.path, {
    customerName: data.customerName,
    status: data.status,
    exportStatus: data.exportStatus,
    sentAt: data.sentAt || null,
  });
  await doc.ref.delete();
}

console.log(`Slettet ${snap.size} dokument(er) for faktura ${invoiceNumber}`);
