import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedPublishDate, latestPointInfo, nextPeriod, shortDate } from './indexLedger.js';

test('neste periode går over årsskiftet', () => {
  assert.equal(nextPeriod('2026M12'), '2027M01');
  assert.equal(nextPeriod('2026K4'), '2027K1');
  assert.equal(nextPeriod('2026K2'), '2026K3');
});

test('anslått publisering ligger etter periodens slutt', () => {
  assert.equal(shortDate(expectedPublishDate('2026K3', '08662')), '21. okt. 2026');
  assert.equal(shortDate(expectedPublishDate('2026M09', '14710')), '10. okt. 2026');
  assert.equal(expectedPublishDate('2026K3', '99999'), null);
});

test('info om siste punkt viser endring og neste tall', () => {
  const series = {
    'bki-veg': {
      table: '08662',
      points: [{ period: '2026K2', value: 107.5 }, { period: '2026K3', value: 109.1 }],
    },
  };
  const info = latestPointInfo({ id: 'bki-veg', series, now: new Date(2026, 10, 2) });
  assert.equal(info.period, '2026K3');
  assert.equal(info.title, '3. kvartal 2026: 109,1');
  assert.ok(info.lines.some((line) => line.startsWith('+1,5 % fra 2. kvartal 2026')));
  assert.ok(info.lines.some((line) => line.includes('4. kvartal 2026 kommer, ventet ca. 21. jan. 2027')));
});

test('registrert dato fra historikken brukes når den finnes', () => {
  const series = { kpi: { table: '14710', points: [{ period: '2026M09', value: 104 }] } };
  const history = [{ id: 'kpi', period: '2026M09', foundAt: '2026-10-10T07:00:00.000Z' }];
  const info = latestPointInfo({ id: 'kpi', series, history, now: new Date(2026, 10, 20) });
  assert.match(info.lines[0], /registrert i ProTop 10\. okt\. 2026/);
  assert.match(info.lines.at(-2), /oktober 2026 var ventet ca\. 10\. nov\. 2026, men er ikke hentet ennå/);
});
