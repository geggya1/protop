/**
 * Pedagogisk gruppering av Apper-veggen for barn — samme mapper som voksen,
 * uten Mat & innkjøp (barn får ikke de modulene).
 */

export const CHILD_APP_GROUPS = [
  {
    id: 'memories',
    titleKey: 'shell.memories',
    ids: ['albums', 'wall', 'childDrawings', 'familyTree', 'scratchMap', 'reiseplanlegger', 'wishes'],
  },
  {
    id: 'family',
    titleKey: 'shell.family',
    ids: ['location', 'rememberDates', 'activities', 'books', 'games'],
  },
  { id: 'vehicles', titleKey: 'shell.vehicles', ids: ['holdings'] },
  { id: 'house', titleKey: 'shell.house', ids: ['documents', 'boligmappa'] },
];

/** Section ids that are app folders (collapsed by default in drawer/rail). */
export const CHILD_APP_SECTION_IDS = new Set([
  ...CHILD_APP_GROUPS.map((g) => g.id),
  'tools',
]);

export function isChildAppSection(sectionId) {
  return CHILD_APP_SECTION_IDS.has(sectionId);
}

export function groupChildAppItems(tools = [], t = (k) => k) {
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
  for (const group of CHILD_APP_GROUPS) {
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
