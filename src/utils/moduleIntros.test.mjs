import assert from 'node:assert/strict';
import {
  EXPECTED_INTRO_KEYS,
  MODULE_INTROS,
  WELCOME_TOUR,
  getModuleIntro,
  getWelcomeTourModules,
  introStorageKey,
  localizeIntro,
  pickIntroText,
} from './moduleIntros.js';

assert.equal(introStorageKey('family', 'plan'), 'family.plan');
assert.equal(introStorageKey('team', 'wall'), 'team.wall');

assert.ok(getModuleIntro('family', 'plan'));
assert.ok(getModuleIntro('family', 'voiceNotes'), 'voiceNotes aliases to notes');
assert.equal(getModuleIntro('family', 'voiceNotes').icon, 'document-text');
assert.equal(getModuleIntro('classroom', 'messages').icon, 'chatbubbles');
assert.equal(getModuleIntro('family', 'does-not-exist'), null);

const chatNb = localizeIntro(getModuleIntro('family', 'chat'), 'nb');
assert.equal(chatNb.title, 'Prat der du allerede er');

const plan = localizeIntro(getModuleIntro('family', 'plan'), 'nb');
assert.match(plan.title, /uke/i);
assert.equal(plan.steps.length, 3);
assert.ok(plan.accent);
assert.ok(plan.icon);
assert.equal(plan.tour[0].scene, 'hub');
assert.equal(plan.tour[0].advance, true);
assert.equal(plan.tour[1].scene, 'inner');

const shop = localizeIntro(getModuleIntro('family', 'shop'), 'nb');
assert.equal(shop.tour[0].scene, 'hub');
assert.equal(shop.tour[0].advance, true);
assert.equal(shop.tour[1].scene, 'inner');
assert.equal(shop.tour[1].anchor, 'input');
assert.equal(shop.tour[2].scene, 'inner');

const planEn = localizeIntro(getModuleIntro('family', 'plan'), 'en');
assert.match(planEn.title, /week/i);

assert.equal(pickIntroText({ nb: 'Hei', en: 'Hi' }, 'nb'), 'Hei');
assert.equal(pickIntroText({ nb: 'Hei', en: 'Hi' }, 'en'), 'Hi');
assert.equal(pickIntroText({ nb: 'Hei', en: 'Hi' }, 'da'), 'Hei');
assert.equal(pickIntroText({ nb: 'Hei', en: 'Hi' }, 'pl'), 'Hi');

const missing = EXPECTED_INTRO_KEYS.filter((k) => !MODULE_INTROS[k]);
assert.deepEqual(missing, [], `Missing intros: ${missing.join(', ')}`);

const extra = Object.keys(MODULE_INTROS).filter((k) => !EXPECTED_INTRO_KEYS.includes(k));
assert.deepEqual(extra, [], `Unexpected intros: ${extra.join(', ')}`);

for (const key of EXPECTED_INTRO_KEYS) {
  const entry = MODULE_INTROS[key];
  assert.ok(entry.icon, `${key} missing icon`);
  assert.ok(entry.accent, `${key} missing accent`);
  assert.ok(entry.soft, `${key} missing soft`);
  assert.ok(entry.title?.nb && entry.title?.en, `${key} missing title`);
  assert.ok(entry.kicker?.nb && entry.kicker?.en, `${key} missing kicker`);
  assert.ok(entry.pitch?.nb && entry.pitch?.en, `${key} missing pitch`);
  assert.ok(Array.isArray(entry.steps) && entry.steps.length >= 2, `${key} needs start steps`);
  entry.steps.forEach((s, i) => {
    const text = typeof s === 'string' ? { nb: s, en: s } : s;
    assert.ok(text.nb && text.en, `${key} step ${i} needs nb+en`);
  });
}

const home = localizeIntro(getModuleIntro('family', 'home'), 'nb', { isPhone: true, hasBottomNav: true });
assert.match(home.steps[0], /kort|dagens plan/i);
assert.match(home.steps[1], /toppbildet|heading-bilde/i);
assert.ok(!/Hold på|Long-press|Dashbord-oppsett|nede til høyre/i.test(home.steps.join(' ')), 'home tour must match widget home');
assert.equal(home.tour[0].anchor, 'timeline');
assert.equal(home.tour[1].anchor, 'edit');
assert.equal(home.tour[2].anchor, 'tabs');

