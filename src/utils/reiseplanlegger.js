/**
 * Reiseplanlegger — Firebase CRUD for family trip plans.
 */
import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  assertValidTripInput,
  assertValidDestinationInput,
  assertValidItemInput,
  syncMemberRoles,
  sortedDestinations,
  ROLES,
  emptyTripForm,
  emptyDestinationForm,
  emptyItemForm,
  categorizeTrips,
  buildTimeline,
  routePoints,
  routeMapsUrl,
  routeMapsEmbed,
  tripStatus,
  formatTripDates,
  formatDisplayDate,
  formatDisplayDateTime,
  canEditTrip,
  canViewTrip,
  memberRoleLabel,
  TICKET_KINDS,
  ITEM_TYPES,
  searchTravelPlaces,
  projectRoute,
  worldRouteLayout,
  latLngToWorldXY,
  splitDateTime,
  joinDateTime,
  localDateKey,
} from './reiseplanleggerLogic.js';

export {
  emptyTripForm,
  emptyDestinationForm,
  emptyItemForm,
  categorizeTrips,
  buildTimeline,
  routePoints,
  routeMapsUrl,
  routeMapsEmbed,
  tripStatus,
  formatTripDates,
  formatDisplayDate,
  formatDisplayDateTime,
  canEditTrip,
  canViewTrip,
  memberRoleLabel,
  TICKET_KINDS,
  ITEM_TYPES,
  ROLES,
  searchTravelPlaces,
  projectRoute,
  worldRouteLayout,
  latLngToWorldXY,
  sortedDestinations,
  splitDateTime,
  joinDateTime,
  localDateKey,
};

function tripsCol(familyId) {
  return collection(db, 'families', familyId, 'reiseplaner');
}

function tripDoc(familyId, tripId) {
  return doc(db, 'families', familyId, 'reiseplaner', tripId);
}

function mapDoc(d) {
  return { id: d.id, ...(d.data() || {}) };
}

export function listenTrips(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(
    tripsCol(familyId),
    (snap) => {
      const rows = snap.docs
        .map(mapDoc)
        .filter((t) => t.deleted !== true)
        .sort((a, b) => {
          const sa = a.startDate || '';
          const sb = b.startDate || '';
          if (sa && sb && sa !== sb) return sa.localeCompare(sb);
          const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return tb - ta;
        });
      cb(rows);
    },
    () => cb([]),
  );
}

