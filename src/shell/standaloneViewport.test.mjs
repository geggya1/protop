import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusBarCover, tabBarBottomPad } from './standaloneChrome.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(join(root, 'app.web.css'), 'utf8');
const stamp = readFileSync(join(root, 'scripts/stamp-build.js'), 'utf8');
const shell = readFileSync(join(root, 'components/AppShell.jsx'), 'utf8');
const header = readFileSync(join(root, 'components/ShellHeader.jsx'), 'utf8');

assert.match(css, /height:\s*100dvh/, 'browser tabs keep the dynamic viewport');
assert.match(
  css,
  /@media \(display-mode: standalone\), \(display-mode: fullscreen\) \{[\s\S]*height:\s*100lvh/,
  'installed Safari app fills the large viewport',
);
assert.match(css, /html\[data-standalone="1"\][\s\S]*height:\s*100lvh/, 'navigator.standalone also fills the screen');
assert.match(stamp, /apple-mobile-web-app-status-bar-style',\s*'black-translucent'/);
assert.match(stamp, /data-protop-standalone/, 'hosted HTML marks the installed app before paint');
assert.match(stamp, /height: 100lvh !important/, 'hosted shell overrides a short 100dvh');
assert.match(shell, /headerCoversStatusBar/, 'phone web header owns the status-bar inset');
assert.match(shell, /coverStatusBar=\{headerCoversStatusBar\}/, 'header background extends to the top edge');
assert.match(header, /statusBarCover/, 'top bar padding sits inside the header');

assert.equal(statusBarCover(59, { phone: true, standalone: true }), 59);
assert.equal(statusBarCover(0, { phone: true, standalone: true }), 47);
assert.equal(statusBarCover(20, { phone: true, standalone: false }), 20);
assert.equal(statusBarCover(59, { phone: false, standalone: true }), 0);

assert.equal(tabBarBottomPad(34, { web: true, standalone: true }), 34);
assert.equal(tabBarBottomPad(0, { web: true, standalone: true }), 34);
assert.equal(tabBarBottomPad(80, { web: true, standalone: false }), 34);
assert.equal(tabBarBottomPad(0, { web: true, standalone: false }), 8);
assert.equal(tabBarBottomPad(0, { web: false, standalone: false }), 4);

console.log('standaloneViewport.test.mjs: ok');
