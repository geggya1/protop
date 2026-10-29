/**
 * Ansatte på den offentlige bedriftssiden. Alt om personen hentes fra ansattregisteret;
 * siden lagrer bare rekkefølgen og om eksterne skal være med (publicPage.staff).
 *
 * Med: eget personell med status Aktiv. Eksterne og innleide (også Aktiv) bare når
 * includeExternal er på. Permisjon, deaktivert, sluttet og papirkurv vises ikke.
 */
import { employmentState } from '../employees/employmentState.js';
import { kindOf } from '../employees/employmentFlags.js';
import { departmentLabels } from '../employees/model.js';

function text(value) {
  return String(value ?? '').trim();
}

function photoOf(value) {
  const raw = text(value);
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
  return /^https:\/\/[^\s]+$/i.test(raw) ? raw : '';
}

/** Norske numre som på visittkort: mobil 472 78 899, fasttelefon 52 05 52 10. Andre land som lagret. */
function phoneLabel(value) {
  const raw = text(value);
  let digits = raw.replace(/\D/g, '');
  if (/^(\+47|0047)/.test(raw.replace(/\s/g, '')) && digits.length >= 10) digits = digits.replace(/^(00)?47/, '');
  else if (/^\+/.test(raw)) return raw;
  if (digits.length !== 8) return raw;
  if (/^[49]/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/** Kort grad etter navnet (f.eks. «Siv. ing.»). Lengre utdanningstekst passer ikke på kortet. */
function degreeOf(value) {
  const raw = text(value);
  return raw.length <= 24 ? raw : '';
}

/** Alle aktive i registeret som kan vises, eksterne merket. Rekkefølgen er registerets. */
export function staffCandidates(employees, departments = []) {
  return (Array.isArray(employees) ? employees : [])
    .filter((row) => text(row?.id) && employmentState(row) === 'active')
    .map((row) => {
      const person = row?.person || {};
      const company = row?.company || {};
      const name = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
      return {
        id: text(row.id),
        name: name || 'Ansatt',
        degree: degreeOf(person.educationLevel),
        title: text(company.title || row?.cv?.headline),
        department: departmentLabels(row, departments).join(', '),
        email: text(company.email || person.email),
        phone: phoneLabel(person.phone),
        photoUrl: photoOf(person.photoUrl),
        external: kindOf(row) !== 'staff',
      };
    });
}

/** Lagret rekkefølge først, så de som ikke er sortert ennå, etter navn. */
export function orderStaff(rows, order = []) {
  const rank = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index]));
  return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'nb');
  });
}

/** Personene slik siden viser dem. */
export function profileStaff(employees, { departments = [], includeExternal = false, order = [] } = {}) {
  return orderStaff(staffCandidates(employees, departments), order)
    .filter((row) => includeExternal || !row.external);
}

/**
 * Dra fromId til plassen til toId. Fremover havner kortet etter målet, bakover foran,
 * som når man drar et kort i en rad.
 */
export function moveStaffOrder(ids, fromId, toId) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  const from = list.indexOf(fromId);
  const to = list.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return list;
  const out = list.slice();
  out.splice(from, 1);
  out.splice(to, 0, fromId);
  return out;
}

/**
 * Flytt én plass blant dem som vises (shown), med skjulte eksterne liggende i ro.
 * direction: -1 tidligere, 1 senere.
 */
export function shiftStaffOrder(allIds, shownIds, id, direction) {
  const shown = Array.isArray(shownIds) ? shownIds : [];
  const index = shown.indexOf(id);
  const neighbor = shown[index + direction];
  if (index < 0 || !neighbor) return Array.isArray(allIds) ? allIds.slice() : [];
  return moveStaffOrder(allIds, id, neighbor);
}
