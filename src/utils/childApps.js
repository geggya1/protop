/** Apps a parent can turn off for a child. Home and settings stay available. */

export const CHILD_LOCKED_APP_IDS = new Set(['home', 'settings', 'help']);

/**
 * Apps that are tilrettelagt for barn, men skrudd av inntil foresatt slår dem på.
 * (Eldre lagrede verdier i allowedApps overstyrer alltid.)
 */
export const CHILD_APP_DEFAULT_OFF = new Set([
  'holdings',
  'boligmappa',
  'documents',
  'location',
  'familyTree',
  'activities',
  // albums/wall: på — album filtreres per deling (viewerUids)
  // scratchMap/reiseplanlegger: på — redigering styres av travelSelfEdit (av som standard)
  // rememberDates: på
]);

/** Pedagogiske grupper i foresattes på/av-liste (samme mapper som barnemenyen). */
export const CHILD_ACCESS_GROUPS = [
  {
    id: 'daily',
    title: 'Hverdag',
    ids: ['chat', 'ai', 'plan', 'stars', 'chores', 'notes', 'friends'],
  },
  {
    id: 'school',
    title: 'Skole',
    ids: ['week-plan', 'lekser', 'mattehjelp', 'leksehjelp', 'klassen'],
  },
  {
    id: 'memories',
    title: 'Minner',
    ids: ['albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger', 'wishes'],
  },
  {
    id: 'family',
    title: 'Familien',
    ids: ['location', 'rememberDates', 'activities', 'books', 'games'],
  },
  { id: 'vehicles', title: 'Kjøretøy', ids: ['holdings'] },
  { id: 'house', title: 'Hus & papir', ids: ['documents', 'boligmappa'] },
];

export const CHILD_RESTRICTABLE_APPS = [
  { id: 'chat', icon: 'chatbubbles-outline', label: 'Chat' },
  { id: 'plan', icon: 'calendar-outline', label: 'Kalender' },
  { id: 'stars', icon: 'checkbox-outline', label: 'Oppgaver' },
  { id: 'chores', icon: 'star-outline', label: 'Gjøremål' },
  { id: 'notes', icon: 'document-text-outline', label: 'Notater' },
  { id: 'lekser', icon: 'book-outline', label: 'Lekser' },
  { id: 'mattehjelp', icon: 'rocket-outline', label: 'Lær skole' },
  { id: 'leksehjelp', icon: 'school-outline', label: 'Leksehjelp' },
  { id: 'games', icon: 'game-controller-outline', label: 'FamilieSpill' },
  { id: 'scratchMap', icon: 'earth-outline', label: 'Våre reiser' },
  { id: 'reiseplanlegger', icon: 'airplane-outline', label: 'Reiseplanlegger' },
  { id: 'familyTree', icon: 'git-network-outline', label: 'Familietreet' },
  { id: 'rememberDates', icon: 'alarm-outline', label: 'Husk dato' },
  { id: 'week-plan', icon: 'today-outline', label: 'Ukeplan' },
  { id: 'klassen', icon: 'people-outline', label: 'Klassen' },
  { id: 'books', icon: 'library-outline', label: 'Bokhylla' },
  { id: 'wishes', icon: 'gift-outline', label: 'Gaveønsker' },
  { id: 'activities', icon: 'fitness-outline', label: 'Aktiviteter' },
  { id: 'location', icon: 'navigate-outline', label: 'Familieposisjon' },
  { id: 'documents', icon: 'folder-open-outline', label: 'Dokumenter' },
  { id: 'albums', icon: 'images-outline', label: 'Familiealbum' },
  { id: 'wall', icon: 'newspaper-outline', label: 'Familievegg' },
  { id: 'childDrawings', icon: 'color-palette-outline', label: 'Barnetegninger' },
  { id: 'holdings', icon: 'car-outline', label: 'Kjøretøy' },
  { id: 'boligmappa', icon: 'home-outline', label: 'Boligen' },
  { id: 'ai', icon: 'sparkles-outline', label: 'Chat med AI' },
];

const CHILD_RESTRICTABLE_BY_ID = new Map(
  CHILD_RESTRICTABLE_APPS.map((app) => [app.id, app]),
);

