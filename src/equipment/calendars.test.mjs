import assert from 'node:assert/strict';
import { eventOccursOnDate } from '../utils/events.js';
import { calendarIdOf, equipmentLayerId, isCalendarLayerHidden } from '../utils/timeGrid.js';
import { emptyProjectState } from '../project/engine.js';
import {
  bookingDateKeys,
  bookingsOnDate,
  validateBooking,
} from './model.js';
import {
  replaceEventBookings,
  setEquipmentBookingPolicy,
  upsertBooking,
  upsertEquipment,
} from './state.js';
import {
  activeCompanyEmployees,
  bookingAccessLabel,
  bookingAsCalendarEvent,
  canManageEquipmentAccess,
  employeeMayBook,
  employeesWhoCanBook,
  equipmentCalendarGroup,
  withEquipmentChecks,
  employeeMaySeeGear,
  equipmentViewerAccess,
  vehiclesForViewer,
} from './calendars.js';

const ada = { id: 'ada', person: { firstName: 'Ada' }, company: { status: 'active' } };
const bo = { id: 'bo', person: { firstName: 'Bo' }, company: { status: 'active' } };
const old = { id: 'old', person: { firstName: 'Ola' }, company: { status: 'inactive' } };
const hired = { id: 'ext', person: { firstName: 'Eva' }, company: { status: 'active', external: true } };

assert.deepEqual(activeCompanyEmployees([old, hired, bo, ada]).map((row) => row.id), ['ada', 'bo']);
assert.equal(canManageEquipmentAccess(['ansatt']), false);
assert.equal(canManageEquipmentAccess(['leder']), true);
assert.equal(canManageEquipmentAccess(['administrator']), true);
assert.equal(canManageEquipmentAccess(['leder'], { previewing: true }), false);

// Uten Admin ser personen bare bedriftsutstyr hen har rettighet på.
const polestar = { id: 'polestar', name: 'Polestar', bookingAccess: 'selected', bookingEmployeeIds: ['ada'] };
assert.equal(employeeMaySeeGear(polestar, ada), true);
assert.equal(employeeMaySeeGear(polestar, bo), false);
assert.equal(employeeMaySeeGear({ id: 'drill', name: 'Drill', status: 'service' }, bo), true);
assert.equal(employeeMaySeeGear({ ...polestar, bookingAccess: 'active' }, hired), false);
assert.equal(employeeMaySeeGear({ id: 'car', name: 'Min bil', scope: 'private' }, bo), false);

let state = emptyProjectState();
state = upsertEquipment(state, { name: 'Poolbil 1', category: 'poolbil', plate: 'EL12345' }).state;
state = upsertEquipment(state, { name: 'Møterom 2', group: 'rom', location: '1. etasje' }).state;
const car = state.equipment.find((row) => row.name === 'Poolbil 1');
const room = state.equipment.find((row) => row.name === 'Møterom 2');

assert.equal(car.bookingAccess, 'active');
assert.equal(car.allowRepeating, true);
assert.equal(employeeMayBook(car, ada), true);
assert.equal(employeeMayBook(car, old), false);
assert.equal(employeeMayBook(car, hired), false);
assert.equal(bookingAccessLabel(car, [ada, bo, old]), 'Alle aktive ansatte (2)');

state = setEquipmentBookingPolicy(state, {
  equipmentId: car.id,
  bookingAccess: 'selected',
  bookingEmployeeIds: ['ada', 'old'],
  allowRepeating: false,
}).state;
const limited = state.equipment.find((row) => row.id === car.id);
assert.deepEqual(employeesWhoCanBook(limited, [ada, bo, old]).map((row) => row.id), ['ada']);
assert.equal(employeeMayBook(limited, ada), true);
assert.equal(employeeMayBook(limited, bo), false);
assert.equal(limited.allowRepeating, false);

const denied = upsertBooking(state, {
  equipmentId: car.id,
  employeeId: 'bo',
  employeeName: 'Bo',
  date: '2026-10-20',
  startTime: '08:00',
  endTime: '10:00',
  enforceAccess: true,
  employees: [ada, bo],
});
assert.equal(denied.ok, false);
assert.match(denied.error, /kan ikke booke/);

const series = upsertBooking(state, {
  equipmentId: room.id,
  employeeId: 'ada',
  employeeName: 'Ada',
  date: '2026-10-19',
  startTime: '09:00',
  endTime: '11:00',
  purpose: 'Mandagsmøte',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [1],
  enforceAccess: true,
  employees: [ada, bo],
});
assert.equal(series.ok, true);
const monday = bookingAsCalendarEvent(series.booking, room);
assert.equal(monday.source, 'equipment');
assert.equal(calendarIdOf(monday, 'co'), equipmentLayerId(room.id));
assert.equal(eventOccursOnDate(monday, new Date(2026, 9, 26)), true);
assert.equal(bookingsOnDate(series.state.equipmentBookings, '2026-10-26').length, 1);
assert.equal(bookingsOnDate(series.state.equipmentBookings, '2026-10-20').length, 0);
assert.equal(eventOccursOnDate(monday, new Date(2026, 9, 20)), false);
assert.equal(isCalendarLayerHidden(monday, new Set(['eq:company']), 'co'), true);

