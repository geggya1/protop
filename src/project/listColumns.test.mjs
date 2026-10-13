import assert from 'node:assert/strict';
import {
  DEFAULT_VISIBLE_COLUMN_KEYS,
  PROJECT_LIST_COLUMNS,
  columnPrefsKey,
  compareProjectsByColumn,
  normalizeVisibleColumns,
  nextColumnSort,
  parseStoredVisibleColumns,
  projectColumnValue,
  projectMatchesColumnFilters,
  projectPhoneLines,
  tableMinWidth,
  toggleVisibleColumn,
  visibleColumnsOf,
} from './listColumns.js';

assert.equal(columnPrefsKey('u1'), 'protop.projectList.columns.v1.u1');
assert.equal(columnPrefsKey(), 'protop.projectList.columns.v1.anon');

assert.deepEqual(
  normalizeVisibleColumns(['number', 'name', 'bogus', 'number']),
  ['number', 'name'],
);
assert.deepEqual(normalizeVisibleColumns([]), DEFAULT_VISIBLE_COLUMN_KEYS);
assert.deepEqual(parseStoredVisibleColumns(JSON.stringify({ visible: ['client'] })), ['client']);

const visible = visibleColumnsOf(['number', 'client']);
assert.equal(visible.length, 2);
assert.equal(visible[0].key, 'number');
assert.ok(tableMinWidth(visible) > 0);

const project = {
  number: '120',
  name: 'Bro',
  client: 'Kommune',
  customerNumber: '44',
  projectStatus: 'Pågående',
  start: '2024-01-01',
};
assert.equal(projectColumnValue(project, 'name'), 'Bro');
assert.equal(
  projectColumnValue(project, 'client', { customerOf: () => ({ name: 'Oslo' }) }),
  'Oslo',
);

assert.equal(
  projectMatchesColumnFilters(project, { name: 'bro', client: 'kom' }),
  true,
);
assert.equal(
  projectMatchesColumnFilters(project, { name: 'tunnel' }),
  false,
);

const sorted = [
  { number: '2', name: 'B' },
  { number: '10', name: 'A' },
].sort((a, b) => compareProjectsByColumn(a, b, { key: 'number', dir: 'asc' }));
assert.deepEqual(sorted.map((row) => row.number), ['2', '10']);

assert.deepEqual(
  nextColumnSort({ key: 'name', dir: 'asc' }, PROJECT_LIST_COLUMNS[1]),
  { key: 'name', dir: 'desc' },
);
assert.deepEqual(
  nextColumnSort({ key: 'name', dir: 'asc' }, PROJECT_LIST_COLUMNS.find((c) => c.key === 'start')),
  { key: 'start', dir: 'desc' },
);

const toggledOff = toggleVisibleColumn(['number', 'name'], 'name', false);
assert.deepEqual(toggledOff, ['number']);
const keepOne = toggleVisibleColumn(['number'], 'number', false);
assert.deepEqual(keepOne, ['number'], 'kan ikke skjule siste kolonne');
const toggledOn = toggleVisibleColumn(['number', 'client'], 'name', true);
assert.deepEqual(toggledOn, ['number', 'name', 'client']);

assert.equal(PROJECT_LIST_COLUMNS.length >= 10, true);

const phone = projectPhoneLines(
  {
    number: '10001',
    name: 'Myklebust CB6-12-13 (1882)',
    client: 'Lagret kunde',
    projectStatus: 'Avsluttet',
    orgnr: '948243113',
    department: '2,Bygg',
    manager: 'Geir Ove Andersen',
  },
  { customerName: 'Sola Kommune', missingAgreement: true },
);
assert.equal(phone.title, '10001 · Myklebust CB6-12-13 (1882)');
assert.equal(phone.meta, 'Sola Kommune · Avsluttet');
assert.equal(phone.missingAgreement, true);

const sparse = projectPhoneLines({ number: '7', name: 'Kai' });
assert.equal(sparse.title, '7 · Kai');
assert.equal(sparse.meta, '');
assert.equal(sparse.missingAgreement, false);
assert.equal(projectPhoneLines({}).title, 'Prosjekt');

console.log('listColumns.test.mjs: ok');
