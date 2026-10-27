/**
 * Finn og fjern data som er kopiert fra ett selskap til et annet.
 *
 * Før fiksen leste et selskap uten egen nettleserkopi den felles kopien fra forrige
 * selskap (prosjekter, kunder, anbudsvarsling, vurderinger, tilbud, avtaler) og lastet
 * den opp som sin egen. Kopiene har samme id som originalen.
 *
 * Bruk:
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/audit-cross-company-data.mjs
 *     Viser rader med samme id i flere selskaper. Endrer ingenting.
 *   ... --owner <familyId>
 *     Viser hva som fjernes fra de andre selskapene når <familyId> eier radene.
 *   ... --owner <familyId> --apply
 *     Fjerner kopiene. Hvert dokument skrives først til scripts/backup-cross-company-<tid>/.
 *
 * Krever firebase-admin (functions/node_modules) og tilgang til protop-c189c.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const ownerIdx = args.indexOf('--owner');
const ownerId = ownerIdx >= 0 ? String(args[ownerIdx + 1] || '').trim() : '';
const apply = args.includes('--apply');
if (apply && !ownerId) {
  console.error('--apply krever --owner <familyId>.');
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

/** Lister i hvert dokument som kan ha fått kopier. */
const SOURCES = [
  {
    doc: ['projects', 'state'],
    wrap: 'state',
    lists: ['projects', 'activities', 'expenses', 'mileageTrips', 'equipment', 'products', 'sales',
      'board', 'sja', 'incidents', 'inspections', 'deviations', 'checklists', 'documents', 'meetings',
      'changes', 'contracts', 'entries', 'crew', 'waste', 'audits'],
    tombstones: { projects: 'deletedProjects' },
  },
  {
    // Produktkatalogen har eget dokument (src/project/storage.js, CATALOG_DOC_KEYS).
    doc: ['projects', 'catalog'],
    wrap: '',
    lists: ['products'],
    tombstones: { products: 'deletedProducts' },
  },
  {
    doc: ['anbud', 'state'],
    wrap: 'state',
    lists: ['customers', 'notices', 'bids', 'contracts', 'agreementCases', 'profiles', 'library'],
    tombstones: { contracts: 'deletedContracts' },
    watch: true,
  },
  {
    doc: ['anbud', 'customers'],
    wrap: '',
    lists: ['customers'],
  },
];

function bodyOf(data, wrap) {
  if (!data) return {};
  return wrap ? (data[wrap] || {}) : data;
}

function idsOf(list) {
  return new Set((Array.isArray(list) ? list : []).map((row) => String(row?.id || '').trim()).filter(Boolean));
}

function watchPrint(watch) {
  if (!watch) return '';
  const emails = [...(watch.emails || [])].map((v) => String(v).toLowerCase()).sort();
  const cpv = [...(watch.cpvCodes || [])].map(String).sort();
  const words = [...(watch.keywords || [])].map((v) => String(v).toLowerCase()).sort();
  if (!emails.length && !cpv.length && !words.length) return '';
  return JSON.stringify({ emails, cpv, words });
}

function familyLabel(family) {
  const data = family.data() || {};
  const name = data.company?.navn || data.name || '';
  const orgnr = data.company?.organisasjonsnummer || data.orgnr || '';
  return `${name}${orgnr ? ` · ${orgnr}` : ''} (${family.id})`;
}

const families = (await db.collection('families').get()).docs
  .filter((family) => {
    const data = family.data() || {};
    return data.isPersonal !== true && ['organization', 'company'].includes(String(data.type || ''));
  });
console.log(`Selskaper: ${families.length}`);
if (ownerId && !families.some((family) => family.id === ownerId)) {
  console.error(`Fant ikke selskapet ${ownerId}.`);
  process.exit(1);
}

/** snapshots[sourceIndex][familyId] = { ref, data } */
const snapshots = SOURCES.map(() => new Map());
for (const family of families) {
  for (const [index, source] of SOURCES.entries()) {
    const ref = family.ref.collection(source.doc[0]).doc(source.doc[1]);
    const snap = await ref.get();
    if (snap.exists) snapshots[index].set(family.id, { ref, data: snap.data() });
  }
}
const labels = new Map(families.map((family) => [family.id, familyLabel(family)]));

