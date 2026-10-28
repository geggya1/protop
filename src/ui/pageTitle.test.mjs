/**
 * Én tittel per side (AGENTS.md): skallet viser sidetittelen, og siden gjentar den ikke.
 * Ren logikk (pageTitle.js, shellPageTitles.js) og kildesjekker for skallet og Page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeTitle, repeatsShellTitle, titleDoubles, titleVariants,
} from './pageTitle.js';
import { shellPageTitles } from '../navigation/shellPageTitles.js';
import { isoMenuTitle } from '../navigation/shellModules.js';
import { resolveShellHeaderTitle } from '../navigation/shellHeaderTitle.js';
import { resolveModuleHero } from '../modules/moduleHero.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const t = (key) => key;

test('samme tittel uansett mellomrom, store bokstaver og punktum', () => {
  assert.equal(normalizeTitle('  Avvik og  forbedring. '), 'avvik og forbedring');
  assert.equal(normalizeTitle('VENNER'), normalizeTitle('Venner'));
  assert.deepEqual(titleVariants('HR · Personell'), ['hr · personell', 'hr', 'personell']);
  assert.equal(repeatsShellTitle('Personell', ['HR · Personell']), true);
  assert.equal(repeatsShellTitle('Avvik og forbedring', ['Avvik og forbedring']), true);
});

test('en annen eller lengre overskrift står (detaljsider, «Risiko og muligheter»)', () => {
  assert.equal(repeatsShellTitle('Risiko og muligheter', ['Risiko']), false);
  assert.equal(repeatsShellTitle('Faktura 1001', ['Faktura']), false);
  assert.equal(repeatsShellTitle('Avvik og forbedring', []), false, 'utenfor skallet: siden har tittelen selv');
  assert.equal(repeatsShellTitle('Avvik og forbedring', null), false);
  assert.equal(repeatsShellTitle(undefined, ['Avvik og forbedring']), false);
  assert.equal(repeatsShellTitle('', ['']), false);
});

test('ISO → Avvik: skallet viser «Avvik og forbedring», og Page gjentar den ikke', () => {
  const headerTitle = resolveShellHeaderTitle({ tab: 'iso', moreSubView: 'avvik', t });
  assert.equal(headerTitle, isoMenuTitle('avvik'));
  // Telefon: toppfeltet viser tittelen. PC: tittelraden (brødsmulen) viser den, toppfeltet ikke.
  const phone = shellPageTitles({ tab: 'iso', subView: 'avvik', headerTitle, titleRow: true });
  const desktop = shellPageTitles({ tab: 'iso', subView: 'avvik', headerTitle: '', titleRow: true });
  for (const titles of [phone, desktop]) {
    assert.ok(titles.includes('Avvik og forbedring'), titles.join(', '));
    assert.equal(repeatsShellTitle('Avvik og forbedring', titles), true);
  }
});

test('HR: «HR · Personell» i toppfeltet dekker seksjonstittelen «Personell»', () => {
  const headerTitle = resolveShellHeaderTitle({ tab: 'hr', moreSubView: 'personell', t });
  const titles = shellPageTitles({ tab: 'hr', subView: 'personell', headerTitle, titleRow: true });
  assert.equal(repeatsShellTitle('Personell', titles), true);
  assert.equal(repeatsShellTitle('Personellregister', titles), false);
});

test('startsider med bånd: båndets tekst teller, ikke brødsmulen eller et skjult toppfelt', () => {
  const hero = resolveModuleHero('iso');
  const titles = shellPageTitles({ tab: 'iso', subView: 'oversikt', headerTitle: '', titleRow: false, heroId: 'iso' });
  assert.ok(titles.includes(hero.title));
  assert.equal(repeatsShellTitle('Oversikt', titles), false, 'ISO-oversikten beholder «Oversikt»');
  // Bedrift › Fraværsinnstillinger: båndet viser «Bedriften», toppfeltet er skjult på PC.
  const absence = shellPageTitles({ tab: 'selskap', subView: 'fravaerstyper', headerTitle: '', heroId: 'selskap' });
  assert.equal(repeatsShellTitle('Fraværsinnstillinger', absence), false);
});

test('sidegjennomgangen teller dobbel tittel, dobbelt i skallet og nesten like titler', () => {
  const found = titleDoubles({
    shell: [
      { text: 'Avvik og forbedring', where: 'toppfelt' },
      { text: 'Avvik og forbedring', where: 'tittelrad' },
      { text: 'VENNER', where: 'bånd' },
      { text: 'Venner', where: 'bånd' },
    ],
    content: [
      { text: 'Avvik og forbedring', kind: 'overskrift', level: '2' },
      { text: '0 saker', kind: 'overskrift', level: '3' },
      { text: 'Avvik og forbedring i prosjekt', kind: 'stor tekst', level: '17px' },
    ],
  });
  assert.deepEqual(found.doubles, ['Avvik og forbedring (overskrift 2)']);
  assert.deepEqual(found.shellDouble, ['avvik og forbedring (toppfelt/tittelrad)', 'venner (bånd/bånd)']);
  assert.deepEqual(found.near, ['Avvik og forbedring i prosjekt']);
  assert.deepEqual(titleDoubles({ shell: [{ text: 'Faktura', where: 'toppfelt' }], content: [] }), {
    doubles: [], shellDouble: [], near: [],
  });
});

test('skallet gir sidene titlene sine, og har én overskrift for siden', () => {
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /<ShellTitlesProvider titles=\{shellTitles\}>/);
  assert.match(shell, /shellPageTitles\(\{/);
  assert.match(shell, /titleInPage=\{titleInContent\}/, 'PC: toppfeltet gjentar ikke båndet eller tittelraden');
  const header = read('components/ShellHeader.jsx');
  assert.equal((header.match(/nativeID="shell-page-title"/g) || []).length, 2, 'tittelen i toppfeltet på PC og mobil');
  assert.equal((header.match(/aria-level=\{1\}/g) || []).length, 2);
  assert.match(header, /titleInPage \? null/);
  assert.match(read('components/Breadcrumb.jsx'), /aria-level=\{title && last \? 1 : undefined\}/);
  const hero = read('components/ModuleHero.jsx');
  assert.match(hero, /nativeID="module-hero-title" accessibilityRole="header" aria-level=\{1\}/);
  assert.doesNotMatch(hero, /nativeID="module-hero"\s+accessibilityRole="header"/, 'båndet er ikke én stor overskrift');
});

test('Page og seksjonstitlene dropper tittelen når skallet viser den, men beholder forklaring og knapper', () => {
  const page = read('src/ui/primitives.jsx');
  assert.match(page, /const shellHasTitle = useRepeatsShellTitle\(title\);/);
  assert.match(page, /\{shellHasTitle \? null : \(/);
  assert.match(page, /\{intro \? <Text/);
  assert.match(page, /\{actions \? <View/);
  assert.match(read('screens/hr/HrShared.jsx'), /useRepeatsShellTitle\(title\)/);
  for (const [path, title] of [
    ['screens/project/ProjectPlatformScreen.jsx', 'Tilgangsstyring'],
    ['screens/project/ProjectPlatformScreen.jsx', 'Modulinnstillinger'],
    ['screens/arbeid/AbsenceSettingsScreen.jsx', 'Fraværsinnstillinger'],
    ['screens/economy/EconomySettingsScreen.jsx', 'Økonomiinnstillinger'],
  ]) {
    assert.match(read(path), new RegExp(`<UnlessShellTitle title="${title}">`), `${path}: ${title}`);
  }
  assert.match(read('screens/economy/EconomyDesk.jsx'), /useRepeatsShellTitle\('Indeksregulering'\)/);
  assert.match(read('screens/v2/PrivacyTermsScreen.jsx'), /useRepeatsShellTitle\(t\('more\.legal'\)\)/);
  // Møter (#556): «Møter», «Oppfølging» og «Møtemaler» står i skallet.
  assert.match(read('screens/meetings/MeetingsModule.jsx'), /const shellHasTitle = useRepeatsShellTitle\(pageTitle\);/);
});
