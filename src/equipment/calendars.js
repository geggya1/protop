/**
 * Firmautstyr som egne kalendere.
 * Ansatte huker av utstyret i margen og booker med samme innkalling som ellers.
 * Tilgang er normalt alle aktive ansatte. Øverste leder og administrator kan snevre inn.
 */

import { colorForExternalCalendar } from '../utils/calendarColors.js';
import { equipmentGroupLayerId, equipmentLayerId } from '../utils/timeGrid.js';
import { displayName } from '../employees/model.js';
import { canAddCompanyVehicle, normalizeBooking, normalizeEquipment } from './model.js';

export { equipmentGroupLayerId, equipmentLayerId };

export const SHOWN_EQUIPMENT_CALENDARS_KEY = 'protop.shownEquipmentCalendars.v1';

export function isActiveCompanyEmployee(employee) {
  if (!employee?.id) return false;
  const status = String(employee.company?.status || 'active').toLowerCase();
  if (status === 'inactive' || status === 'former' || status === 'deleted') return false;
  if (employee.company?.external) return false;
  return true;
}

export function activeCompanyEmployees(employees = []) {
  return (employees || [])
    .filter(isActiveCompanyEmployee)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
}

/** Valgt liste, eller alle aktive når utstyret står på standard. */
export function employeesWhoCanBook(gear, employees = []) {
  const row = normalizeEquipment(gear);
  const active = activeCompanyEmployees(employees);
  if (row.bookingAccess === 'selected') {
    const allowed = new Set(row.bookingEmployeeIds);
    return active.filter((employee) => allowed.has(employee.id));
  }
  return active;
}

export function employeeMayBook(gear, employee) {
  const row = normalizeEquipment(gear);
  if (!row.id || row.scope === 'private' || row.bookable === false || row.status !== 'available') return false;
  if (!isActiveCompanyEmployee(employee)) return false;
  if (row.bookingAccess === 'selected' && !row.bookingEmployeeIds.includes(employee.id)) return false;
  return true;
}

/**
 * Bedriftsutstyr personen har rettighet på (Tilgang-fanen), uansett status.
 * Brukes for alle uten Admin på Utstyr.
 */
export function employeeMaySeeGear(gear, employee) {
  const row = normalizeEquipment(gear);
  if (!row.id || row.scope === 'private') return false;
  if (!isActiveCompanyEmployee(employee)) return false;
  if (row.bookingAccess === 'selected' && !row.bookingEmployeeIds.includes(employee.id)) return false;
  return true;
}

export function canManageEquipmentAccess(levelIds, { bypass = false, previewing = false } = {}) {
  if (previewing) return false;
  return canAddCompanyVehicle(levelIds, { bypass });
}

/**
 * Firmautstyr i Kalender, hendelsesskjemaet og kjøreboken følger Utstyr i tilgangsstyringen,
 * som Utstyr-siden: Admin ser og retter alt. Ellers bare utstyr personen har rettighet på.
 * «Se som bruker» viser det den valgte personen ser.
 * `access` = useCompanyAccess(). `self` = innlogget brukers ansattpost når den er kjent.
 */
export function equipmentViewerAccess(access, { employees = [], self = null } = {}) {
  if (!access?.active) return { canSee: true, manage: true, viewer: self };
  const viewer = access.previewing && access.viewingAs
    ? ((employees || []).find((row) => row.id === access.viewingAs.id) || access.viewingAs)
    : (self || access.employee || null);
  return {
    canSee: !!access.ready && !!access.canView?.('equipment'),
    manage: !!access.ready && !!access.canAdmin?.('equipment'),
    viewer,
  };
}

/** Firmabiler personen kan velge (kjøreboken). `keepId` beholder bilen på en tur som redigeres. */
export function vehiclesForViewer(vehicles = [], { viewer = null, manage = false, keepId = '' } = {}) {
  return (vehicles || []).filter((row) => manage || row.id === keepId || employeeMaySeeGear(row, viewer));
}