const homeDesk = localizeIntro(getModuleIntro('family', 'home'), 'nb', { isDesktop: true, hasRail: true });
assert.equal(homeDesk.tour[0].anchor, 'rail');
assert.match(homeDesk.steps[0], /menyen til venstre/i);

const homeNoTabs = localizeIntro(getModuleIntro('family', 'home'), 'nb', {
  isPhone: true, hasBottomNav: false,
});
assert.match(homeNoTabs.steps[2], /Mer/i);
assert.equal(homeNoTabs.tour[2].anchor, 'content');

const homeChild = localizeIntro(getModuleIntro('family', 'home'), 'nb', {
  isPhone: true, asChild: true, hasBottomNav: false,
});
assert.match(homeChild.steps[1], /Foresatte|toppbildet|bytte/i);
assert.equal(homeChild.tour[1].anchor, 'edit');
assert.equal(homeChild.tour[2].anchor, 'timeline');

const planTour = localizeIntro(getModuleIntro('family', 'plan'), 'nb');
assert.match(planTour.steps[0], /Ny hendelse|øverst/i);
assert.ok(!/nede til høyre/i.test(planTour.steps.join(' ')));

const aiTour = localizeIntro(getModuleIntro('family', 'ai'), 'nb');
assert.equal(aiTour.tour[0].anchor, 'input');
assert.ok(!/nederst/i.test(aiTour.steps[0]));
assert.equal(aiTour.tour[2].anchor, 'add');
assert.match(aiTour.steps[2], /Ny chat|øverst/i);

const mailTour = localizeIntro(getModuleIntro('family', 'mail'), 'nb');
assert.equal(mailTour.tour[0].anchor, 'content');
assert.match(mailTour.steps[0], /melding/i);
assert.equal(mailTour.tour[1].anchor, 'add');
assert.ok(!/Innstillinger for å koble/i.test(mailTour.steps[0]));

const matcoach = localizeIntro(getModuleIntro('family', 'matcoach'), 'nb');
assert.equal(matcoach.tour[0].anchor, 'prefs');
assert.equal(matcoach.tour[0].scene, 'hub');
assert.equal(matcoach.tour[0].advance, true);
assert.equal(matcoach.tour[1].scene, 'inner');
assert.equal(matcoach.tour[2].anchor, 'add');
assert.equal(matcoach.tour[3].anchor, 'content');
assert.match(matcoach.steps[0], /Familie-fanen|preferanser/i);

const albums = localizeIntro(getModuleIntro('family', 'albums'), 'nb');
assert.equal(albums.tour[0].anchor, 'add');
assert.equal(albums.tour[0].advance, true);
assert.equal(albums.tour[1].scene, 'inner');
assert.equal(albums.tour[1].anchor, 'input');
assert.ok(getModuleIntro('family', 'wall'));
assert.ok(getModuleIntro('family', 'friends'));
assert.ok(getModuleIntro('family', 'help'));
assert.ok(getModuleIntro('family', 'moduleAccess'));

const familyHeroes = ['family.home', 'family.stars', 'family.chores', 'family.notes', 'family.chat', 'family.shop'];
familyHeroes.forEach((k) => {
  assert.ok(MODULE_INTROS[k].hero, `${k} should reuse module hero art`);
});

for (const [scope, spec] of Object.entries(WELCOME_TOUR)) {
  const tourScope = scope === 'familyChild' ? 'family' : scope;
  const tour = getWelcomeTourModules(tourScope, { asChild: scope === 'familyChild' });
  assert.equal(tour.highlights.length, spec.highlights.length, `${scope} welcome highlights`);
  assert.equal(tour.apps.length, spec.apps.length, `${scope} welcome apps`);
}

console.log(`moduleIntros.test.mjs: ok (${EXPECTED_INTRO_KEYS.length} modules)`);
