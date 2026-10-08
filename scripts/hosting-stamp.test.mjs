import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bustExpoAssetUrls, buildRefreshScript } = require('./hosting-stamp.js');

const html = `<link rel="stylesheet" href="/_expo/static/css/app.css"><script src="/_expo/static/js/web/index-abc.js" defer></script><script src="/other.js"></script>`;
const busted = bustExpoAssetUrls(html, 'sha/1');
assert.match(busted, /href="\/_expo\/static\/css\/app\.css\?v=sha%2F1"/);
assert.match(busted, /src="\/_expo\/static\/js\/web\/index-abc\.js\?v=sha%2F1"/);
assert.match(busted, /src="\/other\.js"/);
assert.equal(bustExpoAssetUrls(busted, 'next'), busted.replaceAll('sha%2F1', 'next'));

const script = buildRefreshScript('abc');
assert.match(script, /protop_build_reload_once/);
assert.match(script, /"abc"/);
assert.doesNotMatch(script, /location\.reload\(\)\}catch/);

console.log('hosting-stamp: ok');
