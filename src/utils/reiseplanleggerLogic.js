/**
 * Pure logic for Reiseplanlegger — trips, destinations, timeline, roles.
 */

export const ROLES = Object.freeze({
  planner: 'planner',
  reader: 'reader',
});

export const ITEM_TYPES = Object.freeze({
  activity: 'activity',
  todo: 'todo',
  ticket: 'ticket',
  event: 'event',
  note: 'note',
  photo: 'photo',
  memory: 'memory',
});

export const TICKET_KINDS = Object.freeze([
  { id: 'flight', label: 'Flybillett', icon: 'airplane-outline' },
  { id: 'ferry', label: 'Ferje', icon: 'boat-outline' },
  { id: 'train', label: 'Tog', icon: 'train-outline' },
  { id: 'bus', label: 'Buss', icon: 'bus-outline' },
  { id: 'hotel', label: 'Overnatting', icon: 'bed-outline' },
  { id: 'car', label: 'Leiebil', icon: 'car-outline' },
  { id: 'event', label: 'Event / billett', icon: 'ticket-outline' },
  { id: 'other', label: 'Annet', icon: 'document-text-outline' },
]);

export const TICKET_BY_ID = Object.fromEntries(TICKET_KINDS.map((k) => [k.id, k]));

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyTripForm() {
  return {
    title: '',
    startDate: '',
    endDate: '',
    coverUrl: null,
    notes: '',
  };
}

export function emptyDestinationForm() {
  return {
    name: '',
    location: null,
    arriveAt: '',
    leaveAt: '',
    notes: '',
    coverUrl: null,
  };
}

export function emptyItemForm(type = ITEM_TYPES.activity) {
  return {
    type,
    ticketKind: 'flight',
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    url: '',
    confirmationCode: '',
    imageUrl: null,
  };
}

export function normalizeRole(role) {
  return role === ROLES.planner ? ROLES.planner : ROLES.reader;
}

export function canEditTrip(trip, uid, { isFamilyAdmin = false } = {}) {
  if (!trip || !uid) return false;
  if (isFamilyAdmin) return true;
  if (trip.createdBy === uid) return true;
  const role = trip.memberRoles?.[uid] || (trip.memberIds?.includes(uid) ? ROLES.reader : null);
  return role === ROLES.planner;
}

export function canViewTrip(trip, uid, {
  isFamilyMember = false,
  isGrandparent = false,
} = {}) {
  if (!trip || trip.deleted) return false;
  if (!uid) return false;
  if (trip.createdBy === uid) return true;
  if (Array.isArray(trip.memberIds) && trip.memberIds.includes(uid)) return true;
  // Besteforeldre er familie-medlemmer, men skal kun se reiser de er invitert inn i.
  if (isGrandparent) return false;
  if (isFamilyMember && (!trip.memberIds?.length || trip.visibility === 'family')) return true;
  return false;
}

