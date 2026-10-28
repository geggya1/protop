import assert from 'node:assert/strict';
import { FILES, TIMEOUT_MS } from './run-verify-web.mjs';

assert.ok(TIMEOUT_MS <= 60_000);
assert.ok(TIMEOUT_MS >= 15_000);
assert.ok(FILES.includes('functions/slimDeploy.test.mjs'));
assert.ok(FILES.includes('scripts/functions-deploy-needed.test.mjs'));
assert.ok(FILES.includes('functions/anbud/intakeScan.test.mjs'));
assert.ok(FILES.includes('functions/inviteBrand.test.mjs'), 'invitasjonene sendes som ProTop');
assert.ok(FILES.includes('scripts/old-brand.test.mjs'), 'det gamle produktnavnet kommer ikke tilbake');
assert.ok(FILES.includes('src/utils/legacyNames.test.mjs'), 'lagrede nøkler og gamle innlogginger virker');
assert.equal(new Set(FILES).size, FILES.length);
assert.ok(FILES.includes('src/help/assistantEngine.test.mjs'), 'hjelpen og assistenten testes i CI');
assert.ok(FILES.includes('src/help/protopPages.test.mjs'), 'alle sider har hjelp');
assert.ok(FILES.includes('src/help/helpAccess.test.mjs'), 'hjelpen følger tilgangsnivået');
assert.ok(FILES.includes('src/help/assistantTasks.test.mjs'), 'assistentens oppgaver peker på ekte steg');
assert.ok(FILES.includes('src/anbud/hitStore.test.mjs'), 'anbudstreffene blir liggende mellom besøk');
assert.ok(FILES.includes('src/employees/employeeReadAccess.test.mjs'), 'Lese på ansatte ser bare hovedsiden på andre');
assert.ok(FILES.includes('src/project/projectAccess.test.mjs'), 'prosjektsiden følger tilgangsstyringen');
assert.ok(FILES.includes('src/access/accessRules.test.mjs'), 'prosjekt og kjøretøy følger tilgangsstyringen overalt');
assert.ok(FILES.includes('src/utils/companyChat.test.mjs'), 'chatten i bedriften skiller faste ansatte og eksterne');
assert.ok(FILES.includes('src/meetings/meetings.test.mjs'), 'møtene, referatet og PDF-en testes i CI');

assert.ok(FILES.includes('src/utils/mailModel.test.mjs'), 'e-post: svar, mottakere, utkast og flagg testes i CI');

console.log('run-verify-web.test.mjs: ok');
