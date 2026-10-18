import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const review = readFileSync(new URL('../../screens/anbud/CurrentReview.jsx', import.meta.url), 'utf8');
const brief = readFileSync(new URL('../../screens/anbud/OppdragBrief.jsx', import.meta.url), 'utf8');
const rail = readFileSync(new URL('../../screens/anbud/MapRail.jsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../../components/ChatDock.jsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../../components/ModuleHero.jsx', import.meta.url), 'utf8');

assert.match(review, /wide \? styles\.colSide : styles\.colStack/);
assert.match(review, /stacked=\{!wide\}/);
assert.match(review, /colStack: \{ width: '100%', minWidth: 0, gap: 8 \}/);
assert.doesNotMatch(review, /col: \{ flex: 1, minWidth: 280/);
assert.match(review, /actionsStack: \{ flexDirection: 'column' \}/);

assert.match(brief, /stacked \? styles\.panelStacked : styles\.panelSide/);
assert.match(brief, /panelSide: \{ flex: 1, minWidth: 280 \}/);
assert.match(brief, /panelStacked: \{ width: '100%', minWidth: 0, alignSelf: 'stretch' \}/);
assert.doesNotMatch(brief, /panel: \{ flex: 1, minWidth: 280/);

assert.match(rail, /const phone = viewportWidth < BREAKPOINTS\.tablet/);
assert.match(rail, /const open = phone \? phoneSheet : width > RAIL_PEEK \+ 48/);
assert.match(rail, /if \(phone && !open\)/);
assert.match(rail, /accessibilityLabel="Større kart"/);
assert.match(rail, /if \(phone \|\| !focusTick \|\| !selectedId\) return/);

assert.match(chat, /chatFabRestOffset\(extraBottom\)/);
assert.match(chat, /if \(!draggedRef\.current\) return/);

assert.match(hero, /maxHeight: artH/);
assert.match(hero, /overflow: 'clip'/);

console.log('reviewPhoneLayout.test.mjs: ok');
