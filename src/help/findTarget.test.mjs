import assert from 'node:assert/strict';
import {
  findTargetElement, findTargetMatch, findTargetRect, locateStepTarget, normalizeLabel, preciseRect, scoreCandidate,
} from './findTarget.js';

assert.equal(normalizeLabel(' + Ny kunde '), 'ny kunde');
assert.equal(normalizeLabel('Oppdater  nå'), 'oppdater nå');
assert.equal(normalizeLabel(''), '');

assert.equal(scoreCandidate({ label: 'Ny kunde', testId: 'ny kunde' }), 100);
assert.equal(scoreCandidate({ label: 'Ny kunde', ariaLabel: 'Ny kunde' }), 90);
assert.equal(scoreCandidate({ label: 'Ny kunde', text: '+ Ny kunde' }), 80);
assert.equal(scoreCandidate({ label: 'Velg filer', ariaLabel: 'Velg filer eller slipp dem her' }), 60);
assert.equal(scoreCandidate({ label: 'Oppdater nå', text: 'Oppdater nå (3 nye)' }), 50);
assert.equal(scoreCandidate({ label: 'Ny', text: 'Nytt prosjekt' }), 0, 'korte etiketter må treffe eksakt');
assert.equal(scoreCandidate({ label: 'Ny kunde', text: 'Ingen kunder er registrert ennå.' }), 0);
assert.equal(scoreCandidate({ label: 'Godkjenn', text: 'Godkjenninger' }), 0, 'prefiks må være et helt ord');
assert.equal(scoreCandidate({ label: 'Lås timer til', ariaLabel: 'Lås timer til 2026-10-01' }), 60);

// Liten DOM-attrapp: knapp med ikon + tekst inni et kort med mye tekst.
function el({ text = '', aria = '', testId = '', placeholder = '', rect, role = '', children = [], hidden = false }) {
  const node = {
    textContent: text || children.map((c) => c.textContent).join(''),
    childElementCount: children.length,
    getAttribute: (n) => ({ 'aria-label': aria, 'data-testid': testId, placeholder, role })[n] || null,
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3], right: rect[0] + rect[2], bottom: rect[1] + rect[3] }),
    closest(sel) {
      if (sel.includes('data-wp-help-overlay')) return null;
      if (sel.includes('help-target-rail')) return this.inMenu ? this : null;
      if (role === 'button' || this.parentButton) return this.parentButton || this;
      return null;
    },
    scrollIntoView() { this.scrolled = true; },
    hidden,
  };
  children.forEach((c) => { c.parentButton = role === 'button' ? node : c.parentButton; });
  return node;
}
const label = el({ text: 'Ny kunde', rect: [1110, 20, 80, 20] });
const button = el({ role: 'button', rect: [1100, 12, 130, 36], children: [el({ text: '', rect: [1104, 20, 16, 16] }), label] });
const card = el({ text: 'Ingen kunder er registrert ennå. Trykk Ny kunde for å starte.', rect: [240, 300, 800, 200] });
const offscreen = el({ role: 'button', text: 'Lagre kunde', rect: [300, 2000, 120, 40] });
const nodes = [card, button, label, offscreen];
const doc = {
  defaultView: {
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle: (n) => ({ visibility: n.hidden ? 'hidden' : 'visible', display: 'flex', opacity: '1' }),
  },
  querySelectorAll: (sel) => (/dialog|aria-modal/.test(sel) ? [] : nodes),
};

assert.equal(findTargetElement(['Ny kunde'], doc), button, 'markerer hele knappen, ikke teksten eller kortet');
assert.equal(findTargetElement(['Finnes ikke', 'Ny kunde'], doc), button, 'neste etikett prøves');
assert.equal(findTargetElement(['Finnes ikke'], doc), null);
assert.deepEqual(findTargetRect(['Ny kunde'], { doc }), { x: 1100, y: 12, w: 130, h: 36 });
findTargetRect(['Lagre kunde'], { doc });
assert.equal(offscreen.scrolled, true, 'knapp utenfor skjermen rulles frem');
assert.equal(findTargetElement(['Ny kunde'], null), null);

// Plassholder i søkefelt teller som etikett.
const search = el({ placeholder: 'Filtrer prosjekt', rect: [300, 200, 240, 36] });
const docSearch = { ...doc, querySelectorAll: (sel) => (/dialog|aria-modal/.test(sel) ? [] : [search]) };
assert.equal(findTargetElement(['Filtrer prosjekt'], docSearch), search);

