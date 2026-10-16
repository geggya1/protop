/**
 * Mutasjoner for utstyr, reservasjoner, egne biler og kjøresats.
 */

import { createId } from '../project/engine.js';
import {
  normalizeBooking,
  normalizeEquipment,
  normalizePersonalVehicle,
  validateBooking,
  validateEquipment,
  validatePersonalVehicle,
} from './model.js';

function stamp() {
  return new Date().toISOString();
}

function ok(state, extra = {}) {
  return { ok: true, error: null, state, ...extra };
}

function fail(state, error) {
  return { ok: false, error, state };
}

function replaceById(list, row) {
  const rest = (list || []).filter((item) => item.id !== row.id);
  return [row, ...rest];
}

export function upsertEquipment(state, input) {
  const check = validateEquipment(input);
  if (!check.ok) return fail(state, check.error);
  const existing = (state.equipment || []).find((row) => row.id && row.id === input.id);
  const row = normalizeEquipment({
    ...check.equipment,
    id: existing?.id || input.id || createId('ust'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({ ...state, equipment: replaceById(state.equipment || [], row) }, { equipment: row });
}

export function removeEquipment(state, id) {
  const current = (state.equipment || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Utstyret finnes ikke.');
  return ok({
    ...state,
    equipment: (state.equipment || []).filter((row) => row.id !== id),
  });
}

export function upsertBooking(state, input) {
  const check = validateBooking(input, state.equipmentBookings || []);
  if (!check.ok) return fail(state, check.error);
  const gear = (state.equipment || []).find((row) => row.id === check.booking.equipmentId);
  if (!gear) return fail(state, 'Utstyret finnes ikke.');
  if (gear.bookable === false || gear.status === 'retired') {
    return fail(state, 'Utstyret kan ikke reserveres.');
  }
  const existing = (state.equipmentBookings || []).find((row) => row.id && row.id === input.id);
  const row = normalizeBooking({
    ...check.booking,
    equipmentName: gear.name || check.booking.equipmentName,
    id: existing?.id || input.id || createId('res'),
    createdAt: existing?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({
    ...state,
    equipmentBookings: replaceById(state.equipmentBookings || [], row),
  }, { booking: row });
}

export function cancelBooking(state, id) {
  const current = (state.equipmentBookings || []).find((row) => row.id === id);
  if (!current) return fail(state, 'Reservasjonen finnes ikke.');
  const row = normalizeBooking({ ...current, status: 'cancelled', updatedAt: stamp() });
  return ok({
    ...state,
    equipmentBookings: replaceById(state.equipmentBookings, row),
  }, { booking: row });
}

export function upsertPersonalVehicle(state, input) {
  const check = validatePersonalVehicle(input);
  if (!check.ok) return fail(state, check.error);
  const existing = (state.personalVehicles || []).find((row) => row.id && row.id === input.id);
  const duplicate = (state.personalVehicles || []).find((row) => (
    row.id !== existing?.id
    && row.employeeId === check.vehicle.employeeId
    && row.plate === check.vehicle.plate
  ));
  const row = normalizePersonalVehicle({
    ...check.vehicle,
    id: duplicate?.id || existing?.id || input.id || createId('bil'),
    createdAt: existing?.createdAt || duplicate?.createdAt || stamp(),
    updatedAt: stamp(),
  });
  return ok({
    ...state,
    personalVehicles: replaceById(state.personalVehicles || [], row),
  }, { vehicle: row });
}

export function removePersonalVehicle(state, id) {
  if (!(state.personalVehicles || []).some((row) => row.id === id)) {
    return fail(state, 'Bilen finnes ikke.');
  }
  return ok({
    ...state,
    personalVehicles: state.personalVehicles.filter((row) => row.id !== id),
  });
}

/** Tom sats betyr statens regulativ. Driften setter kroner per km her. */
export function setMileageRate(state, ratePerKm) {
  const rate = Number(String(ratePerKm ?? '').replace(',', '.'));
  const row = {
    id: 'company',
    ratePerKm: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : 0,
    updatedAt: stamp(),
  };
  return ok({
    ...state,
    mileagePolicies: replaceById(state.mileagePolicies || [], row),
  }, { policy: row });
}
