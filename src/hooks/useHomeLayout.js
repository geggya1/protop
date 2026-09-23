import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  emptyHomeLayout,
  homeLayoutsEqual,
  loadHomeLayout,
  parseHomeLayout,
  saveHomeLayout,
  subscribeHomeLayout,
} from '../utils/homeLayoutStore';
import {
  addWidget,
  normalizeWidgets,
  removeWidget,
  resolveHomeLook,
  setWidgetVariantInList,
  toggleWidgetType,
  widgetsForLook,
} from '../homeWidgetCatalog';
import { cycleWidgetSpan, moveWidgetOnGrid } from '../homeGrid';
import {
  childChoresLayoutIsStale,
  upgradeChildChoresLayout,
} from '../utils/childHomeLayout';

export function useHomeLayout(uid, { role = 'parent', aliases = [] } = {}) {
  const [layout, setLayout] = useState(() => emptyHomeLayout(role));
  const [ready, setReady] = useState(false);

  // Stabilize alias identity so reload does not thrash every render.
  const aliasKey = Array.isArray(aliases)
    ? aliases.filter(Boolean).map(String).sort().join('\0')
    : '';
  const aliasList = useMemo(
    () => (aliasKey ? aliasKey.split('\0') : []),
    [aliasKey],
  );

  const reload = useCallback(async () => {
    const next = await loadHomeLayout(uid, { role, aliases: aliasList });
    setLayout((prev) => (homeLayoutsEqual(prev, next) ? prev : next));
    setReady(true);
  }, [uid, role, aliasList]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => subscribeHomeLayout(reload), [reload]);

  // Runtime safety net: if a child board still has half-width chores after load,
  // force the upgraded layout into React state (and storage) immediately.
  useEffect(() => {
    if (!ready || role !== 'child' || !uid) return;
    if (!childChoresLayoutIsStale(layout?.widgets)) return;
    const widgets = upgradeChildChoresLayout(layout.widgets, layout.look);
    const next = parseHomeLayout({ ...layout, widgets }, role);
    setLayout(next);
    void saveHomeLayout(uid, next, { role });
  }, [ready, role, uid, layout]);

  const persist = useCallback((patch) => {
    setLayout((prev) => {
      const lookChanged = patch.look && patch.look !== prev.look && patch.widgets == null;
      const look = resolveHomeLook(patch.look ?? prev.look);
      const widgets = lookChanged
        ? widgetsForLook(look, role)
        : normalizeWidgets(patch.widgets ?? prev.widgets, role);
      const merged = {
        ...prev,
        ...patch,
        look,
        widgets,
      };
      // parseHomeLayout applies child chores migrations before state + storage diverge.
      const next = parseHomeLayout(merged, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const setBanner = useCallback((bannerId, customBannerUri = null) => (
    persist({ bannerId, customBannerUri })
  ), [persist]);

  const setBottomIds = useCallback((bottomIds) => persist({ bottomIds }), [persist]);

  const setBottomNavEnabled = useCallback((bottomNavEnabled) => persist({ bottomNavEnabled: !!bottomNavEnabled }), [persist]);

  const setLook = useCallback((lookId) => persist({ look: lookId }), [persist]);

  const setWidgets = useCallback((widgets) => persist({ widgets }), [persist]);

  const add = useCallback((type) => {
    setLayout((prev) => {
      const widgets = addWidget(prev.widgets, type, role);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const remove = useCallback((id) => {
    setLayout((prev) => {
      const widgets = normalizeWidgets(removeWidget(prev.widgets, id), role);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const moveToCell = useCallback((id, col, row) => {
    setLayout((prev) => {
      const widgets = moveWidgetOnGrid(prev.widgets, id, col, row);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const cycleSize = useCallback((id) => {
    setLayout((prev) => {
      const widgets = cycleWidgetSpan(prev.widgets, id);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const toggleType = useCallback((type) => {
    setLayout((prev) => {
      const widgets = toggleWidgetType(prev.widgets, type, role);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const setVariant = useCallback((type, variantId) => {
    setLayout((prev) => {
      const widgets = setWidgetVariantInList(prev.widgets, type, variantId, role);
      const next = parseHomeLayout({ ...prev, widgets }, role);
      void saveHomeLayout(uid, next, { role });
      return next;
    });
  }, [uid, role]);

  const resetWidgets = useCallback(() => {
    persist({ widgets: widgetsForLook(layout.look, role) });
  }, [persist, layout.look, role]);

  return {
    layout,
    ready,
    reload,
    persist,
    setWidgets,
    setBanner,
    setBottomIds,
    setBottomNavEnabled,
    setLook,
    setWidgetVariant: setVariant,
    add,
    toggleType,
    setVariant,
    remove,
    move: moveToCell,
    moveTo: moveToCell,
    cycleSize,
    resetWidgets,
  };
}