// via: målknappen finnes ikke ennå → knappen som åpner den markeres.
const viaHit = locateStepTarget({ find: ['Lagre faktura'], via: ['Ny kunde'] }, { doc });
assert.equal(viaHit.via, true);
assert.equal(viaHit.label, 'Ny kunde');
assert.equal(viaHit.el, button);
const directHit = locateStepTarget({ find: ['Ny kunde'], via: ['Finnes ikke'] }, { doc });
assert.equal(directHit.via, false);
assert.deepEqual(directHit.rect, { x: 1100, y: 12, w: 130, h: 36 });
assert.equal(locateStepTarget({ find: ['X'], via: ['Y'] }, { doc }), null);
assert.equal(findTargetMatch(['Ny kunde'], doc).label, 'Ny kunde');

// Åpen dialog: knappen i dialogen vinner over en lik knapp bak.
const behind = el({ role: 'button', text: 'Lagre', rect: [100, 100, 80, 30] });
const inside = el({ role: 'button', text: 'Lagre', rect: [600, 400, 120, 40] });
const dialog = {
  ...el({ role: 'dialog', rect: [500, 300, 400, 300] }),
  querySelectorAll: () => [inside],
};
const docDialog = {
  ...doc,
  querySelectorAll: (sel) => (/dialog|aria-modal/.test(sel) ? [dialog] : [behind, inside]),
};
assert.equal(findTargetElement(['Lagre'], docDialog), inside, 'dialogen først');

// Menyen: «Godkjenninger» i menyen er ikke knappen «Godkjenn».
const menuItem = el({ role: 'button', text: 'Godkjenninger', rect: [10, 300, 180, 32] });
menuItem.inMenu = true;
const docMenu = { ...doc, querySelectorAll: (sel) => (/dialog|aria-modal/.test(sel) ? [] : [menuItem]) };
assert.equal(findTargetElement(['Godkjenn'], docMenu), null, 'prefiks i menyen teller ikke');
const menuExact = el({ role: 'button', aria: 'Søk i menyen', rect: [10, 80, 180, 32] });
menuExact.inMenu = true;
const docMenu2 = { ...doc, querySelectorAll: (sel) => (/dialog|aria-modal/.test(sel) ? [] : [menuExact]) };
assert.equal(findTargetElement(['Søk i menyen'], docMenu2), menuExact, 'eksakt etikett i menyen teller');

// via bak et åpent modalvindu teller ikke (det er dekket).
const modal = { ...el({ rect: [400, 200, 500, 400] }), contains: () => false, querySelectorAll: () => [] };
const docModal = {
  ...doc,
  querySelectorAll: (sel) => (sel.includes('aria-modal') && !sel.includes('role') ? [modal] : (/dialog/.test(sel) ? [] : nodes)),
};
assert.equal(locateStepTarget({ find: ['Finnes ikke'], via: ['Ny kunde'] }, { doc: docModal }), null);

// Presis markering: en rad over hele bredden krympes til teksten, en knapp markeres hel.
const textNode = { textContent: 'Hjelpe Bot' };
const rowDoc = {
  defaultView: {
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle: () => ({ borderTopLeftRadius: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' }),
  },
  createTreeWalker: () => {
    let done = false;
    return { nextNode: () => (done ? null : ((done = true), textNode)) };
  },
  createRange: () => ({
    selectNodeContents() {},
    getBoundingClientRect: () => ({ left: 260, top: 520, width: 72, height: 18 }),
  }),
};
const row = { tagName: 'DIV', getAttribute: () => null };
assert.deepEqual(preciseRect(row, { x: 240, y: 510, w: 1120, h: 40 }, '#hr-row-*', rowDoc), { x: 260, y: 520, w: 72, h: 18 }, 'hel rad → bare navnet');
assert.deepEqual(preciseRect(row, { x: 240, y: 510, w: 180, h: 40 }, 'Ny kunde', rowDoc), { x: 240, y: 510, w: 180, h: 40 }, 'knappestørrelse beholdes');
const input = { tagName: 'INPUT', getAttribute: (n) => (n === 'placeholder' ? 'Søk' : null) };
assert.ok(preciseRect(input, { x: 240, y: 300, w: 1100, h: 40 }, 'Søk', rowDoc).w < 600, 'brede søkefelt markeres fra starten');
const phoneDoc = {
  ...rowDoc,
  defaultView: {
    innerWidth: 390,
    innerHeight: 844,
    getComputedStyle: () => ({
      borderTopLeftRadius: '12px', backgroundColor: 'rgb(16, 153, 244)',
      borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px',
    }),
  },
};
assert.deepEqual(preciseRect(row, { x: 16, y: 700, w: 358, h: 48 }, 'Legg til prosjekt', phoneDoc), { x: 16, y: 700, w: 358, h: 48 }, 'fullbreddeknapp på mobil markeres hel');

console.log('findTarget.test.mjs: ok');
