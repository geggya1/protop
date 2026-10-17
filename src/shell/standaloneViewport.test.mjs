import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusBarCover, tabBarBottomPad } from './standaloneChrome.js';
import { applyVisualViewportFrame, visualViewportFrame } from './visualViewportFrame.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(join(root, 'app.web.css'), 'utf8');
const stamp = readFileSync(join(root, 'scripts/stamp-build.js'), 'utf8');
const shell = readFileSync(join(root, 'components/AppShell.jsx'), 'utf8');
const header = readFileSync(join(root, 'components/ShellHeader.jsx'), 'utf8');
const app = readFileSync(join(root, 'App.jsx'), 'utf8');
const bottomNav = readFileSync(join(root, 'components/parentHome/ParentShellBottomNav.jsx'), 'utf8');

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
assert.equal(tabBarBottomPad(80, { web: true, standalone: false }), 4);
assert.equal(tabBarBottomPad(0, { web: true, standalone: false }), 4);
assert.equal(tabBarBottomPad(0, { web: false, standalone: false }), 4);

assert.deepEqual(visualViewportFrame({ height: 640.4, offsetTop: 12.6 }, 800), { top: 13, height: 640 });
assert.deepEqual(visualViewportFrame(null, 700), { top: 0, height: 700 });
assert.deepEqual(visualViewportFrame({ height: 0, offsetTop: -4 }, 500), { top: 0, height: 500 });

const cssVars = {};
applyVisualViewportFrame({
  documentElement: { style: { setProperty(name, value) { cssVars[name] = value; } } },
}, { top: 8, height: 612 });
assert.equal(cssVars['--protop-vv-top'], '8px');
assert.equal(cssVars['--protop-vv-height'], '612px');

assert.match(css, /--protop-vv-height/, 'phone shell tracks the visual viewport');
assert.match(css, /@media \(max-width: 767px\)[\s\S]*position:\s*fixed/, 'phone document does not scroll');
assert.match(css, /@media \(max-width: 1023px\)[\s\S]*#shell-scroll/, 'page body is the only scrollport');
assert.match(app, /usePhoneVisualViewport/, 'app publishes the visible frame');
assert.match(header, /chromeLocked/, 'phone top menu stays pinned');
assert.match(shell, /nativeID="shell-scroll"/, 'module body is the scrollport');
assert.doesNotMatch(bottomNav, /position:\s*'fixed'/, 'bottom menu stays in the shell column');

console.log('standaloneViewport.test.mjs: ok');
