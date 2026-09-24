import assert from 'node:assert/strict';
import {
  inferStepAnchor,
  inferStepScene,
  buildTourSteps,
  visibleTourPages,
  shortPitch,
  inflateRect,
  clampRect,
  fallbackTargetRect,
  placeCard,
  attachPoint,
  arrowPath,
  arrowHead,
  resolveHole,
  shouldAutoWelcome,
  matchesWhen,
  resolveRawStep,
} from './helpLayout.js';

assert.equal(inferStepAnchor('Åpne en liste, eller trykk + for en ny'), 'content');
assert.equal(inferStepAnchor('Tap + to add an event'), 'add');
assert.equal(inferStepAnchor('Trykk Inviter (øverst) for å sende kode'), 'header');
assert.equal(inferStepAnchor('Sveip uka for å se hva som kommer'), 'content');
assert.equal(inferStepAnchor('Trykk en app-flis for å åpne den'), 'shortcuts');
assert.equal(inferStepAnchor('Trykk en app-flis for å åpne den', { isDesktop: true, hasRail: true }), 'rail');
assert.equal(inferStepAnchor('Trykk på en app i listen', { hasRail: true }), 'content');
assert.equal(inferStepAnchor('Bytt fane nederst', { isPhone: true }), 'tabs');
assert.equal(inferStepAnchor('Bytt fane nederst', { hasRail: true }), 'rail');
assert.equal(inferStepAnchor('Dagens plan og avtaler ligger rett under hilsenen'), 'timeline');
assert.equal(inferStepAnchor('Trykk et kort — dagens plan, oppgaver eller chat — for å åpne appen'), 'timeline');
assert.equal(inferStepAnchor('Trykk blyanten på toppbildet for å redigere hjem'), 'edit');
assert.equal(inferStepAnchor('Trykk bildet øverst på toppbildet for å bytte heading-bilde'), 'edit');
assert.equal(inferStepAnchor('Trykk en app i menyen til venstre', { isDesktop: true, hasRail: true }), 'rail');
assert.equal(inferStepAnchor('Alle apper ligger i menyen til venstre', { isDesktop: true, hasRail: true }), 'rail');
assert.equal(inferStepAnchor('Ny samtale ligger i listen om du vil starte på nytt'), 'content');
assert.equal(inferStepAnchor('Nye medlemmer dukker opp her når de godtas'), 'content');
assert.equal(inferStepAnchor('Trykk Ny hendelse øverst til høyre'), 'add');
assert.equal(inferStepAnchor('Ny chat-knappen øverst til høyre starter en ny samtale'), 'add');
assert.equal(inferStepAnchor('Skriv i feltet og trykk Send'), 'input');
assert.equal(inferStepAnchor('Skriv spørsmålet nederst og trykk Send'), 'input');
assert.equal(inferStepAnchor('Skriv varen og trykk Enter — andre ser den med en gang'), 'input');
assert.equal(inferStepAnchor('Skriv og send — alle i tråden ser det med en gang'), 'input');

assert.ok(shortPitch('Vær, kalender og snarveier. Dette er kommandosentralen.', 40).length <= 41);

assert.equal(matchesWhen({ isDesktop: true }, { isDesktop: true }), true);
assert.equal(matchesWhen({ isDesktop: true }, { isDesktop: false }), false);
assert.equal(matchesWhen({ hasBottomNav: false }, { hasBottomNav: false, isPhone: true }), true);

const variantStep = resolveRawStep({
  nb: 'Telefon',
  en: 'Phone',
  anchor: 'tabs',
  variants: [
    { when: { isDesktop: true }, nb: 'Skrivebord', en: 'Desktop', anchor: 'rail' },
  ],
}, { isDesktop: true });
assert.equal(variantStep.nb, 'Skrivebord');
assert.equal(variantStep.anchor, 'rail');

const phoneShortcut = fallbackTargetRect('shortcuts', {
  width: 390, height: 844, isPhone: true, isDesktop: false, hasRail: false, pad: 16,
});
assert.ok(phoneShortcut.y > 200, 'shortcuts fallback sits below the hero band');

const phoneCardAbove = placeCard({
  winW: 390,
  winH: 844,
  hole: { x: 16, y: 520, w: 358, h: 96 },
  cardW: 420,
  cardH: 280,
  isPhone: true,
  inset: { bottom: 20, top: 40 },
});
assert.ok(phoneCardAbove.y + phoneCardAbove.h <= 520, 'card sits above a low spotlight');

const inflated = inflateRect({ x: 10, y: 10, w: 20, h: 20 }, 8);
assert.deepEqual(inflated, { x: 2, y: 2, w: 36, h: 36 });

const clamped = clampRect({ x: -20, y: 10, w: 5000, h: 20 }, 400, 800, 4);
assert.equal(clamped.x, 4);
assert.ok(clamped.w <= 392);

const phoneHelp = fallbackTargetRect('helpBtn', {
  width: 390, height: 844, isPhone: true, isDesktop: false, hasRail: false,
});
assert.ok(phoneHelp.y >= 56, 'phone help sits below the header, under the profile');
assert.ok(phoneHelp.x > 320, 'phone help is right-aligned under the avatar');
assert.equal(phoneHelp.w, 40);

const deskHelp = fallbackTargetRect('helpBtn', {
  width: 1440, height: 900, isPhone: false, isDesktop: true, hasRail: true, railWidth: 220,
});
assert.ok(deskHelp.y < 40, 'desktop help stays in the compact header');

const phoneAdd = fallbackTargetRect('add', {
  width: 390, height: 844, isPhone: true, isDesktop: false, hasRail: false,
});
assert.ok(phoneAdd.x + phoneAdd.w <= 390);
assert.ok(phoneAdd.y >= 0);

