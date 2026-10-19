import assert from 'node:assert/strict';
import { deployNeededForPaths, functionSourceClosure } from './functions-deploy-needed.mjs';

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

console.log('functions-deploy-needed.test.mjs: ok');
