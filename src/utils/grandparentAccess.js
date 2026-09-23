/**
 * Besteforeldre (begrenset voksenrolle i familien).
 * Alltid: familietre, husk dato, familievegg (+ hjem/innstillinger/hjelp).
 * Øvrige apper kun når admin «inviterer inn» via grandparentModules.
 */

export const GRANDPARENT_LOCKED_APP_IDS = new Set([
  'home',
  'settings',
  'help',
  'notifications',
  'familyTree',
  'rememberDates',
  'wall',
]);

/** Moduler besteforeldre kan inviteres inn i (admin-styrte brytere). */
export const GRANDPARENT_INVITE_APPS = [
  { id: 'wishes', icon: 'gift-outline', label: 'Gaveønsker' },
  { id: 'albums', icon: 'images-outline', label: 'Familiealbum' },
  { id: 'reiseplanlegger', icon: 'airplane-outline', label: 'Reiseplanlegger' },
  { id: 'scratchMap', icon: 'earth-outline', label: 'Våre reiser' },
  { id: 'games', icon: 'game-controller-outline', label: 'FamilieSpill' },
  { id: 'activities', icon: 'fitness-outline', label: 'Aktiviteter' },
  { id: 'plan', icon: 'calendar-outline', label: 'Kalender' },
];

const INVITE_IDS = new Set(GRANDPARENT_INVITE_APPS.map((a) => a.id));

export function isGrandparentMember(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.adultRole === 'grandparent') return true;
  if (record.isGrandparent === true) return true;
  return false;
}

export function defaultGrandparentModules() {
  const next = {};
  GRANDPARENT_INVITE_APPS.forEach((app) => {
    next[app.id] = false;
  });
  return next;
}

export function mergeGrandparentModules(saved) {
  const next = defaultGrandparentModules();
  if (!saved || typeof saved !== 'object') return next;
  GRANDPARENT_INVITE_APPS.forEach((app) => {
    if (typeof saved[app.id] === 'boolean') next[app.id] = saved[app.id];
  });
  // Reiseplanlegger / våre reiser: speil hvis bare én er satt
  if (typeof saved.reiseplanlegger === 'boolean' && typeof saved.scratchMap !== 'boolean') {
    next.scratchMap = saved.reiseplanlegger;
  }
  if (typeof saved.scratchMap === 'boolean' && typeof saved.reiseplanlegger !== 'boolean') {
    next.reiseplanlegger = saved.scratchMap;
  }
  return next;
}

export function grandparentModulesFor(record) {
  return mergeGrandparentModules(record?.grandparentModules);
}

export function isGrandparentAppAllowed(modules, appId) {
  if (!appId) return true;
  if (GRANDPARENT_LOCKED_APP_IDS.has(appId)) return true;
  if (!INVITE_IDS.has(appId)) return false;
  if (!modules || typeof modules !== 'object') return false;
  return modules[appId] === true;
}

export function applyGrandparentAppRestrictions(sections, modules) {
  return (sections || [])
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => isGrandparentAppAllowed(modules, item.id)),
    }))
    .filter((section) => (section.items || []).length > 0);
}

/** Full foresatt (ikke besteforeldre) — brukes i delings-/synlighetslogikk. */
export function isFullParentActor({ isParent = false, isGrandparent = false } = {}) {
  return !!isParent && !isGrandparent;
}

/**
 * Familiehendelser besteforeldre kan se: kun der de er lagt inn.
 * Tom memberIds / audience=family telles ikke som invitasjon for besteforeldre.
 */
export function canGrandparentViewCalendarEvent(event, uid) {
  if (!event || !uid) return false;
  if (event.deleted === true) return false;
  if (event.createdBy === uid || event.ownerUid === uid) return true;
  const ids = Array.isArray(event.memberIds) ? event.memberIds : [];
  return ids.includes(uid);
}

export function filterCalendarEventsForGrandparent(events, uid) {
  return (events || []).filter((ev) => canGrandparentViewCalendarEvent(ev, uid));
}

/** Uids som skal med i «hele familien»-deling (uten besteforeldre). */
export function familyShareMemberUids(members = []) {
  return [...new Set(
    (members || [])
      .filter((m) => m && !isGrandparentMember(m) && m.role !== 'grandparent')
      .map((m) => m.uid || m.id)
      .filter(Boolean),
  )];
}
