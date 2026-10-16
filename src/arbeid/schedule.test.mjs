import assert from 'node:assert/strict';
import {
  departureOf,
  formatScheduleDate,
  normalizeScheduleRow,
  parseScheduleDate,
  replaceSchedule,
  scheduleFromPercent,
  scheduleRange,
  scheduledHours,
} from './schedule.js';

const early = {
  id: 'spring',
  from: '2026-04-01',
  days: scheduleFromPercent(100, 8),
};
const later = {
  id: 'autumn',
  from: '2026-09-01',
  days: {
    ...scheduleFromPercent(100, 8),
    fri: { hours: 0, arrival: '0:00', adjustment: '0:00' },
  },
};

{
  const saved = replaceSchedule([early], later).schedules;
  assert.deepEqual(saved.map((row) => row.from), ['2026-04-01', '2026-09-01']);
  const spring = scheduleRange(saved[0], saved);
  const autumn = scheduleRange(saved[1], saved);
  assert.equal(formatScheduleDate(spring.from), '01.04.2026');
  assert.equal(formatScheduleDate(spring.to), '31.08.2026');
  assert.equal(spring.open, false);
  assert.equal(autumn.open, true);
  assert.equal(formatScheduleDate(autumn.from), '01.09.2026');

  const employee = { company: { workPercent: '50' }, extras: { schedules: saved } };
  assert.equal(scheduledHours(employee, new Date(2026, 7, 31), 7.5), 8);
  assert.equal(scheduledHours(employee, new Date(2026, 8, 1), 7.5), 8);
  assert.equal(scheduledHours(employee, new Date(2026, 8, 4), 7.5), 0);
}

{
  const closed = { ...early, to: '2026-08-31' };
  const employee = { company: { workPercent: '50' }, extras: { schedules: [closed] } };
  assert.equal(scheduledHours(employee, new Date(2026, 7, 31), 8), 8);
  assert.equal(scheduledHours(employee, new Date(2026, 8, 1), 8), 4);
}

{
  assert.equal(parseScheduleDate('01.09.2026'), '2026-09-01');
  assert.equal(parseScheduleDate('2026-09-01'), '2026-09-01');
  assert.equal(parseScheduleDate('31.02.2026'), '');
  const row = normalizeScheduleRow({
    id: 'p1',
    from: '01.09.2026',
    to: '',
    days: { mon: { hours: '8:00', arrival: '7:00', leave: '15:00', adjustment: '0:00' } },
  });
  assert.equal(row.ok, true);
  assert.equal(row.row.days.mon.leave, undefined);
  assert.equal(departureOf(row.row.days.mon), '15:00');
  const custom = normalizeScheduleRow({
    id: 'p1',
    from: '01.09.2026',
    days: { mon: { hours: '7:30', arrival: '8:00', leave: '16:00', adjustment: '0:30' } },
  });
  assert.equal(custom.row.days.mon.leave, '16:00');
  assert.equal(replaceSchedule([row.row], { ...row.row, id: 'p2' }).ok, false);
}

{
  const saved = replaceSchedule([early], later).schedules;
  const winter = normalizeScheduleRow({
    id: 'winter',
    from: '01.01.2027',
    days: scheduleFromPercent(80, 7.5),
  });
  const next = replaceSchedule(saved, winter.row);
  assert.equal(next.ok, true);
  assert.equal(next.schedules.length, 3);
  const autumn = next.schedules.find((row) => row.id === 'autumn');
  assert.equal(scheduleRange(autumn, next.schedules).to, '2026-12-31');
  assert.equal(scheduleRange(next.schedules[2], next.schedules).open, true);
}

console.log('schedule.test.mjs: ok');
