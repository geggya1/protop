import assert from 'node:assert/strict';
import { viewAsChromeVisible } from './viewAsNav.js';

assert.equal(
  viewAsChromeVisible({ canViewAs: false, tab: 'skjema' }),
  false,
  'uten rettighet vises ikke øyet',
);

assert.equal(
  viewAsChromeVisible({ canViewAs: true, tab: 'home' }),
  false,
  'personlige sider har ikke øyet',
);

assert.equal(
  viewAsChromeVisible({ canViewAs: true, tab: 'plan' }),
  false,
  'plan er personlig',
);

for (const tab of ['selskap', 'skjema', 'anbud', 'okonomi', 'ansatte', 'projects']) {
  assert.equal(
    viewAsChromeVisible({ canViewAs: true, tab }),
    true,
    `${tab} er en bedriftsmodul`,
  );
}

assert.equal(
  viewAsChromeVisible({ canViewAs: true, tab: 'home', previewing: true }),
  true,
  'aktiv visning lyser også utenfor bedriftsmodulen, så den kan tilbakestilles',
);

assert.equal(
  viewAsChromeVisible({ canViewAs: false, tab: 'home', previewing: true }),
  false,
  'aktiv visning uten rettighet vises ikke',
);
