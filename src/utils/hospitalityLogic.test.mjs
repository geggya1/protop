import assert from 'node:assert/strict';
import {
  isValidNukiPin,
  generateNukiPin,
  lockValidityWindow,
  nukiAuthName,
  renderTemplate,
  buildMessageVars,
  computeMessageSendAt,
  shouldSendMessage,
  messageDedupeKey,
  nextReservationStatus,
  detectChannelFromIcalUrl,
  parseIcalEvents,
  mergeIcalReservations,
  reviewScoreLabel,
  connectionHealth,
  statusLabelNb,
  RESERVATION_STATUS,
  MESSAGE_TRIGGERS,
  CHANNELS,
  DEFAULT_MESSAGE_TEMPLATES,
} from './hospitalityLogic.js';

// --- Nuki PIN ---
assert.equal(isValidNukiPin('252525'), true);
assert.equal(isValidNukiPin('121212'), false); // starts with 12
assert.equal(isValidNukiPin('252520'), false); // contains 0
assert.equal(isValidNukiPin('25252'), false);
assert.equal(isValidNukiPin('abcdef'), false);

const pin = generateNukiPin(['111111']);
assert.equal(isValidNukiPin(pin), true);
assert.notEqual(pin, '111111');

const many = new Set();
for (let i = 0; i < 30; i += 1) many.add(generateNukiPin([...many]));
assert.equal(many.size, 30);

// --- Lock window ---
const win = lockValidityWindow('2026-08-26T15:00:00.000Z', '2026-08-28T11:00:00.000Z', {
  earlyHours: 2,
  lateHours: 1,
});
assert.equal(win.allowedFromDate, '2026-08-26T13:00:00.000Z');
assert.equal(win.allowedUntilDate, '2026-08-28T12:00:00.000Z');

assert.throws(() => lockValidityWindow('bad', '2026-08-28T11:00:00.000Z'));
assert.throws(() => lockValidityWindow('2026-08-28T15:00:00.000Z', '2026-08-26T11:00:00.000Z'));

assert.ok(nukiAuthName('Ola Nordmann', 'abcdef123456').length <= 20);
assert.equal(nukiAuthName('', 'x').length > 0, true);

// --- Templates ---
const rendered = renderTemplate('Hei {{guestName}} – kode {{lockCode}}', {
  guestName: 'Kari',
  lockCode: '334455',
});
assert.equal(rendered, 'Hei Kari – kode 334455');

const vars = buildMessageVars(
  {
    guestName: 'Per',
    checkIn: '2026-08-26T15:00:00.000Z',
    checkOut: '2026-08-27T11:00:00.000Z',
    channel: 'airbnb',
  },
  {
    name: 'Hytta',
    address: 'Fjellveien 1',
    wifiName: 'HytteWifi',
    wifiPassword: 'secret',
    checkInInstructions: 'Bruk sideinngangen',
  },
  { code: '987654', allowedFromDate: '2026-08-26T13:00:00.000Z', allowedUntilDate: '2026-08-27T12:00:00.000Z' },
);
assert.equal(vars.guestName, 'Per');
assert.equal(vars.propertyName, 'Hytta');
assert.equal(vars.lockCode, '987654');
assert.equal(vars.wifiName, 'HytteWifi');
assert.match(vars.checkIn, /2026|aug|26/i);

// --- Message scheduling ---
const reservation = {
  id: 'r1',
  status: RESERVATION_STATUS.confirmed,
  checkIn: '2026-08-26T15:00:00.000Z',
  checkOut: '2026-08-28T11:00:00.000Z',
  confirmedAt: '2026-08-20T10:00:00.000Z',
};

const t3 = {
  id: 'checkin_3h',
  trigger: MESSAGE_TRIGGERS.hours_before_checkin,
  offsetHours: 3,
  enabled: true,
};
const sendAt = computeMessageSendAt(t3, reservation);
assert.equal(sendAt.toISOString(), '2026-08-26T12:00:00.000Z');

assert.equal(
  shouldSendMessage(t3, reservation, { now: new Date('2026-08-26T12:30:00.000Z') }),
  true,
);
assert.equal(
  shouldSendMessage(t3, reservation, { now: new Date('2026-08-26T11:00:00.000Z') }),
  false,
);
assert.equal(
  shouldSendMessage(t3, reservation, {
    now: new Date('2026-08-26T12:30:00.000Z'),
    alreadySentKeys: [messageDedupeKey(t3, reservation)],
  }),
  false,
);
assert.equal(
  shouldSendMessage(t3, { ...reservation, status: RESERVATION_STATUS.cancelled }, {
    now: new Date('2026-08-26T12:30:00.000Z'),
  }),
  false,
);

const confirmTpl = {
  id: 'confirm',
  trigger: MESSAGE_TRIGGERS.booking_confirmed,
  offsetHours: 0,
  enabled: true,
};
assert.equal(
  computeMessageSendAt(confirmTpl, reservation).toISOString(),
  '2026-08-20T10:00:00.000Z',
);

const reviewTpl = {
  id: 'review',
  trigger: MESSAGE_TRIGGERS.review_request,
  offsetHours: 24,
  enabled: true,
};
assert.equal(
  computeMessageSendAt(reviewTpl, reservation).toISOString(),
  '2026-08-29T11:00:00.000Z',
);

