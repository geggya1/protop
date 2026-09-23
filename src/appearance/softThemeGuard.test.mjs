import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const soft = readFileSync(new URL('../../components/parentHome/softTheme.js', import.meta.url), 'utf8');
assert.equal(soft.includes('adaptiveColor'), false, 'soft dashboard must not follow dark appearance');
assert.equal(soft.includes('SOFT_DARK'), false);
assert.match(soft, /ink:\s*'#1F2630'/);
assert.match(soft, /card:\s*'#FFFFFF'/);

const eventForm = readFileSync(new URL('../../screens/v2/EventFormScreen.jsx', import.meta.url), 'utf8');
assert.match(eventForm, /capsule:[\s\S]*?backgroundColor:\s*colors\.sunken/);
assert.match(eventForm, /chip:[\s\S]*?backgroundColor:\s*colors\.sunken/);
assert.equal(eventForm.includes("backgroundColor: '#eef2f7'"), false);
assert.equal(eventForm.includes("backgroundColor: '#f1f5f9'"), false);

console.log('softThemeGuard.test.mjs ok');
