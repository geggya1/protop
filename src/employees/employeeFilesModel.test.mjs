import assert from 'node:assert/strict';
import {
  cleanEntryName, descendantIds, folderChildren, folderTrail, formatEntrySize, storageSafeName,
} from './employeeFilesModel.js';

const entries = [
  { id: 'f1', kind: 'folder', name: 'Kontrakter', parentId: '' },
  { id: 'f2', kind: 'folder', name: 'Kurs', parentId: '' },
  { id: 'f3', kind: 'folder', name: '2026', parentId: 'f1' },
  { id: 'a', kind: 'file', name: 'arbeidsavtale.pdf', parentId: 'f1' },
  { id: 'b', kind: 'file', name: 'attest.pdf', parentId: '' },
  { id: 'c', kind: 'file', name: 'gammel.pdf', parentId: '', deleted: true },
  { id: 'd', kind: 'file', name: 'tillegg.pdf', parentId: 'f3' },
];

// Mapper først, så filer; slettede vises ikke.
assert.deepEqual(folderChildren(entries, '').map((row) => row.id), ['f1', 'f2', 'b']);
assert.deepEqual(folderChildren(entries, 'f1').map((row) => row.id), ['f3', 'a']);

assert.deepEqual(folderTrail(entries, 'f3').map((row) => row.name), ['Kontrakter', '2026']);
assert.deepEqual(folderTrail(entries, ''), []);

// Sletting av en mappe tar med alt innhold.
assert.deepEqual(descendantIds(entries, 'f1').sort(), ['a', 'd', 'f3']);

assert.equal(cleanEntryName('  a/b\\c  '), 'a-b-c');
assert.equal(storageSafeName('Lønn mars 2026.pdf'), 'Lonn_mars_2026.pdf');
assert.equal(formatEntrySize(0), '');
assert.equal(formatEntrySize(2048), '2 kB');
assert.equal(formatEntrySize(1572864), '1,5 MB');

console.log('employeeFilesModel.test.mjs: ok');
