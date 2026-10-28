import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Stilblokken `name: { … }` fra StyleSheet.create i en fil. */
function styleBlock(src, name) {
  const start = src.indexOf(`  ${name}: {`);
  assert.ok(start >= 0, `fant ikke stilen ${name}`);
  return src.slice(start, src.indexOf('}', start));
}

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

// SOS-02: på mobil-web krymper ikke et <input> under sin naturlige bredde uten minWidth 0,
// og Send-knappen havnet på x 405–439 av 390 px i venne- og kollegachatten.
test('chatfeltet krymper, Send-knappen gjør det ikke', () => {
  const dock = read('components/ChatDock.jsx');
  assert.match(styleBlock(dock, 'input'), /minWidth: 0/);
  assert.match(styleBlock(dock, 'sendBtn'), /flexShrink: 0/);

  const friend = read('screens/v2/FriendChatThreadScreen.jsx');
  assert.match(styleBlock(friend, 'input'), /minWidth: 0/);
  assert.match(styleBlock(friend, 'sendBtn'), /flexShrink: 0/);

  const thread = read('screens/v2/ChatThreadScreen.jsx');
  assert.match(styleBlock(thread, 'input'), /minWidth: 0/);
  assert.match(styleBlock(thread, 'send'), /flexShrink: 0/);
  assert.match(thread, /<HelpTarget id="input" style=\{\{ flex: 1, minWidth: 0 \}\}>/);
});
