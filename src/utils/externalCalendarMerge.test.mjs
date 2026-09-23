import assert from 'node:assert/strict';
import {
  mergeExternalEvents,
  clientEventsFillingGaps,
  combineExternalCalendarErrors,
  calendarSyncNotice,
} from './externalCalendarMerge.js';

const job = { id: 'ms-job-x-1', dateKey: '2026-08-27', startTime: '09:00', connectionId: 'job', title: 'server job' };
const personal = { id: 'ms-home-x-1', dateKey: '2026-08-27', startTime: '18:00', connectionId: 'home', title: 'home' };
const sameGraphId = { id: 'ms-job-AAMk-2026-08-27', dateKey: '2026-08-27', startTime: '09:00', connectionId: 'job', title: 'consult1' };
const sameGraphOther = { id: 'ms-home-AAMk-2026-08-27', dateKey: '2026-08-27', startTime: '09:00', connectionId: 'home', title: 'invest-as' };
const mergedSame = mergeExternalEvents([sameGraphId, sameGraphOther], []);
assert.equal(mergedSame.length, 2);

const clientJob = { ...job, title: 'client overwrite' };

const merged = mergeExternalEvents([job, personal], [clientJob]);
assert.equal(merged.length, 2);
assert.equal(merged.find((e) => e.id === 'ms-job-x-1').title, 'server job');
assert.equal(merged.find((e) => e.connectionId === 'home').id, 'ms-home-x-1');

const gaps = clientEventsFillingGaps([job], [clientJob, personal]);
assert.equal(gaps.length, 1);
assert.equal(gaps[0].connectionId, 'home');

const errors = combineExternalCalendarErrors(
  [{ connectionId: 'home', message: 'Outlook-økten utløp' }],
  [{ connectionId: 'home', message: 'Outlook-økten utløp' }],
  [{ message: 'other' }],
);
assert.equal(errors.length, 2);

assert.equal(calendarSyncNotice({ connections: [{ id: 'job', type: 'microsoft' }] }), null);

const notice = calendarSyncNotice({
  connections: [
    { id: 'job', type: 'microsoft', email: 'job@firma.no' },
    { id: 'home', type: 'microsoft', email: 'meg@outlook.com', lastError: 'Outlook-økten utløp', needsReauth: true },
  ],
  fetchErrors: [{ connectionId: 'home', message: 'Outlook-økten utløp' }],
});
assert.ok(notice);
assert.equal(notice.reconnect, true);
assert.match(notice.message, /meg@outlook.com/);

const swallowedWouldHaveBeen = calendarSyncNotice({
  connections: [
    { id: 'job', type: 'microsoft', email: 'job@firma.no' },
    { id: 'home', type: 'microsoft', needsReauth: true, lastError: 'expired' },
  ],
  fetchErrors: [],
});
assert.ok(swallowedWouldHaveBeen);
assert.match(swallowedWouldHaveBeen.message, /synkroniserer ikke/);

const unnamed = calendarSyncNotice({
  connections: [
    { id: 'job', type: 'microsoft', email: 'geir@consult1.no' },
    { id: 'home', type: 'microsoft', email: 'geir@invest-as.no' },
  ],
  fetchErrors: [{ message: 'Klarte ikke hente eksterne kalendere' }],
});
assert.ok(unnamed);
assert.equal(unnamed.reconnect, false);
assert.match(unnamed.message, /Klarte ikke hente/);

const skipWarning = calendarSyncNotice({
  connections: [
    { id: 'home', type: 'microsoft', email: 'goa@invest-as.no', lastError: 'Hoppet over kalendere uten lesetilgang (Ferie) i goa@invest-as.no.' },
  ],
  fetchErrors: [],
});
assert.equal(skipWarning, null);

const rateLimited = calendarSyncNotice({
  connections: [{ id: 'job', type: 'microsoft', email: 'job@firma.no' }],
  fetchErrors: [{ message: 'For mange kall til fetchExternalCalendarEvents (4/min).' }],
});
assert.equal(rateLimited, null);

const afterReload = calendarSyncNotice({
  connections: [
    { id: 'job', type: 'microsoft', email: 'geir@consult1.no' },
    { id: 'home', type: 'microsoft', email: 'geir@invest-as.no', lastError: 'Outlook-økten utløp', needsReauth: true },
  ],
  fetchErrors: [{ message: 'Klarte ikke hente eksterne kalendere' }],
});
assert.ok(afterReload);
assert.equal(afterReload.reconnect, true);
assert.match(afterReload.message, /geir@invest-as.no/);
assert.match(afterReload.message, /Koble til på nytt/);

console.log('externalCalendarMerge ok');
