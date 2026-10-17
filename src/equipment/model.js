/**
 * Utstyr, reservasjoner og den ansattes egne biler.
 * Ren data inn / data ut, slik at kalender og kjørebok deler samme register.
 */

import { equipmentCategory, equipmentGroup } from './catalog.js';

function text(value) {
  return String(value ?? '').trim();
}

function stampDate(value) {
  const raw = text(value);
  if (!raw) return '';
  return raw.slice(0, 10);
}

function clock(value, fallback) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function equipmentInterval(row) {
  const date = stampDate(row?.date || row?.start);
  const startClock = clock(row?.startTime || String(row?.start || '').slice(11, 16), '08:00');
  const endClock = clock(row?.endTime || String(row?.end || '').slice(11, 16), '16:00');
  const start = `${date}T${startClock}`;
  let end = `${date}T${endClock}`;
  if (end <= start) end = `${date}T23:59`;
  return { date, start, end };
}

export function normalizeEquipment(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const hinted = equipmentGroup(row.group || row.category);
  const category = equipmentCategory(
    EQUIPMENT_CATEGORY_IDS.has(row.category)
      ? row.category
      : (hinted.id === 'kjoretoy' ? 'poolbil' : hinted.id === 'rom' ? 'rom' : 'annet'),
  );
  const group = equipmentGroup(row.group || category.group || category.id);
  const kind = group.id === 'kjoretoy' ? 'vehicle' : group.id === 'rom' ? 'room' : category.kind;
  const status = ['available', 'service', 'retired'].includes(row.status) ? row.status : 'available';
  return {
    id: text(row.id),
    name: text(row.name),
    category: category.id,
    group: group.id,
    kind,
    scope: row.scope === 'private' ? 'private' : 'company',
    ownerEmployeeId: text(row.ownerEmployeeId),
    ownerName: text(row.ownerName),
    plate: text(row.plate).toUpperCase().replace(/[^A-Z0-9ÆØÅ]/gi, ''),
    serial: text(row.serial),
    make: text(row.make),
    model: text(row.model),
    year: text(row.year),
    fuel: text(row.fuel),
    electric: !!row.electric,
    location: text(row.location),
    status,
    bookable: row.bookable !== false && status === 'available',
    purchasedAt: stampDate(row.purchasedAt),
    warrantyUntil: stampDate(row.warrantyUntil),
    warrantyVendor: text(row.warrantyVendor),
    warrantyNote: text(row.warrantyNote),
    warrantyUri: text(row.warrantyUri),
    notes: text(row.notes),
    vegvesenSummary: text(row.vegvesenSummary),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function validateEquipment(input) {
  const row = normalizeEquipment(input);
  if (!row.name) return { ok: false, error: 'Utstyret trenger et navn.', equipment: row };
  if (row.category === 'poolbil' && row.plate && row.plate.length < 2) {
    return { ok: false, error: 'Skiltnummeret er for kort.', equipment: row };
  }
  return { ok: true, error: null, equipment: row };
}

export function normalizeBooking(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const interval = equipmentInterval(row);
  const status = row.status === 'cancelled' ? 'cancelled' : 'reserved';
  return {
    id: text(row.id),
    equipmentId: text(row.equipmentId),
    equipmentName: text(row.equipmentName),
    employeeId: text(row.employeeId),
    employeeName: text(row.employeeName),
    projectId: text(row.projectId),
    projectName: text(row.projectName),
    date: interval.date,
    start: interval.start,
    end: interval.end,
    purpose: text(row.purpose),
    status,
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function validateBooking(input, bookings = []) {
  const row = normalizeBooking(input);
  if (!row.equipmentId) return { ok: false, error: 'Velg utstyr som skal reserveres.', booking: row };
  if (!row.date) return { ok: false, error: 'Velg dato.', booking: row };
  if (!row.employeeId) return { ok: false, error: 'Reservasjonen mangler ansatt.', booking: row };
  const clash = (bookings || []).find((other) => (
    other.id !== row.id
    && other.equipmentId === row.equipmentId
    && other.status !== 'cancelled'
    && row.status !== 'cancelled'
    && row.start < other.end
    && other.start < row.end
  ));
  if (clash) {
    const who = clash.employeeName || 'en annen';
    return { ok: false, error: `Opptatt ${clash.start.slice(11)}–${clash.end.slice(11)} (${who}).`, booking: row };
  }
  return { ok: true, error: null, booking: row };
}

export function normalizePersonalVehicle(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  return {
    id: text(row.id),
    employeeId: text(row.employeeId),
    employeeName: text(row.employeeName),
    plate: text(row.plate).toUpperCase().replace(/[^A-Z0-9ÆØÅ]/gi, ''),
    nickname: text(row.nickname),
    make: text(row.make),
    model: text(row.model),
    year: text(row.year),
    fuel: text(row.fuel),
    electric: !!row.electric || /el|elektr/i.test(text(row.fuel)),
    vegvesenSummary: text(row.vegvesenSummary),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function validatePersonalVehicle(input) {
  const row = normalizePersonalVehicle(input);
  if (!row.employeeId) return { ok: false, error: 'Bilen må knyttes til en ansatt.', vehicle: row };
  if (!row.plate) return { ok: false, error: 'Skriv inn skiltnummer.', vehicle: row };
  return { ok: true, error: null, vehicle: row };
}

const EQUIPMENT_CATEGORY_IDS = new Set([
  'poolbil', 'drone', 'ipad', 'termokamera', 'verktoy', 'annet', 'rom',
]);

export function companyVehicles(equipment = []) {
  return (equipment || [])
    .map(normalizeEquipment)
    .filter((row) => (
      row.scope !== 'private'
      && row.bookable
      && row.status === 'available'
      && (row.group === 'kjoretoy' || row.category === 'poolbil' || row.kind === 'vehicle')
    ));
}

/** Egne biler fra kjøreboken, pluss privat kjøretøy i utstyrsregisteret. */
export function employeeVehicles(personalVehicles = [], equipment = [], employeeId = '') {
  const own = vehiclesForEmployee(personalVehicles, employeeId);
  const plates = new Set(own.map((row) => row.plate));
  const id = text(employeeId);
  const gear = (equipment || [])
    .map(normalizeEquipment)
    .filter((row) => (
      row.scope === 'private'
      && row.ownerEmployeeId === id
      && row.plate
      && (row.group === 'kjoretoy' || row.kind === 'vehicle')
      && !plates.has(row.plate)
    ))
    .map((row) => ({
      id: row.id,
      employeeId: row.ownerEmployeeId,
      employeeName: row.ownerName,
      plate: row.plate,
      nickname: row.name,
      make: row.make,
      model: row.model,
      year: row.year,
      fuel: row.fuel,
      electric: row.electric,
      vegvesenSummary: row.vegvesenSummary,
    }));
  return [...own, ...gear];
}

export function vehiclesForEmployee(vehicles = [], employeeId = '') {
  const id = text(employeeId);
  return (vehicles || [])
    .map(normalizePersonalVehicle)
    .filter((row) => row.employeeId === id && row.plate);
}

export function vehicleTitle(row) {
  const name = text(row?.nickname || row?.name);
  const car = [row?.make, row?.model].filter(Boolean).join(' ');
  const plate = text(row?.plate);
  return [name || car || 'Bil', plate].filter(Boolean).join(' · ');
}

export function bookingsOnDate(bookings = [], date) {
  const key = stampDate(date);
  return (bookings || [])
    .map(normalizeBooking)
    .filter((row) => row.status !== 'cancelled' && row.date === key)
    .sort((a, b) => a.start.localeCompare(b.start));
}
