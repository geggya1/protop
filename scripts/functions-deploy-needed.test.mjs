import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deployNeededForPaths, DEPLOY_ENTRIES, entriesForChanges, functionSourceClosure } from './functions-deploy-needed.mjs';

const closure = functionSourceClosure();

assert.ok(closure.has('functions/anbudIntake.js'));
assert.ok(closure.has('src/anbud/intake.js'));
assert.equal(closure.has('src/economy/hoursImport.js'), false);
assert.equal(closure.has('src/mileage/routePlan.js'), false);
assert.equal(closure.has('functions/slimDeploy.test.mjs'), false);

assert.equal(deployNeededForPaths(['src/arbeid/absenceReport.js'], closure), false);
assert.equal(deployNeededForPaths(['src/anbud/intake.js'], closure), true);
assert.equal(deployNeededForPaths(['functions/anbudIntake.js'], closure), true);
assert.equal(deployNeededForPaths(['functions/slimDeploy.test.mjs'], closure), false);
assert.equal(deployNeededForPaths(['scripts/deploy-slim-functions.sh'], closure), true);
assert.equal(deployNeededForPaths(['README.md'], closure), false);

const digest = entriesForChanges(['src/anbud/model.js']);
assert.ok(digest.includes('anbudDigestIndex.js'));
assert.equal(digest.includes('stravaIndex.js'), false);
assert.equal(digest.includes('hospitalityIndex.js'), false);

const strava = entriesForChanges(['functions/strava.js']);
assert.deepEqual(strava, ['stravaIndex.js']);

assert.equal(entriesForChanges(['src/economy/hoursImport.js']).length, 0);
assert.equal(entriesForChanges(['scripts/deploy-slim-functions.sh']).length, DEPLOY_ENTRIES.length);

const script = readFileSync(new URL('./deploy-slim-functions.sh', import.meta.url), 'utf8');
for (const entry of DEPLOY_ENTRIES) {
  assert.match(script, new RegExp(entry.replace(/[.]/g, '\\.')));
}

const batched = DEPLOY_ENTRIES.filter((entry) => entry !== 'anbudDigestIndex.js' && entry !== 'pushIndex.js');
const seen = new Map();
for (const entry of batched) {
  const text = readFileSync(new URL(`../functions/${entry}`, import.meta.url), 'utf8');
  const names = [];
  for (const match of text.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/g)) names.push(match[1]);
  for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.push(name);
    }
  }
  for (const name of names) {
    assert.equal(seen.has(name), false, `${name} eksporteres fra både ${seen.get(name)} og ${entry}`);
    seen.set(name, entry);
  }
}

console.log('functions-deploy-needed.test.mjs: ok');
