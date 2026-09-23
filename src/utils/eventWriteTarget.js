/**
 * Where to read/write a calendar event in Firestore.
 * Cross-platform list items use id `xp:{familyId}:{eventId}` — never write that id.
 */
export function resolveEventWriteTarget(event, fallbackFamilyId = null) {
  if (!event) {
    return { familyId: fallbackFamilyId || null, eventId: null };
  }

  const rawId = String(event.id || '');
  let familyId = event.familyId || null;
  let eventId = event.sourceEventId || null;

  if (rawId.startsWith('xp:')) {
    const parts = rawId.split(':');
    if (parts.length >= 3) {
      if (!familyId) familyId = parts[1] || null;
      if (!eventId) eventId = parts.slice(2).join(':') || null;
    }
  }

  if (!familyId) {
    familyId = event.sourcePlatformId || fallbackFamilyId || null;
  }
  if (!eventId && rawId && !rawId.startsWith('xp:')) {
    eventId = rawId;
  }

  return { familyId: familyId || null, eventId: eventId || null };
}