export function assertValidTripInput(data) {
  const title = String(data?.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Gi reisen et navn.');
  const startDate = String(data?.startDate || '').trim();
  const endDate = String(data?.endDate || '').trim();
  if (startDate && endDate && startDate > endDate) {
    throw new Error('Sluttdato kan ikke være før startdato.');
  }
  return {
    title,
    startDate: startDate || null,
    endDate: endDate || startDate || null,
    notes: String(data?.notes || '').trim().slice(0, 4000),
    coverUrl: data?.coverUrl || null,
  };
}

export function assertValidDestinationInput(data, order = 0) {
  const name = String(data?.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Gi destinasjonen et navn.');
  const loc = data?.location && typeof data.location === 'object' ? data.location : null;
  return {
    id: data?.id || newId('dest'),
    name,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    location: loc ? {
      label: String(loc.label || name).slice(0, 240),
      lat: loc.lat != null ? Number(loc.lat) : null,
      lng: loc.lng != null ? Number(loc.lng) : null,
      placeId: loc.placeId || null,
      source: loc.source || null,
      shortName: loc.shortName ? String(loc.shortName).slice(0, 120) : null,
    } : { label: name, lat: null, lng: null, placeId: null, source: null, shortName: null },
    arriveAt: String(data?.arriveAt || '').trim() || null,
    leaveAt: String(data?.leaveAt || '').trim() || null,
    notes: String(data?.notes || '').trim().slice(0, 4000),
    coverUrl: data?.coverUrl || null,
    checkedIn: !!data?.checkedIn,
    checkedInAt: data?.checkedInAt || null,
    checkedInBy: data?.checkedInBy || null,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export function assertValidItemInput(data) {
  const type = ITEM_TYPES[data?.type] ? data.type : ITEM_TYPES.activity;
  const title = String(data?.title || '').trim().slice(0, 160);
  if (!title) throw new Error('Gi elementet en tittel.');
  const ticketKind = type === ITEM_TYPES.ticket
    ? (TICKET_BY_ID[data?.ticketKind] ? data.ticketKind : 'other')
    : null;
  return {
    id: data?.id || newId('item'),
    type,
    ticketKind,
    title,
    description: String(data?.description || '').trim().slice(0, 4000),
    startAt: String(data?.startAt || '').trim() || null,
    endAt: String(data?.endAt || '').trim() || null,
    url: String(data?.url || '').trim().slice(0, 500) || null,
    confirmationCode: String(data?.confirmationCode || '').trim().slice(0, 80) || null,
    imageUrl: data?.imageUrl || null,
    done: !!data?.done,
    createdAt: data?.createdAt || null,
    createdBy: data?.createdBy || null,
  };
}

/** Local calendar day key YYYY-MM-DD (avoids UTC shift from toISOString). */
export function localDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Split stored arrive/leave/startAt into date + time parts for pickers.
 * Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm", or full ISO.
 */
export function splitDateTime(value) {
  const s = String(value || '').trim();
  if (!s) return { date: '', time: '' };
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (!m) {
    const ms = toMillis(s);
    if (ms == null) return { date: '', time: '' };
    const d = new Date(ms);
    return {
      date: localDateKey(d),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    };
  }
  return {
    date: m[1],
    time: m[2] != null ? `${m[2]}:${m[3]}` : '',
  };
}

/** Join date key + optional HH:mm into storage string. */
export function joinDateTime(date, time) {
  const d = String(date || '').trim().slice(0, 10);
  if (!d) return '';
  const t = String(time || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [hh, mm] = t.split(':');
    return `${d}T${String(hh).padStart(2, '0')}:${mm}`;
  }
  return d;
}

/** Parse ISO date or datetime to ms. Returns null if invalid. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds != null) return value.seconds * 1000;
  const s = String(value).trim();
  if (!s) return null;
  // date-only → local start of day
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  // Prefer local parse for naive datetime without timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function endOfDayMillis(value) {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59.999`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return toMillis(value);
}

export function tripStatus(trip, now = Date.now()) {
  const start = toMillis(trip?.startDate);
  const end = endOfDayMillis(trip?.endDate || trip?.startDate);
  if (start != null && now < start) return 'upcoming';
  if (end != null && now > end) return 'past';
  if (start != null || end != null) return 'active';
  return 'draft';
}

export function formatTripDates(trip) {
  const start = trip?.startDate;
  const end = trip?.endDate;
  if (!start && !end) return 'Uten dato';
  if (start && end && start !== end) return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  return formatDisplayDate(start || end);
}

export function formatDisplayDate(value) {
  const ms = toMillis(value);
  if (ms == null) return String(value || '');
  try {
    return new Date(ms).toLocaleDateString('nb-NO', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

export function formatDisplayDateTime(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDisplayDate(s);
  const ms = toMillis(s);
  if (ms == null) return s;
  try {
    return new Date(ms).toLocaleString('nb-NO', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export function sortedDestinations(trip) {
  const list = Array.isArray(trip?.destinations) ? [...trip.destinations] : [];
  return list
    .filter((d) => d && !d.deleted)
    .sort((a, b) => {
      const oa = Number(a.order);
      const ob = Number(b.order);
      if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa - ob;
      const ta = toMillis(a.arriveAt) || 0;
      const tb = toMillis(b.arriveAt) || 0;
      return ta - tb;
    });
}

/**
 * Build day buckets for timeline. Past days are collapsed by default
 * when the trip is active or past.
 */
export function buildTimeline(trip, { now = Date.now(), expandPast = false } = {}) {
  const destinations = sortedDestinations(trip);
  const dayMap = new Map();

  const ensureDay = (key, label) => {
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        key,
        label,
        events: [],
        isPast: false,
        isToday: false,
        isFuture: false,
      });
    }
    return dayMap.get(key);
  };

  const dayKeyFrom = (value, fallbackKey = 'uten-dato') => {
    if (!value) return fallbackKey;
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const ms = toMillis(s);
    if (ms == null) return fallbackKey;
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  destinations.forEach((dest, idx) => {
    const arriveKey = dayKeyFrom(dest.arriveAt || dest.leaveAt, `dest-${dest.id}`);
    const day = ensureDay(arriveKey, arriveKey.startsWith('dest-') ? dest.name : formatDisplayDate(arriveKey));
    day.events.push({
      kind: 'destination',
      id: dest.id,
      destinationId: dest.id,
      destinationName: dest.name,
      title: dest.name,
      subtitle: dest.location?.label || 'Ankomst',
      startAt: dest.arriveAt,
      endAt: dest.leaveAt,
      order: idx,
      checkedIn: !!dest.checkedIn,
      coverUrl: dest.coverUrl,
      destination: dest,
    });

    const leaveKey = dest.leaveAt ? dayKeyFrom(dest.leaveAt) : null;
    if (leaveKey && leaveKey !== arriveKey && !leaveKey.startsWith('dest-')) {
      const leaveDay = ensureDay(leaveKey, formatDisplayDate(leaveKey));
      leaveDay.events.push({
        kind: 'departure',
        id: `${dest.id}-leave`,
        destinationId: dest.id,
        destinationName: dest.name,
        title: `Avreise · ${dest.name}`,
        subtitle: dest.location?.label || null,
        startAt: dest.leaveAt,
        endAt: dest.leaveAt,
        order: idx,
        checkedIn: !!dest.checkedIn,
        destination: dest,
      });
    }

    (dest.items || []).forEach((item) => {
      if (!item || item.deleted) return;
      const itemKey = dayKeyFrom(item.startAt || dest.arriveAt, arriveKey);
      const itemDay = ensureDay(
        itemKey,
        itemKey.startsWith('dest-') ? dest.name : formatDisplayDate(itemKey),
      );
      itemDay.events.push({
        kind: 'item',
        id: item.id,
        destinationId: dest.id,
        destinationName: dest.name,
        title: item.title,
        subtitle: item.description || TICKET_BY_ID[item.ticketKind]?.label || null,
        startAt: item.startAt,
        endAt: item.endAt,
        type: item.type,
        ticketKind: item.ticketKind,
        done: !!item.done,
        imageUrl: item.imageUrl,
        item,
      });
    });
  });

  const todayKey = localDateKey(now);

  const days = [...dayMap.values()].map((day) => {
    const endMs = endOfDayMillis(day.key) ?? toMillis(day.events[0]?.startAt);
    const startMs = toMillis(day.key) ?? endMs;
    const isToday = day.key === todayKey;
    const isPast = !isToday && endMs != null && endMs < now;
    const isFuture = !isToday && startMs != null && startMs > now;
    const events = [...day.events].sort((a, b) => {
      const ta = toMillis(a.startAt) || 0;
      const tb = toMillis(b.startAt) || 0;
      if (ta !== tb) return ta - tb;
      return String(a.title).localeCompare(String(b.title), 'nb');
    });
    return {
      ...day,
      events,
      isPast,
      isToday,
      isFuture,
      collapsed: isPast && !expandPast,
      muted: isPast,
      highlight: isToday || (!isPast && events.some((e) => {
        const t = toMillis(e.startAt);
        return t != null && t >= now && t < now + 36 * 3600 * 1000;
      })),
    };
  }).sort((a, b) => {
    if (a.key.startsWith('dest-') && !b.key.startsWith('dest-')) return 1;
    if (!a.key.startsWith('dest-') && b.key.startsWith('dest-')) return -1;
    return String(a.key).localeCompare(String(b.key));
  });

  const pastDays = days.filter((d) => d.isPast);
  const liveDays = days.filter((d) => !d.isPast);

  return {
    days,
    pastDays,
    liveDays,
    pastCount: pastDays.reduce((n, d) => n + d.events.length, 0),
    nextEvent: liveDays.flatMap((d) => d.events).find((e) => {
      const t = toMillis(e.startAt);
      return t == null || t >= now - 60 * 60 * 1000;
    }) || null,
    status: tripStatus(trip, now),
  };
}

export function routePoints(trip) {
  return sortedDestinations(trip).map((d, i) => ({
    id: d.id,
    name: d.name,
    placeLabel: d.location?.label || d.name,
    label: String.fromCharCode(65 + (i % 26)),
    lat: d.location?.lat != null && Number.isFinite(Number(d.location.lat))
      ? Number(d.location.lat) : null,
    lng: d.location?.lng != null && Number.isFinite(Number(d.location.lng))
      ? Number(d.location.lng) : null,
    checkedIn: !!d.checkedIn,
    coverUrl: d.coverUrl,
  }));
}

/** Google Maps directions URL for A→B→C when coords exist. */
export function routeMapsUrl(points) {
  const withCoords = (points || []).filter(
    (p) => p.lat != null && p.lng != null
      && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
  );
  if (withCoords.length === 0) return null;
  if (withCoords.length === 1) {
    return `https://www.google.com/maps?q=${withCoords[0].lat},${withCoords[0].lng}`;
  }
  const path = withCoords.map((p) => `${p.lat},${p.lng}`).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}

/** OSM embed bbox covering all route points (single overview map). */
export function routeMapsEmbed(points, { pad = 0.08 } = {}) {
  const withCoords = (points || []).filter(
    (p) => p.lat != null && p.lng != null
      && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
  );
  if (withCoords.length === 0) return null;
  const lats = withCoords.map((p) => Number(p.lat));
  const lngs = withCoords.map((p) => Number(p.lng));
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.04);
  const spanLng = Math.max(maxLng - minLng, 0.04);
  minLat -= spanLat * pad + 0.02;
  maxLat += spanLat * pad + 0.02;
  minLng -= spanLng * pad + 0.02;
  maxLng += spanLng * pad + 0.02;
  const marker = withCoords[0];
  const bbox = [minLng, minLat, maxLng, maxLat]
    .map((n) => encodeURIComponent(String(n)))
    .join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${encodeURIComponent(marker.lat)}%2C${encodeURIComponent(marker.lng)}`;
}

/** Equirectangular projection into the shared SVG world-map space. */
export function latLngToWorldXY(lat, lng, { width = 1000, height = 500 } = {}) {
  return {
    x: ((Number(lng) + 180) / 360) * width,
    y: ((90 - Number(lat)) / 180) * height,
  };
}

/**
 * Fit a world-map viewBox around route points and project markers into map XY.
 * Used by ReiseRouteMap so the route sits on real continents (not a flat gradient).
 */
export function worldRouteLayout(points, {
  width = 1000,
  height = 500,
  pad = 0.32,
  minSpanX = 48,
  minSpanY = 32,
  aspect = 1.8,
} = {}) {
  const list = Array.isArray(points) ? points : [];
  const withCoords = list.filter(
    (p) => p.lat != null && p.lng != null
      && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
  );

  if (withCoords.length === 0) {
    return {
      viewBox: `0 0 ${width} ${height}`,
      minX: 0,
      minY: 0,
      spanX: width,
      spanY: height,
      scale: 1,
      hasCoords: false,
      markers: list.map((p, i) => ({
        ...p,
        x: width * (0.2 + (list.length <= 1 ? 0.3 : (0.6 * i) / Math.max(list.length - 1, 1))),
        y: height * (0.42 + Math.sin(i * 0.9) * 0.06),
        hasCoords: false,
      })),
    };
  }

  const mapped = withCoords.map((p) => ({
    ...p,
    ...latLngToWorldXY(p.lat, p.lng, { width, height }),
  }));
  let minX = Math.min(...mapped.map((p) => p.x));
  let maxX = Math.max(...mapped.map((p) => p.x));
  let minY = Math.min(...mapped.map((p) => p.y));
  let maxY = Math.max(...mapped.map((p) => p.y));
  let spanX = Math.max(maxX - minX, minSpanX);
  let spanY = Math.max(maxY - minY, minSpanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  spanX *= 1 + pad * 2;
  spanY *= 1 + pad * 2;

  const targetAspect = aspect > 0 ? aspect : width / height;
  if (spanX / spanY < targetAspect) spanX = spanY * targetAspect;
  else spanY = spanX / targetAspect;

  minX = cx - spanX / 2;
  minY = cy - spanY / 2;
  // Keep the window over the world map (allow slight ocean overflow).
  minX = Math.max(-width * 0.05, Math.min(minX, width * 1.05 - spanX));
  minY = Math.max(-height * 0.05, Math.min(minY, height * 1.05 - spanY));

  const byId = new Map(mapped.map((p) => [p.id || p.label, p]));
  let markers = list.map((p, i) => {
    const hit = byId.get(p.id || p.label);
    if (hit) return { ...p, x: hit.x, y: hit.y, hasCoords: true };
    return {
      ...p,
      x: minX + spanX * (list.length <= 1 ? 0.5 : i / (list.length - 1)),
      y: minY + spanY * 0.62,
      hasCoords: false,
    };
  });

  // Nudge near-duplicate stops so stacked labels (e.g. Kristiansand + Norge) stay readable.
  const minDist = Math.max(spanX, spanY) * 0.045;
  const placed = [];
  markers = markers.map((m) => {
    if (!m.hasCoords) {
      placed.push(m);
      return m;
    }
    let { x, y } = m;
    for (let n = 0; n < 6; n += 1) {
      let collided = false;
      for (let j = 0; j < placed.length; j += 1) {
        const other = placed[j];
        if (!other.hasCoords) continue;
        const dist = Math.hypot(x - other.x, y - other.y);
        if (dist >= minDist) continue;
        collided = true;
        const angle = (placed.length * 2.4) + (n * 1.1);
        x = other.x + Math.cos(angle) * minDist * (1 + n * 0.15);
        y = other.y + Math.sin(angle) * minDist * (1 + n * 0.15);
        break;
      }
      if (!collided) break;
    }
    const next = { ...m, x, y };
    placed.push(next);
    return next;
  });

  return {
    viewBox: `${minX} ${minY} ${spanX} ${spanY}`,
    minX,
    minY,
    spanX,
    spanY,
    scale: width / spanX,
    hasCoords: true,
    markers,
  };
}

/** Project lat/lng to 0–1 SVG space with padding (legacy abstract route layout). */
export function projectRoute(points, { pad = 0.12 } = {}) {
  const withCoords = points.filter((p) => p.lat != null && p.lng != null
    && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (withCoords.length === 0) {
    return points.map((p, i) => ({
      ...p,
      x: pad + (1 - 2 * pad) * (points.length <= 1 ? 0.5 : i / (points.length - 1)),
      y: 0.5 + Math.sin(i * 0.9) * 0.18,
      hasCoords: false,
    }));
  }
  const lats = withCoords.map((p) => Number(p.lat));
  const lngs = withCoords.map((p) => Number(p.lng));
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (minLat === maxLat) { minLat -= 0.5; maxLat += 0.5; }
  if (minLng === maxLng) { minLng -= 0.5; maxLng += 0.5; }
  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;

  return points.map((p, i) => {
    if (p.lat == null || p.lng == null || !Number.isFinite(Number(p.lat))) {
      return {
        ...p,
        x: pad + (1 - 2 * pad) * (points.length <= 1 ? 0.5 : i / (points.length - 1)),
        y: 0.62,
        hasCoords: false,
      };
    }
    const x = pad + (1 - 2 * pad) * ((Number(p.lng) - minLng) / spanLng);
    const y = pad + (1 - 2 * pad) * (1 - ((Number(p.lat) - minLat) / spanLat));
    return { ...p, x, y, hasCoords: true };
  });
}

export function categorizeTrips(trips, now = Date.now()) {
  const upcoming = [];
  const active = [];
  const past = [];
  const draft = [];
  (trips || []).forEach((t) => {
    const s = tripStatus(t, now);
    if (s === 'active') active.push(t);
    else if (s === 'upcoming') upcoming.push(t);
    else if (s === 'past') past.push(t);
    else draft.push(t);
  });
  const byStart = (a, b) => (toMillis(a.startDate) || 0) - (toMillis(b.startDate) || 0);
  const byStartDesc = (a, b) => (toMillis(b.startDate) || 0) - (toMillis(a.startDate) || 0);
  upcoming.sort(byStart);
  active.sort(byStart);
  past.sort(byStartDesc);
  draft.sort(byStartDesc);
  return { upcoming, active, past, draft };
}

export function memberRoleLabel(role) {
  return role === ROLES.planner ? 'Reiseplanlegger' : 'Leser';
}

export function syncMemberRoles(memberIds = [], memberRoles = {}, { ownerUid = null } = {}) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ownerUid && !ids.includes(ownerUid)) ids.unshift(ownerUid);
  const roles = { ...(memberRoles || {}) };
  ids.forEach((id) => {
    if (!roles[id]) roles[id] = id === ownerUid ? ROLES.planner : ROLES.reader;
  });
  Object.keys(roles).forEach((id) => {
    if (!ids.includes(id)) delete roles[id];
  });
  if (ownerUid) roles[ownerUid] = ROLES.planner;
  return { memberIds: ids, memberRoles: roles };
}

/** Worldwide place search via Nominatim (no Nordic country filter). */
export async function searchTravelPlaces(query, lang = 'nb') {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&q=${encodeURIComponent(q)}`;
  const headers = {
    Accept: 'application/json',
    'Accept-Language': lang || 'nb',
  };
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  return (json || [])
    .map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      placeId: String(r.place_id),
      source: 'osm',
      shortName: r.address?.city
        || r.address?.town
        || r.address?.village
        || r.address?.municipality
        || r.address?.state
        || r.address?.country
        || (r.display_name || '').split(',')[0],
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}
