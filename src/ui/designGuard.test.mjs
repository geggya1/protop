import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/**
 * «Sperrehake» for designsystemet (UX-02): hardkodede hex-farger, fontSize-tall og
 * borderRadius-tall under screens/ kan bare bli færre. Bruk useColors(), src/ui/tokens
 * og src/ui-komponentene i stedet.
 *
 * Går tallet ned, senk BASELINE til det nye tallet i samme endring (testen sier fra).
 * Går det opp, er det nye magiske tall i en skjerm: bytt dem ut med tokens.
 */
// Møter (#556, screens/meetings) kom inn fra main med egne farger og tall: 206 hex, 218 fontSize og
// 86 borderRadius. Grensen er hevet med akkurat det; resten av screens/ har gått ned. Møtemodulen
// bør over på useColors() og tokens, og da senkes grensen igjen.
export const BASELINE = {
  hex: 2985,
  fontSize: 4224,
  borderRadius: 2209,
};

const root = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(js|jsx|tsx|ts)$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}

const PATTERNS = {
  hex: /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g,
  fontSize: /fontSize:\s*[0-9.]+/g,
  borderRadius: /borderRadius:\s*[0-9.]+/g,
};

export function countDesignDebt(text) {
  const out = {};
  for (const [key, re] of Object.entries(PATTERNS)) out[key] = (String(text).match(re) || []).length;
  return out;
}

test('tellingen finner hex, fontSize og borderRadius som tall', () => {
  assert.deepEqual(
    countDesignDebt("{ color: '#b42318', backgroundColor: '#fff', fontSize: 12, borderRadius: 999, padding: space.md, radius: radius.card }"),
    { hex: 2, fontSize: 1, borderRadius: 1 },
  );
  assert.deepEqual(countDesignDebt('{ fontSize: type.body.fontSize, borderRadius: radius.card }'), { hex: 0, fontSize: 0, borderRadius: 0 });
});

test('hardkodede designverdier under screens/ øker ikke', () => {
  const total = { hex: 0, fontSize: 0, borderRadius: 0 };
  for (const rel of sourceFiles('screens')) {
    const counts = countDesignDebt(readFileSync(join(root, rel), 'utf8'));
    for (const key of Object.keys(total)) total[key] += counts[key];
  }
  for (const key of Object.keys(BASELINE)) {
    assert.ok(
      total[key] <= BASELINE[key],
      `${key}: ${total[key]} under screens/, mer enn grensen ${BASELINE[key]}. Bruk useColors() og src/ui/tokens.`,
    );
    if (total[key] < BASELINE[key]) {
      console.log(`designGuard: ${key} er nede i ${total[key]} (grense ${BASELINE[key]}). Senk BASELINE.${key}.`);
    }
  }
});
