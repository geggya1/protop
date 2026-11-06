/**
 * Shared module heading: copy, colors, illustration wiring, phone/tablet/web.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_ART_SCALE } from '../appearance/pageArtScale.js';
import {
  MODULE_HERO, heroTitleWithCompany, phoneChromeHeroId, resolveModuleHero, shellHeroCompact, shellHeroModuleId,
} from './moduleHero.js';
import { COMPANY_HERO, companyHeroGroup, companyHeroId } from './companyHero.js';
import { GROUP_PALETTE } from './groupPalette.js';
import { getProtopPage, helpPageId } from '../help/protopPages.js';
import {
  ACTIVATABLE_MODULE_IDS,
  getModuleConfig,
  ILLUSTRATION_FILES,
  PHONE_ILLUSTRATION_FILES,
} from './moduleActivationRegistry.js';
import { buildHelpWelcomeModule } from '../utils/helpWelcome.js';
import { getModuleIntro, localizeIntro } from '../utils/moduleIntros.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const MOCKUP_IDS = [
  'stars', 'notes', 'shop',
  'books', 'games',
  'matcoach', 'meals', 'recipes', 'pantry',
  'albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger',
  'wishes', 'location', 'rememberDates', 'activities',
];

for (const id of MOCKUP_IDS) {
  const hero = resolveModuleHero(id, 'nb');
  assert.ok(hero.kicker, `${id} kicker`);
  assert.ok(hero.title, `${id} title`);
  assert.ok(hero.pitch, `${id} pitch`);
  assert.match(hero.bg, /^#/, `${id} bg`);
  assert.equal(hero.moduleId, id);
  const en = resolveModuleHero(id, 'en');
  assert.ok(en.title, `${id} en title`);
  assert.notEqual(en.title, hero.title, `${id} should have English title`);
  assert.equal(shellHeroModuleId(id), id, `${id} shell tab hero`);
}

assert.equal(shellHeroModuleId('more', 'shop'), 'shop');
assert.equal(shellHeroModuleId('more', 'matcoach'), 'matcoach');
assert.equal(shellHeroModuleId('more', 'books'), 'books');
assert.equal(shellHeroModuleId('more', 'familyTree'), 'familyTree');
assert.equal(shellHeroModuleId('more', 'rememberDates'), 'rememberDates', 'Husk dato is a Mer-subview, not a top tab');
assert.equal(shellHeroModuleId('stars'), 'stars');
assert.equal(shellHeroModuleId('plan'), 'plan');
assert.equal(shellHeroModuleId('mail'), 'mail');
assert.equal(shellHeroModuleId('home'), null);
assert.equal(shellHeroModuleId('more', null), null);
assert.equal(shellHeroModuleId('more', 'help'), null);
assert.equal(shellHeroModuleId('more', 'childApps'), null);

const MORE_HUB_HERO_IDS = [
  'shop', 'books', 'games', 'matcoach', 'meals', 'recipes', 'pantry',
  'albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger',
  'wishes', 'location', 'rememberDates', 'activities',
  'lekser', 'documents', 'holdings', 'boligmappa', 'hospitality', 'progress',
];
for (const id of MORE_HUB_HERO_IDS) {
  assert.equal(shellHeroModuleId('more', id), id, `${id} Mer-subview heading`);
  assert.equal(phoneChromeHeroId('more', id, true), id, `${id} phone chrome heading`);
  assert.equal(phoneChromeHeroId('more', id, false), null, `${id} tablet/web keeps content-band heading`);
}
assert.equal(phoneChromeHeroId('more', 'childDrawings', true), 'childDrawings', 'Barnetegninger phone heading is header chrome, not a content card');
assert.equal(phoneChromeHeroId('more', 'rememberDates', true), 'rememberDates', 'Husk dato phone heading is header chrome, not a content card');
assert.equal(phoneChromeHeroId('stars', null, true), 'stars');
assert.equal(phoneChromeHeroId('more', 'help', true), null);

const TOP_TAB_HERO_IDS = ['stars', 'notes', 'chat', 'plan', 'mail', 'chores'];
for (const id of TOP_TAB_HERO_IDS) {
  assert.equal(phoneChromeHeroId(id, null, true), id, `${id} top-tab phone chrome heading`);
  assert.equal(phoneChromeHeroId(id, null, false), null, `${id} tablet/web keeps content-band heading`);
}

const plan = resolveModuleHero('plan', 'nb');
assert.equal(plan.title, 'Din kalender, én plan');
assert.equal(plan.kicker, 'Kalender');

const assetsSrc = readFileSync(join(ROOT, 'src/modules/moduleActivationAssets.js'), 'utf8');
// Familiemodulene (matcoach, posisjon, reiser, familietre …) er fjernet fra ProTop.
assert.equal(/matcoach|familietreet|scratchMap/.test(assetsSrc), false);

for (const id of ACTIVATABLE_MODULE_IDS) {
  const hero = resolveModuleHero(id, 'nb');
  assert.ok(hero.title, `${id} catalog fallback title`);
  assert.ok(hero.bg, `${id} palette`);
  assert.ok(ILLUSTRATION_FILES[id], `${id} illustration filename`);
}


const frameSrc = readFileSync(join(ROOT, 'components/ModulePageBg.jsx'), 'utf8');
assert.match(frameSrc, /<ModuleHero /, 'frame must render the shared heading');
assert.match(frameSrc, /export function useShowModuleHero\(\) \{\s*return true;/s, 'phone uses the same top heading as tablet/web');
assert.match(frameSrc, /if \(showHero \|\| !imgSource\) return null/, 'bottom art is hidden when the top heading shows');
assert.match(frameSrc, /export function ModuleHubIntro[\s\S]*if \(showHero\) return null/, 'duplicate intro titles hide when the heading shows');
assert.match(frameSrc, /useModuleHeroHosted/, 'in-shell pages must not draw a second heading');
assert.match(frameSrc, /hosted \|\| isPhone/, 'phone never draws a content-band heading under Hjem');

const shellSrc = readFileSync(join(ROOT, 'components/AppShell.jsx'), 'utf8');
assert.match(shellSrc, /shellHeroModuleId/, 'shell draws the shared heading above content');
assert.match(shellSrc, /phoneChromeHeroId/, 'phone heading id is resolved for Mer-subviews including Husk dato');
assert.match(shellSrc, /<ModuleHero /, 'shell heading is ModuleHero');
assert.match(shellSrc, /ModuleHeroHostProvider/, 'shell marks the heading as hosted');
assert.match(shellSrc, /headerHeroId \? \([\s\S]*<ModuleHero/, 'phone heading replaces the shell page title');
assert.match(shellSrc, /pageHeroId && !headerHeroId/, 'tablet\/web keep the heading in the content band');
assert.match(shellSrc, /flush chrome/, 'phone heading is flattened into the shell chrome');
assert.doesNotMatch(shellSrc, /heroBandPhone/, 'phone no longer draws a second heading below the title');
assert.doesNotMatch(shellSrc, /chromeBg=/, 'logo bar stays white like modules — not pastel-tinted');
assert.doesNotMatch(shellSrc, /headerHeroId === 'home'/, 'home uses chromeOnly logo bar, not ModuleHero');

const headerSrc = readFileSync(join(ROOT, 'components/ShellHeader.jsx'), 'utf8');
assert.match(headerSrc, /hero = null/, 'ShellHeader accepts the module heading');
assert.doesNotMatch(headerSrc, /chromeBg/, 'ShellHeader logo chrome is not pastel-tinted');
assert.doesNotMatch(headerSrc, /IMMERSIVE_GLASS_BG|barImmersive/, 'phone chrome no longer uses dark glass');
assert.match(headerSrc, /nativeID="module-hero-slot"/, 'phone heading sits in the header chrome slot');
assert.match(headerSrc, /styles\.heroTitleRight/, 'titleRight overlays the pastel band');
assert.match(headerSrc, /styles\.heroChrome/, 'phone heading is embedded as header chrome');
assert.match(headerSrc, /marginHorizontal: -12/, 'band is edge-to-edge in the header');
assert.match(headerSrc, /styles\.avatarSlot/, 'profile photo keeps its slot');
assert.doesNotMatch(headerSrc, /helpOnAvatar/, 'help sits in the logo row, not hanging off the profile photo (EGEN-03)');
assert.doesNotMatch(headerSrc, /helpOverlayPhone:\s*\{[^}]*top:\s*42/, 'help is not pinned over the profile from the header top');
assert.doesNotMatch(headerSrc, /heroBelowRow/, 'help no longer reserves a row under the band');
assert.doesNotMatch(headerSrc, /heroBackLink/, 'no dedicated Hjem back-link slot under the band');
assert.doesNotMatch(headerSrc, /CompactBackLink/, 'ShellHeader no longer renders a Hjem back link');
assert.match(headerSrc, /\{hero \?/, 'phone heading replaces the large module title text');
assert.doesNotMatch(
  headerSrc,
  /\{hero \?[\s\S]*styles\.familyName[\s\S]*styles\.heroChrome/s,
  'family name is hidden when the module hero is phone chrome',
);
assert.match(
  headerSrc,
  /heroTitleRight:\s*\{[^}]*bottom:\s*\d+/,
  'add overlays the bottom of the pastel band',
);
assert.doesNotMatch(
  headerSrc,
  /heroTitleRight:\s*\{[^}]*top:\s*0/,
  'add is not a detached title row at the top of the band',
);
assert.match(headerSrc, /position:\s*'absolute'/, 'help overlay does not push page content down');
assert.doesNotMatch(headerSrc, /familyNameHero/, 'family name is not painted on top of the band');
assert.doesNotMatch(headerSrc, /styles\.pageTitleRow[\s\S]*nativeID="module-hero-slot"/, 'hero is not a detached card below the title row');


const asideSrc = readFileSync(join(ROOT, 'components/ModuleAside.jsx'), 'utf8');
assert.match(asideSrc, /Tips for /, 'tips card kicker must name the module');
assert.match(asideSrc, /Åpne veiledning/, 'tips card still opens the help tour');
assert.match(asideSrc, /moduleHeroName/, 'tips title uses the same module name as the heading');

const helpBtn = readFileSync(join(ROOT, 'components/HelpButton.jsx'), 'utf8');
assert.match(helpBtn, /openModuleHelp/, 'header lightbulb still opens module help');
assert.match(helpBtn, /HelpTarget id="helpBtn"/, 'help tour still anchors on the bulb');

const heroSrc = readFileSync(join(ROOT, 'components/ModuleHero.jsx'), 'utf8');
assert.doesNotMatch(heroSrc, /if \(!force && isPhone\) return null/, 'phone must render ModuleHero, not skip it');
assert.match(heroSrc, /isPhone \? 112 : 136/, 'phone heading stays compact (shorter than tablet)');
assert.match(heroSrc, /const ART_INSET = 8/, 'heading art sits 2mm from the top and bottom');
assert.match(heroSrc, /heroH - ART_INSET \* 2/, 'art height follows the heading minus the 2mm inset');
assert.match(heroSrc, /artWrapPhone/, 'phone heading caps the art so the band stays short');
assert.match(heroSrc, /objectFit: 'contain'/, 'heading art scales inside the band without cropping');
assert.doesNotMatch(heroSrc, /PAGE_ART_SCALE/, 'heading art is not zoomed past the 2mm inset');
assert.equal(PAGE_ART_SCALE, 1.4, 'page illustrations outside the heading stay 40% larger');
assert.match(heroSrc, /artWrap: \{[\s\S]*?overflow: 'hidden'/, 'art wrap keeps the picture inside the band');
const welcomeSrc = readFileSync(join(ROOT, 'components/ModuleWelcomeModal.jsx'), 'utf8');
assert.match(welcomeSrc, /PAGE_ART_SCALE/, 'welcome art uses the same 40% scale');
assert.match(welcomeSrc, /artFrame:[\s\S]*overflow: 'hidden'/, 'welcome art can crop inside its frame');
assert.match(frameSrc, /PAGE_ART_SCALE/, 'bottom page art uses the same 40% scale');
assert.match(heroSrc, /artWrap: \{[\s\S]*?marginRight: ART_INSET/, 'tablet and desktop heading art keeps a small gap at the right edge');
assert.match(heroSrc, /artWrapPhone:\s*\{[^}]*marginRight:\s*0/, 'phone heading art sits on the right margin');
assert.match(heroSrc, /resizeMode="contain"/, 'native hero art uses contain');
assert.match(heroSrc, /force = false/, 'force prop remains for SchoolPageLayout and similar stack screens');
assert.match(heroSrc, /flush = false/, 'flush prop remains for shell/school bands');
assert.match(heroSrc, /chrome = false/, 'chrome prop flattens the phone band into the header');
assert.match(heroSrc, /heroChromePhone/, 'phone chrome band flattens top radius and sits in the header');
assert.match(heroSrc, /borderTopLeftRadius: 0/, 'phone chrome band has no top radius');
assert.match(heroSrc, /copyPhoneChrome/, 'phone chrome copy stays compact in the title slot');
assert.match(heroSrc, /copyPhone:[\s\S]*minWidth:\s*168/, 'phone heading keeps room for the full pitch');
assert.match(heroSrc, /isPhone \? 3/, 'phone pitch can use three lines so the tip is not cut off');
assert.match(heroSrc, /artWrapPhoneChrome/, 'phone chrome art stays in the title\/add-button row');
assert.match(heroSrc, /artWrapPhoneChrome:\s*\{[^}]*marginRight:\s*0/, 'phone chrome art is flush with the right margin');
assert.match(heroSrc, /objectPosition: 'right center'/, 'phone heading art anchors to the right edge');

assert.ok(MODULE_HERO.matcoach.title.nb.includes('Ukeplanen'));
assert.ok(MODULE_HERO.stars.title.nb.includes('oversikt'));

const COMPANY_PAGES = [
  ['projects', null, 'projects'],
  ['ansatte', null, 'ansatte'],
  ['kunder', null, 'kunder'],
  ['kontrakt', null, 'kontrakt'],
  ['skjema', null, 'skjema'],
  ['iso', null, 'iso'],
  ['moter', null, 'moter-oversikt'],
  ['moter', 'oversikt', 'moter-oversikt'],
  ['moter', 'oppfolging', 'moter-oppfolging'],
  ['moter', 'maler', 'moter-maler'],
  ['timeliste', null, 'timeliste'],
  ['hr', 'oversikt', 'hr-oversikt'],
  ['hr', 'personell', 'hr-personell'],
  ['hr', 'avtaler', 'hr-personell'],
  ['hr', 'produktivitet', 'hr-oversikt'],
  ['arbeid', 'produktivitet', 'arbeid-produktivitet'],
  ['arbeid', 'fremdrift', 'arbeid-fremdrift'],
  ['hr', 'lonn', 'hr-personell'],
  ['hr', 'oppfolging', 'hr-oppfolging'],
  ['hr', 'compliance', 'hr-personell'],
  ['hr', 'rekruttering', 'hr-rekruttering'],
  ['hr', 'handbok', 'hr-handbok'],
  ['hr', 'skjema', 'hr-skjema'],
  ['selskap', null, 'selskap'],
  ['selskap', 'tilgang', 'selskap-tilgang'],
  ['selskap', 'underenheter', 'underenheter'],
  ['underenheter', null, 'underenheter'],
  ['anbud', 'varsling', 'anbud-varsling'],
  ['anbud', 'foresporsel', 'anbud-foresporsel'],
  ['anbud', 'vurdering', 'anbud-vurdering'],
  ['anbud', 'tilbud', 'anbud-tilbud'],
  ['arbeid', 'timeliste', 'arbeid-timeliste'],
  ['arbeid', 'timerapport', 'arbeid-timerapport'],
  ['arbeid', 'timesaldo', 'arbeid-timesaldo'],
  ['arbeid', 'fravaer', 'arbeid-fravaer'],
  ['arbeid', 'fravaersrapport', 'arbeid-fravaersrapport'],
  ['arbeid', 'planlagt', 'arbeid-planlagt'],
  ['arbeid', 'fravaer-innstillinger', 'arbeid-fravaer-innstillinger'],
  ['arbeid', 'utlegg', 'okonomi-utlegg'],
  ['arbeid', 'salg', 'arbeid-salg'],
  ['arbeid', 'godkjenning', 'arbeid-godkjenning'],
  ['okonomi', 'oversikt', 'okonomi-oversikt'],
  ['okonomi', 'inntjening', 'okonomi-inntjening'],
  ['okonomi', 'kunder', 'okonomi-kunder'],
  ['okonomi', 'avtaler', 'okonomi-avtaler'],
  ['okonomi', 'faktura', 'okonomi-faktura'],
  ['okonomi', 'fakturagrunnlag', 'okonomi-fakturagrunnlag'],
  ['okonomi', 'utlegg', 'okonomi-utlegg'],
  ['okonomi', 'kjorebok', 'okonomi-kjorebok'],
  ['utstyr', null, 'utstyr'],
  ['okonomi', 'produkter', 'okonomi-produkter'],
  ['okonomi', 'indeks', 'okonomi-indeks'],
  ['okonomi', 'indekser', 'okonomi-indekser'],
  ['okonomi', 'innstillinger', 'okonomi-innstillinger'],
];
for (const [tab, sub, id] of COMPANY_PAGES) {
  assert.equal(companyHeroId(tab, sub), id, `${tab}/${sub || ''}`);
  assert.equal(shellHeroModuleId(tab, sub), id, `${id} shell heading`);
  // Båndet er toppoverskriften på alle sidene i modulen, også undersidene (eierbeslutning 28.10).
  assert.equal(shellHeroCompact(tab, sub), false, `${tab}/${sub || ''} har båndet`);
  assert.equal(phoneChromeHeroId(tab, sub, true), id, `${id} phone chrome heading`);
  assert.equal(phoneChromeHeroId(tab, sub, false), null, `${id} tablet/web keeps content-band heading`);
  const hero = resolveModuleHero(id, 'nb');
  const en = resolveModuleHero(id, 'en');
  assert.ok(hero.title, `${id} title`);
  assert.ok(hero.kicker, `${id} kicker`);
  assert.ok(hero.pitch, `${id} pitch`);
  assert.notEqual(en.title, hero.title, `${id} should have English title`);
  assert.ok(COMPANY_HERO[id], `${id} company hero`);
}
assert.equal(shellHeroCompact('arbeid', 'timeliste'), false, 'Timeliste er startsiden i Timer');
assert.equal(shellHeroCompact('arbeid', 'godkjenning'), false, 'Godkjenninger er en underside, men har båndet');
assert.equal(shellHeroCompact('okonomi', 'oversikt'), false);
assert.equal(shellHeroCompact('okonomi', 'fakturagrunnlag'), false);
assert.equal(shellHeroCompact('hr', 'lonn'), false);
assert.equal(shellHeroCompact('iso', 'prosesser'), false, 'ISO-undersidene har båndet');
assert.equal(shellHeroCompact('kunder'), false);
assert.equal(shellHeroCompact('stars'), false, 'personlige sider beholder båndet');
assert.equal(shellHeroCompact('home'), false, 'Hjem har ikke bånd');
assert.equal(resolveModuleHero('projects', 'nb').wideArt, true, 'project overview uses the wide illustration');
assert.equal(resolveModuleHero('ansatte', 'nb').wideArt, true, 'ansatte uses the wide illustration');
assert.equal(resolveModuleHero('kunder', 'nb').wideArt, true, 'kunder uses the wide illustration');
assert.equal(resolveModuleHero('anbud-varsling', 'nb').wideArt, true, 'anbudsvarsling uses the wide illustration');
assert.equal(resolveModuleHero('anbud-vurdering', 'nb').wideArt, true, 'vurdering av aktuelle uses the wide illustration');
assert.equal(resolveModuleHero('anbud-foresporsel', 'nb').wideArt, true, 'tender enquiry uses the wide illustration');
assert.equal(resolveModuleHero('anbud-tilbud', 'nb').wideArt, true, 'tilbud uses the wide illustration');
assert.equal(resolveModuleHero('kontrakt', 'nb').wideArt, true, 'kontrakt uses the wide illustration');
assert.equal(resolveModuleHero('skjema', 'nb').wideArt, true, 'skjema uses the wide illustration');
assert.equal(resolveModuleHero('timeliste', 'nb').wideArt, true, 'personal timesheet uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-timeliste', 'nb').wideArt, true, 'company timesheet uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-timerapport', 'nb').wideArt, true, 'hours report uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-timesaldo', 'nb').wideArt, true, 'hour balance uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-fravaer', 'nb').wideArt, true, 'absence overview uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-fravaersrapport', 'nb').wideArt, true, 'absence report uses the wide illustration');
// Fraværsinnstillinger har samme bånd som Fraværsoversikt, med sin egen tittel.
assert.equal(resolveModuleHero('arbeid-fravaer-innstillinger', 'nb').title, 'Fraværsinnstillinger');
assert.equal(resolveModuleHero('arbeid-fravaer-innstillinger', 'nb').wideArt, true);
assert.equal(resolveModuleHero('arbeid-fravaer-innstillinger', 'nb').bg, resolveModuleHero('arbeid-fravaer', 'nb').bg);
assert.equal(ILLUSTRATION_FILES['arbeid-fravaer-innstillinger'], ILLUSTRATION_FILES['arbeid-fravaer']);
// Økonomiinnstillinger har samme bilde som Bedriftsinnstillinger, med sin egen tittel.
assert.equal(resolveModuleHero('okonomi-innstillinger', 'nb').title, 'Økonomiinnstillinger');
assert.equal(resolveModuleHero('okonomi-innstillinger', 'nb').wideArt, true);
assert.equal(ILLUSTRATION_FILES['okonomi-innstillinger'], ILLUSTRATION_FILES.selskap);
assert.equal(resolveModuleHero('arbeid-salg', 'nb').wideArt, true, 'product sales use the wide illustration');
assert.equal(resolveModuleHero('okonomi-produkter', 'nb').wideArt, true, 'products use the wide illustration');
assert.equal(resolveModuleHero('arbeid-godkjenning', 'nb').wideArt, true, 'approvals use the wide illustration');
assert.equal(resolveModuleHero('arbeid-produktivitet', 'nb').wideArt, true, 'capacity plan uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-produktivitet', 'nb').title, 'Belegg og kapasitet');
assert.equal(resolveModuleHero('iso', 'nb').wideArt, true, 'iso uses the wide illustration');
// Møter: samme bilde på alle sidene, med sidens egen tittel, og fargen fra Møter og referat.
for (const id of ['moter-oversikt', 'moter-oppfolging', 'moter-maler']) {
  assert.equal(resolveModuleHero(id, 'nb').wideArt, true, `${id} uses the wide illustration`);
  assert.equal(ILLUSTRATION_FILES[id], 'moter--module-activation-illustration.webp');
  assert.equal(companyHeroGroup(id), 'company-meetings');
  // Telefonen har et eget, nesten kvadratisk bilde, så folkene ikke blir små i det lave båndet.
  assert.equal(PHONE_ILLUSTRATION_FILES[id], 'moter-phone--module-activation-illustration.webp');
}
assert.equal(resolveModuleHero('moter-oppfolging', 'nb').title, 'Oppfølging');
assert.equal(resolveModuleHero('moter-maler', 'nb').title, 'Møtemaler');
assert.equal(resolveModuleHero('okonomi-faktura', 'nb').wideArt, true, 'invoices use the wide illustration');
assert.equal(resolveModuleHero('okonomi-kjorebok', 'nb').wideArt, true, 'mileage log uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-indeks', 'nb').wideArt, true, 'index adjustment uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-fakturagrunnlag', 'nb').wideArt, true, 'billing basis uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-oversikt', 'nb').wideArt, true, 'finance overview uses the wide illustration');
assert.equal(resolveModuleHero('selskap', 'nb').wideArt, true, 'company profile uses the wide illustration');
// Bedriftsprofilen har ikke eget banner; båndet bærer selskapsnavnet.
assert.equal(resolveModuleHero('selskap', 'nb').withCompanyName, true);
assert.equal(resolveModuleHero('underenheter', 'nb').withCompanyName, false);
assert.equal(heroTitleWithCompany('Bedriften', 'CONSULT1 AS'), 'Bedriften – Consult1 AS');
assert.equal(heroTitleWithCompany('Bedriften', ''), 'Bedriften');
assert.equal(resolveModuleHero('underenheter', 'nb').wideArt, true, 'units and group use the wide illustration');
assert.equal(resolveModuleHero('selskap-tilgang', 'nb').wideArt, true, 'access and permissions use the wide illustration');
assert.equal(resolveModuleHero('plan', 'nb').wideArt, true, 'calendar uses the wide illustration');
assert.equal(resolveModuleHero('mail', 'nb').wideArt, true, 'mail uses the wide illustration');
assert.equal(resolveModuleHero('stars', 'nb').wideArt, true, 'tasks use the wide illustration');
assert.equal(resolveModuleHero('notes', 'nb').wideArt, true, 'notes use the wide illustration');
assert.equal(resolveModuleHero('friends', 'nb').wideArt, true, 'friends use the wide illustration');
assert.equal(shellHeroModuleId('more', 'friends'), 'friends', 'venner uses the shared heading');
assert.equal(resolveModuleHero('plan', 'nb').title, 'Din kalender, én plan', 'calendar title stays');
assert.equal(resolveModuleHero('friends', 'nb').title, 'Venner', 'friends title stays the page name');
// Én farge per menygruppe (UX-06): båndet skifter ikke farge mellom fanene i en modul,
// og hjelpen bruker samme farge for samme side.
for (const id of Object.keys(COMPANY_HERO)) {
  const band = resolveModuleHero(id, 'nb');
  assert.equal(band.ink, '', `${id} keeps dark text on the pastel band`);
  assert.equal(band.muted, '', `${id} keeps the default muted pitch`);
  assert.notEqual(band.bg, '#1B2026', `${id} is not anthracite`);
  const group = companyHeroGroup(id);
  assert.ok(GROUP_PALETTE[group], `${id} hører til en menygruppe`);
  assert.equal(band.bg, GROUP_PALETTE[group].bg, `${id} bg følger gruppen ${group}`);
  assert.equal(band.bg2, GROUP_PALETTE[group].bg2, `${id} bg2 følger gruppen ${group}`);
  assert.equal(band.accent, GROUP_PALETTE[group].accent, `${id} accent følger gruppen ${group}`);
}
const hrColors = new Set(['hr-oversikt', 'hr-personell', 'hr-oppfolging', 'hr-sykefravaer']
  .map((id) => resolveModuleHero(id, 'nb').bg));
assert.equal(hrColors.size, 1, 'HR har én farge på alle fanene');
assert.equal(resolveModuleHero('okonomi-faktura', 'nb').accent, resolveModuleHero('okonomi-oversikt', 'nb').accent);
assert.equal(resolveModuleHero('notes', 'nb').bg, GROUP_PALETTE.personal.bg, 'Notat følger Personlig');
for (const [tab, sub, id] of COMPANY_PAGES) {
  const help = getProtopPage(helpPageId(tab, sub));
  if (!help) continue;
  // Hjelpen og menyen plasserer siden i samme gruppe, og fargen er den samme.
  assert.equal(help.section, companyHeroGroup(id), `${tab}/${sub || ''}: samme gruppe i hjelp og meny`);
  assert.equal(help.accent, resolveModuleHero(id, 'nb').accent, `${tab}/${sub || ''}: samme farge i bånd og hjelp`);
}
assert.equal(resolveModuleHero('okonomi-utlegg', 'nb').wideArt, true, 'economy expenses use the illustration');
assert.equal(resolveModuleHero('week-plan', 'nb').bg, '#f4efe6', 'ukeplan palette stays sand (ikke en ProTop-modul)');
assert.equal(resolveModuleHero('week-plan', 'nb').wideArt, false, 'ukeplan art slot is unchanged');
assert.doesNotMatch(heroSrc, /width:\s*'64%'/, 'phone wide art is not a 64% absolute crop');
assert.doesNotMatch(heroSrc, /objectFit:\s*'cover'/, 'hero art stays contain, not cover');
assert.match(heroSrc, /artWrapPhone:\s*\{[^}]*maxWidth:\s*'54%'/, 'phone art shrinks inside the short heading');
assert.match(heroSrc, /artWrapTablet:\s*\{[^}]*maxWidth:\s*'50%'/, 'tablet art scales to the heading height');
assert.match(heroSrc, /artWrapDesk:\s*\{[^}]*maxWidth:\s*'50%'/, 'desktop art scales to the heading height');
assert.match(heroSrc, /artFit:[\s\S]*objectFit:\s*'contain'/, 'heading art keeps its full picture');
assert.doesNotMatch(heroSrc, /artWrapPhone:\s*\{[^}]*position:\s*'absolute'/, 'phone art stays in the row');
assert.match(heroSrc, /phone: isPhone/, 'phone can use the tighter illustration');
assert.equal(shellHeroModuleId('arbeid', null), 'arbeid-timeliste');
assert.equal(shellHeroModuleId('home'), null, 'home stays without a module heading');

const projectFile = 'prosjekt--module-activation-illustration.webp';
const projectBundled = join(ROOT, 'assets/module-activation', projectFile);
const projectPublic = join(ROOT, 'public/assets/module-activation', projectFile);
assert.equal(existsSync(projectBundled), true, 'project overview bundled art');
assert.equal(existsSync(projectPublic), true, 'project overview public art');
assert.equal(
  createHash('sha256').update(readFileSync(projectBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(projectPublic)).digest('hex'),
  'project overview bundled != public',
);
assert.match(assetsSrc, /projects: require\('\.\.\/\.\.\/assets\/module-activation\/prosjekt--module-activation-illustration\.webp'\)/);
const ansatteFile = 'ansatte--module-activation-illustration.webp';
const ansatteBundled = join(ROOT, 'assets/module-activation', ansatteFile);
const ansattePublic = join(ROOT, 'public/assets/module-activation', ansatteFile);
assert.equal(existsSync(ansatteBundled), true, 'ansatte bundled art');
assert.equal(existsSync(ansattePublic), true, 'ansatte public art');
assert.equal(
  createHash('sha256').update(readFileSync(ansatteBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(ansattePublic)).digest('hex'),
  'ansatte bundled != public',
);
assert.match(assetsSrc, /ansatte: require\('\.\.\/\.\.\/assets\/module-activation\/ansatte--module-activation-illustration\.webp'\)/);
const kunderFile = 'kunder--module-activation-illustration.webp';
const kunderBundled = join(ROOT, 'assets/module-activation', kunderFile);
const kunderPublic = join(ROOT, 'public/assets/module-activation', kunderFile);
assert.equal(existsSync(kunderBundled), true, 'kunder bundled art');
assert.equal(existsSync(kunderPublic), true, 'kunder public art');
assert.equal(
  createHash('sha256').update(readFileSync(kunderBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kunderPublic)).digest('hex'),
  'kunder bundled != public',
);
assert.match(assetsSrc, /kunder: require\('\.\.\/\.\.\/assets\/module-activation\/kunder--module-activation-illustration\.webp'\)/);
const anbudFile = 'anbud-varsling--module-activation-illustration.webp';
const anbudBundled = join(ROOT, 'assets/module-activation', anbudFile);
const anbudPublic = join(ROOT, 'public/assets/module-activation', anbudFile);
assert.equal(existsSync(anbudBundled), true, 'anbud bundled art');
assert.equal(existsSync(anbudPublic), true, 'anbud public art');
assert.equal(
  createHash('sha256').update(readFileSync(anbudBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(anbudPublic)).digest('hex'),
  'anbud bundled != public',
);
assert.match(assetsSrc, /'anbud-varsling': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-varsling--module-activation-illustration\.webp'\)/);
const tilbudFile = 'anbud-tilbud--module-activation-illustration.webp';
const tilbudBundled = join(ROOT, 'assets/module-activation', tilbudFile);
const tilbudPublic = join(ROOT, 'public/assets/module-activation', tilbudFile);
assert.equal(existsSync(tilbudBundled), true, 'tilbud bundled art');
assert.equal(existsSync(tilbudPublic), true, 'tilbud public art');
assert.equal(
  createHash('sha256').update(readFileSync(tilbudBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(tilbudPublic)).digest('hex'),
  'tilbud bundled != public',
);
assert.match(assetsSrc, /'anbud-tilbud': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-tilbud--module-activation-illustration\.webp'\)/);
const vurderingFile = 'anbud-vurdering--module-activation-illustration.webp';
const vurderingBundled = join(ROOT, 'assets/module-activation', vurderingFile);
const vurderingPublic = join(ROOT, 'public/assets/module-activation', vurderingFile);
assert.equal(existsSync(vurderingBundled), true, 'vurdering bundled art');
assert.equal(existsSync(vurderingPublic), true, 'vurdering public art');
assert.equal(
  createHash('sha256').update(readFileSync(vurderingBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(vurderingPublic)).digest('hex'),
  'vurdering bundled != public',
);
assert.match(assetsSrc, /'anbud-vurdering': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-vurdering--module-activation-illustration\.webp'\)/);
const foresporselFile = 'anbud-foresporsel--module-activation-illustration.webp';
const foresporselBundled = join(ROOT, 'assets/module-activation', foresporselFile);
const foresporselPublic = join(ROOT, 'public/assets/module-activation', foresporselFile);
assert.equal(existsSync(foresporselBundled), true, 'foresporsel bundled art');
assert.equal(existsSync(foresporselPublic), true, 'foresporsel public art');
assert.equal(
  createHash('sha256').update(readFileSync(foresporselBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(foresporselPublic)).digest('hex'),
  'foresporsel bundled != public',
);
assert.match(assetsSrc, /'anbud-foresporsel': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-foresporsel--module-activation-illustration\.webp'\)/);
const kontraktFile = 'kontrakt--module-activation-illustration.webp';
const kontraktBundled = join(ROOT, 'assets/module-activation', kontraktFile);
const kontraktPublic = join(ROOT, 'public/assets/module-activation', kontraktFile);
assert.equal(existsSync(kontraktBundled), true, 'kontrakt bundled art');
assert.equal(existsSync(kontraktPublic), true, 'kontrakt public art');
assert.equal(
  createHash('sha256').update(readFileSync(kontraktBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kontraktPublic)).digest('hex'),
  'kontrakt bundled != public',
);
assert.match(assetsSrc, /kontrakt: require\('\.\.\/\.\.\/assets\/module-activation\/kontrakt--module-activation-illustration\.webp'\)/);
const skjemaFile = 'skjema--module-activation-illustration.webp';
const skjemaBundled = join(ROOT, 'assets/module-activation', skjemaFile);
const skjemaPublic = join(ROOT, 'public/assets/module-activation', skjemaFile);
assert.equal(existsSync(skjemaBundled), true, 'skjema bundled art');
assert.equal(existsSync(skjemaPublic), true, 'skjema public art');
assert.equal(
  createHash('sha256').update(readFileSync(skjemaBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(skjemaPublic)).digest('hex'),
  'skjema bundled != public',
);
assert.match(assetsSrc, /skjema: require\('\.\.\/\.\.\/assets\/module-activation\/skjema--module-activation-illustration\.webp'\)/);
const timelisteFile = 'timeliste--module-activation-illustration.webp';
const timelisteBundled = join(ROOT, 'assets/module-activation', timelisteFile);
const timelistePublic = join(ROOT, 'public/assets/module-activation', timelisteFile);
assert.equal(existsSync(timelisteBundled), true, 'timeliste bundled art');
assert.equal(existsSync(timelistePublic), true, 'timeliste public art');
assert.equal(
  createHash('sha256').update(readFileSync(timelisteBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(timelistePublic)).digest('hex'),
  'timeliste bundled != public',
);
assert.match(assetsSrc, /timeliste: require\('\.\.\/\.\.\/assets\/module-activation\/timeliste--module-activation-illustration\.webp'\)/);
assert.match(assetsSrc, /'arbeid-timeliste': require\('\.\.\/\.\.\/assets\/module-activation\/timeliste--module-activation-illustration\.webp'\)/);
for (const file of [
  'arbeid-timerapport--module-activation-illustration.webp',
  'arbeid-timesaldo--module-activation-illustration.webp',
  'arbeid-fravaer--module-activation-illustration.webp',
  'arbeid-fravaersrapport--module-activation-illustration.webp',
]) {
  const bundled = join(ROOT, 'assets/module-activation', file);
  const published = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(existsSync(bundled), true, `${file} bundled`);
  assert.equal(existsSync(published), true, `${file} public`);
  assert.equal(
    createHash('sha256').update(readFileSync(bundled)).digest('hex'),
    createHash('sha256').update(readFileSync(published)).digest('hex'),
    `${file} bundled != public`,
  );
}
assert.match(assetsSrc, /'arbeid-timerapport': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-timerapport--module-activation-illustration\.webp'\)/);
assert.match(assetsSrc, /'arbeid-timesaldo': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-timesaldo--module-activation-illustration\.webp'\)/);
assert.match(assetsSrc, /'arbeid-fravaer': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaer--module-activation-illustration\.webp'\)/);
assert.match(assetsSrc, /'arbeid-fravaersrapport': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaersrapport--module-activation-illustration\.webp'\)/);
const utleggFile = 'arbeid-utlegg--module-activation-illustration.webp';
const utleggBundled = join(ROOT, 'assets/module-activation', utleggFile);
const utleggPublic = join(ROOT, 'public/assets/module-activation', utleggFile);
assert.equal(existsSync(utleggBundled), true, 'utlegg bundled art');
assert.equal(existsSync(utleggPublic), true, 'utlegg public art');
assert.equal(
  createHash('sha256').update(readFileSync(utleggBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(utleggPublic)).digest('hex'),
  'utlegg bundled != public',
);
assert.match(assetsSrc, /'arbeid-utlegg': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-utlegg--module-activation-illustration\.webp'\)/);
for (const file of [
  'arbeid-salg--module-activation-illustration.webp',
  'okonomi-produkter--module-activation-illustration.webp',
]) {
  const bundled = join(ROOT, 'assets/module-activation', file);
  const published = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(existsSync(bundled), true, `${file} bundled`);
  assert.equal(existsSync(published), true, `${file} public`);
  assert.equal(
    createHash('sha256').update(readFileSync(bundled)).digest('hex'),
    createHash('sha256').update(readFileSync(published)).digest('hex'),
    `${file} bundled != public`,
  );
}
assert.match(assetsSrc, /'arbeid-salg': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-salg--module-activation-illustration\.webp'\)/);
assert.match(assetsSrc, /'okonomi-produkter': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-produkter--module-activation-illustration\.webp'\)/);
const godkjenningFile = 'arbeid-godkjenning--module-activation-illustration.webp';
const godkjenningBundled = join(ROOT, 'assets/module-activation', godkjenningFile);
const godkjenningPublic = join(ROOT, 'public/assets/module-activation', godkjenningFile);
assert.equal(existsSync(godkjenningBundled), true, 'godkjenning bundled art');
assert.equal(existsSync(godkjenningPublic), true, 'godkjenning public art');
assert.equal(
  createHash('sha256').update(readFileSync(godkjenningBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(godkjenningPublic)).digest('hex'),
  'godkjenning bundled != public',
);
assert.match(assetsSrc, /'arbeid-godkjenning': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-godkjenning--module-activation-illustration\.webp'\)/);
const isoFile = 'iso--module-activation-illustration.webp';
const isoBundled = join(ROOT, 'assets/module-activation', isoFile);
const isoPublic = join(ROOT, 'public/assets/module-activation', isoFile);
assert.equal(existsSync(isoBundled), true, 'iso bundled art');
assert.equal(existsSync(isoPublic), true, 'iso public art');
assert.equal(
  createHash('sha256').update(readFileSync(isoBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(isoPublic)).digest('hex'),
  'iso bundled != public',
);
assert.match(assetsSrc, /iso: require\('\.\.\/\.\.\/assets\/module-activation\/iso--module-activation-illustration\.webp'\)/);
for (const hrId of ['hr-oversikt', 'hr-personell', 'hr-avtaler', 'hr-produktivitet', 'hr-lonn', 'hr-oppfolging', 'hr-compliance', 'hr-rekruttering']) {
  const hrFile = `${hrId}--module-activation-illustration.webp`;
  const hrBundled = join(ROOT, 'assets/module-activation', hrFile);
  const hrPublic = join(ROOT, 'public/assets/module-activation', hrFile);
  assert.equal(existsSync(hrBundled), true, `${hrId} bundled art`);
  assert.equal(existsSync(hrPublic), true, `${hrId} public art`);
  assert.equal(
    createHash('sha256').update(readFileSync(hrBundled)).digest('hex'),
    createHash('sha256').update(readFileSync(hrPublic)).digest('hex'),
    `${hrId} bundled != public`,
  );
  assert.match(assetsSrc, new RegExp(`'${hrId}': require\\('\\.\\./\\.\\./assets/module-activation/${hrFile.replace(/\./g, '\\.')}'\\)`));
  // Avtaler, Lønn og Lovpålagt er samlet i Personell og har ikke eget bånd lenger.
  if (!['hr-produktivitet', 'hr-avtaler', 'hr-lonn', 'hr-compliance'].includes(hrId)) {
    assert.equal(resolveModuleHero(hrId, 'nb').wideArt, true, `${hrId} uses the illustration`);
  }
}
assert.match(assetsSrc, /'arbeid-produktivitet': require\('\.\.\/\.\.\/assets\/module-activation\/hr-produktivitet--module-activation-illustration\.webp'\)/);
const fakturaFile = 'okonomi-faktura--module-activation-illustration.webp';
const fakturaBundled = join(ROOT, 'assets/module-activation', fakturaFile);
const fakturaPublic = join(ROOT, 'public/assets/module-activation', fakturaFile);
assert.equal(existsSync(fakturaBundled), true, 'faktura bundled art');
assert.equal(existsSync(fakturaPublic), true, 'faktura public art');
assert.equal(
  createHash('sha256').update(readFileSync(fakturaBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(fakturaPublic)).digest('hex'),
  'faktura bundled != public',
);
assert.match(assetsSrc, /'okonomi-faktura': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-faktura--module-activation-illustration\.webp'\)/);
const kjorebokFile = 'okonomi-kjorebok--module-activation-illustration.webp';
const kjorebokBundled = join(ROOT, 'assets/module-activation', kjorebokFile);
const kjorebokPublic = join(ROOT, 'public/assets/module-activation', kjorebokFile);
assert.equal(existsSync(kjorebokBundled), true, 'kjorebok bundled art');
assert.equal(existsSync(kjorebokPublic), true, 'kjorebok public art');
assert.equal(
  createHash('sha256').update(readFileSync(kjorebokBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kjorebokPublic)).digest('hex'),
  'kjorebok bundled != public',
);
assert.match(assetsSrc, /'okonomi-kjorebok': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-kjorebok--module-activation-illustration\.webp'\)/);
const indeksFile = 'okonomi-indeks--module-activation-illustration.webp';
const indeksBundled = join(ROOT, 'assets/module-activation', indeksFile);
const indeksPublic = join(ROOT, 'public/assets/module-activation', indeksFile);
assert.equal(existsSync(indeksBundled), true, 'indeks bundled art');
assert.equal(existsSync(indeksPublic), true, 'indeks public art');
assert.equal(
  createHash('sha256').update(readFileSync(indeksBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(indeksPublic)).digest('hex'),
  'indeks bundled != public',
);
assert.match(assetsSrc, /'okonomi-indeks': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-indeks--module-activation-illustration\.webp'\)/);
const grunnlagFile = 'okonomi-fakturagrunnlag--module-activation-illustration.webp';
const grunnlagBundled = join(ROOT, 'assets/module-activation', grunnlagFile);
const grunnlagPublic = join(ROOT, 'public/assets/module-activation', grunnlagFile);
assert.equal(existsSync(grunnlagBundled), true, 'fakturagrunnlag bundled art');
assert.equal(existsSync(grunnlagPublic), true, 'fakturagrunnlag public art');
assert.equal(
  createHash('sha256').update(readFileSync(grunnlagBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(grunnlagPublic)).digest('hex'),
  'fakturagrunnlag bundled != public',
);
assert.match(assetsSrc, /'okonomi-fakturagrunnlag': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-fakturagrunnlag--module-activation-illustration\.webp'\)/);
const oversiktFile = 'okonomi-oversikt--module-activation-illustration.webp';
const oversiktBundled = join(ROOT, 'assets/module-activation', oversiktFile);
const oversiktPublic = join(ROOT, 'public/assets/module-activation', oversiktFile);
assert.equal(existsSync(oversiktBundled), true, 'oversikt bundled art');
assert.equal(existsSync(oversiktPublic), true, 'oversikt public art');
assert.equal(
  createHash('sha256').update(readFileSync(oversiktBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(oversiktPublic)).digest('hex'),
  'oversikt bundled != public',
);
assert.match(assetsSrc, /'okonomi-oversikt': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-oversikt--module-activation-illustration\.webp'\)/);
const utleggOkonomiFile = 'okonomi-utlegg--module-activation-illustration.webp';
const utleggOkonomiBundled = join(ROOT, 'assets/module-activation', utleggOkonomiFile);
const utleggOkonomiPublic = join(ROOT, 'public/assets/module-activation', utleggOkonomiFile);
assert.equal(existsSync(utleggOkonomiBundled), true, 'okonomi utlegg bundled art');
assert.equal(existsSync(utleggOkonomiPublic), true, 'okonomi utlegg public art');
assert.equal(
  createHash('sha256').update(readFileSync(utleggOkonomiBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(utleggOkonomiPublic)).digest('hex'),
  'okonomi utlegg bundled != public',
);
assert.match(assetsSrc, /'okonomi-utlegg': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-utlegg--module-activation-illustration\.webp'\)/);
const selskapFile = 'selskap--module-activation-illustration.webp';
const selskapBundled = join(ROOT, 'assets/module-activation', selskapFile);
const selskapPublic = join(ROOT, 'public/assets/module-activation', selskapFile);
assert.equal(existsSync(selskapBundled), true, 'selskap bundled art');
assert.equal(existsSync(selskapPublic), true, 'selskap public art');
assert.equal(
  createHash('sha256').update(readFileSync(selskapBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(selskapPublic)).digest('hex'),
  'selskap bundled != public',
);
assert.match(assetsSrc, /selskap: require\('\.\.\/\.\.\/assets\/module-activation\/selskap--module-activation-illustration\.webp'\)/);
for (const [id, file] of [
  ['underenheter', 'underenheter--module-activation-illustration.webp'],
  ['selskap-tilgang', 'selskap-tilgang--module-activation-illustration.webp'],
  ['friends', 'venner--module-activation-illustration.webp'],
  ['plan', 'kalender--module-activation-illustration.webp'],
  ['mail', 'e-post--module-activation-illustration.webp'],
  ['stars', 'oppgaver--module-activation-illustration.webp'],
  ['notes', 'notat--module-activation-illustration.webp'],
]) {
  const bundled = join(ROOT, 'assets/module-activation', file);
  const published = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(existsSync(bundled), true, `${file} bundled`);
  assert.equal(existsSync(published), true, `${file} public`);
  assert.equal(
    createHash('sha256').update(readFileSync(bundled)).digest('hex'),
    createHash('sha256').update(readFileSync(published)).digest('hex'),
    `${file} bundled != public`,
  );
  const key = /^[A-Za-z_$][\w$]*$/.test(id) ? id : `'${id}'`;
  assert.match(
    assetsSrc,
    new RegExp(`${key}: require\\('\\.\\.\\/\\.\\.\\/assets\\/module-activation\\/${file.replace(/[.]/g, '\\.')}'\\)`),
    `${id} require`,
  );
}
for (const file of [
  'okonomi-faktura-phone--module-activation-illustration.webp',
  'arbeid-godkjenning-phone--module-activation-illustration.webp',
  'okonomi-produkter-phone--module-activation-illustration.webp',
  'okonomi-utlegg-phone--module-activation-illustration.webp',
  'arbeid-fravaer-phone--module-activation-illustration.webp',
  'timeliste-phone--module-activation-illustration.webp',
  'moter-phone--module-activation-illustration.webp',
]) {
  const bundled = join(ROOT, 'assets/module-activation', file);
  const published = join(ROOT, 'public/assets/module-activation', file);
  assert.equal(existsSync(bundled), true, `${file} bundled`);
  assert.equal(existsSync(published), true, `${file} public`);
  assert.equal(
    createHash('sha256').update(readFileSync(bundled)).digest('hex'),
    createHash('sha256').update(readFileSync(published)).digest('hex'),
    `${file} bundled != public`,
  );
  assert.match(assetsSrc, new RegExp(file.replace(/[.]/g, '\\.')), `${file} is bundled for the phone slot`);
}
assert.match(heroSrc, /ART_INSET/, 'every heading picture uses the same 2mm inset');

console.log(`moduleHero.test.mjs: ok (${MOCKUP_IDS.length} mockup modules, ${COMPANY_PAGES.length} company pages)`);
