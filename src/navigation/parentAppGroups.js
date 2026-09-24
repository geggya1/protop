/** Foreldre-gruppering av Apper-veggen. Barn bruker tilsvarende mapper i childAppGroups. */

export const PARENT_APP_GROUPS = [
  { id: 'food', titleKey: 'shell.food', ids: ['matcoach', 'shop', 'meals', 'recipes', 'pantry'] },
  { id: 'memories', titleKey: 'shell.memories', ids: ['albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger', 'wishes'] },
  {
    id: 'family',
    titleKey: 'shell.family',
    ids: ['location', 'rememberDates', 'activities', 'books', 'games', 'progress'],
  },
  { id: 'vehicles', titleKey: 'shell.vehicles', ids: ['holdings'] },
  { id: 'house', titleKey: 'shell.house', ids: ['documents', 'boligmappa', 'hospitality'] },
];

/** Section ids that are app folders (collapsed by default in the rail). */
export const PARENT_APP_SECTION_IDS = new Set([
  ...PARENT_APP_GROUPS.map((g) => g.id),
  'tools',
]);

export function isParentAppSection(sectionId) {
  return PARENT_APP_SECTION_IDS.has(sectionId);
}

export function groupParentAppItems(tools = [], t = (k) => k) {
  const byId = new Map(tools.map((item) => [item.id, item]));
  const take = (ids) => {
    const items = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) continue;
      items.push(item);
      byId.delete(id);
    }
    return items;
  };
  const sections = [];
  for (const group of PARENT_APP_GROUPS) {
    const items = take(group.ids);
    if (items.length) {
      sections.push({
        id: group.id,
        title: t(group.titleKey),
        items,
      });
    }
  }
  const leftover = [...byId.values()];
  if (leftover.length) sections.push({ id: 'tools', title: t('apps.otherApps'), items: leftover });
  return sections;
}