/** Grupperte rader for foresattes på/av-UI. Ukjente id-er havner i «Øvrige». */
export function groupedChildRestrictableApps() {
  const used = new Set();
  const groups = [];
  for (const group of CHILD_ACCESS_GROUPS) {
    const apps = [];
    for (const id of group.ids) {
      const app = CHILD_RESTRICTABLE_BY_ID.get(id);
      if (!app) continue;
      apps.push(app);
      used.add(id);
    }
    if (apps.length) groups.push({ id: group.id, title: group.title, apps });
  }
  const leftover = CHILD_RESTRICTABLE_APPS.filter((app) => !used.has(app.id));
  if (leftover.length) {
    groups.push({ id: 'other', title: 'Øvrige apper', apps: leftover });
  }
  return groups;
}

export function countAllowedApps(allowedApps) {
  const total = CHILD_RESTRICTABLE_APPS.length;
  let on = 0;
  CHILD_RESTRICTABLE_APPS.forEach((app) => {
    if (allowedApps?.[app.id] !== false) on += 1;
  });
  return { on, total };
}

export function defaultChildAppAllowed(appId, { aiEnabled } = {}) {
  if (appId === 'ai') return aiEnabled !== false;
  if (CHILD_APP_DEFAULT_OFF.has(appId)) return false;
  return true;
}

export function mergeAllowedApps(saved, { aiEnabled } = {}) {
  const next = {};
  CHILD_RESTRICTABLE_APPS.forEach((app) => {
    if (saved && typeof saved[app.id] === 'boolean') {
      next[app.id] = saved[app.id];
      return;
    }
    if (app.id === 'games') {
      if (saved && typeof saved.quiz === 'boolean') {
        next.games = saved.quiz;
        return;
      }
      next.games = defaultChildAppAllowed('games', { aiEnabled });
      return;
    }
    if (app.id === 'ai') {
      next[app.id] = defaultChildAppAllowed('ai', { aiEnabled });
      return;
    }
    next[app.id] = defaultChildAppAllowed(app.id, { aiEnabled });
  });
  return next;
}

export function allowedAppsForChild(child) {
  if (!child) return mergeAllowedApps(null);
  return mergeAllowedApps(child.allowedApps, { aiEnabled: child.aiEnabled });
}

export function isChildAppAllowed(allowedApps, appId) {
  if (!appId || CHILD_LOCKED_APP_IDS.has(appId)) return true;
  if (!allowedApps || typeof allowedApps !== 'object') return true;
  if (appId === 'quiz') {
    if (typeof allowedApps.games === 'boolean') return allowedApps.games !== false;
    return allowedApps.quiz !== false;
  }
  return allowedApps[appId] !== false;
}

export function isChildAiAllowed(child) {
  return isChildAppAllowed(allowedAppsForChild(child), 'ai');
}

export function applyChildAppRestrictions(sections, allowedApps) {
  if (!sections?.length) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => (
        item.id === 'restrictions' || item.id === 'child-apps' || isChildAppAllowed(allowedApps, item.id)
      )),
    }))
    .filter((section) => (section.items || []).length > 0);
}

/** Filter dashboard tiles + nested folder apps (e.g. Skole). */
export function filterChildDashboardApps(apps, allowedApps) {
  if (!apps?.length) return apps;
  return apps
    .map((app) => {
      if (app?.type === 'folder' && Array.isArray(app.apps)) {
        const nested = app.apps.filter((a) => isChildAppAllowed(allowedApps, a.id));
        if (!nested.length) return null;
        return {
          ...app,
          apps: nested,
          sub: nested.map((a) => a.label).join(' · ') || app.sub,
        };
      }
      return isChildAppAllowed(allowedApps, app.id) ? app : null;
    })
    .filter(Boolean);
}

export async function persistChildAllowedApps(familyId, childId, allowedApps) {
  if (!familyId || !childId || !allowedApps) return;
  const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase'),
  ]);
  const payload = {
    allowedApps: {
      ...allowedApps,
      quiz: allowedApps.games !== false,
    },
    aiEnabled: allowedApps.ai !== false,
    updatedAt: serverTimestamp(),
  };
  await Promise.all([
    setDoc(doc(db, 'families', familyId, 'children', childId), payload, { merge: true }),
    setDoc(doc(db, 'children', childId), payload, { merge: true }).catch(() => {}),
  ]);
}
