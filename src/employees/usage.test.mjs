import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmployee } from './model.js';
import {
  applyUsageSummary,
  clientIpFromHeaders,
  formatUsageStamp,
  normalizeUsageEvent,
  sanitizeIp,
  usageSummaryLines,
} from './usage.js';

test('IP leses fra forespørselen og forkastes når den er ugyldig', () => {
  assert.equal(clientIpFromHeaders({ 'x-forwarded-for': '203.0.113.8, 10.0.0.1' }), '203.0.113.8');
  assert.equal(clientIpFromHeaders({ 'x-forwarded-for': '::ffff:198.51.100.4' }), '198.51.100.4');
  assert.equal(sanitizeIp('ikke-en-ip'), '');
  assert.equal(sanitizeIp('2001:db8::1'), '2001:db8::1');
});

test('hendelser normaliseres og oppdaterer sist aktiv og sist time', () => {
  const hour = normalizeUsageEvent({
    type: 'hour',
    summary: '7.5 t · 2026-10-11 · Broa',
    detail: { hours: 7.5, date: '2026-10-11', projectName: 'Broa', secret: 'skal-bort' },
    companyId: 'fam1',
    employeeId: 'emp1',
  }, {
    at: '2026-10-11T15:04:00.000Z',
    ip: '203.0.113.8',
    userAgent: 'Mozilla',
    actorUid: 'user_1',
  });
  assert.equal(hour.detail.secret, undefined);
  assert.equal(hour.detail.hours, 7.5);
  assert.equal(hour.ip, '203.0.113.8');
  const summary = applyUsageSummary(null, hour);
  assert.equal(summary.lastHourAt, hour.at);
  // IP-adressen står i hendelsen, ikke i sammendraget på ansattposten (L-03).
  assert.equal(summary.lastActiveIp, '');
  assert.match(summary.lastHourSummary, /Broa/);

  const login = normalizeUsageEvent({ type: 'login' }, {
    at: '2026-10-11T08:00:00.000Z',
    ip: '198.51.100.20',
    actorUid: 'user_1',
  });
  const afterLogin = applyUsageSummary(summary, login);
  assert.equal(afterLogin.lastLoginAt, login.at);
  assert.equal(afterLogin.lastHourAt, hour.at);
  assert.equal(normalizeUsageEvent({ type: 'password' }), null);
});

test('sammendraget kan vises og følger med på medarbeideren', () => {
  const employee = normalizeEmployee({
    id: 'emp1',
    usage: {
      lastActiveAt: '2026-10-11T15:04:00.000Z',
      lastActiveIp: '203.0.113.8',
      lastHourAt: '2026-10-11T15:04:00.000Z',
      lastHourSummary: '7.5 t',
    },
  });
  const lines = usageSummaryLines(employee.usage);
  // Eldre sammendrag med IP-adresse: vises ikke, og fjernes neste gang posten lagres.
  assert.equal(lines.find((row) => row.id === 'ip'), undefined);
  assert.equal(employee.usage.lastActiveIp, '');
  assert.match(lines.find((row) => row.id === 'hour')?.value, /7\.5 t/);
  assert.match(formatUsageStamp('2026-10-11T15:04:00.000Z'), /\d{2}\.\d{2}\.2026/);
});
