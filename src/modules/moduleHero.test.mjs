/**
 * Shared module heading: copy, colors, illustration wiring, phone/tablet/web.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_HERO, phoneChromeHeroId, resolveModuleHero, shellHeroModuleId } from './moduleHero.js';
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
assert.match(shellSrc, /hero=\{headerHeroId/, 'phone heading replaces the shell page title');
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

console.log(`moduleHero.test.mjs: ok (${MOCKUP_IDS.length} mockup modules)`);
