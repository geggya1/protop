import assert from 'node:assert/strict';
import {
  COMPANY_DOCK_IDS,
  PRIVATE_DOCK_IDS,
  PROTOP_BOTTOM_SHORTCUT_IDS,
  privateDockPreset,
  protopDock,
} from './protopShell.js';
import { COMPANY_BOTTOM_NAV } from '../companyHome/model.js';

// Samme dock i Privat og Bedrift (UX-21): Hjem · Timer · Prosjekter/Kalender · Oppgaver · Meny.
assert.deepEqual(protopDock(COMPANY_DOCK_IDS).map((row) => row.label), ['Hjem', 'Timer', 'Prosjekter', 'Oppgaver', 'Meny']);
assert.deepEqual(protopDock(PRIVATE_DOCK_IDS).map((row) => row.label), ['Hjem', 'Timer', 'Kalender', 'Oppgaver', 'Meny']);
assert.deepEqual(COMPANY_BOTTOM_NAV, protopDock(COMPANY_DOCK_IDS), 'bedriftens dock bruker samme definisjon');

// Samme modul har samme navn og ikon på plass 1, 2, 4 og 5.
const company = protopDock(COMPANY_DOCK_IDS);
const priv = protopDock(PRIVATE_DOCK_IDS);
for (const index of [0, 1, 3, 4]) {
  assert.equal(company[index].label, priv[index].label);
  assert.equal(company[index].icon, priv[index].icon);
}

// Privat: felles dock bare for den som er i en bedrift og ikke har valgt egne snarveier.
assert.deepEqual(
  privateDockPreset({ hasCompany: true, bottomShortcutIds: PROTOP_BOTTOM_SHORTCUT_IDS }).map((row) => row.id),
  PRIVATE_DOCK_IDS,
);
assert.equal(privateDockPreset({ hasCompany: false, bottomShortcutIds: PROTOP_BOTTOM_SHORTCUT_IDS }), null);
assert.equal(privateDockPreset({ hasCompany: true, bottomShortcutIds: ['home', 'chat', 'plan'] }), null, 'egne valg beholdes');

console.log('protopDock.test.mjs ok');
