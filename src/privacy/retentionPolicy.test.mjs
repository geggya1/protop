import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USAGE_RETENTION_DAYS } from './companyPrivacy.js';
import {
  ACCESS_LOG_RETENTION_DAYS, RETENTION_POLICY, lastDeletableAccountingYear, retentionCutoffIso, retentionDays,
  retentionEntry, retentionLabel,
} from './retentionPolicy.js';

const doc = readFileSync(new URL('../../docs/personvern/lagringstider.md', import.meta.url), 'utf8');

// Hver kategori har frist, utgangspunkt og grunnlag, og står i dokumentet.
const ids = new Set();
for (const entry of RETENTION_POLICY) {
  assert.ok(!ids.has(entry.id), `${entry.id} står to ganger`);
  ids.add(entry.id);
  assert.ok(retentionDays(entry) > 0, `${entry.id} mangler frist`);
  assert.ok(entry.label && entry.from, `${entry.id} mangler tekst`);
  assert.ok(Array.isArray(entry.basis) && entry.basis.length, `${entry.id} mangler grunnlag`);
  assert.ok(['implemented', 'locked', 'proposal'].includes(entry.status), entry.id);
  // Bare det som faktisk slettes i koden, er slått på. Forslag venter på eierens beslutning.
  assert.equal(entry.enabled, entry.status === 'implemented', `${entry.id}: enabled følger status`);
  assert.ok(doc.includes(`(\`${entry.id}\`)`), `${entry.id} mangler i docs/personvern/lagringstider.md`);
}
for (const id of ['accessLog', 'timeEntries', 'absences', 'chat', 'customers', 'isoCases', 'isoInjuries', 'invoices']) {
  assert.ok(ids.has(id), `${id} mangler`);
}

// Innsynsloggen: to år, og den er implementert.
assert.equal(ACCESS_LOG_RETENTION_DAYS, 730);
assert.equal(retentionLabel(retentionEntry('accessLog')), '2 år');
assert.equal(retentionDays(retentionEntry('usageLog')), USAGE_RETENTION_DAYS);
const now = new Date('2026-10-28T00:00:00.000Z');
assert.equal(retentionCutoffIso('accessLog', now), '2024-10-28T00:00:00.000Z');
// Forslag gir ingen frist før de er slått på.
assert.equal(retentionCutoffIso('chat', now), '');
assert.equal(retentionCutoffIso('ukjent', now), '');
const on = RETENTION_POLICY.map((row) => (row.id === 'chat' ? { ...row, enabled: true } : row));
assert.equal(retentionCutoffIso('chat', now, on), new Date(now.getTime() - 720 * 24 * 3600 * 1000).toISOString());

// Fem år etter regnskapsårets slutt: i 2026 kan 2020 og eldre slettes.
assert.equal(lastDeletableAccountingYear(5, now), 2020);
assert.equal(retentionLabel(retentionEntry('absenceComments')), '12 måneder');
assert.equal(retentionLabel({ keep: { days: 90 } }), '90 dager');

console.log('retentionPolicy.test.mjs: ok');
