/**
 * Shared module heading: copy, colors, illustration wiring, phone/tablet/web.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_ART_SCALE } from '../appearance/pageArtScale.js';
import { MODULE_HERO, phoneChromeHeroId, resolveModuleHero, shellHeroModuleId } from './moduleHero.js';
import { COMPANY_HERO, companyHeroId } from './companyHero.js';
import {
  ACTIVATABLE_MODULE_IDS,
  getModuleConfig,
  ILLUSTRATION_FILES,
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
assert.match(assetsSrc, /matcoach: require\('\.\.\/\.\.\/assets\/module-activation\/ai-matcoach--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /matcoach: 'matcoach'/);
assert.match(assetsSrc, /location: 'location'/);
assert.match(assetsSrc, /scratchMap: 'scratchMap'/);

for (const id of ACTIVATABLE_MODULE_IDS) {
  const hero = resolveModuleHero(id, 'nb');
  assert.ok(hero.title, `${id} catalog fallback title`);
  assert.ok(hero.bg, `${id} palette`);
  assert.ok(ILLUSTRATION_FILES[id], `${id} illustration filename`);
}

const matcoachFile = 'ai-matcoach--module-activation-illustration.png';
const bundled = join(ROOT, 'assets/module-activation', matcoachFile);
const published = join(ROOT, 'public/assets/module-activation', matcoachFile);
assert.equal(existsSync(bundled), true, 'matcoach bundled art');
assert.equal(existsSync(published), true, 'matcoach public art');
assert.equal(
  createHash('sha256').update(readFileSync(bundled)).digest('hex'),
  createHash('sha256').update(readFileSync(published)).digest('hex'),
  'matcoach bundled != public',
);

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
assert.match(headerSrc, /styles\.heroBelowRow/, 'help sits in a tight row under the band');
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
  /heroTitleRight:[\s\S]*bottom:\s*\d+/,
  'add overlays the bottom of the pastel band',
);
assert.doesNotMatch(
  headerSrc,
  /heroTitleRight:[\s\S]*top:\s*0/,
  'add is not a detached title row at the top of the band',
);
assert.match(headerSrc, /justifyContent: 'flex-end'/, 'help aligns to the right under the band');
assert.doesNotMatch(headerSrc, /familyNameHero/, 'family name is not painted on top of the band');
assert.doesNotMatch(headerSrc, /styles\.pageTitleRow[\s\S]*nativeID="module-hero-slot"/, 'hero is not a detached card below the title row');

const drawingsSrc = readFileSync(join(ROOT, 'screens/v2/ChildDrawingsHubScreen.jsx'), 'utf8');
assert.match(drawingsSrc, /ModulePageFrame name="childDrawings"/, 'Barnetegninger uses the shared page frame');
assert.match(drawingsSrc, /useShellTitleRight/, 'Barnetegninger registers + Ny tegning in the shell');
assert.doesNotMatch(drawingsSrc, /<ModuleHero /, 'Barnetegninger must not draw its own heading card');

const datesSrc = readFileSync(join(ROOT, 'screens/v2/RememberDatesHubScreen.jsx'), 'utf8');
assert.match(datesSrc, /ModulePageFrame name="remember-dates"/, 'Husk dato uses the shared page frame');
assert.match(datesSrc, /useShellTitleRight/, 'Husk dato registers + Ny dato in the shell title row');
assert.doesNotMatch(datesSrc, /<ModuleHero /, 'Husk dato must not draw its own heading card');

const schoolSrc = readFileSync(join(ROOT, 'components/SchoolPageLayout.jsx'), 'utf8');
assert.match(schoolSrc, /force/, 'SchoolPageLayout still opts into ModuleHero on stack screens');
assert.match(schoolSrc, /flush/, 'SchoolPageLayout still uses flush heading');
assert.match(schoolSrc, /heroHosted/, 'SchoolPageLayout skips its own heading when the shell already drew one');
assert.doesNotMatch(schoolSrc, /const TABS =/, 'school apps no longer render the in-page tab menu');
assert.doesNotMatch(schoolSrc, /For \$\{firstName\}/, 'school apps no longer show the For-name context line');
assert.match(schoolSrc, /showBack = typeof onBack === 'function'/, 'only an explicit onBack keeps a back link');
assert.doesNotMatch(schoolSrc, /backLabel:\s*'Hjem'/, 'school hub no longer shows a Hjem back link');

const asideSrc = readFileSync(join(ROOT, 'components/ModuleAside.jsx'), 'utf8');
assert.match(asideSrc, /Tips for /, 'tips card kicker must name the module');
assert.match(asideSrc, /Åpne veiledning/, 'tips card still opens the help tour');
assert.match(asideSrc, /moduleHeroName/, 'tips title uses the same module name as the heading');

const helpBtn = readFileSync(join(ROOT, 'components/HelpButton.jsx'), 'utf8');
assert.match(helpBtn, /openModuleHelp/, 'header lightbulb still opens module help');
assert.match(helpBtn, /HelpTarget id="helpBtn"/, 'help tour still anchors on the bulb');

const heroSrc = readFileSync(join(ROOT, 'components/ModuleHero.jsx'), 'utf8');
assert.doesNotMatch(heroSrc, /if \(!force && isPhone\) return null/, 'phone must render ModuleHero, not skip it');
assert.match(heroSrc, /isPhone \? 144/, 'phone heading stays compact (shorter than tablet)');
assert.match(heroSrc, /artWrapPhone/, 'phone heading uses a narrower art wrap so copy still fits');
assert.match(heroSrc, /objectFit: 'contain'/, 'hero art is sized with contain before the shared scale');
assert.match(heroSrc, /PAGE_ART_SCALE/, 'hero art uses the shared 40% page scale');
assert.match(heroSrc, /transformOrigin: 'right center'/, 'scaled art grows inward so the band can crop the edges');
assert.equal(PAGE_ART_SCALE, 1.4, 'page illustrations are 40% larger');
assert.match(heroSrc, /artWrap: \{[\s\S]*?overflow: 'hidden'/, 'art wrap crops the enlarged illustration');
const welcomeSrc = readFileSync(join(ROOT, 'components/ModuleWelcomeModal.jsx'), 'utf8');
assert.match(welcomeSrc, /PAGE_ART_SCALE/, 'welcome art uses the same 40% scale');
assert.match(welcomeSrc, /artFrame:[\s\S]*overflow: 'hidden'/, 'welcome art can crop inside its frame');
assert.match(frameSrc, /PAGE_ART_SCALE/, 'bottom page art uses the same 40% scale');
assert.match(heroSrc, /paddingRight: 18/, 'hero art needs inset so rounded corners do not clip it');
assert.match(heroSrc, /paddingBottom: 10/, 'hero art needs bottom inset so the band radius does not clip it');
assert.match(heroSrc, /width: 360/, 'desktop hero art should be large enough to match other module headings');
assert.match(heroSrc, /resizeMode="contain"/, 'native hero art uses contain');
assert.match(heroSrc, /moduleId === 'familyTree'/, 'familyTree uses a larger square art wrap');
assert.match(heroSrc, /artWrapSquare/, 'familyTree heading art is enlarged');
assert.match(heroSrc, /force = false/, 'force prop remains for SchoolPageLayout and similar stack screens');
assert.match(heroSrc, /flush = false/, 'flush prop remains for shell/school bands');
assert.match(heroSrc, /chrome = false/, 'chrome prop flattens the phone band into the header');
assert.match(heroSrc, /heroChromePhone/, 'phone chrome band flattens top radius and sits in the header');
assert.match(heroSrc, /borderTopLeftRadius: 0/, 'phone chrome band has no top radius');
assert.match(heroSrc, /copyPhoneChrome/, 'phone chrome copy stays compact in the title slot');
assert.match(heroSrc, /artWrapPhoneChrome/, 'phone chrome art stays in the title\/add-button row');

const shopSrc = readFileSync(join(ROOT, 'screens/v2/ShoppingListScreen.jsx'), 'utf8');
assert.match(shopSrc, /useShowModuleHero/, 'shopping list reads the shared heading flag');
assert.match(shopSrc, /!showPageHero/, 'shopping list bottom art is suppressed when the heading shows');
assert.ok(MODULE_HERO.matcoach.title.nb.includes('Ukeplanen'));
assert.ok(MODULE_HERO.stars.title.nb.includes('oversikt'));

const matcoachCopy = localizeIntro(getModuleIntro('family', 'matcoach'), 'nb');
const matcoachHelp = buildHelpWelcomeModule({
  scope: 'family',
  moduleId: 'matcoach',
  copy: matcoachCopy,
});
assert.ok(matcoachHelp);
assert.match(matcoachHelp.illustrationPath, /ai-matcoach--module-activation-illustration\.png\?v=/);
assert.equal(getModuleConfig('matcoach'), null, 'matcoach stays ungated');

const familyTreeFile = 'familietreet--module-activation-illustration.png';
const familyTreeBundled = join(ROOT, 'assets/module-activation', familyTreeFile);
const familyTreePublic = join(ROOT, 'public/assets/module-activation', familyTreeFile);
assert.equal(existsSync(familyTreeBundled), true, 'familyTree bundled art');
assert.equal(existsSync(familyTreePublic), true, 'familyTree public art');
assert.equal(
  createHash('sha256').update(readFileSync(familyTreeBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(familyTreePublic)).digest('hex'),
  'familyTree bundled != public',
);
assert.match(assetsSrc, /familyTree: require\('\.\.\/\.\.\/assets\/module-activation\/familietreet--module-activation-illustration\.png'\)/);
const familyTreeHelp = buildHelpWelcomeModule({
  scope: 'family',
  moduleId: 'familyTree',
  copy: localizeIntro(getModuleIntro('family', 'familyTree'), 'nb'),
});
assert.ok(familyTreeHelp);
assert.match(familyTreeHelp.illustrationPath, /familietreet--module-activation-illustration\.png\?v=/);

const COMPANY_PAGES = [
  ['projects', null, 'projects'],
  ['ansatte', null, 'ansatte'],
  ['kunder', null, 'kunder'],
  ['kontrakt', null, 'kontrakt'],
  ['skjema', null, 'skjema'],
  ['iso', null, 'iso'],
  ['timeliste', null, 'timeliste'],
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
  ['arbeid', 'utlegg', 'arbeid-utlegg'],
  ['arbeid', 'salg', 'arbeid-salg'],
  ['arbeid', 'godkjenning', 'arbeid-godkjenning'],
  ['okonomi', 'oversikt', 'okonomi-oversikt'],
  ['okonomi', 'kunder', 'okonomi-kunder'],
  ['okonomi', 'avtaler', 'okonomi-avtaler'],
  ['okonomi', 'faktura', 'okonomi-faktura'],
  ['okonomi', 'fakturagrunnlag', 'okonomi-fakturagrunnlag'],
  ['okonomi', 'utlegg', 'okonomi-utlegg'],
  ['okonomi', 'kjorebok', 'okonomi-kjorebok'],
  ['okonomi', 'produkter', 'okonomi-produkter'],
  ['okonomi', 'indeks', 'okonomi-indeks'],
];
for (const [tab, sub, id] of COMPANY_PAGES) {
  assert.equal(companyHeroId(tab, sub), id, `${tab}/${sub || ''}`);
  assert.equal(shellHeroModuleId(tab, sub), id, `${id} shell heading`);
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
assert.equal(resolveModuleHero('arbeid-utlegg', 'nb').wideArt, true, 'project expenses use the wide illustration');
assert.equal(resolveModuleHero('arbeid-salg', 'nb').wideArt, true, 'product sales use the wide illustration');
assert.equal(resolveModuleHero('okonomi-produkter', 'nb').wideArt, true, 'products use the wide illustration');
assert.equal(resolveModuleHero('arbeid-godkjenning', 'nb').wideArt, true, 'approvals use the wide illustration');
assert.equal(resolveModuleHero('iso', 'nb').wideArt, true, 'iso uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-faktura', 'nb').wideArt, true, 'invoices use the wide illustration');
assert.equal(resolveModuleHero('okonomi-kjorebok', 'nb').wideArt, true, 'mileage log uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-indeks', 'nb').wideArt, true, 'index adjustment uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-fakturagrunnlag', 'nb').wideArt, true, 'billing basis uses the wide illustration');
assert.equal(resolveModuleHero('okonomi-oversikt', 'nb').wideArt, true, 'finance overview uses the wide illustration');
assert.equal(resolveModuleHero('selskap', 'nb').wideArt, true, 'company profile uses the wide illustration');
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
const TEXT_ONLY_PASTEL = {
  underenheter: ['#e8eef6', '#f7f9fc', '#1d4ed8'],
  'anbud-foresporsel': ['#E5F6FE', '#f7fbff', '#1099F4'],
  'anbud-vurdering': ['#E5F6FE', '#f7fbff', '#1099F4'],
  'arbeid-timerapport': ['#e6f5fb', '#f4fbfe', '#0284c7'],
  'arbeid-timesaldo': ['#e6f5fb', '#f4fbfe', '#0284c7'],
  'arbeid-planlagt': ['#f4efe6', '#fbf8f2', '#b45309'],
  'okonomi-kunder': ['#e7f7ee', '#f5fcf8', '#15803d'],
  'okonomi-avtaler': ['#e7f7ee', '#f5fcf8', '#15803d'],
};
for (const id of Object.keys(COMPANY_HERO)) {
  const band = resolveModuleHero(id, 'nb');
  assert.equal(band.ink, '', `${id} keeps dark text on the pastel band`);
  assert.equal(band.muted, '', `${id} keeps the default muted pitch`);
  assert.notEqual(band.bg, '#1B2026', `${id} is not anthracite`);
  const pastel = TEXT_ONLY_PASTEL[id] || ['#E5F6FE', '#f7fbff', '#1099F4'];
  assert.equal(band.bg, pastel[0], `${id} pastel bg`);
  assert.equal(band.bg2, pastel[1], `${id} pastel bg2`);
  assert.equal(band.accent, pastel[2], `${id} pastel accent`);
}
assert.equal(resolveModuleHero('okonomi-utlegg', 'nb').wideArt, true, 'economy expenses use the illustration');
assert.equal(resolveModuleHero('week-plan', 'nb').bg, '#f4efe6', 'weekplan palette stays sand');
assert.equal(resolveModuleHero('week-plan', 'nb').wideArt, false, 'weekplan art slot is unchanged');
assert.doesNotMatch(heroSrc, /width:\s*'64%'/, 'phone wide art is not a 64% absolute crop');
assert.doesNotMatch(heroSrc, /objectFit:\s*'cover'/, 'hero art stays contain, not cover');
assert.match(heroSrc, /artWrapWidePhone:\s*\{[^}]*width:\s*218/, 'phone wide art keeps the enlarged size without a side crop');
assert.match(heroSrc, /artWrapWideTablet:\s*\{[^}]*width:\s*406/, 'tablet wide art keeps the enlarged size without a side crop');
assert.match(heroSrc, /artWrapWideDesk:\s*\{[^}]*width:\s*504/, 'desktop wide art keeps the enlarged size without a side crop');
assert.match(heroSrc, /artWide:[\s\S]*transform:\s*'none'/, 'wide art is not scaled past its own width');
assert.match(heroSrc, /artWide:[\s\S]*objectFit:\s*'contain'/, 'wide art keeps its full width inside the slot');
assert.doesNotMatch(heroSrc, /artWrapWidePhone:\s*\{[^}]*position:\s*'absolute'/, 'wide art stays in the row');
assert.match(heroSrc, /phone: isPhone/, 'phone can use the tighter illustration');
assert.equal(shellHeroModuleId('arbeid', null), 'arbeid-timeliste');
assert.equal(shellHeroModuleId('home'), null, 'home stays without a module heading');

const projectFile = 'prosjekt--module-activation-illustration.png';
const projectBundled = join(ROOT, 'assets/module-activation', projectFile);
const projectPublic = join(ROOT, 'public/assets/module-activation', projectFile);
assert.equal(existsSync(projectBundled), true, 'project overview bundled art');
assert.equal(existsSync(projectPublic), true, 'project overview public art');
assert.equal(
  createHash('sha256').update(readFileSync(projectBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(projectPublic)).digest('hex'),
  'project overview bundled != public',
);
assert.match(assetsSrc, /projects: require\('\.\.\/\.\.\/assets\/module-activation\/prosjekt--module-activation-illustration\.png'\)/);
const ansatteFile = 'ansatte--module-activation-illustration.png';
const ansatteBundled = join(ROOT, 'assets/module-activation', ansatteFile);
const ansattePublic = join(ROOT, 'public/assets/module-activation', ansatteFile);
assert.equal(existsSync(ansatteBundled), true, 'ansatte bundled art');
assert.equal(existsSync(ansattePublic), true, 'ansatte public art');
assert.equal(
  createHash('sha256').update(readFileSync(ansatteBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(ansattePublic)).digest('hex'),
  'ansatte bundled != public',
);
assert.match(assetsSrc, /ansatte: require\('\.\.\/\.\.\/assets\/module-activation\/ansatte--module-activation-illustration\.png'\)/);
const kunderFile = 'kunder--module-activation-illustration.png';
const kunderBundled = join(ROOT, 'assets/module-activation', kunderFile);
const kunderPublic = join(ROOT, 'public/assets/module-activation', kunderFile);
assert.equal(existsSync(kunderBundled), true, 'kunder bundled art');
assert.equal(existsSync(kunderPublic), true, 'kunder public art');
assert.equal(
  createHash('sha256').update(readFileSync(kunderBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kunderPublic)).digest('hex'),
  'kunder bundled != public',
);
assert.match(assetsSrc, /kunder: require\('\.\.\/\.\.\/assets\/module-activation\/kunder--module-activation-illustration\.png'\)/);
const anbudFile = 'anbud-varsling--module-activation-illustration.png';
const anbudBundled = join(ROOT, 'assets/module-activation', anbudFile);
const anbudPublic = join(ROOT, 'public/assets/module-activation', anbudFile);
assert.equal(existsSync(anbudBundled), true, 'anbud bundled art');
assert.equal(existsSync(anbudPublic), true, 'anbud public art');
assert.equal(
  createHash('sha256').update(readFileSync(anbudBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(anbudPublic)).digest('hex'),
  'anbud bundled != public',
);
assert.match(assetsSrc, /'anbud-varsling': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-varsling--module-activation-illustration\.png'\)/);
const tilbudFile = 'anbud-tilbud--module-activation-illustration.png';
const tilbudBundled = join(ROOT, 'assets/module-activation', tilbudFile);
const tilbudPublic = join(ROOT, 'public/assets/module-activation', tilbudFile);
assert.equal(existsSync(tilbudBundled), true, 'tilbud bundled art');
assert.equal(existsSync(tilbudPublic), true, 'tilbud public art');
assert.equal(
  createHash('sha256').update(readFileSync(tilbudBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(tilbudPublic)).digest('hex'),
  'tilbud bundled != public',
);
assert.match(assetsSrc, /'anbud-tilbud': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-tilbud--module-activation-illustration\.png'\)/);
const vurderingFile = 'anbud-vurdering--module-activation-illustration.png';
const vurderingBundled = join(ROOT, 'assets/module-activation', vurderingFile);
const vurderingPublic = join(ROOT, 'public/assets/module-activation', vurderingFile);
assert.equal(existsSync(vurderingBundled), true, 'vurdering bundled art');
assert.equal(existsSync(vurderingPublic), true, 'vurdering public art');
assert.equal(
  createHash('sha256').update(readFileSync(vurderingBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(vurderingPublic)).digest('hex'),
  'vurdering bundled != public',
);
assert.match(assetsSrc, /'anbud-vurdering': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-vurdering--module-activation-illustration\.png'\)/);
const foresporselFile = 'anbud-foresporsel--module-activation-illustration.png';
const foresporselBundled = join(ROOT, 'assets/module-activation', foresporselFile);
const foresporselPublic = join(ROOT, 'public/assets/module-activation', foresporselFile);
assert.equal(existsSync(foresporselBundled), true, 'foresporsel bundled art');
assert.equal(existsSync(foresporselPublic), true, 'foresporsel public art');
assert.equal(
  createHash('sha256').update(readFileSync(foresporselBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(foresporselPublic)).digest('hex'),
  'foresporsel bundled != public',
);
assert.match(assetsSrc, /'anbud-foresporsel': require\('\.\.\/\.\.\/assets\/module-activation\/anbud-foresporsel--module-activation-illustration\.png'\)/);
const kontraktFile = 'kontrakt--module-activation-illustration.png';
const kontraktBundled = join(ROOT, 'assets/module-activation', kontraktFile);
const kontraktPublic = join(ROOT, 'public/assets/module-activation', kontraktFile);
assert.equal(existsSync(kontraktBundled), true, 'kontrakt bundled art');
assert.equal(existsSync(kontraktPublic), true, 'kontrakt public art');
assert.equal(
  createHash('sha256').update(readFileSync(kontraktBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kontraktPublic)).digest('hex'),
  'kontrakt bundled != public',
);
assert.match(assetsSrc, /kontrakt: require\('\.\.\/\.\.\/assets\/module-activation\/kontrakt--module-activation-illustration\.png'\)/);
const skjemaFile = 'skjema--module-activation-illustration.png';
const skjemaBundled = join(ROOT, 'assets/module-activation', skjemaFile);
const skjemaPublic = join(ROOT, 'public/assets/module-activation', skjemaFile);
assert.equal(existsSync(skjemaBundled), true, 'skjema bundled art');
assert.equal(existsSync(skjemaPublic), true, 'skjema public art');
assert.equal(
  createHash('sha256').update(readFileSync(skjemaBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(skjemaPublic)).digest('hex'),
  'skjema bundled != public',
);
assert.match(assetsSrc, /skjema: require\('\.\.\/\.\.\/assets\/module-activation\/skjema--module-activation-illustration\.png'\)/);
const timelisteFile = 'timeliste--module-activation-illustration.png';
const timelisteBundled = join(ROOT, 'assets/module-activation', timelisteFile);
const timelistePublic = join(ROOT, 'public/assets/module-activation', timelisteFile);
assert.equal(existsSync(timelisteBundled), true, 'timeliste bundled art');
assert.equal(existsSync(timelistePublic), true, 'timeliste public art');
assert.equal(
  createHash('sha256').update(readFileSync(timelisteBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(timelistePublic)).digest('hex'),
  'timeliste bundled != public',
);
assert.match(assetsSrc, /timeliste: require\('\.\.\/\.\.\/assets\/module-activation\/timeliste--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'arbeid-timeliste': require\('\.\.\/\.\.\/assets\/module-activation\/timeliste--module-activation-illustration\.png'\)/);
for (const file of [
  'arbeid-timerapport--module-activation-illustration.png',
  'arbeid-timesaldo--module-activation-illustration.png',
  'arbeid-fravaer--module-activation-illustration.png',
  'arbeid-fravaersrapport--module-activation-illustration.png',
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
assert.match(assetsSrc, /'arbeid-timerapport': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-timerapport--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'arbeid-timesaldo': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-timesaldo--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'arbeid-fravaer': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaer--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'arbeid-fravaersrapport': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaersrapport--module-activation-illustration\.png'\)/);
const utleggFile = 'arbeid-utlegg--module-activation-illustration.png';
const utleggBundled = join(ROOT, 'assets/module-activation', utleggFile);
const utleggPublic = join(ROOT, 'public/assets/module-activation', utleggFile);
assert.equal(existsSync(utleggBundled), true, 'utlegg bundled art');
assert.equal(existsSync(utleggPublic), true, 'utlegg public art');
assert.equal(
  createHash('sha256').update(readFileSync(utleggBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(utleggPublic)).digest('hex'),
  'utlegg bundled != public',
);
assert.match(assetsSrc, /'arbeid-utlegg': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-utlegg--module-activation-illustration\.png'\)/);
for (const file of [
  'arbeid-salg--module-activation-illustration.png',
  'okonomi-produkter--module-activation-illustration.png',
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
assert.match(assetsSrc, /'arbeid-salg': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-salg--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'okonomi-produkter': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-produkter--module-activation-illustration\.png'\)/);
const godkjenningFile = 'arbeid-godkjenning--module-activation-illustration.png';
const godkjenningBundled = join(ROOT, 'assets/module-activation', godkjenningFile);
const godkjenningPublic = join(ROOT, 'public/assets/module-activation', godkjenningFile);
assert.equal(existsSync(godkjenningBundled), true, 'godkjenning bundled art');
assert.equal(existsSync(godkjenningPublic), true, 'godkjenning public art');
assert.equal(
  createHash('sha256').update(readFileSync(godkjenningBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(godkjenningPublic)).digest('hex'),
  'godkjenning bundled != public',
);
assert.match(assetsSrc, /'arbeid-godkjenning': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-godkjenning--module-activation-illustration\.png'\)/);
const isoFile = 'iso--module-activation-illustration.png';
const isoBundled = join(ROOT, 'assets/module-activation', isoFile);
const isoPublic = join(ROOT, 'public/assets/module-activation', isoFile);
assert.equal(existsSync(isoBundled), true, 'iso bundled art');
assert.equal(existsSync(isoPublic), true, 'iso public art');
assert.equal(
  createHash('sha256').update(readFileSync(isoBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(isoPublic)).digest('hex'),
  'iso bundled != public',
);
assert.match(assetsSrc, /iso: require\('\.\.\/\.\.\/assets\/module-activation\/iso--module-activation-illustration\.png'\)/);
const fakturaFile = 'okonomi-faktura--module-activation-illustration.png';
const fakturaBundled = join(ROOT, 'assets/module-activation', fakturaFile);
const fakturaPublic = join(ROOT, 'public/assets/module-activation', fakturaFile);
assert.equal(existsSync(fakturaBundled), true, 'faktura bundled art');
assert.equal(existsSync(fakturaPublic), true, 'faktura public art');
assert.equal(
  createHash('sha256').update(readFileSync(fakturaBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(fakturaPublic)).digest('hex'),
  'faktura bundled != public',
);
assert.match(assetsSrc, /'okonomi-faktura': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-faktura--module-activation-illustration\.png'\)/);
const kjorebokFile = 'okonomi-kjorebok--module-activation-illustration.png';
const kjorebokBundled = join(ROOT, 'assets/module-activation', kjorebokFile);
const kjorebokPublic = join(ROOT, 'public/assets/module-activation', kjorebokFile);
assert.equal(existsSync(kjorebokBundled), true, 'kjorebok bundled art');
assert.equal(existsSync(kjorebokPublic), true, 'kjorebok public art');
assert.equal(
  createHash('sha256').update(readFileSync(kjorebokBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(kjorebokPublic)).digest('hex'),
  'kjorebok bundled != public',
);
assert.match(assetsSrc, /'okonomi-kjorebok': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-kjorebok--module-activation-illustration\.png'\)/);
const indeksFile = 'okonomi-indeks--module-activation-illustration.png';
const indeksBundled = join(ROOT, 'assets/module-activation', indeksFile);
const indeksPublic = join(ROOT, 'public/assets/module-activation', indeksFile);
assert.equal(existsSync(indeksBundled), true, 'indeks bundled art');
assert.equal(existsSync(indeksPublic), true, 'indeks public art');
assert.equal(
  createHash('sha256').update(readFileSync(indeksBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(indeksPublic)).digest('hex'),
  'indeks bundled != public',
);
assert.match(assetsSrc, /'okonomi-indeks': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-indeks--module-activation-illustration\.png'\)/);
const grunnlagFile = 'okonomi-fakturagrunnlag--module-activation-illustration.png';
const grunnlagBundled = join(ROOT, 'assets/module-activation', grunnlagFile);
const grunnlagPublic = join(ROOT, 'public/assets/module-activation', grunnlagFile);
assert.equal(existsSync(grunnlagBundled), true, 'fakturagrunnlag bundled art');
assert.equal(existsSync(grunnlagPublic), true, 'fakturagrunnlag public art');
assert.equal(
  createHash('sha256').update(readFileSync(grunnlagBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(grunnlagPublic)).digest('hex'),
  'fakturagrunnlag bundled != public',
);
assert.match(assetsSrc, /'okonomi-fakturagrunnlag': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-fakturagrunnlag--module-activation-illustration\.png'\)/);
const oversiktFile = 'okonomi-oversikt--module-activation-illustration.png';
const oversiktBundled = join(ROOT, 'assets/module-activation', oversiktFile);
const oversiktPublic = join(ROOT, 'public/assets/module-activation', oversiktFile);
assert.equal(existsSync(oversiktBundled), true, 'oversikt bundled art');
assert.equal(existsSync(oversiktPublic), true, 'oversikt public art');
assert.equal(
  createHash('sha256').update(readFileSync(oversiktBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(oversiktPublic)).digest('hex'),
  'oversikt bundled != public',
);
assert.match(assetsSrc, /'okonomi-oversikt': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-oversikt--module-activation-illustration\.png'\)/);
const utleggOkonomiFile = 'okonomi-utlegg--module-activation-illustration.png';
const utleggOkonomiBundled = join(ROOT, 'assets/module-activation', utleggOkonomiFile);
const utleggOkonomiPublic = join(ROOT, 'public/assets/module-activation', utleggOkonomiFile);
assert.equal(existsSync(utleggOkonomiBundled), true, 'okonomi utlegg bundled art');
assert.equal(existsSync(utleggOkonomiPublic), true, 'okonomi utlegg public art');
assert.equal(
  createHash('sha256').update(readFileSync(utleggOkonomiBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(utleggOkonomiPublic)).digest('hex'),
  'okonomi utlegg bundled != public',
);
assert.match(assetsSrc, /'okonomi-utlegg': require\('\.\.\/\.\.\/assets\/module-activation\/okonomi-utlegg--module-activation-illustration\.png'\)/);
const selskapFile = 'selskap--module-activation-illustration.png';
const selskapBundled = join(ROOT, 'assets/module-activation', selskapFile);
const selskapPublic = join(ROOT, 'public/assets/module-activation', selskapFile);
assert.equal(existsSync(selskapBundled), true, 'selskap bundled art');
assert.equal(existsSync(selskapPublic), true, 'selskap public art');
assert.equal(
  createHash('sha256').update(readFileSync(selskapBundled)).digest('hex'),
  createHash('sha256').update(readFileSync(selskapPublic)).digest('hex'),
  'selskap bundled != public',
);
assert.match(assetsSrc, /selskap: require\('\.\.\/\.\.\/assets\/module-activation\/selskap--module-activation-illustration\.png'\)/);
for (const [id, file] of [
  ['underenheter', 'underenheter--module-activation-illustration.png'],
  ['selskap-tilgang', 'selskap-tilgang--module-activation-illustration.png'],
  ['friends', 'venner--module-activation-illustration.png'],
  ['plan', 'kalender--module-activation-illustration.png'],
  ['mail', 'e-post--module-activation-illustration.png'],
  ['stars', 'oppgaver--module-activation-illustration.png'],
  ['notes', 'notat--module-activation-illustration.png'],
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
  'okonomi-faktura-phone--module-activation-illustration.png',
  'arbeid-godkjenning-phone--module-activation-illustration.png',
  'okonomi-produkter-phone--module-activation-illustration.png',
  'okonomi-utlegg-phone--module-activation-illustration.png',
  'arbeid-fravaer-phone--module-activation-illustration.png',
  'timeliste-phone--module-activation-illustration.png',
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
assert.match(heroSrc, /wideArt/, 'wide illustrations use the weekplan art slot');

console.log(`moduleHero.test.mjs: ok (${MOCKUP_IDS.length} mockup modules, ${COMPANY_PAGES.length} company pages)`);
