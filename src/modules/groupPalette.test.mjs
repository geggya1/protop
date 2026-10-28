import assert from 'node:assert/strict';
import { COMPANY_DRAWER_GROUPS } from '../navigation/shellModules.js';
import { HELP_SECTIONS } from '../help/protopPages.js';
import { GROUP_PALETTE } from './groupPalette.js';

function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Hver menygruppe (og hver seksjon i hjelpen) har én farge.
for (const group of COMPANY_DRAWER_GROUPS) {
  assert.ok(GROUP_PALETTE[group.id], `${group.id} mangler farge`);
}
for (const section of HELP_SECTIONS) {
  assert.ok(GROUP_PALETTE[section.id], `${section.id} (hjelp) mangler farge`);
}

// Teksten på båndet og i hjelpen skal holde WCAG AA (4,5:1).
for (const [id, row] of Object.entries(GROUP_PALETTE)) {
  for (const key of ['bg', 'bg2', 'soft']) {
    const ratio = contrast(row.accent, row[key]);
    assert.ok(ratio >= 4.5, `${id}: ${row.accent} på ${key} ${row[key]} gir ${ratio.toFixed(2)}`);
  }
}

console.log('groupPalette.test.mjs ok');
