/**
 * Mutasjoner for utstyr, reservasjoner, egne biler og kjøresats.
 */

import { createId } from '../project/engine.js';
import { employeeMayBook } from './calendars.js';
import {
  controlBlocking,
  linkControlFinding,
  normalizeBooking,
  normalizeEquipment,
  recordControl,
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

/**
 * Legg lokale endringer (before → after) inn i en ferskere liste, f.eks. skyens kopi.
 * Endrede og nye rader erstatter etter id, fjernede rader tas ut, resten beholdes.
 */
export function patchRowsById(fresh, before, after) {
  const previous = new Map((before || []).filter((row) => row?.id).map((row) => [row.id, JSON.stringify(row)]));
  const kept = new Set((after || []).map((row) => row?.id).filter(Boolean));
  const changed = (after || []).filter((row) => row?.id && previous.get(row.id) !== JSON.stringify(row));
  const changedIds = new Set(changed.map((row) => row.id));
  const removed = new Set([...previous.keys()].filter((id) => !kept.has(id)));
  return [
    ...changed,
    ...(fresh || []).filter((row) => row?.id && !changedIds.has(row.id) && !removed.has(row.id)),
  ];
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
  const normalizedGear = normalizeEquipment(gear);
  if (normalizedGear.bookable === false || normalizedGear.status === 'retired') {
    return fail(state, 'Utstyret kan ikke reserveres.');
  }
  // Kalibrering, sakkyndig kontroll eller EU-kontroll med passert frist: sperret til kontrollen er registrert.
  const blocked = check.booking.status !== 'cancelled' ? controlBlocking(normalizedGear, check.booking.date) : null;
  if (blocked) {
    return fail(state, `${normalizedGear.name}: ${blocked.label.toLowerCase()} forfalt ${blocked.next}. Kan ikke reserveres før kontrollen er registrert.`);
  }
  if (check.booking.recurring && normalizedGear.allowRepeating === false) {
    return fail(state, `${normalizedGear.name} kan ikke bookes regelmessig.`);
  }
  if (input.enforceAccess && !input.manage) {
    const employee = (input.employees || []).find((row) => row.id === check.booking.employeeId);
    if (!employeeMayBook(normalizedGear, employee)) {
      return fail(state, `Du kan ikke booke ${normalizedGear.name}.`);
    }
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

function text(value) {
  return String(value ?? '').trim();
}

/** Bytt hvilke utstyr en kalenderhendelse reserverer. Feil ruller ikke tilbake delvis. */
export function replaceEventBookings(state, input = {}) {
  const eventId = text(input.eventId);
  if (!eventId) return fail(state, 'Bookingen mangler kalenderhendelse.');
  const wanted = [...new Set((input.equipmentIds || []).map((id) => text(id)).filter(Boolean))];
  for (const equipmentId of wanted) {
    const gear = (state.equipment || []).find((row) => row.id === equipmentId);
    if (!gear) return fail(state, 'Utstyret finnes ikke.');
    const normalizedGear = normalizeEquipment(gear);
    if (input.enforceAccess && !input.manage) {
      const employee = (input.employees || []).find((row) => row.id === input.employeeId);
      if (!employeeMayBook(normalizedGear, employee)) {
        return fail(state, `Du kan ikke booke ${normalizedGear.name}.`);
      }
    }
    const existing = (state.equipmentBookings || []).find((row) => (
      row.eventId === eventId && row.equipmentId === equipmentId && row.status !== 'cancelled'
    ));
    const probe = upsertBooking(state, {
      ...input,
      id: existing?.id,
      equipmentId,
      eventId,
      purpose: input.purpose || input.title || '',
    });
    if (!probe.ok) return fail(state, probe.error);
  }
  let next = state;
  for (const row of state.equipmentBookings || []) {
    if (row.eventId === eventId && row.status !== 'cancelled' && !wanted.includes(row.equipmentId)) {
      const cancelled = cancelBooking(next, row.id);
      if (!cancelled.ok) return fail(state, cancelled.error);
      next = cancelled.state;
    }
  }
  for (const equipmentId of wanted) {
    const existing = (next.equipmentBookings || []).find((row) => (
      row.eventId === eventId && row.equipmentId === equipmentId && row.status !== 'cancelled'
    ));
    const saved = upsertBooking(next, {
      ...input,
      id: existing?.id,
      equipmentId,
      eventId,
      purpose: input.purpose || input.title || '',
    });
    if (!saved.ok) return fail(state, saved.error);
    next = saved.state;
  }
  return ok(next);
}

export function cancelEventBookings(state, eventId) {
  const id = text(eventId);
  if (!id) return ok(state);
  let next = state;
  for (const row of state.equipmentBookings || []) {
    if (row.eventId === id && row.status !== 'cancelled') {
      const cancelled = cancelBooking(next, row.id);
      if (cancelled.ok) next = cancelled.state;
    }
  }
  return ok(next);
}

/** Gjennomført kontroll eller kalibrering på utstyret (ny frist ut fra intervallet). */
export function recordEquipmentControl(state, equipmentId, controlId, input = {}) {
  const gear = (state.equipment || []).find((row) => row.id === equipmentId);
  if (!gear) return fail(state, 'Utstyret finnes ikke.');
  const res = recordControl(gear, controlId, input);
  if (!res.ok) return fail(state, res.error);
  const saved = upsertEquipment(state, res.equipment);
  return saved.ok ? ok(saved.state, { equipment: saved.equipment, control: res.control, deviation: res.deviation }) : saved;
}

/** Saken som ble meldt for et kontrollavvik, lagres på kontrollen (avvik koblet til utstyret). */
export function linkEquipmentFinding(state, equipmentId, controlId, finding) {
  const gear = (state.equipment || []).find((row) => row.id === equipmentId);
  if (!gear) return fail(state, 'Utstyret finnes ikke.');
  return upsertEquipment(state, linkControlFinding(gear, controlId, finding));
}

/** Hvem som kan booke, og om serien kan gjentas. Bare leder og administrator kaller denne. */
export function setEquipmentBookingPolicy(state, input = {}) {
  const gear = (state.equipment || []).find((row) => row.id === input.equipmentId);
  if (!gear) return fail(state, 'Utstyret finnes ikke.');
  const selected = input.bookingAccess === 'selected';
  return upsertEquipment(state, {
    ...gear,
    bookingAccess: selected ? 'selected' : 'active',
    bookingEmployeeIds: selected ? input.bookingEmployeeIds : [],
    allowRepeating: input.allowRepeating !== false,
  });
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
