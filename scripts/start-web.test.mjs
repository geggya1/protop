import assert from 'assert';
import { LOCAL_WEB_HINT, localWebExpoArgs } from './start-web.mjs';

assert.match(LOCAL_WEB_HINT, /ERR_CONNECTION_REFUSED/);
assert.match(LOCAL_WEB_HINT, /npm run web/);
assert.match(LOCAL_WEB_HINT, /127\.0\.0\.1:8081/);
assert.deepStrictEqual(localWebExpoArgs(), ['start', '--web', '--port', '8081']);

console.log('start-web: ok');
