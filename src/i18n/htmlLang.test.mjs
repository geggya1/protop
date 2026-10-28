import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// protop.no skal ha <html lang="nb"> (WCAG 3.1.1). Expo bruker app.json → expo.web.lang,
// og stamp-build.js setter nb også om malen skulle ignorere den.
const root = new URL('../../', import.meta.url);
const app = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
assert.equal(app.expo.web.lang, 'nb');

const stamp = readFileSync(new URL('scripts/stamp-build.js', root), 'utf8');
assert.match(stamp, /lang="nb"/);
assert.match(readFileSync(new URL('scripts/verify-web-dist.mjs', root), 'utf8'), /lang="nb"/);

// Samme omskriving som i stamp-build.js.
function withNb(html) {
  return /<html[^>]*\blang="/.test(html)
    ? html.replace(/(<html[^>]*\blang=")[^"]*"/, '$1nb"')
    : html.replace(/<html/, '<html lang="nb"');
}
assert.equal(withNb('<!DOCTYPE html><html lang="en"><head>'), '<!DOCTYPE html><html lang="nb"><head>');
assert.equal(withNb('<html><head>'), '<html lang="nb"><head>');
assert.equal(withNb('<html style="x" lang="en">'), '<html style="x" lang="nb">');

console.log('htmlLang.test.mjs: ok');
