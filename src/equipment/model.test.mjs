import assert from 'node:assert/strict';
import { emptyProjectState, normalizeProjectState } from '../project/engine.js';
import {
  bookingsOnDate,
  canAddCompanyVehicle,
  companyVehicles,
  employeeVehicles,
  normalizeBooking,
  validateBooking,
  validateEquipment,
} from './model.js';
import {
  cancelBooking,
  setMileageRate,
  upsertBooking,
  upsertEquipment,
  upsertPersonalVehicle,
} from './state.js';
import { deleteTrip, recordDutyTrip } from '../economy/opsState.js';
import { buildOperationsProposals } from '../economy/billingFromOperations.js';
import { normalizeTrip } from '../economy/mileage.js';
import {
  mileageProjectOptions,
  mileageRate,
  projectHasOwnAddress,
  tripCost,
  vehicleOdometer,
} from '../mileage/flow.js';

const gear = validateEquipment({
  name: 'Poolbil 1',
  category: 'poolbil',
  plate: 'EL 12345',
  warrantyUntil: '2028-04-01',
  warrantyUri: 'https://example.com/garanti.pdf',
});
assert.equal(gear.ok, true);
assert.equal(gear.equipment.plate, 'EL12345');
assert.equal(gear.equipment.kind, 'vehicle');
assert.equal(gear.equipment.group, 'kjoretoy');
assert.equal(gear.equipment.scope, 'company');
assert.equal(validateEquipment({ name: '' }).ok, false);

let state = emptyProjectState();
state = upsertEquipment(state, gear.equipment).state;
const car = state.equipment[0];
assert.equal(companyVehicles(state.equipment).length, 1);
assert.equal(canAddCompanyVehicle(['ansatt']), false);
assert.equal(canAddCompanyVehicle(['avdelingsleder']), false);
assert.equal(canAddCompanyVehicle(['leder']), true);
assert.equal(canAddCompanyVehicle(['administrator']), true);
assert.equal(canAddCompanyVehicle(['ansatt'], { bypass: true }), true);

const clash = upsertBooking(state, {
  equipmentId: car.id,
  employeeId: 'a',
  employeeName: 'Ada',
  date: '2026-10-20',
  startTime: '08:00',
  endTime: '12:00',
});
assert.equal(clash.ok, true);
state = clash.state;
const overlap = upsertBooking(state, {
  equipmentId: car.id,
  employeeId: 'b',
  employeeName: 'Bo',
  date: '2026-10-20',
  startTime: '11:00',
  endTime: '15:00',
});
assert.equal(overlap.ok, false);
assert.match(overlap.error, /Opptatt/);
const later = upsertBooking(state, {
  equipmentId: car.id,
  employeeId: 'b',
  employeeName: 'Bo',
  date: '2026-10-20',
  startTime: '12:00',
  endTime: '16:00',
});
assert.equal(later.ok, true);
assert.equal(bookingsOnDate(later.state.equipmentBookings, '2026-10-20').length, 2);
state = cancelBooking(later.state, clash.booking.id).state;
assert.equal(normalizeBooking(state.equipmentBookings.find((row) => row.id === clash.booking.id)).status, 'cancelled');
assert.equal(validateBooking({
  equipmentId: car.id,
  employeeId: 'b',
  date: '2026-10-20',
  startTime: '09:00',
  endTime: '11:00',
}, state.equipmentBookings).ok, true);

state = upsertPersonalVehicle(state, {
  employeeId: 'ada',
  plate: 'ab 12345',
  make: 'Tesla',
  model: 'Y',
  fuel: 'Elektrisk',
}).state;
assert.equal(state.personalVehicles[0].plate, 'AB12345');
assert.equal(state.personalVehicles[0].electric, true);

state = setMileageRate(state, '').state;
assert.equal(mileageRate(state.mileagePolicies).source, 'statutory');
assert.equal(mileageRate(state.mileagePolicies).rate, 3.5);
state = setMileageRate(state, '4,50').state;
assert.equal(mileageRate(state.mileagePolicies).source, 'company');
assert.equal(mileageRate(state.mileagePolicies).rate, 4.5);

state.projects = [
  { id: 'p1', number: '10', name: 'Brygge', status: 'aktiv', client: 'Nord', street: 'Kai 1', postalCode: '0150', placeName: 'Oslo' },
  { id: 'p2', number: '11', name: 'Gammelt', status: 'aktiv', client: 'Sør' },
];
state.timeEntries = [
  { employeeId: 'ada', projectId: 'p1', date: '2026-09-02', hours: 4 },
  { employeeId: 'ada', projectId: 'p2', date: '2026-01-02', hours: 8 },
  { employeeId: 'bo', projectId: 'p2', date: '2026-10-01', hours: 3 },
];
const suggested = mileageProjectOptions(state, 'ada', { today: new Date('2026-10-16T12:00:00') });
assert.deepEqual(suggested.options.map((row) => row.project.id), ['p1']);
assert.equal(suggested.options[0].address, 'Kai 1, 0150 Oslo');
const searched = mileageProjectOptions(state, 'ada', { query: 'gammelt', today: new Date('2026-10-16') });
assert.deepEqual(searched.options.map((row) => row.project.id), ['p2']);
const withMember = mileageProjectOptions({
  ...state,
  members: [{ employeeId: 'ada', projectId: 'p2', active: true }],
}, 'ada', { today: new Date('2026-10-16T12:00:00') });
assert.deepEqual(withMember.options.map((row) => row.project.id).sort(), ['p1', 'p2']);
assert.equal(projectHasOwnAddress(state.projects[0]), true);
assert.equal(projectHasOwnAddress(state.projects[1]), false);
assert.equal(projectHasOwnAddress({ place: 'Foss Eikeland' }), true);
assert.equal(projectHasOwnAddress({ client: 'Kunde' }), false);

