import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { absenceWidgetDestination, monthKeyEnd } from './absenceWidgetNav.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const phone = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceView.jsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/ModuleHero.jsx'), 'utf8');

assert.equal(monthKeyEnd('2026-02'), '2026-02-28');
assert.equal(monthKeyEnd('2024-02'), '2024-02-29');
assert.equal(monthKeyEnd('2026-10'), '2026-10-31');

const allStaff = absenceWidgetDestination('headcount');
assert.equal(allStaff.tab, 'ansatte');
assert.equal(allStaff.intent, null);

const oneStaff = absenceWidgetDestination('headcount', { employeeId: 'e1' });
assert.equal(oneStaff.intent.type, 'openEmployee');
assert.equal(oneStaff.intent.view, 'absence');
assert.equal(oneStaff.intent.employeeId, 'e1');

const away = absenceWidgetDestination('away-sykdom', { today: '2026-10-16' });
assert.equal(away.subView, 'fravaersrapport');
assert.equal(away.intent.category, 'sykdom');
assert.equal(away.intent.period, 'custom');
assert.equal(away.intent.fromDate, '2026-10-16');
assert.equal(away.intent.toDate, '2026-10-16');

const span = absenceWidgetDestination('away-ferie', {
  today: '2026-10-16',
  fromDate: '2026-10-12',
  toDate: '2026-10-18',
  employeeId: 'e2',
});
assert.equal(span.intent.fromDate, '2026-10-12');
assert.equal(span.intent.toDate, '2026-10-18');
assert.equal(span.intent.employeeId, 'e2');

const usage = absenceWidgetDestination('usage', { category: 'permisjon' });
assert.equal(usage.intent.category, 'permisjon');
assert.equal(usage.intent.typeId, '');
assert.equal(usage.intent.period, 'year');

const specific = absenceWidgetDestination('detail', { category: 'egenmelding' });
assert.equal(specific.intent.category, 'sykdom');
assert.equal(specific.intent.typeId, 'egenmelding');

const chart = absenceWidgetDestination('chart', { fromDate: '2026-05-01', toDate: '2026-10-31' });
assert.equal(chart.intent.category, '');
assert.equal(chart.intent.period, 'custom');
assert.equal(chart.intent.toDate, '2026-10-31');

assert.equal(absenceWidgetDestination('planned', { employeeId: 'e3' }).subView, 'planlagt');
assert.equal(absenceWidgetDestination('planned').intent, null);
assert.equal(absenceWidgetDestination('earned', { employeeId: 'e4' }).intent.view, 'absence');
assert.equal(absenceWidgetDestination('ukjent'), null);

assert.match(phone, /absenceWidgetDestination/);
assert.match(phone, /person-outline/);
assert.doesNotMatch(phone, /#102848/);
assert.match(phone, /onOpenSource\?\.\(dest\)/);
assert.match(hero, /copyPhone:[\s\S]*minWidth:\s*168/);
assert.match(hero, /isPhone \? 3/);

console.log('absenceWidgetNav.test.mjs: ok');
