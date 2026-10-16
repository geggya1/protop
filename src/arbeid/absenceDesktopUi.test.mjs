import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceDesktop.jsx'), 'utf8');
const phone = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceView.jsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/ModuleHero.jsx'), 'utf8');

assert.match(desktop, /nativeID="fravaer-oversikt-web"/);
assert.match(desktop, /nativeID="absence-report-select-all"/);
assert.match(desktop, /nativeID="absence-report-delete-selected"/);
assert.match(desktop, /accessibilityRole="checkbox"/);
assert.match(desktop, /controlStrip/);
assert.match(desktop, /nativeID="periode-midten"/);
assert.match(desktop, /segmentTrack/);
assert.match(desktop, /summarizeAbsenceSpan/);
assert.match(desktop, /statusSplit/);
assert.match(desktop, /StatusCard/);
assert.match(desktop, /countBadge/);
assert.match(desktop, /Borte i dag/);
assert.match(desktop, /Planlagt fremover/);

// Compact overview should stay readable without heavy type.
assert.doesNotMatch(desktop, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);
assert.doesNotMatch(phone, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);

assert.match(hero, /isDesktop \? 148/);
assert.match(hero, /titleDesk:[\s\S]*fontSize:\s*22/);

console.log('absenceDesktopUi.test.mjs: ok');