export async function createTrip(familyId, uid, data, { memberIds = [], memberRoles = {} } = {}) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const base = assertValidTripInput(data);
  const members = syncMemberRoles(memberIds.length ? memberIds : [uid], memberRoles, { ownerUid: uid });
  const ref = await addDoc(tripsCol(familyId), {
    ...base,
    destinations: [],
    visibility: 'family',
    ...members,
    createdBy: uid,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTrip(familyId, tripId, patch, existing = null) {
  if (!familyId || !tripId) throw new Error('Mangler reise.');
  const next = { updatedAt: serverTimestamp() };
  if ('title' in patch || 'startDate' in patch || 'endDate' in patch || 'notes' in patch || 'coverUrl' in patch) {
    const base = existing
      ? patchTripFields(existing, patch)
      : assertValidTripInput({
        title: patch.title ?? 'Reise',
        startDate: patch.startDate,
        endDate: patch.endDate,
        notes: patch.notes,
        coverUrl: patch.coverUrl,
      });
    if ('title' in patch) next.title = base.title;
    if ('startDate' in patch) next.startDate = base.startDate;
    if ('endDate' in patch) next.endDate = base.endDate;
    if ('notes' in patch) next.notes = base.notes;
    if ('coverUrl' in patch) next.coverUrl = base.coverUrl;
  }
  if ('destinations' in patch) next.destinations = patch.destinations;
  if ('memberIds' in patch || 'memberRoles' in patch) {
    const synced = syncMemberRoles(patch.memberIds, patch.memberRoles, {
      ownerUid: patch.ownerUid || null,
    });
    next.memberIds = synced.memberIds;
    next.memberRoles = synced.memberRoles;
  }
  if ('visibility' in patch) next.visibility = patch.visibility === 'members' ? 'members' : 'family';
  await updateDoc(tripDoc(familyId, tripId), next);
}

export async function softDeleteTrip(familyId, tripId) {
  if (!familyId || !tripId) throw new Error('Mangler reise.');
  await updateDoc(tripDoc(familyId, tripId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function setTripMembers(familyId, trip, memberIds, memberRoles, ownerUid) {
  const synced = syncMemberRoles(memberIds, memberRoles, { ownerUid: ownerUid || trip.createdBy });
  await updateTrip(familyId, trip.id, {
    memberIds: synced.memberIds,
    memberRoles: synced.memberRoles,
    ownerUid: ownerUid || trip.createdBy,
  });
}

export async function addDestination(familyId, trip, data) {
  const destinations = sortedDestinations(trip);
  const dest = assertValidDestinationInput(data, destinations.length);
  const next = [...destinations, dest];
  await updateTrip(familyId, trip.id, { destinations: next });
  return dest.id;
}

export async function updateDestination(familyId, trip, destinationId, patch) {
  const destinations = sortedDestinations(trip).map((d) => {
    if (d.id !== destinationId) return d;
    return assertValidDestinationInput({ ...d, ...patch, id: d.id }, d.order);
  });
  await updateTrip(familyId, trip.id, { destinations });
}

export async function removeDestination(familyId, trip, destinationId) {
  const destinations = sortedDestinations(trip)
    .filter((d) => d.id !== destinationId)
    .map((d, i) => ({ ...d, order: i }));
  await updateTrip(familyId, trip.id, { destinations });
}

export async function reorderDestinations(familyId, trip, orderedIds) {
  const byId = Object.fromEntries(sortedDestinations(trip).map((d) => [d.id, d]));
  const destinations = orderedIds
    .map((id, i) => (byId[id] ? { ...byId[id], order: i } : null))
    .filter(Boolean);
  // append any missing
  sortedDestinations(trip).forEach((d) => {
    if (!orderedIds.includes(d.id)) destinations.push({ ...d, order: destinations.length });
  });
  await updateTrip(familyId, trip.id, { destinations });
}

export async function checkInDestination(familyId, trip, destinationId, uid) {
  const destinations = sortedDestinations(trip).map((d) => {
    if (d.id !== destinationId) return d;
    return {
      ...d,
      checkedIn: true,
      checkedInAt: new Date().toISOString(),
      checkedInBy: uid || null,
    };
  });
  await updateTrip(familyId, trip.id, { destinations });
}

export async function addDestinationItem(familyId, trip, destinationId, data, uid) {
  const item = assertValidItemInput({
    ...data,
    createdBy: uid || null,
    createdAt: new Date().toISOString(),
  });
  const destinations = sortedDestinations(trip).map((d) => {
    if (d.id !== destinationId) return d;
    return { ...d, items: [...(d.items || []), item] };
  });
  await updateTrip(familyId, trip.id, { destinations });
  return item.id;
}

export async function updateDestinationItem(familyId, trip, destinationId, itemId, patch) {
  const destinations = sortedDestinations(trip).map((d) => {
    if (d.id !== destinationId) return d;
    return {
      ...d,
      items: (d.items || []).map((it) => {
        if (it.id !== itemId) return it;
        return assertValidItemInput({ ...it, ...patch, id: it.id });
      }),
    };
  });
  await updateTrip(familyId, trip.id, { destinations });
}

export async function removeDestinationItem(familyId, trip, destinationId, itemId) {
  const destinations = sortedDestinations(trip).map((d) => {
    if (d.id !== destinationId) return d;
    return { ...d, items: (d.items || []).filter((it) => it.id !== itemId) };
  });
  await updateTrip(familyId, trip.id, { destinations });
}

export async function addMemory(familyId, trip, destinationId, data, uid) {
  return addDestinationItem(familyId, trip, destinationId, {
    ...data,
    type: ITEM_TYPES.memory,
  }, uid);
}

/** Patch updateTrip title validation when only partial fields sent */
const _origAssert = assertValidTripInput;
export function patchTripFields(existing, patch) {
  return _origAssert({
    title: patch.title ?? existing.title,
    startDate: patch.startDate !== undefined ? patch.startDate : existing.startDate,
    endDate: patch.endDate !== undefined ? patch.endDate : existing.endDate,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    coverUrl: patch.coverUrl !== undefined ? patch.coverUrl : existing.coverUrl,
  });
}
