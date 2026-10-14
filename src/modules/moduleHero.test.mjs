/**
 * Shared module heading: copy, colors, illustration wiring, phone/tablet/web.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
assert.match(heroSrc, /objectFit: 'contain'/, 'hero art must fit inside the band, not crop');
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
assert.equal(resolveModuleHero('anbud-tilbud', 'nb').wideArt, true, 'tilbud uses the wide illustration');
assert.equal(resolveModuleHero('kontrakt', 'nb').wideArt, true, 'kontrakt uses the wide illustration');
assert.equal(resolveModuleHero('skjema', 'nb').wideArt, true, 'skjema uses the wide illustration');
assert.equal(resolveModuleHero('timeliste', 'nb').wideArt, true, 'personal timesheet uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-timeliste', 'nb').wideArt, true, 'company timesheet uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-fravaer', 'nb').wideArt, true, 'absence overview uses the wide illustration');
assert.equal(resolveModuleHero('arbeid-fravaersrapport', 'nb').wideArt, true, 'absence report uses the wide illustration');
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
assert.match(assetsSrc, /'arbeid-fravaer': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaer--module-activation-illustration\.png'\)/);
assert.match(assetsSrc, /'arbeid-fravaersrapport': require\('\.\.\/\.\.\/assets\/module-activation\/arbeid-fravaersrapport--module-activation-illustration\.png'\)/);
assert.match(heroSrc, /wideArt/, 'wide illustrations use a wider art slot');

console.log(`moduleHero.test.mjs: ok (${MOCKUP_IDS.length} mockup modules, ${COMPANY_PAGES.length} company pages)`);