// 1) Oversikt: samme id i flere selskaper.
let shared = 0;
for (const [index, source] of SOURCES.entries()) {
  for (const list of source.lists) {
    const owners = new Map();
    for (const [familyId, { data }] of snapshots[index]) {
      for (const id of idsOf(bodyOf(data, source.wrap)[list])) {
        if (!owners.has(id)) owners.set(id, []);
        owners.get(id).push(familyId);
      }
    }
    for (const [id, ids] of owners) {
      if (ids.length < 2) continue;
      shared += 1;
      console.log(`[${source.doc.join('/')}.${list}] ${id}: ${ids.map((f) => labels.get(f)).join(' | ')}`);
    }
  }
  if (source.watch) {
    const prints = new Map();
    for (const [familyId, { data }] of snapshots[index]) {
      const print = watchPrint(bodyOf(data, source.wrap).watch);
      if (!print) continue;
      if (!prints.has(print)) prints.set(print, []);
      prints.get(print).push(familyId);
    }
    for (const ids of prints.values()) {
      if (ids.length < 2) continue;
      shared += 1;
      console.log(`[anbudsvarsling] lik varsling: ${ids.map((f) => labels.get(f)).join(' | ')}`);
    }
  }
}
console.log(`Delte rader/innstillinger: ${shared}`);
if (!ownerId) process.exit(0);

// 2) Fjern kopier fra alle andre selskaper enn eieren.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(root, 'scripts', `backup-cross-company-${stamp}`);
if (apply) mkdirSync(backupDir, { recursive: true });
const now = new Date().toISOString();
let changedDocs = 0;

for (const [index, source] of SOURCES.entries()) {
  const owner = snapshots[index].get(ownerId);
  if (!owner) continue;
  const ownerBody = bodyOf(owner.data, source.wrap);
  for (const [familyId, { ref, data }] of snapshots[index]) {
    if (familyId === ownerId) continue;
    const body = { ...bodyOf(data, source.wrap) };
    const notes = [];
    for (const list of source.lists) {
      const ownerIds = idsOf(ownerBody[list]);
      const rows = Array.isArray(body[list]) ? body[list] : [];
      const kept = rows.filter((row) => !ownerIds.has(String(row?.id || '').trim()));
      if (kept.length === rows.length) continue;
      const removed = rows.filter((row) => !kept.includes(row));
      body[list] = kept;
      notes.push(`${list}: -${removed.length}`);
      const tombKey = source.tombstones?.[list];
      if (tombKey) {
        const tombs = Array.isArray(body[tombKey]) ? body[tombKey] : [];
        const known = idsOf(tombs);
        body[tombKey] = [
          ...tombs,
          ...removed
            .filter((row) => !known.has(String(row.id)))
            .map((row) => ({ id: String(row.id), number: String(row.number || ''), deletedAt: now })),
        ];
      }
    }
    if (source.watch) {
      const print = watchPrint(body.watch);
      if (print && print === watchPrint(ownerBody.watch)) {
        body.watch = {
          companyName: '', cpvCodes: [], keywords: [], areas: [], departmentAreas: [],
          nationwide: false, savedAt: null, orgnr: '', cpvSource: '', emails: [],
        };
        notes.push('anbudsvarsling nullstilt');
      }
    }
    if (!notes.length) continue;
    changedDocs += 1;
    console.log(`${apply ? 'Rydder' : 'Ville ryddet'} ${labels.get(familyId)} ${source.doc.join('/')}: ${notes.join(', ')}`);
    if (!apply) continue;
    writeFileSync(join(backupDir, `${familyId}__${source.doc.join('_')}.json`), JSON.stringify(data, null, 2));
    const next = source.wrap ? { ...data, [source.wrap]: body } : body;
    if (source.watch && notes.includes('anbudsvarsling nullstilt')) next.digestEnabled = false;
    next.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(next);
  }
}
console.log(apply
  ? `Ferdig. ${changedDocs} dokumenter ryddet. Sikkerhetskopi: ${backupDir}`
  : `Tørrkjøring. ${changedDocs} dokumenter ville blitt ryddet. Legg til --apply for å skrive.`);