const saved = recordDutyTrip(state, {
  date: '2026-10-16',
  employeeId: 'ada',
  employeeName: 'Ada',
  vehicleKind: 'private',
  vehicleId: state.personalVehicles[0].id,
  vehicleName: 'Tesla Y',
  plate: 'AB12345',
  from: 'Kontor',
  to: 'Kai 1, Oslo',
  notes: 'Befaring',
  visitPurpose: 'befaring',
  km: 24,
  oneWayKm: 12,
  tolls: 74,
  ferries: 0,
  rate: 4.5,
  projectId: 'p1',
  projectNumber: '10',
  projectName: 'Brygge',
  customerName: 'Nord',
});
assert.equal(saved.ok, true);
assert.equal(saved.trip.amount, tripCost({ km: 24, rate: 4.5, tolls: 74 }).amount);
assert.equal(saved.trip.expenseId, saved.expense.id);
assert.equal(saved.expense.billable, false);
assert.equal(saved.expense.projectId, 'p1');
assert.equal(saved.expense.tripId, saved.trip.id);
assert.equal(saved.expense.vehicleId, state.personalVehicles[0].id);
assert.equal(saved.state.mileageTrips[0].status, 'approved');
const tracked = {
  id: state.personalVehicles[0].id,
  trackOdometer: true,
  odometerStart: 1000,
  odometerSince: '2026-01-01',
};
assert.equal(vehicleOdometer(tracked, saved.state.mileageTrips).current, 1024);
assert.equal(vehicleOdometer({ ...tracked, odometerSince: '2026-10-17' }, saved.state.mileageTrips).driven, 0);
assert.equal(vehicleOdometer({ ...tracked, trackOdometer: false }, saved.state.mileageTrips), null);
const removed = deleteTrip(saved.state, saved.trip.id);
assert.equal(removed.ok, true);
assert.equal(removed.state.mileageTrips.length, 0);
assert.equal((removed.state.expenses || []).some((row) => row.tripId === saved.trip.id), false);
const invoiced = deleteTrip({
  ...saved.state,
  mileageTrips: [{ ...saved.trip, status: 'invoiced' }],
}, saved.trip.id);
assert.equal(invoiced.ok, false);
const counted = validateEquipment({
  name: 'Bil',
  group: 'kjoretoy',
  plate: 'AB1',
  trackOdometer: true,
  odometerStart: '1000',
  odometerSince: '2026-10-01',
});
assert.equal(counted.equipment.trackOdometer, true);
assert.equal(counted.equipment.odometerStart, 1000);
assert.equal(counted.equipment.odometerSince, '2026-10-01');

const clearedToll = normalizeTrip({
  date: '2026-10-16',
  from: 'A',
  to: 'B',
  notes: 'Befaring',
  km: 10,
  tolls: 0,
  routeCharges: [{ id: 'x', name: 'Oslo bomring', kind: 'toll', amount: 74, passes: 2, unitPrice: 37 }],
});
assert.equal(clearedToll.tolls, 0);
assert.equal(clearedToll.amount, 35);
const fromCharges = normalizeTrip({
  date: '2026-10-16',
  from: 'A',
  to: 'B',
  notes: 'Befaring',
  km: 10,
  routeCharges: [{ id: 'x', name: 'Oslo bomring', kind: 'toll', amount: 74, passes: 2, unitPrice: 37 }],
});
assert.equal(fromCharges.tolls, 74);
const proposal = buildOperationsProposals(saved.state).find((row) => row.trips?.length);
assert.equal(proposal.trips.length, 1);
assert.equal(proposal.expenses.length, 0);
assert.equal(proposal.amountExVat, saved.trip.amount);
const roundTrip = normalizeProjectState(saved.state);
assert.equal(roundTrip.equipment.length, 1);
assert.equal(roundTrip.personalVehicles.length, 1);
assert.equal(roundTrip.mileagePolicies[0].ratePerKm, 4.5);
assert.equal(roundTrip.mileageTrips.length, 1);

const room = validateEquipment({ name: 'Møterom A', group: 'rom' });
assert.equal(room.ok, true);
assert.equal(room.equipment.group, 'rom');
assert.equal(room.equipment.kind, 'room');
assert.equal(room.equipment.bookable, true);
const privateCar = validateEquipment({
  name: 'Min bil',
  group: 'kjoretoy',
  scope: 'private',
  ownerEmployeeId: 'ada',
  plate: 'en 63224',
});
assert.equal(privateCar.equipment.scope, 'private');
assert.equal(privateCar.equipment.plate, 'EN63224');
assert.equal(companyVehicles([gear.equipment, privateCar.equipment]).length, 1);
assert.equal(employeeVehicles([], [privateCar.equipment], 'ada')[0].plate, 'EN63224');
assert.equal(employeeVehicles([], [privateCar.equipment], 'bo').length, 0);
