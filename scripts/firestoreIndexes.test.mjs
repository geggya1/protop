/**
 * Emulatoren krever ingen indekser, men Firestore i skyen gjør det. Hver
 * collectionGroup-spørring på et felt trenger et feltunntak med gruppeindeks,
 * og spørringer som blander array-contains/ulikhet med andre felt trenger en
 * sammensatt indeks. Uten dem feiler spørringen bare i produksjon.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'firestore.indexes.json'), 'utf8'));

function sources(dir) {
  return readdirSync(join(root, dir), { recursive: true })
    .filter((rel) => /\.(js|jsx)$/.test(rel) && !/\.test\./.test(rel) && !rel.includes('node_modules'))
    .map((rel) => readFileSync(join(root, dir, rel), 'utf8'));
}

const code = [...sources('src'), ...sources('screens'), ...sources('components'), ...sources('functions')].join('\n');

// collectionGroup('x').where('felt', op) på server og query(collectionGroup(db, 'x'), where('felt', op)) i appen.
const groupQueries = new Set();
for (const m of code.matchAll(/collectionGroup\(\s*(?:db\s*,\s*)?'([A-Za-z]+)'\s*\)\s*(?:\.where|,\s*where)\(\s*'([A-Za-z.]+)'\s*,\s*'([^']+)'/g)) {
  groupQueries.add(`${m[1]}|${m[2]}|${m[3]}`);
}
assert.ok(groupQueries.size >= 5, `fant bare ${groupQueries.size} collectionGroup-spørringer`);

for (const key of groupQueries) {
  const [group, field, op] = key.split('|');
  // Flere vilkår (f.eks. status + dato): en sammensatt gruppeindeks som starter på feltet dekker spørringen.
  const composite = (spec.indexes || []).some((ix) => ix.collectionGroup === group
    && ix.queryScope === 'COLLECTION_GROUP' && ix.fields[0]?.fieldPath === field);
  if (composite) continue;
  const override = (spec.fieldOverrides || []).find((row) => row.collectionGroup === group && row.fieldPath === field);
  assert.ok(override, `collectionGroup('${group}') på ${field} mangler feltunntak i firestore.indexes.json`);
  const wantArray = /array-contains/.test(op);
  assert.ok(
    override.indexes.some((ix) => ix.queryScope === 'COLLECTION_GROUP' && (wantArray ? ix.arrayConfig === 'CONTAINS' : ix.order === 'ASCENDING')),
    `collectionGroup('${group}') på ${field} (${op}) mangler gruppeindeks`,
  );
  // Feltunntaket erstatter de automatiske indeksene: samlingsspørringene på feltet må fortsatt virke.
  for (const want of [{ order: 'ASCENDING' }, { order: 'DESCENDING' }, { arrayConfig: 'CONTAINS' }]) {
    assert.ok(
      override.indexes.some((ix) => ix.queryScope === 'COLLECTION' && Object.entries(want).every(([k, v]) => ix[k] === v)),
      `${group}.${field}: feltunntaket fjerner samlingsindeksen ${JSON.stringify(want)}`,
    );
  }
}

function hasComposite(group, fields) {
  return (spec.indexes || []).some((ix) => ix.collectionGroup === group
    && fields.every((f, i) => ix.fields[i]?.fieldPath === f));
}

// Sammensatte spørringer i appen.
assert.ok(hasComposite('friendChats', ['memberIds', 'updatedAt']), 'vennechatlisten (memberIds + updatedAt) mangler indeks');
assert.ok(hasComposite('children', ['familyId', 'deleted']), 'barnelisten (familyId + deleted !=) mangler indeks');
assert.ok(hasComposite('timeEntries', ['employeeId', 'date']));
assert.ok(hasComposite('absences', ['employeeId', 'date']));

console.log(`firestoreIndexes.test.mjs: ok (${groupQueries.size} collectionGroup-spørringer)`);
