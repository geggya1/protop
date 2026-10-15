import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const chart = readFileSync(join(root, 'components/project/CompanyGroupChart.jsx'), 'utf8');
const screen = readFileSync(join(root, 'screens/project/CompanyUnitsScreen.jsx'), 'utf8');

assert.match(chart, /export function GroupYearButton/);
assert.match(chart, /nativeID="company-group-year"/);
assert.match(chart, /nativeID="company-group-totals"/);
assert.match(chart, /showUnits:\s*false/);
assert.doesNotMatch(chart, /Registrert underenhet/);
assert.doesNotMatch(chart, /styles\.totalsRow|styles\.totalsCard|styles\.yearCard/);
assert.doesNotMatch(chart, /model\.units\.map/);

const totalsAt = chart.indexOf('nativeID="company-group-totals"');
const parentAt = chart.indexOf('<CompanyCard node={model.parent}');
assert.ok(totalsAt > 0 && parentAt > totalsAt, 'Totalt i konsernet skal stå over morselskapet');

assert.match(screen, /GroupYearButton/);
assert.match(screen, /headingActions/);
assert.match(screen, /yearControl/);
assert.match(screen, /company-units-gear/);
assert.doesNotMatch(screen, /group-show-units/);
assert.doesNotMatch(screen, /Vis underenheter fra Enhetsregisteret/);

console.log('companyGroupChart.ui ok');