export function bookingAccessLabel(gear, employees = []) {
  const people = employeesWhoCanBook(gear, employees);
  if (normalizeEquipment(gear).bookingAccess !== 'selected') {
    return people.length ? `Alle aktive ansatte (${people.length})` : 'Alle aktive ansatte';
  }
  if (!people.length) return 'Ingen valgt';
  const names = people.map((employee) => displayName(employee));
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} + ${names.length - 2}`;
}

export function equipmentCalendarLabel(gear) {
  const row = normalizeEquipment(gear);
  return row.plate ? `${row.name} · ${row.plate}` : row.name;
}

/**
 * Utstyr den ansatte kan huke av i kalenderen.
 * Leder og administrator ser alt som kan bookes, så de kan rette en reservasjon.
 */
export function equipmentCalendarGroup({ equipment = [], employees = [], viewer = null, manage = false } = {}) {
  const children = (equipment || [])
    .map(normalizeEquipment)
    .filter((row) => row.scope !== 'private' && row.bookable && row.status === 'available')
    .filter((row) => manage || employeeMayBook(row, viewer))
    .sort((a, b) => equipmentCalendarLabel(a).localeCompare(equipmentCalendarLabel(b), 'nb'))
    .map((row) => ({
      id: equipmentLayerId(row.id),
      equipmentId: row.id,
      label: equipmentCalendarLabel(row),
      sublabel: row.location || null,
      color: colorForExternalCalendar('company', row.id, 'equipment'),
      shared: true,
    }));
  if (!children.length) return null;
  return {
    id: equipmentGroupLayerId(),
    label: 'Firmautstyr',
    sublabel: 'Huk av og book',
    color: '#0f766e',
    independent: true,
    expandable: true,
    defaultExpanded: true,
    children,
  };
}

export function withEquipmentChecks(group, shownIds) {
  if (!group) return null;
  const shown = shownIds instanceof Set ? shownIds : new Set(shownIds || []);
  const children = (group.children || []).map((child) => ({
    ...child,
    checked: shown.has(child.id),
  }));
  const checked = children.length > 0 && children.every((child) => child.checked);
  return { ...group, checked, children };
}

/** Reservasjon slik kalenderen tegner den. Én serie, samme gjentakelse som hendelsen. */
export function bookingAsCalendarEvent(booking, gear) {
  const row = normalizeBooking(booking);
  if (!row.date || row.status === 'cancelled' || !row.equipmentId) return null;
  const item = gear ? normalizeEquipment(gear) : null;
  const who = row.employeeName || 'Opptatt';
  const purpose = row.purpose && row.purpose !== 'Prosjekt' ? row.purpose : '';
  return {
    id: `equipment:${row.id}`,
    source: 'equipment',
    equipmentId: row.equipmentId,
    equipmentBookingId: row.id,
    eventId: row.eventId || '',
    employeeId: row.employeeId,
    bookingPurpose: row.purpose || '',
    title: purpose ? `${who} · ${purpose}` : who,
    dateKey: row.date,
    endDateKey: row.endDate || row.date,
    startTime: row.start.slice(11, 16),
    endTime: row.end.slice(11, 16),
    place: item?.name || row.equipmentName,
    color: colorForExternalCalendar('company', row.equipmentId, 'equipment'),
    readOnly: false,
    recurring: row.recurring,
    recurrenceType: row.recurrenceType,
    recurrenceInterval: row.recurrenceInterval,
    recurrenceByDays: row.recurrenceByDays,
    recurrenceUntilKey: row.recurrenceUntilKey,
    audience: 'selected',
    memberIds: [],
  };
}

export function equipmentEventsFromBookings(bookings = [], equipment = []) {
  const byId = new Map((equipment || []).map(normalizeEquipment).map((row) => [row.id, row]));
  return (bookings || [])
    .map((row) => bookingAsCalendarEvent(row, byId.get(row.equipmentId)))
    .filter(Boolean);
}