const phoneEdit = fallbackTargetRect('edit', {
  width: 390, height: 844, isPhone: true, isDesktop: false, hasRail: false, pad: 16,
});
assert.ok(phoneEdit.x + phoneEdit.w <= 390);
assert.equal(phoneEdit.w, 44);

const deskAdd = fallbackTargetRect('add', {
  width: 1440, height: 900, isPhone: false, isDesktop: true, hasRail: true, railWidth: 220, pad: 12,
});
assert.ok(deskAdd.x > 1100, 'desktop add lives in the compact header, top-right');
assert.ok(deskAdd.x + deskAdd.w < 1440);

const tabletAdd = fallbackTargetRect('add', {
  width: 820, height: 1180, isPhone: false, isTablet: true, isDesktop: false,
  hasRail: true, railWidth: 200, pad: 22,
});
assert.ok(tabletAdd.x > 400, 'tablet add sits on the title row, right side of main');
assert.ok(tabletAdd.x >= 200);

const phoneCard = placeCard({
  winW: 390, winH: 844, cardW: 420, cardH: 320, isPhone: true, inset: { bottom: 20 },
});
assert.ok(phoneCard.y + phoneCard.h <= 844);
assert.ok(Math.abs(phoneCard.x - (390 - phoneCard.w) / 2) < 1);

const holeLeft = { x: 240, y: 80, w: 140, h: 40 };
const deskCard = placeCard({
  winW: 1440, winH: 900, hole: holeLeft, cardW: 380, cardH: 360, isPhone: false,
});
assert.ok(deskCard.x > 800, 'card sits on the right when the hole is on the left');

const holeRight = { x: 1280, y: 12, w: 36, h: 36 };
const deskCardLeft = placeCard({
  winW: 1440, winH: 900, hole: holeRight, cardW: 380, cardH: 360, isPhone: false,
});
assert.ok(deskCardLeft.x < 200, 'card sits on the left when the hole is on the right');

const from = attachPoint({ x: 20, y: 400, w: 360, h: 280 }, { x: 200, y: 80, w: 140, h: 40 });
const to = attachPoint({ x: 200, y: 80, w: 140, h: 40 }, { x: 20, y: 400, w: 360, h: 280 });
assert.ok(from.y <= 400 + 1);
assert.match(arrowPath(from, to), /^M /);
assert.match(arrowHead(from, to), /^M /);

const measured = resolveHole('add', { x: 200, y: 90, w: 140, h: 40 }, { width: 390, height: 844 });
assert.ok(measured.w > 140);
assert.ok(measured.x < 200);

assert.equal(shouldAutoWelcome({}, {}, 'family'), true);
assert.equal(shouldAutoWelcome({ family: 1 }, {}, 'family'), false);
assert.equal(shouldAutoWelcome({}, { 'family.wishes': 1 }, 'family'), false);
assert.equal(shouldAutoWelcome({}, { 'team.home': 1 }, 'family'), true);

assert.equal(inferStepScene('Åpne en liste, eller trykk + for en ny'), 'hub');
assert.equal(inferStepScene('Skriv varen og trykk Enter — andre ser den med en gang', 1), 'inner');
assert.equal(inferStepScene('Kryss av i butikken etter hvert som det går i posen', 2), 'inner');

const shopTour = buildTourSteps([
  'Åpne en liste, eller trykk + for en ny',
  'Skriv varen og trykk Enter — andre ser den med en gang',
  'Kryss av i butikken etter hvert som det går i posen',
]);
assert.equal(shopTour[0].scene, 'hub');
assert.equal(shopTour[0].advance, true);
assert.equal(shopTour[0].anchor, 'content');
assert.equal(shopTour[1].scene, 'inner');
assert.equal(shopTour[1].anchor, 'input');
assert.equal(shopTour[1].advance, false);
assert.equal(shopTour[2].scene, 'inner');

const hubPages = visibleTourPages(shopTour, 'hub');
assert.equal(hubPages.length, 1);
assert.equal(hubPages[0].index, 0);
const innerPages = visibleTourPages(shopTour, 'inner');
assert.equal(innerPages.length, 2);
assert.equal(innerPages[0].index, 1);

const inputHoleMissing = resolveHole('input', null, { width: 390, height: 844 });
assert.equal(inputHoleMissing, null);

assert.equal(inferStepAnchor('Trykk Familie-fanen for å sette preferanser'), 'prefs');
assert.equal(inferStepAnchor('Trykk + Ny ukeplan'), 'add');
assert.equal(inferStepAnchor('Trykk + Nytt album'), 'add');
assert.equal(resolveHole('prefs', null, { width: 390, height: 844 }), null);
assert.ok(resolveHole('prefs', { x: 100, y: 200, w: 90, h: 40 }, { width: 390, height: 844 }));

const matcoachTour = buildTourSteps([
  {
    nb: 'Trykk Familie-fanen for å sette preferanser',
    en: 'Tap the Family tab to set preferences',
    anchor: 'prefs',
    scene: 'hub',
  },
  {
    nb: 'Sett antall, allergier og budsjett — lagre',
    en: 'Set adults, allergies and budget — then save',
    anchor: 'content',
    scene: 'inner',
  },
  {
    nb: 'Trykk + Ny ukeplan',
    en: 'Tap + New week plan',
    anchor: 'add',
    scene: 'hub',
  },
]);
assert.equal(matcoachTour[0].advance, true);
assert.equal(matcoachTour[0].anchor, 'prefs');
assert.equal(matcoachTour[2].anchor, 'add');
assert.equal(matcoachTour[2].advance, false);

console.log('helpLayout.test.mjs: ok');
