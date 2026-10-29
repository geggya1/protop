import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceDesktop.jsx'), 'utf8');
const phone = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceView.jsx'), 'utf8');
const person = readFileSync(join(ROOT, 'screens/arbeid/AbsenceOverviewView.jsx'), 'utf8');
const hero = readFileSync(join(ROOT, 'components/ModuleHero.jsx'), 'utf8');

assert.match(desktop, /nativeID="fravaer-oversikt-web"/);
assert.match(desktop, /phoneScroll/);
assert.match(desktop, /nativeID="fravaersrapport"/);
assert.match(phone, /ACTIVE_STAFF_LABEL/);
assert.match(person, /ACTIVE_STAFF_LABEL/);
assert.doesNotMatch(phone, /Alle ansatte/);
assert.doesNotMatch(person, /Alle ansatte/);
assert.match(desktop, /nativeID="absence-report-select-all"/);
assert.match(desktop, /nativeID="absence-report-delete-selected"/);
assert.match(desktop, /accessibilityRole="checkbox"/);
assert.match(desktop, /controlStrip/);
assert.match(desktop, /nativeID="periode-midten"/);
assert.match(desktop, /segmentTrack/);
assert.match(desktop, /summarizeAbsenceSpan/);
assert.match(desktop, /boardMain/);
assert.match(desktop, /fravaer-board-side/);
assert.match(desktop, /alignItems: 'flex-start'/);
assert.match(desktop, /Henter hvem som er borte/);
assert.match(desktop, /fravaer-loading-aar/);
assert.doesNotMatch(desktop, /statusSplit/);
assert.match(desktop, /StatusCard/);
assert.match(desktop, /countBadge/);
assert.match(desktop, /Borte i dag/);
assert.match(desktop, /Planlagt fremover/);
assert.doesNotMatch(desktop, /Registrerte perioder/);
assert.match(readFileSync(join(ROOT, 'components/arbeid/AbsenceOrganizePanel.jsx'), 'utf8'), /absence-organize-panel/);
assert.match(readFileSync(join(ROOT, 'components/arbeid/AbsenceOrganizePanel.jsx'), 'utf8'), /Kolonner i tabellen/);
assert.match(readFileSync(join(ROOT, 'components/arbeid/AbsenceOrganizePanel.jsx'), 'utf8'), /Filtrer og sorter/);
assert.match(desktop, /nativeID="absence-filter-toggle"/);
assert.match(desktop, /nativeID="fravaer-report-settings"/);
assert.match(desktop, /nativeID="fravaer-import"/);
assert.match(desktop, /nativeID="fravaer-clear-imported"/);
assert.match(desktop, /accessibilityLabel="Innstillinger"/);
assert.match(desktop, /accessibilityLabel="Filtrer og sorter"/);
assert.doesNotMatch(readFileSync(join(ROOT, 'components/arbeid/AbsenceOrganizePanel.jsx'), 'utf8'), /width:\s*300/);

// Compact overview should stay readable without heavy type.
assert.doesNotMatch(desktop, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);
assert.doesNotMatch(phone, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);
// Ansattens Oversikt: normal vekt, Siste fravær til høyre på bred web.
assert.doesNotMatch(person, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);
assert.match(person, /const sideRecent = Platform\.OS === 'web'/);
assert.match(person, /recentSide: \{ width: 420/);

const filterValue = person.match(/filterValue:\s*\{[^}]+\}/)?.[0] || '';
const filterLabel = person.match(/filterLabel:\s*\{[^}]+\}/)?.[0] || '';
assert.match(filterValue, /fontSize:\s*13/);
assert.match(filterValue, /fontWeight:\s*'400'/);
assert.match(filterLabel, /fontWeight:\s*'400'/);
assert.doesNotMatch(filterValue, /fontWeight:\s*'700'/);

// Antallet i utvalget heter det utvalget er (Innleide, Eksterne), ikke alltid «Ansatte».
assert.match(desktop, /label=\{absenceAudienceLabel\(audience\.selected\)\}/);

// Planlagt fravær: ingen fet skrift, godkjent ferie i egen skuff med dato og godkjenner, saldo per søknad.
const panel = readFileSync(join(ROOT, 'components/arbeid/VacationPlanPanel.jsx'), 'utf8');
assert.doesNotMatch(panel, /fontWeight:\s*['"](?:[56789]00|bold)['"]/);
assert.match(panel, /nativeID="ferieplan-godkjent-skuff"/);
assert.match(panel, /approvalLabel\(row, nameOf\)/);
assert.match(panel, /vacationRequestBalance\(/);
assert.match(panel, /nativeID=\{`ferieplan-angre-/);
assert.doesNotMatch(
  readFileSync(join(ROOT, 'components/arbeid/RegisterVacationModal.jsx'), 'utf8'),
  /fontWeight:\s*['"](?:[789]00|bold)['"]/,
);

assert.match(hero, /isDesktop \? 148/);
assert.match(hero, /titleDesk:[\s\S]*fontSize:\s*22/);

console.log('absenceDesktopUi.test.mjs: ok');
