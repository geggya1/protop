/**
 * L-09: «Tillat AI-funksjoner». Alle skjermer som sender importfiler til AI, går gjennom
 * guardAi (useCompanyAiGuard), så importen leses lokalt når bedriften har slått AI av.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('askImportInterpret kalles bare via guardAi i skjermene', () => {
  const hits = [];
  for (const dir of ['screens', 'components']) {
    for (const rel of readdirSync(join(root, dir), { recursive: true })) {
      if (!/\.(js|jsx)$/.test(rel) || /\.test\./.test(rel)) continue;
      const code = readFileSync(join(root, dir, rel), 'utf8');
      code.split('\n').forEach((line, index) => {
        if (/askImportInterpret\(payload\)/.test(line)) hits.push({ file: `${dir}/${rel}`, line: index + 1, text: line.trim() });
      });
    }
  }
  assert.ok(hits.some((hit) => hit.file.endsWith('EmployeesScreen.jsx')), 'Ansatte bruker AI-importen');
  const open = hits.filter((hit) => !/guardAi\(\(payload\) => askImportInterpret\(payload\)\)/.test(hit.text));
  assert.deepEqual(open, [], 'AI-kall uten guardAi');
});
