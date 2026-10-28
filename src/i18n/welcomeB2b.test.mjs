/**
 * ProTop er for bedrifter (UX-09): utlogget går til innlogging også i appen, og
 * velkomst- og venneteksten handler ikke om familien.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const app = read('../../App.jsx');
assert.match(app, /stage === 'welcome' \? \(welcomePathEntry \|\| 'Login'\)/, 'utlogget går til Login på alle plattformer');
assert.doesNotMatch(app, /Platform\.OS === 'web' \? 'Login' : 'Welcome'/);

const strings = read('./strings.js');
const welcome = strings.slice(strings.indexOf('  welcome: {'), strings.indexOf('\n  },', strings.indexOf('  welcome: {')));
for (const old of ['Mindre kaos', 'Mer tid sammen', 'hele familien', 'Derfor velger familier', '49 kr', 'foresatt', 'barn']) {
  assert.equal(welcome.includes(old), false, `velkomsten nevner ikke «${old}»`);
}
assert.match(welcome, /Timer, prosjekt og faktura i én app/);

const accepted = strings.match(/acceptedBody: L\('([^']+)'/)[1];
assert.equal(accepted, 'Dere er nå venner. De får ikke tilgang til bedriften eller kalenderen din.');

const register = read('../../screens/RegisterScreen.jsx');
assert.doesNotMatch(register, /Invitasjon til familie|foresatt i familien|tilgang til familien/);

console.log('welcomeB2b.test.mjs ok');
