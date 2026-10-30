/**
 * Titlene skallet faktisk viser for en side (én tittel per side, AGENTS.md):
 * toppfeltets tittel (tom når båndet eller tittelraden har tatt over), siste ledd i
 * brødsmulen når tittelraden vises (undersider), modulbåndets overlinje og
 * overskrift, og den valgte fanen i modulmenyen under båndet (tabLabels). Sidene sammenligner sin egen overskrift mot disse med
 * repeatsShellTitle (src/ui/pageTitle.js).
 */
import { companyNavTrail, navTrailSegments } from './navTrail.js';
import { resolveModuleHero } from '../modules/moduleHero.js';

export function shellPageTitles({
  tab, subView = null, headerTitle = '', titleRow = false, heroId = null, lang = 'nb', tabLabels = [],
} = {}) {
  const titles = [headerTitle, ...(tabLabels || [])];
  if (titleRow) {
    const segments = navTrailSegments(companyNavTrail(tab, subView));
    if (segments.length) titles.push(segments[segments.length - 1].label);
  }
  if (heroId) {
    const hero = resolveModuleHero(heroId, lang);
    titles.push(hero.kicker, hero.title);
  }
  return [...new Set(titles.filter((t) => typeof t === 'string' && t.trim()))];
}