const clash = upsertBooking(series.state, {
  equipmentId: room.id,
  employeeId: 'bo',
  employeeName: 'Bo',
  date: '2026-10-26',
  startTime: '10:00',
  endTime: '12:00',
});
assert.equal(clash.ok, false);
assert.match(clash.error, /Opptatt/);

const noRepeat = upsertBooking(state, {
  equipmentId: car.id,
  employeeId: 'ada',
  employeeName: 'Ada',
  date: '2026-10-20',
  startTime: '08:00',
  endTime: '09:00',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [2],
});
assert.equal(noRepeat.ok, false);
assert.match(noRepeat.error, /regelmessig/);

const booked = replaceEventBookings(series.state, {
  eventId: 'evt-1',
  equipmentIds: [room.id],
  employeeId: 'bo',
  employeeName: 'Bo',
  date: '2026-11-02',
  startTime: '13:00',
  endTime: '14:00',
  purpose: 'Status',
  manage: true,
});
assert.equal(booked.ok, true);
assert.equal(booked.state.equipmentBookings.filter((row) => row.eventId === 'evt-1' && row.status !== 'cancelled').length, 1);

const cleared = replaceEventBookings(booked.state, {
  eventId: 'evt-1',
  equipmentIds: [],
  employeeId: 'bo',
  manage: true,
});
assert.equal(cleared.state.equipmentBookings.find((row) => row.eventId === 'evt-1').status, 'cancelled');

const forAda = equipmentCalendarGroup({
  equipment: state.equipment,
  employees: [ada, bo],
  viewer: ada,
  manage: false,
});
assert.equal(forAda.label, 'Firmautstyr');
assert.equal(forAda.children.length, 2);
const forBo = equipmentCalendarGroup({
  equipment: state.equipment,
  employees: [ada, bo],
  viewer: bo,
  manage: false,
});
assert.equal(forBo.children.length, 1);
assert.equal(forBo.children[0].equipmentId, room.id);
const checked = withEquipmentChecks(forBo, new Set([forBo.children[0].id]));
assert.equal(checked.checked, true);
assert.equal(checked.children[0].checked, true);

const managerSeesCar = equipmentCalendarGroup({
  equipment: state.equipment,
  employees: [ada, bo],
  viewer: bo,
  manage: true,
});
assert.equal(managerSeesCar.children.length, 2);

assert.equal(validateBooking({
  equipmentId: room.id,
  employeeId: 'ada',
  date: '2026-10-20',
  startTime: '08:00',
  endTime: '09:00',
}).ok, true);
assert.ok(bookingDateKeys(series.booking).includes('2026-10-19'));
assert.ok(bookingDateKeys(series.booking).includes('2026-11-02'));

// Kalender, hendelsesskjema og kjørebok følger Utstyr i tilgangsstyringen, ikke nivånavnet.
{
  const grants = { equipment: 'see' };
  const access = {
    active: true,
    ready: true,
    previewing: false,
    viewingAs: null,
    employee: ada,
    canView: (r) => ['see', 'read', 'write'].includes(grants[r]),
    canAdmin: (r) => grants[r] === 'write',
  };
  const reader = equipmentViewerAccess(access, { employees: [ada, bo] });
  assert.deepEqual({ canSee: reader.canSee, manage: reader.manage, viewer: reader.viewer?.id }, { canSee: true, manage: false, viewer: 'ada' });
  // «Se som»: den valgte personens utstyr, ikke innlogget bruker.
  const preview = equipmentViewerAccess({ ...access, previewing: true, viewingAs: { id: 'bo' } }, { employees: [ada, bo] });
  assert.equal(preview.viewer.id, 'bo');
  // Uten Utstyr i tilgangsstyringen: ikke noe firmautstyr.
  assert.equal(equipmentViewerAccess({ ...access, canView: () => false }).canSee, false);
  const cars = [polestar, { id: 'tesla', name: 'Tesla' }];
  assert.deepEqual(vehiclesForViewer(cars, { viewer: bo }).map((c) => c.id), ['tesla']);
  assert.deepEqual(vehiclesForViewer(cars, { viewer: ada }).map((c) => c.id), ['polestar', 'tesla']);
  assert.deepEqual(vehiclesForViewer(cars, { viewer: bo, manage: true }).map((c) => c.id), ['polestar', 'tesla']);
  assert.deepEqual(vehiclesForViewer(cars, { viewer: bo, keepId: 'polestar' }).map((c) => c.id), ['polestar', 'tesla']);
}