assert.ok(DEFAULT_MESSAGE_TEMPLATES.length >= 4);

// --- Status machine ---
assert.equal(nextReservationStatus(RESERVATION_STATUS.inquiry, 'confirm'), RESERVATION_STATUS.confirmed);
assert.equal(nextReservationStatus(RESERVATION_STATUS.confirmed, 'check_in'), RESERVATION_STATUS.checked_in);
assert.equal(nextReservationStatus(RESERVATION_STATUS.checked_in, 'check_out'), RESERVATION_STATUS.checked_out);
assert.equal(nextReservationStatus(RESERVATION_STATUS.confirmed, 'cancel'), RESERVATION_STATUS.cancelled);
assert.equal(nextReservationStatus(RESERVATION_STATUS.checked_out, 'cancel'), null);
assert.equal(nextReservationStatus(RESERVATION_STATUS.confirmed, 'no_show'), RESERVATION_STATUS.no_show);

// --- Channel detection ---
assert.equal(detectChannelFromIcalUrl('https://www.airbnb.com/calendar/ical/123.ics?s=x'), CHANNELS.airbnb);
assert.equal(detectChannelFromIcalUrl('https://ical.booking.com/v1/export?t=abc'), CHANNELS.booking);
assert.equal(detectChannelFromIcalUrl('https://example.com/cal.ics'), CHANNELS.ical);

// --- iCal parse ---
const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc-123@airbnb.com
DTSTART:20260826T150000Z
DTEND:20260828T110000Z
SUMMARY:Kari Nordmann
DESCRIPTION:Phone: +47 90000000
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:cancel-1
DTSTART:20260901T150000Z
DTEND:20260903T110000Z
SUMMARY:Reserved
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

const events = parseIcalEvents(ics);
assert.equal(events.length, 2);
assert.equal(events[0].guestName, 'Kari Nordmann');
assert.equal(events[0].externalId, 'abc-123@airbnb.com');
assert.equal(events[0].status, RESERVATION_STATUS.confirmed);
assert.equal(events[1].status, RESERVATION_STATUS.cancelled);
assert.equal(events[0].checkIn, '2026-08-26T15:00:00.000Z');

// Folded line support
const folded = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fold-1
DTSTART:20260826
DTEND:20260827
SUMMARY:Line
  continued
END:VEVENT
END:VCALENDAR`;
const foldedEvents = parseIcalEvents(folded);
assert.equal(foldedEvents.length, 1);
assert.match(foldedEvents[0].guestName, /Linecontinued|Line continued/);

// --- Merge ---
const existing = [
  {
    id: 'doc1',
    externalId: 'abc-123@airbnb.com',
    sourceId: 'src1',
    status: RESERVATION_STATUS.confirmed,
    checkIn: '2026-08-26T15:00:00.000Z',
    checkOut: '2026-08-28T11:00:00.000Z',
    guestName: 'Kari Nordmann',
  },
  {
    id: 'doc2',
    externalId: 'gone-1',
    sourceId: 'src1',
    status: RESERVATION_STATUS.confirmed,
    checkIn: '2026-07-01T15:00:00.000Z',
    checkOut: '2026-07-03T11:00:00.000Z',
    guestName: 'Old',
  },
];
const upserts = mergeIcalReservations(existing, events, {
  channel: CHANNELS.airbnb,
  propertyId: 'p1',
  sourceId: 'src1',
  now: new Date('2026-08-25T12:00:00.000Z'),
});
const actions = upserts.map((u) => u.action);
assert.ok(actions.includes('create')); // cancel-1 new
assert.ok(upserts.some((u) => u.action === 'update' && u.id === 'doc2' && u.data.status === RESERVATION_STATUS.cancelled));

// Date change detection
const moved = mergeIcalReservations(
  [existing[0]],
  [{
    ...events[0],
    checkOut: '2026-08-29T11:00:00.000Z',
  }],
  { channel: CHANNELS.airbnb, propertyId: 'p1', sourceId: 'src1' },
);
assert.equal(moved.length, 1);
assert.equal(moved[0].action, 'update');
assert.equal(moved[0].data.checkOut, '2026-08-29T11:00:00.000Z');

// --- Reviews / health ---
assert.equal(reviewScoreLabel(4.9), 'Utmerket');
assert.equal(reviewScoreLabel(3.2), 'Middels');
assert.equal(statusLabelNb(RESERVATION_STATUS.cancelled), 'Kansellert');

  const health = connectionHealth([
  { type: 'airbnb', messagingReady: true, oauthConnected: true },
  { type: 'nuki', connected: true, apiTokenSet: true },
]);
assert.equal(health.find((h) => h.type === 'airbnb').connected, true);
assert.equal(health.find((h) => h.type === 'airbnb').oauthConnected, true);
assert.equal(health.find((h) => h.type === 'airbnb').messagingReady, true);

const icalHealth = connectionHealth([
  { type: 'airbnb', connected: true, icalUrl: 'https://airbnb.com/x.ics', calendarOnly: true },
]);
assert.equal(icalHealth.find((h) => h.type === 'airbnb').connected, false);
assert.equal(icalHealth.find((h) => h.type === 'airbnb').calendarOnly, true);

console.log('hospitalityLogic.test.mjs: all passed');
