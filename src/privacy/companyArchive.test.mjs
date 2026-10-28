import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import {
  MAX_ARCHIVE_FILE_BYTES, archiveFilePath, archiveFilePlan, archiveReadme, base64ToBytes, buildCompanyArchive,
} from './companyArchive.js';

assert.deepEqual([...base64ToBytes(Buffer.from('hei').toString('base64'))], [...strToU8('hei')]);
assert.equal(archiveFilePath('families/A/invoices/i1/faktura-1.pdf', 'A'), 'filer/invoices/i1/faktura-1.pdf');
assert.equal(archiveFilePath('families/A/../B/x.pdf', 'A'), 'filer/./B/x.pdf');

const plan = archiveFilePlan([
  { path: 'families/A/invoices/i1/faktura-1.pdf', size: 100 },
  { path: 'families/A/hr/e1/stor.pdf', size: MAX_ARCHIVE_FILE_BYTES + 1 },
  { path: '' },
]);
assert.deepEqual(plan.fetch.map((row) => row.path), ['families/A/invoices/i1/faktura-1.pdf']);
assert.deepEqual(plan.skipped, [{ path: 'families/A/hr/e1/stor.pdf', reason: 'for stor (over 15 MB)' }]);

const readme = archiveReadme({
  companyName: 'Bygg AS', exportedAt: '2026-10-28T10:00:00.000Z', documents: 12, files: 1, missing: plan.skipped,
});
assert.match(readme, /bokføringsloven § 13/);
assert.match(readme, /12 dokumenter/);
assert.match(readme, /families\/A\/hr\/e1\/stor\.pdf: for stor/);

const zip = buildCompanyArchive({
  familyId: 'A',
  json: JSON.stringify({ format: 'protop-bedrift', documents: [] }),
  files: [{ path: 'families/A/invoices/i1/faktura-1.pdf', bytes: strToU8('%PDF-1.4') }],
  missing: plan.skipped,
  companyName: 'Bygg AS',
  documents: 12,
});
const entries = unzipSync(zip);
assert.deepEqual(Object.keys(entries).sort(), ['LESMEG.txt', 'data/bedrift.json', 'filer/invoices/i1/faktura-1.pdf']);
assert.equal(JSON.parse(strFromU8(entries['data/bedrift.json'])).format, 'protop-bedrift');
assert.equal(strFromU8(entries['filer/invoices/i1/faktura-1.pdf']), '%PDF-1.4');

console.log('companyArchive.test.mjs: ok');
