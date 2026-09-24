/**
 * Deling av eksterne kalenderhendelser med familien.
 * Selve hendelsen forblir read-only; kun synlighet lagres i Firestore.
 */

export function isExternalCalendarEvent(ev) {
  if (!ev) return false;
  if (ev.sharedFromExternal) return false;
  return !!(
    ev.connectionId
    || ev.sourceProvider
    || ev.externalCalendarId
    || (ev.private && ev.readOnly && (ev.source === 'microsoft' || ev.source === 'ics' || ev.source === 'google'))
  );
}

/** Trygg Firestore-doc-id for ekstern hendelsesnøkkel. */
export function externalEventVisibilityDocId(externalEventId) {
  return String(externalEventId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 400);
}

export function externalEventMirrorId(externalEventId) {
  const base = externalEventVisibilityDocId(externalEventId);
  return `ext_${base}`.slice(0, 500);
}

/** Standard: kun eier ser hendelsen i familien (ikke hele familien). */
export function defaultExternalEventVisibility(ownerUid) {
  const id = ownerUid ? [ownerUid] : [];
  return {
    audience: 'selected',
    memberIds: id,
    wholeFamily: false,
    picked: id,
  };
}

export function applyVisibilityToFormState(data, ownerUid) {
  if (!data) return defaultExternalEventVisibility(ownerUid);
  if (data.audience === 'family') {
    return { audience: 'family', memberIds: [], wholeFamily: true, picked: [] };
  }
  const memberIds = Array.isArray(data.memberIds) ? [...data.memberIds] : [];
  if (!memberIds.length && ownerUid) memberIds.push(ownerUid);
  return {
    audience: 'selected',
    memberIds,
    wholeFamily: false,
    picked: memberIds,
  };
}

export function isOwnerOnlyVisibility({ wholeFamily, picked, ownerUid }) {
  if (wholeFamily) return false;
  const ids = [...new Set((picked || []).filter(Boolean))];
  return ids.length === 1 && ids[0] === ownerUid;
}

export function buildExternalVisibilityPayload({
  existing,
  wholeFamily,
  picked,
  ownerUid,
}) {
  const selectedIds = wholeFamily
    ? []
    : [...new Set((picked?.length ? picked : (ownerUid ? [ownerUid] : [])).filter(Boolean))];
  return {
    externalEventId: existing.id,
    connectionId: existing.connectionId || null,
    ownerUid: ownerUid || null,
    audience: wholeFamily ? 'family' : 'selected',
    memberIds: selectedIds,
    title: existing.title || 'Hendelse',
    dateKey: existing.dateKey,
    endDateKey: existing.endDateKey || existing.dateKey,
    startTime: existing.startTime ?? null,
    endTime: existing.endTime ?? null,
    place: existing.place || null,
    color: existing.color || null,
    source: existing.source || null,
    sourceLabel: existing.sourceLabel || null,
    recurring: !!existing.recurring,
    allDay: existing.allDay ?? !existing.startTime,
  };
}

export function buildExternalMirrorEvent(visibilityPayload, ownerUid) {
  return {
    ...visibilityPayload,
    readOnly: true,
    private: false,
    sharedFromExternal: true,
    childIds: [],
    createdBy: ownerUid || visibilityPayload.ownerUid || null,
  };
}

/** Slå inn lagret synlighet på ekstern hendelse for visning i kalenderlisten. */
export function overlayExternalEventVisibility(ev, visibilityByEventId, ownerUid) {
  if (!ev || !isExternalCalendarEvent(ev)) return ev;
  const vis = visibilityByEventId?.[ev.id];
  if (vis) {
    const state = applyVisibilityToFormState(vis, vis.ownerUid || ownerUid);
    return {
      ...ev,
      audience: state.audience,
      memberIds: state.memberIds,
    };
  }
  const def = defaultExternalEventVisibility(ownerUid);
  return {
    ...ev,
    audience: def.audience,
    memberIds: def.memberIds,
  };
}
