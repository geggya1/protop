import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ScrollView, ActivityIndicator } from 'react-native';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { addDoc, collection, onSnapshot, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, MEMBER_COLORS, useLayout } from '../../src/theme';
import {
  addDays, dateKey, startOfWeekMonday, monthGrid, isSameMonth, WEEKDAYS_SHORT, MONTHS_NO, sameDay, isToday, getISOWeek,
} from '../../src/utils/dates';
import { calendarIdOf, isCalendarLayerHidden, calendarConnectionLayerId, calendarSubLayerId, connectionDisplayLabel, icsSidebarLabel, HIDDEN_CALENDAR_LAYERS_KEY } from '../../src/utils/timeGrid';
import OutlookCalendar from '../../components/OutlookCalendar';
import { eventOccursOnDate, eventVisibleToUser } from '../../src/utils/events';
import {
  listenEventsAcrossPlatforms,
  platformIdsFromFamilies,
  listenParentTodosAcrossPlatforms,
} from '../../src/utils/crossPlatformData';
import { resolveEventWriteTarget } from '../../src/utils/eventWriteTarget';
import { fetchExternalCalendarEvents, listCalendarConnections, hydrateExternalCalendarEvents, peekExternalCalendarCache, OPEN_CALENDAR_SETTINGS_KEY } from '../../src/utils/calendarIntegration';
import { peekCalendarConnectionsCache } from '../../src/utils/calendarConnectionsCache';
import { peekFamilyEventsCache, putFamilyEventsCache } from '../../src/utils/familyEventsCache';
import { calendarSyncNotice } from '../../src/utils/externalCalendarMerge';
import {
  listenChildTodos, toggleTodo, toggleParentTodo,
} from '../../src/utils/todos';
import { buildCalendarPaneItems } from '../../src/utils/calendarTaskPane';
import { isChildParentTaskReadOnly } from '../../src/utils/childTaskAccess';
import {
  canCreateFamilyCalendarEvent,
  canShowCalendarSettings,
} from '../../src/utils/childCalendarAccess';
import { isExternalCalendarEvent } from '../../src/utils/externalEventVisibility';
import {
  useExternalEventVisibilityMap,
  useEventsWithExternalVisibility,
} from '../../src/hooks/useExternalEventVisibility';
import CalendarSettingsScreen from './CalendarSettingsScreen';
import { createMeal, familyMealHeadcount } from '../../src/utils/meals';
import { listenEventsSharedWithMe } from '../../src/utils/friends';
import MemberAvatarStack, { whoCountLabel, resolveEventMembers } from '../../components/MemberAvatarStack';
import { Screen, Mute } from '../../components/ui';
import { DeskBtn } from '../../components/DeskBtn';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorForConnection, colorForExternalCalendar, colorForFamilyEvent, FAMILY_CALENDAR_COLOR, isDefaultLayerCalendar } from '../../src/utils/calendarColors';
import CustodyLegendBar from '../../components/CustodyLegendBar';
import {
  childrenWithCustody,
  custodyCellTint,
  custodyEnabled,
  custodyOverlayForDay,
} from '../../src/utils/custodySchedule';
import {
  loadCustodyOverlayPrefs,
  saveCustodyOverlayPrefs,
} from '../../src/utils/custodyOverlayPrefs';

const HIDDEN_CALS_KEY = HIDDEN_CALENDAR_LAYERS_KEY;

function EventRow({ item, canOpen, canEdit, onPress, members, friendPeople }) {
  const isPrivate = !!item.private;
  const isLocked = !!item.readOnly;
  const people = resolveEventMembers(members, item.memberIds, friendPeople);
  const markColor = colorForFamilyEvent(item, members);
  return (
    <TouchableOpacity
      style={styles.eventRow}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!canOpen}
      accessibilityRole="button"
      accessibilityLabel={canEdit ? `Rediger ${item.title}` : `Åpne ${item.title}`}
    >
      <View style={[styles.mark, { backgroundColor: markColor }]} />
      <View style={styles.eventTimeCol}>
        <Text style={styles.rowTime} numberOfLines={1}>
          {item.startTime || 'Hele'}
        </Text>
        {!!item.endTime && (
          <Text style={styles.rowTimeEnd} numberOfLines={1}>{item.endTime}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.eventTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          {(isPrivate || isLocked) && (
            <View style={styles.privatePill}>
              <Ionicons name="lock-closed" size={10} color={colors.muted} />
              <Text style={styles.privatePillTxt} numberOfLines={1}>{item.sourceLabel || 'Privat'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {whoCountLabel(item.memberIds, people.length, item.audience, members, friendPeople)}
        </Text>
      </View>
      {((!isPrivate && !isLocked) || people.length > 0 || item.audience === 'family' || item.sharedFromFriend) && (
        <View style={styles.avatarSlot}>
          <MemberAvatarStack
            members={members}
            memberIds={item.memberIds}
            audience={item.audience}
            friendPeople={friendPeople}
            size={22}
            max={3}
          />
        </View>
      )}
      {canOpen ? (
        <Ionicons
          name={canEdit ? 'create-outline' : 'chevron-forward'}
          size={15}
          color={colors.muted}
        />
      ) : null}
    </TouchableOpacity>
  );
}

function CalendarSyncBanner({ notice, onPress }) {
  if (!notice?.message) return null;
  return (
    <TouchableOpacity
      style={styles.syncBanner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notice.message}
    >
      <Ionicons name="warning-outline" size={16} color="#92400e" />
      <Text style={styles.syncBannerTxt}>{notice.message}</Text>
      <Text style={styles.syncBannerLink}>{notice.reconnect ? 'Koble til' : 'Åpne'}</Text>
    </TouchableOpacity>
  );
}

export default function PlanScreen({ active = true }) {
  const nav = useNavigation();
  useHelpScene('hub');
  const { t } = useI18n();
  const { pad, isDesktop, isTablet } = useLayout();
  const {
    familyId, members, uid, family, families, isParent, meChild, isChild, activeChild, isActingAsChild,
    isGrandparent, kids, friendPeople,
  } = useApp();
  const splitCalendar = isDesktop;
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState(() => peekFamilyEventsCache(platformIdsFromFamilies(families)) || []);
  const [friendSharedEvents, setFriendSharedEvents] = useState([]);
  const [meals, setMeals] = useState([]);
  const familyCounts = useMemo(() => familyMealHeadcount(members), [members]);
  const [mealTitle, setMealTitle] = useState('');
  const [mealAdults, setMealAdults] = useState(() => String(familyMealHeadcount(members).adults));
  const [mealChildren, setMealChildren] = useState(() => String(familyMealHeadcount(members).children));
  const [mealDay, setMealDay] = useState(null);
  const [mealSaving, setMealSaving] = useState(false);
  const [externalEvents, setExternalEvents] = useState([]);
  const externalVisibilityByEventId = useExternalEventVisibilityMap(familyId);
  const visibleExternalEvents = useEventsWithExternalVisibility(
    externalEvents,
    uid,
    externalVisibilityByEventId,
  );
  const [externalLayers, setExternalLayers] = useState([]);
  const [calendarConnections, setCalendarConnections] = useState([]);
  const [externalSyncErrors, setExternalSyncErrors] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [hiddenCals, setHiddenCals] = useState(() => new Set());
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [parentTodos, setParentTodos] = useState([]);
  const [kidsTodosById, setKidsTodosById] = useState({});
  const [custodyOverlayPrefs, setCustodyOverlayPrefs] = useState({ showOverlay: false, childFilter: 'all' });

  useEffect(() => {
    if (!isParent || isChild || isActingAsChild) return undefined;
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
      if (sessionStorage.getItem(OPEN_CALENDAR_SETTINGS_KEY) === '1') {
        sessionStorage.removeItem(OPEN_CALENDAR_SETTINGS_KEY);
        setShowCalendarSettings(true);
      }
    } catch { /* ignore */ }
    return undefined;
  }, [isParent, isChild, isActingAsChild]);

  useEffect(() => {
    if (!uid) {
      setCustodyOverlayPrefs({ showOverlay: false, childFilter: 'all' });
      return undefined;
    }
    let alive = true;
    loadCustodyOverlayPrefs(uid).then((prefs) => {
      if (!alive) return;
      setCustodyOverlayPrefs(prefs);
    });
    return () => { alive = false; };
  }, [uid, isChild, meChild?.id, meChild?.custody]);

  const custodyKids = useMemo(() => childrenWithCustody(kids), [kids]);
  const childViewerCustody = useMemo(
    () => (isChild && meChild ? custodyEnabled(meChild) : false),
    [isChild, meChild],
  );
  const custodyOverlayActive = custodyOverlayPrefs.showOverlay && (
    custodyKids.length > 0 || childViewerCustody
  );
  const custodyChildFilter = useMemo(() => {
    if (isChild && meChild?.id) return meChild.id;
    if (isActingAsChild && activeChild?.id) return activeChild.id;
    return custodyOverlayPrefs.childFilter || 'all';
  }, [isChild, meChild?.id, isActingAsChild, activeChild?.id, custodyOverlayPrefs.childFilter]);

  const getCustodyOverlay = useCallback((d) => {
    if (!custodyOverlayActive || !uid) return null;
    const custodyKids = (isChild && meChild)
      ? [meChild]
      : (isActingAsChild && activeChild ? [activeChild] : kids);
    return custodyOverlayForDay({
      date: d,
      kids: custodyKids,
      viewerUid: uid,
      childFilter: custodyChildFilter,
      viewerIsChild: isChild,
    });
  }, [custodyOverlayActive, uid, kids, isChild, meChild, isActingAsChild, activeChild, custodyChildFilter]);

  const toggleCustodyOverlay = useCallback(async () => {
    if (!uid) return;
    const next = await saveCustodyOverlayPrefs(uid, { showOverlay: !custodyOverlayPrefs.showOverlay });
    setCustodyOverlayPrefs(next);
  }, [uid, custodyOverlayPrefs.showOverlay]);

  const onCustodyOverlayChange = useCallback(async (patch) => {
    if (!uid) return;
    const next = await saveCustodyOverlayPrefs(uid, patch);
    setCustodyOverlayPrefs(next);
  }, [uid]);

  const selectedKey = dateKey(anchor);
  const asChildViewer = isChild || isActingAsChild;

  const viewingChild = useMemo(
    () => (isActingAsChild ? activeChild : (isChild ? meChild : null)),
    [isActingAsChild, activeChild, isChild, meChild],
  );

  const childCanEditCalendar = !!viewingChild?.calendarSelfEdit;
  const parentCalendarSettings = canShowCalendarSettings({ isParent, asChildViewer });
  const canCreateCalendarEvent = canCreateFamilyCalendarEvent({
    isParent,
    asChildViewer,
    childCanEditCalendar,
  });

  const calendarAddBtn = useMemo(() => {
    if (!canCreateCalendarEvent || mode === 'meals') return null;
    return (
      <ShellAddButton
        label="Ny hendelse"
        accessibilityLabel="Ny hendelse"
        onPress={() => nav.navigate('EventForm', { familyId, dateKey: selectedKey })}
      />
    );
  }, [isDesktop, canCreateCalendarEvent, mode, familyId, selectedKey, nav]);
  useShellTitleRight(calendarAddBtn, { active });

  const viewerIds = useMemo(() => {
    const child = isActingAsChild ? activeChild : (isChild ? meChild : null);
    // «Vis som barn» / innlogget barn: kun barnets id-er (ikke foresattes uid).
    if (child) {
      const ids = new Set();
      [child.uid, child.id, child.childId, child.docId].filter(Boolean).forEach((id) => ids.add(id));
      return ids;
    }
    return new Set([uid].filter(Boolean));
  }, [uid, isChild, isActingAsChild, meChild, activeChild]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    const cached = peekFamilyEventsCache(platformIds);
    if (cached?.length) setEvents(cached);
    return listenEventsAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      viewerIds,
      platforms: families,
      onChange: (next) => {
        putFamilyEventsCache(platformIds, next);
        setEvents(next);
      },
    });
  }, [familyId, platformIds, viewerIds, families]);

  useEffect(() => {
    if (!uid || asChildViewer) {
      setFriendSharedEvents([]);
      return undefined;
    }
    return listenEventsSharedWithMe(uid, {
      excludeFamilyIds: platformIds,
      onChange: setFriendSharedEvents,
    });
  }, [uid, platformIds, asChildViewer]);

  useEffect(() => {
    const asChild = isChild || isActingAsChild;
    if (!familyId || !isDesktop || asChild) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodosAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      uid,
      viewerIds,
      asChild: false,
      platforms: families,
      onChange: setParentTodos,
    });
  }, [familyId, isDesktop, platformIds, uid, viewerIds, isChild, isActingAsChild, families]);

  useEffect(() => {
    const asChild = isChild || isActingAsChild;
    if (!familyId || !isDesktop || !asChild || !meChild?.id) {
      setKidsTodosById({});
      return undefined;
    }
    const childId = meChild.id;
    return listenChildTodos(familyId, childId, (todos) => {
      setKidsTodosById({ [childId]: todos });
    });
  }, [familyId, isDesktop, isChild, isActingAsChild, meChild?.id]);

  useEffect(() => {
    if (!familyId) return undefined;
    return onSnapshot(collection(db, 'families', familyId, 'meals'), (snap) => {
      setMeals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setMeals([]));
  }, [familyId]);

  useEffect(() => {
    if (!uid) {
      setHiddenCals(new Set());
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${HIDDEN_CALS_KEY}.${uid}`);
        if (!alive) return;
        const list = raw ? JSON.parse(raw) : [];
        setHiddenCals(new Set(Array.isArray(list) ? list : []));
      } catch {
        if (alive) setHiddenCals(new Set());
      }
    })();
    return () => { alive = false; };
  }, [uid]);

  useEffect(() => {
    if (!uid || !isParent) {
      setCalendarConnections([]);
      return undefined;
    }
    let alive = true;
    listCalendarConnections()
      .then((list) => { if (alive) setCalendarConnections(list || []); })
      .catch(() => { if (alive) setCalendarConnections([]); });
    return () => { alive = false; };
  }, [uid, isParent]);

  const weekDays = useMemo(() => {
    const mon = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [anchor]);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const iso = getISOWeek(anchor);

  const rangeKeys = useMemo(() => {
    if (mode === 'meals') return null;
    if (mode === 'day') {
      const k = dateKey(anchor);
      return { start: k, end: k };
    }
    const days = mode === 'month' ? grid : weekDays;
    if (!days.length) return null;
    return { start: dateKey(days[0]), end: dateKey(days[days.length - 1]) };
  }, [mode, grid, weekDays, anchor]);

  useFocusEffect(useCallback(() => {
    if (!isParent || !uid || !rangeKeys || mode === 'meals') {
      setExternalLoading(false);
      return undefined;
    }
    let alive = true;
    const { start, end } = rangeKeys;

    // Synk minne-cache først — ingen spinner ved varm remount / app-bytte
    const peeked = peekExternalCalendarCache(uid, start, end);
    if (peeked?.events) {
      setExternalEvents(peeked.events || []);
      setExternalLayers(peeked.layers || []);
      setExternalLoading(!!peeked.stale);
    } else {
      const connPeek = peekCalendarConnectionsCache(uid);
      if (connPeek?.connections) setCalendarConnections(connPeek.connections);
      setExternalLoading(true);
    }

    // Disk-hydrate (kan være ferskere enn tom minne)
    hydrateExternalCalendarEvents(start, end, { uid })
      .then((cached) => {
        if (!alive || !cached) return;
        setExternalEvents(cached.events || []);
        setExternalLayers(cached.layers || []);
        if (!cached.stale) setExternalLoading(false);
      })
      .catch(() => {});

    // Hent ferske events i bakgrunnen — ikke force (da hopper vi over varm cache)
    listCalendarConnections()
      .then((list) => {
        if (!alive) return null;
        const connections = list || [];
        setCalendarConnections(connections);
        return fetchExternalCalendarEvents(start, end, { uid, force: false });
      })
      .catch(() => {
        if (alive) setCalendarConnections((prev) => prev || []);
        return fetchExternalCalendarEvents(start, end, { uid, force: false });
      })
      .then((res) => {
        if (!alive || !res) return;
        setExternalEvents(res?.events || []);
        setExternalLayers(res?.layers || []);
        setExternalSyncErrors(res?.errors || []);
        if (res?.errors?.length && !res?.fromCache) {
          console.warn('[calendar] sync errors', res.errors);
        }
      })
      .catch((e) => {
        console.warn('[calendar] fetch failed', e?.message || e);
      })
      .finally(() => {
        if (alive) setExternalLoading(false);
      });
    return () => { alive = false; };
  }, [isParent, uid, rangeKeys, mode]));

  const childEventVisible = useCallback((e) => (
    eventVisibleToUser(e, viewerIds, { asChild: true, members })
  ), [viewerIds, members]);

  const canManageEvent = useCallback((e) => {
    if (!e || e.readOnly || e.sharedFromFriend) return false;
    if (asChildViewer) {
      if (!childCanEditCalendar) return false;
      return childEventVisible(e);
    }
    if (isGrandparent) {
      return !!(uid && e.createdBy && e.createdBy === uid);
    }
    if (isParent) return true;
    // Egen privat/personlig hendelse — også når den ligger i en annen familie.
    return !!(uid && e.createdBy && e.createdBy === uid);
  }, [asChildViewer, isParent, isGrandparent, uid, childCanEditCalendar, childEventVisible]);

  /** Foreldre kan åpne alle; barn kan lese synlige hendelser (redigering krever calendarSelfEdit). */
  const canOpenEvent = useCallback((e) => {
    if (!e) return false;
    if (e.sharedFromFriend) return true;
    if (asChildViewer) {
      if (e.sharedFromExternal) return childEventVisible(e);
      if (e.readOnly) return false;
      return childEventVisible(e);
    }
    if (isParent) return true;
    if (e.readOnly) return false;
    return !!(uid && e.createdBy && e.createdBy === uid);
  }, [asChildViewer, isParent, uid, childEventVisible]);

  const openEventForm = useCallback((e) => {
    if (!canOpenEvent(e)) return;
    const external = isExternalCalendarEvent(e);
    const fromFriend = !!e.sharedFromFriend;
    const editable = !fromFriend && canManageEvent(e);
    const { familyId: targetFamilyId, eventId } = resolveEventWriteTarget(e, familyId);
    nav.navigate('EventForm', {
      familyId: targetFamilyId || e.familyId || familyId,
      event: {
        ...e,
        id: eventId || e.sourceEventId || e.id,
        sourceEventId: eventId || e.sourceEventId || e.id,
        familyId: targetFamilyId || e.familyId || familyId,
        readOnly: fromFriend || external || !editable ? true : !!e.readOnly,
      },
    });
  }, [canOpenEvent, canManageEvent, familyId, nav]);

  const itemsForDay = useCallback((d) => {
    const k = dateKey(d);
    const familyEv = events
      .filter((e) => eventOccursOnDate(e, d))
      .filter((e) => !(isParent && !isActingAsChild && e.sharedFromExternal))
      // Barn (og «som barn») ser bare hendelser de er med på / hele familien.
      // Foreldre ser alle hendelser på aktiv plattform; andre plattformer er allerede profilfiltrert.
      .filter((e) => {
        if (e.crossPlatform) return true;
        if (isParent && !isActingAsChild && !isGrandparent) {
          if (e.createdBy && viewerIds.has(e.createdBy)) return true;
          if (e.ownerUid && viewerIds.has(e.ownerUid)) return true;
          const mids = Array.isArray(e.memberIds) ? e.memberIds.filter(Boolean) : [];
          return mids.some((id) => viewerIds.has(id));
        }
        return eventVisibleToUser(e, viewerIds, {
          asChild: asChildViewer,
          isGrandparent,
          members,
        });
      })
      .map((e) => ({
        ...e,
        occurrenceDateKey: k,
        color: e.color || colorForFamilyEvent(e, members),
      }));
    const privateEv = isParent && !isActingAsChild && !isGrandparent
      ? visibleExternalEvents.filter((e) => eventOccursOnDate(e, d))
      : [];
    const friendEv = (!asChildViewer ? friendSharedEvents : [])
      .filter((e) => eventOccursOnDate(e, d))
      .map((e) => ({
        ...e,
        occurrenceDateKey: k,
        color: e.color || colorForFamilyEvent(e, members),
      }));
    const seen = new Set();
    const ev = [...familyEv, ...privateEv, ...friendEv]
      .filter((e) => {
        const key = `${e.familyId || ''}:${e.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((e) => !isCalendarLayerHidden(e, hiddenCals, familyId))
      .sort((a, b) => {
        const ta = a.startTime || '00:00';
        const tb = b.startTime || '00:00';
        return ta.localeCompare(tb);
      });
    return { ev };
  }, [events, visibleExternalEvents, friendSharedEvents, isParent, isActingAsChild, asChildViewer, isGrandparent, viewerIds, members, hiddenCals, familyId]);

  const paneKids = useMemo(
    () => (asChildViewer && meChild?.id ? [meChild] : []),
    [asChildViewer, meChild],
  );

  const paneItemsForDay = useCallback((d) => buildCalendarPaneItems({
    date: d,
    parentTodos,
    kids: paneKids,
    kidsTodosById,
    viewer: {
      uid,
      ids: viewerIds,
      asChild: asChildViewer,
    },
  }), [parentTodos, paneKids, kidsTodosById, uid, viewerIds, asChildViewer]);

  const onOpenPaneItem = useCallback((item) => {
    if (!item) return;
    if (item.kind === 'chore') {
      if (!isParent || isActingAsChild) return;
      nav.navigate('AddTodo', {
        familyId,
        child: item.child,
        todo: item.task,
        currentDateKey: dateKey(item.date),
      });
      return;
    }
    const t = item.task;
    const resolved = t.crossPlatform ? { ...t, id: t.sourceTodoId || t.id } : t;
    nav.navigate('ParentTask', {
      task: resolved,
      familyId: t.familyId || familyId,
      readOnly: isChildParentTaskReadOnly({ isChild, isNew: false }),
    });
  }, [nav, familyId, isChild, isParent, isActingAsChild]);

  const onTogglePaneItem = useCallback(async (item) => {
    if (!item) return;
    try {
      if (item.kind === 'chore') {
        await toggleTodo(familyId, item.childId, item.task, item.date);
        return;
      }
      if (isChildParentTaskReadOnly({ isChild, isNew: false })) return;
      await toggleParentTodo(item.task.familyId || familyId, item.task, item.date);
    } catch { /* ignore */ }
  }, [familyId, isChild]);

  const onCreatePaneItem = useCallback((k) => {
    nav.navigate('ParentTask', { familyId, deadline: k });
  }, [nav, familyId]);

  const selected = itemsForDay(anchor);
  const weekEventCount = weekDays.reduce((n, d) => n + itemsForDay(d).ev.length, 0);
  const days = mode === 'month' ? grid : weekDays;

  const calendars = useMemo(() => {
    const list = [];
    const seen = new Set();
    const addFlat = (id, label, color, extra = {}) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, label, color: color || FAMILY_CALENDAR_COLOR, ...extra });
    };

    const famId = `fam:${familyId || 'family'}`;
    if (!seen.has(famId)) {
      seen.add(famId);
      list.push({
        id: famId,
        label: 'Min kalender',
        color: FAMILY_CALENDAR_COLOR,
      });
    }
    (families || []).forEach((f, i) => {
      if (!f?.id || f.id === familyId) return;
      addFlat(
        `plat:${f.id}`,
        f.name || 'Annen plattform',
        MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length],
      );
    });

    [...events, ...externalEvents].forEach((e) => {
      if (e?.source === 'microsoft' || e?.connectionId) return;
      if (!(e?.private || e?.readOnly)) return;
      addFlat(
        calendarIdOf(e, familyId),
        e.sourceLabel || 'Ekstern kalender',
        e.color,
      );
    });

    const connById = new Map((calendarConnections || []).map((c) => [c.id, c]));
    const layerPacks = new Map((externalLayers || []).map((p) => [p.connectionId, p]));
    const icsSiblings = (calendarConnections || []).filter((c) => c.type === 'ics');

    (calendarConnections || []).forEach((conn) => {
      if (!conn?.id) return;
      if (conn.type === 'microsoft') {
        const parentId = calendarConnectionLayerId(conn.id);
        if (seen.has(parentId)) return;
        seen.add(parentId);
        const pack = layerPacks.get(conn.id);
        const email = connectionDisplayLabel(conn, 'Outlook');
        const children = [];
        const childSeen = new Set();
        const addChild = (cal) => {
          const cid = calendarSubLayerId(conn.id, cal.id);
          if (!cid || childSeen.has(cid)) return;
          childSeen.add(cid);
          const owner = cal.ownerEmail || '';
          const isShared = !!(owner && email
            && owner.toLowerCase() !== String(email).toLowerCase());
          children.push({
            id: cid,
            label: cal.name || (isShared ? owner : 'Kalender'),
            sublabel: isShared ? owner : null,
            color: cal.color || colorForExternalCalendar(conn.id, cal.id, 'microsoft', {
              isDefault: isDefaultLayerCalendar(cal),
            }),
            shared: isShared,
          });
        };
        (pack?.calendars || []).forEach(addChild);
        externalEvents
          .filter((e) => e.connectionId === conn.id && e.graphCalendarId)
          .forEach((e) => addChild({
            id: e.graphCalendarId,
            name: e.graphCalendarName || 'Kalender',
            ownerEmail: e.mailboxEmail || conn.email,
            color: e.color,
          }));

        const showChildren = children.length > 1 ? children : children.filter((c) => c.shared);
        const parentColor = pack?.color
          || children[0]?.color
          || colorForConnection(conn.id, 'microsoft');

        list.push({
          id: parentId,
          label: 'Outlook',
          sublabel: email,
          color: parentColor,
          type: 'microsoft',
          error: !!(conn.lastError || conn.needsReauth),
          expandable: showChildren.length > 0,
          children: showChildren,
        });
        return;
      }

      const emailOrLabel = connectionDisplayLabel(conn, conn.type === 'google' ? 'Google' : 'ICS');
      const label = conn.type === 'google'
        ? (emailOrLabel === 'Google' ? (conn.label || 'Google') : `Google · ${emailOrLabel}`)
        : icsSidebarLabel(conn, icsSiblings);
      addFlat(
        calendarConnectionLayerId(conn.id),
        label,
        colorForConnection(conn.id, conn.type || 'ics'),
        { type: conn.type },
      );
    });

    const msConnIds = new Set(
      externalEvents.filter((e) => e.source === 'microsoft' && e.connectionId).map((e) => e.connectionId),
    );
    msConnIds.forEach((cid) => {
      if (connById.has(cid)) return;
      const parentId = calendarConnectionLayerId(cid);
      if (seen.has(parentId)) return;
      seen.add(parentId);
      const sample = externalEvents.find((e) => e.connectionId === cid);
      const email = sample?.connectionEmail
        || String(sample?.sourceLabel || '').replace(/^Outlook\s*[·•\-–]\s*/i, '').trim()
        || 'Outlook';
      const children = [];
      const childSeen = new Set();
      externalEvents.filter((e) => e.connectionId === cid).forEach((e) => {
        const id = calendarSubLayerId(cid, e.graphCalendarId || 'primary');
        if (!id || childSeen.has(id)) return;
        childSeen.add(id);
        children.push({
          id,
          label: e.graphCalendarName || 'Kalender',
          sublabel: e.mailboxEmail && e.mailboxEmail !== email ? e.mailboxEmail : null,
          color: e.color || colorForExternalCalendar(cid, e.graphCalendarId || 'primary', 'microsoft', {
            isDefault: !!e.graphCalendarIsDefault,
          }),
          shared: !!(e.mailboxEmail && e.mailboxEmail !== email),
        });
      });
      list.push({
        id: parentId,
        label: 'Outlook',
        sublabel: email,
        color: children[0]?.color || colorForConnection(cid, 'microsoft'),
        type: 'microsoft',
        expandable: children.length > 1,
        children: children.length > 1 ? children : [],
      });
    });

    return list;
  }, [
    familyId, family, families, members, events, externalEvents,
    calendarConnections, externalLayers, externalSyncErrors,
  ]);

  const syncNotice = useMemo(
    () => calendarSyncNotice({
      connections: calendarConnections,
      fetchErrors: externalSyncErrors,
    }),
    [calendarConnections, externalSyncErrors],
  );

  const toggleCal = useCallback((id) => {
    setHiddenCals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (uid) {
        AsyncStorage.setItem(
          `${HIDDEN_CALS_KEY}.${uid}`,
          JSON.stringify([...next]),
        ).catch(() => {});
      }
      return next;
    });
  }, [uid]);

  const shift = (dir) => {
    if (mode === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else if (mode === 'day') setAnchor((d) => addDays(d, dir));
    else setAnchor((d) => addDays(d, dir * 7));
  };

  const saveMeal = async () => {
    if (!familyId || !mealDay || !mealTitle.trim() || mealSaving) return;
    setMealSaving(true);
    try {
      const ref = await createMeal(familyId, {
        dateKey: mealDay,
        title: mealTitle.trim(),
        tag: 'Middag',
        adults: Number(mealAdults) || 2,
        children: Number(mealChildren) || 0,
      });
      const saved = {
        id: ref.id,
        dateKey: mealDay,
        title: mealTitle.trim(),
        tag: 'Middag',
        adults: Number(mealAdults) || 2,
        children: Number(mealChildren) || 0,
        ingredientsStatus: 'pending',
      };
      setMealTitle('');
      setMealAdults(String(familyCounts.adults));
      setMealChildren(String(familyCounts.children));
      setMealDay(null);
      nav.navigate('MealDetail', { familyId, mealId: ref.id, meal: saved });
    } finally {
      setMealSaving(false);
    }
  };

  const openMeal = (meal) => {
    nav.navigate('MealDetail', { familyId, mealId: meal.id, meal });
  };

  const shareMeals = async () => {
    if (!familyId || !uid) return;
    const lines = weekDays.map((d) => {
      const meal = meals.find((m) => m.dateKey === dateKey(d));
      if (!meal) return null;
      const label = WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
      return `${label}: ${meal.title}`;
    }).filter(Boolean);
    if (!lines.length) return;
    await setDoc(doc(db, 'families', familyId, 'chats', 'family'), {
      type: 'family',
      title: family?.name || 'Familien',
      memberIds: members.map((m) => m.uid).filter(Boolean),
    }, { merge: true });
    await addDoc(collection(db, 'families', familyId, 'chats', 'family', 'messages'), {
      text: `Ukemeny uke ${iso.week}\n${lines.join('\n')}`,
      senderId: uid,
      senderName: 'Ukemeny',
      createdAt: serverTimestamp(),
    });
  };

  const dayLabel = `${WEEKDAYS_SHORT[(anchor.getDay() + 6) % 7]} ${anchor.getDate()}. ${MONTHS_NO[anchor.getMonth()]}`;

  const renderMealsList = () => (

          <FlatList
            data={weekDays}
            keyExtractor={(d) => dateKey(d)}
            contentContainerStyle={styles.listPad}
            numColumns={isDesktop ? 2 : 1}
            key={isDesktop ? 'meals-2' : 'meals-1'}
            columnWrapperStyle={isDesktop ? styles.mealCols : undefined}
            renderItem={({ item: d }) => {
              const k = dateKey(d);
              const meal = meals.find((m) => m.dateKey === k);
              const todayDay = isToday(d);
              return (
                <View style={[styles.mealCard, isDesktop && styles.mealCardSplit, todayDay && styles.mealCardToday]}>
                  <View style={styles.mealDayRow}>
                    <Text style={[styles.mealDay, todayDay && styles.mealDayToday]}>
                      {WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} {d.getDate()}.{d.getMonth() + 1}
                    </Text>
                    {todayDay ? <Text style={styles.mealTodayBadge}>I dag</Text> : null}
                  </View>
                  {meal ? (
                    <TouchableOpacity style={styles.mealRow} onPress={() => openMeal(meal)} activeOpacity={0.75}>
                      <View style={styles.pill}><Text style={styles.pillTxt}>{meal.tag || 'Middag'}</Text></View>
                      <Text style={styles.mealTitle}>{meal.title}</Text>
                      {(meal.adults != null || meal.children != null) && (
                        <Text style={styles.mealMeta}>
                          {meal.adults || 0} voksne{meal.children ? ` · ${meal.children} barn` : ''}
                        </Text>
                      )}
                      {meal.ingredients?.length > 0 && (
                        <Text style={styles.mealIngredients}>
                          {meal.ingredients.length} varer i handlelisten
                        </Text>
                      )}
                      <Text style={styles.mealTapHint}>Trykk for handleliste →</Text>
                    </TouchableOpacity>
                  ) : isParent ? (
                    mealDay === k ? (
                      <View style={{ gap: 8 }}>
                        <TextInput
                          value={mealTitle}
                          onChangeText={setMealTitle}
                          placeholder="F.eks. fiskesuppe, taco, pasta…"
                          style={styles.mealInput}
                          autoFocus
                        />
                        <View style={styles.portionRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.portionLbl}>Voksne</Text>
                            <TextInput
                              value={mealAdults}
                              onChangeText={setMealAdults}
                              keyboardType="number-pad"
                              style={styles.portionInput}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.portionLbl}>Barn</Text>
                            <TextInput
                              value={mealChildren}
                              onChangeText={setMealChildren}
                              keyboardType="number-pad"
                              style={styles.portionInput}
                            />
                          </View>
                        </View>
                        <Text style={styles.aiHint}>AI lager handleliste basert på rett og antall personer.</Text>
                        <View style={styles.mealFormActions}>
                          <TouchableOpacity onPress={() => { setMealDay(null); setMealTitle(''); }}>
                            <Text style={styles.cancelTxt}>Avbryt</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={saveMeal} disabled={!mealTitle.trim() || mealSaving}>
                            <Text style={[styles.link, (!mealTitle.trim() || mealSaving) && { opacity: 0.5 }]}>
                              {mealSaving ? 'Lagrer…' : 'Lagre og lag handleliste'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setMealDay(k)}><Text style={styles.link}>+ Middag</Text></TouchableOpacity>
                    )
                  ) : (
                    <Mute>Ikke planlagt</Mute>
                  )}
                </View>
              );
            }}
            ListFooterComponent={isParent ? (
              isDesktop ? (
                <View style={{ marginTop: 8 }}>
                  <DeskBtn icon="chatbubbles-outline" label="Del ukemeny i chat" onPress={shareMeals} />
                </View>
              ) : (
                <TouchableOpacity style={styles.shareBtn} onPress={shareMeals}>
                  <Text style={styles.shareTxt}>Del ukemeny i chat</Text>
                </TouchableOpacity>
              )
            ) : null}
          />

  );

  if (showCalendarSettings && parentCalendarSettings) {
    return (
      <CalendarSettingsScreen
        inShell
        onBack={() => setShowCalendarSettings(false)}
        calendars={calendars}
        hiddenCals={hiddenCals}
        onToggleCal={toggleCal}
        custodyOverlayPrefs={custodyOverlayPrefs}
        onCustodyOverlayChange={onCustodyOverlayChange}
      />
    );
  }

  if (isDesktop) {
    return (
      <Screen>
        <OutlookCalendar
          mode={mode}
          setMode={setMode}
          anchor={anchor}
          setAnchor={setAnchor}
          weekDays={weekDays}
          grid={grid}
          iso={iso}
          itemsForDay={itemsForDay}
          canManageEvent={canManageEvent}
          canOpenEvent={canOpenEvent}
          openEventForm={openEventForm}
          onCreateEvent={(k, opts = {}) => nav.navigate('EventForm', {
            familyId,
            dateKey: k,
            startTime: opts.startTime,
            endTime: opts.endTime,
            allDay: opts.allDay,
          })}
          isParent={isParent}
          canCreateCalendarEvent={canCreateCalendarEvent}
          showCalendarSettings={parentCalendarSettings}
          onSettings={() => setShowCalendarSettings(true)}
          familyName={family?.name}
          calendars={calendars}
          hiddenCals={hiddenCals}
          onToggleCal={toggleCal}
          syncNotice={syncNotice}
          mealsBody={renderMealsList()}
          paneItemsForDay={paneItemsForDay}
          paneLabel={asChildViewer ? t('tabs.chores') : t('tabs.tasks')}
          paneCreateLabel={asChildViewer ? 'Nytt gjøremål' : 'Ny oppgave'}
          onOpenPaneItem={onOpenPaneItem}
          onTogglePaneItem={onTogglePaneItem}
          onCreatePaneItem={isParent && !asChildViewer ? onCreatePaneItem : null}
          getCustodyOverlay={custodyOverlayActive ? getCustodyOverlay : null}
          custodyOverlayActive={custodyOverlayActive}
          showCustodyToggle={custodyKids.length > 0 || childViewerCustody}
          onToggleCustodyOverlay={toggleCustodyOverlay}
          custodyLegend={(
            <CustodyLegendBar
              visible={custodyOverlayActive}
              kids={kids}
              viewerUid={uid}
              childFilter={custodyChildFilter}
              members={members}
              viewerIsChild={asChildViewer}
            />
          )}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={[styles.wrap, { paddingHorizontal: pad }]}>
        <View style={styles.toolbar}>
          <View style={styles.seg}>
            {[['day', 'Dag'], ['week', 'Uke'], ['month', 'Måned'], ['meals', 'Mat']].map(([m, label]) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segOn]}>
                <Text style={[styles.segTxt, mode === m && styles.segTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isParent ? (
            <>
              {custodyKids.length > 0 ? (
                <TouchableOpacity
                  style={[styles.settingsBtn, custodyOverlayActive && styles.custodyBtnOn]}
                  onPress={toggleCustodyOverlay}
                  accessibilityLabel={custodyOverlayActive ? 'Skjul delt bosted' : 'Vis delt bosted'}
                >
                  <Ionicons
                    name={custodyOverlayActive ? 'home' : 'home-outline'}
                    size={20}
                    color={custodyOverlayActive ? colors.brand : colors.ink}
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.settingsBtn}
                onPress={() => setShowCalendarSettings(true)}
                accessibilityLabel="Kalenderinnstillinger"
              >
                <Ionicons name="settings-outline" size={20} color={colors.ink} />
              </TouchableOpacity>
            </>
          ) : (childViewerCustody ? (
            <TouchableOpacity
              style={[styles.settingsBtn, custodyOverlayActive && styles.custodyBtnOn]}
              onPress={toggleCustodyOverlay}
              accessibilityLabel={custodyOverlayActive ? 'Skjul bosted' : 'Vis bosted'}
            >
              <Ionicons
                name={custodyOverlayActive ? 'home' : 'home-outline'}
                size={20}
                color={custodyOverlayActive ? colors.brand : colors.ink}
              />
            </TouchableOpacity>
          ) : null)}
        </View>

        {mode === 'day' || mode === 'week' ? (
          <View style={[styles.homeWeek, { marginBottom: 6 }]}>
            {weekDays.map((d) => {
              const k = dateKey(d);
              const { ev } = itemsForDay(d);
              const selectedDay = sameDay(d, anchor);
              const todayDay = isToday(d);
              const custodyTint = custodyOverlayActive
                ? custodyCellTint(getCustodyOverlay(d), { selected: selectedDay, today: todayDay })
                : null;
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => setAnchor(d)}
                  style={[
                    styles.homeWeekCell,
                    custodyTint,
                    todayDay && !selectedDay && styles.cellToday,
                    selectedDay && styles.cellOn,
                  ]}
                  accessibilityLabel={k}
                >
                  <Text style={[
                    styles.homeWeekDow,
                    selectedDay && styles.homeWeekDowOn,
                    todayDay && !selectedDay && styles.whToday,
                  ]}
                  >
                    {WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}
                  </Text>
                  <Text style={[
                    styles.cellNum,
                    selectedDay && styles.cellNumOn,
                    todayDay && !selectedDay && styles.cellNumToday,
                  ]}
                  >
                    {d.getDate()}
                  </Text>
                  <View style={styles.dots}>
                    {ev.slice(0, 2).map((e) => (
                      <View key={e.id} style={[styles.dot, { backgroundColor: e.color || colorForFamilyEvent(e, members) }]} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => shift(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navLbl} numberOfLines={1}>
            {mode === 'month'
              ? `${MONTHS_NO[anchor.getMonth()]} ${anchor.getFullYear()}`
              : mode === 'day'
                ? dayLabel
                : `Uke ${iso.week} · ${weekDays[0].getDate()}.–${weekDays[6].getDate()}. ${MONTHS_NO[anchor.getMonth()].slice(0, 3)}`}
          </Text>
          <TouchableOpacity onPress={() => shift(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {mode !== 'meals' && !isToday(anchor) && (
          <TouchableOpacity style={styles.todayJump} onPress={() => setAnchor(new Date())}>
            <Text style={styles.todayJumpTxt}>Gå til i dag</Text>
          </TouchableOpacity>
        )}

        <CalendarSyncBanner
          notice={parentCalendarSettings ? syncNotice : null}
          onPress={() => setShowCalendarSettings(true)}
        />

        <CustodyLegendBar
          visible={custodyOverlayActive && mode !== 'meals'}
          kids={kids}
          viewerUid={uid}
          childFilter={custodyChildFilter}
          members={members}
          viewerIsChild={asChildViewer}
        />

        {mode === 'meals' ? renderMealsList() : (
          <ScrollView
            style={styles.dayList}
            contentContainerStyle={styles.listPad}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {mode === 'month' ? (
              <View style={styles.monthBlock}>
                <View style={styles.weekHead}>
                  {WEEKDAYS_SHORT.map((d, i) => {
                    const headerToday = (new Date().getDay() + 6) % 7 === i;
                    return (
                      <Text key={d} style={[styles.wh, headerToday && styles.whToday]}>{d}</Text>
                    );
                  })}
                </View>
                <View style={styles.grid}>
                  {days.map((d) => {
                    const k = dateKey(d);
                    const { ev } = itemsForDay(d);
                    const selectedDay = sameDay(d, anchor);
                    const todayDay = isToday(d);
                    const outside = !isSameMonth(d, anchor);
                    const custodyTint = custodyOverlayActive
                      ? custodyCellTint(getCustodyOverlay(d), { selected: selectedDay, today: todayDay })
                      : null;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => setAnchor(d)}
                        style={[
                          styles.cell,
                          (isDesktop || isTablet) && styles.cellWide,
                          custodyTint,
                          todayDay && !selectedDay && styles.cellToday,
                          selectedDay && styles.cellOn,
                          outside && { opacity: 0.35 },
                        ]}
                      >
                        <Text style={[styles.cellNum, selectedDay && styles.cellNumOn, todayDay && !selectedDay && styles.cellNumToday]}>
                          {d.getDate()}
                        </Text>
                        <View style={styles.dots}>
                          {ev.slice(0, 3).map((e) => (
                            <View key={e.id} style={[styles.dot, { backgroundColor: e.color || colorForFamilyEvent(e, members) }]} />
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {selected.ev.length === 0 && (
              externalLoading && isParent && !asChildViewer ? (
                <View style={styles.dayLoading}>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={styles.emptyDay}>Laster kalender…</Text>
                </View>
              ) : (
                <Text style={styles.emptyDay}>
                  {mode === 'week' && weekEventCount > 0
                    ? `Ingen hendelser denne dagen. ${weekEventCount} andre denne uken — trykk på dagen med prikker.`
                    : 'Ingen hendelser denne dagen.'}
                </Text>
              )
            )}

            {selected.ev.length > 0 && (
              <View style={styles.listCard}>
                <Text style={styles.listSection}>Hendelser</Text>
                {selected.ev.map((e) => (
                  <EventRow
                    key={`${e.id}-${e.occurrenceDateKey || e.dateKey}`}
                    item={e}
                    canOpen={canOpenEvent(e)}
                    canEdit={canManageEvent(e)}
                    members={members}
                    friendPeople={friendPeople}
                    onPress={() => openEventForm(e)}
                  />
                ))}
              </View>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 2 },
  homeWeek: { flexDirection: 'row', minWidth: 0 },
  homeWeekCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 0,
  },
  homeWeekDow: {
    fontSize: 9,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  homeWeekDowOn: { color: '#fff' },
  toolbar: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },  toolbarDesk: { marginBottom: 12, gap: 10, flexWrap: 'wrap' },
  deskNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deskNavLbl: { fontWeight: '400', color: colors.ink, fontSize: 14, minWidth: 88, textAlign: 'center' },
  deskActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  custodyBtnOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  settingsBtnDesk: { borderRadius: 8, width: 36, height: 36 },
  seg: { flex: 1, flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: colors.line },
  segDesk: { borderRadius: 8, flexGrow: 0, flex: 0, width: 280 },
  segBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center' },
  segBtnDesk: { borderRadius: 6 },
  segOn: { backgroundColor: colors.brand },
  segTxt: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  segTxtOn: { color: '#fff' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  navBtnDesk: { borderRadius: 8 },
  navLbl: { fontWeight: '400', color: colors.ink, fontSize: 12, flex: 1, textAlign: 'center', marginHorizontal: 6 },
  todayJump: { alignSelf: 'center', marginBottom: 8, paddingVertical: 4, paddingHorizontal: 10 },
  todayJumpTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  syncBannerTxt: { flex: 1, color: '#9a3412', fontWeight: '400', fontSize: 12, lineHeight: 16 },
  syncBannerLink: { color: '#9a3412', fontWeight: '400', fontSize: 12 },
  splitRow: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 20 },
  splitCal: { flex: 1.05, minWidth: 0 },
  splitList: { flex: 1, minWidth: 280 },
  weekBoard: {
    flex: 1, minHeight: 0, flexDirection: 'row', gap: 8,
  },
  weekCol: {
    flex: 1, minWidth: 0, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 8, overflow: 'hidden',
  },
  weekColToday: { borderColor: colors.brand, backgroundColor: '#f8fbff' },
  weekColHead: {
    alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  weekColHeadOn: { backgroundColor: colors.brandSoft },
  weekColDow: { fontSize: 10, fontWeight: '400', color: colors.muted, textTransform: 'uppercase' },
  weekColDowToday: { color: colors.brand },
  weekColNum: { fontSize: 16, fontWeight: '400', color: colors.ink, marginTop: 1 },
  weekColNumToday: { color: colors.brand },
  weekColBody: { flex: 1, padding: 6 },
  weekEmpty: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
  weekEvent: {
    backgroundColor: colors.brandSoft, borderLeftWidth: 3, borderRadius: 4,
    paddingVertical: 5, paddingHorizontal: 6, marginBottom: 5,
  },
  weekEventTime: { fontSize: 10, fontWeight: '400', color: colors.brand },
  weekEventTitle: { fontSize: 12, fontWeight: '400', color: colors.ink, marginTop: 1 },
  weekAdd: { alignItems: 'center', paddingVertical: 4, marginTop: 2 },
  weekAddTxt: { color: colors.brand, fontWeight: '400', fontSize: 16 },
  monthBoard: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1,
    borderColor: colors.line, minHeight: 0,
  },
  monthCell: {
    width: `${100 / 7}%`, minHeight: 92, padding: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  monthCellToday: { backgroundColor: '#f8fbff' },
  monthCellOn: { backgroundColor: colors.brandSoft },
  monthNum: { fontWeight: '400', fontSize: 12, color: colors.ink, marginBottom: 4 },
  monthNumToday: { color: colors.brand },
  monthChip: { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2, marginBottom: 2 },
  monthChipTxt: { color: '#fff', fontSize: 10, fontWeight: '400' },
  monthMore: { fontSize: 10, fontWeight: '400', color: colors.muted, marginTop: 2 },
  weekHead: { flexDirection: 'row', marginBottom: 2 },
  wh: { flex: 1, textAlign: 'center', fontWeight: '400', color: colors.muted, fontSize: 10 },
  whToday: { color: colors.brand, fontWeight: '400' },
  monthBlock: { marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, maxHeight: 44 },
  cellWide: { maxHeight: 56, aspectRatio: 1.15 },
  cellToday: { backgroundColor: colors.brandSoft },
  cellOn: { backgroundColor: colors.brand },
  cellNum: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  cellNumOn: { color: '#fff' },
  cellNumToday: { color: colors.brand },
  dots: { flexDirection: 'row', gap: 2, marginTop: 1, minHeight: 8, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dayList: { flex: 1, minHeight: 0 },
  listPad: { paddingBottom: 8, flexGrow: 1 },
  mealCols: { gap: 10 },
  mealCardSplit: { flex: 1 },
  listCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  listSection: {
    fontSize: 10, fontWeight: '400', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  mark: { width: 4, height: 32, borderRadius: 4 },
  eventTimeCol: { width: 44 },
  rowTime: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  rowTimeEnd: { fontWeight: '400', color: colors.muted, fontSize: 10, marginTop: 1 },
  rowTitle: { fontWeight: '400', color: colors.ink, fontSize: 14, flexShrink: 1 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  privatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 140,
    backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.line,
  },
  privatePillTxt: { fontSize: 10, fontWeight: '400', color: colors.muted, flexShrink: 1 },
  rowSub: { color: colors.muted, fontWeight: '500', fontSize: 11, marginTop: 1 },
  avatarSlot: { flexShrink: 0, marginLeft: 2 },
  emptyDay: { textAlign: 'center', color: colors.muted, fontWeight: '400', fontSize: 13, paddingVertical: 16 },
  dayLoading: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  mealCard: { backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  mealCardToday: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.brandSoft },
  mealDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mealDay: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  mealDayToday: { color: colors.brand },
  mealTodayBadge: {
    backgroundColor: colors.brand, color: '#fff', fontSize: 10, fontWeight: '400',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden',
  },
  mealRow: { gap: 4, marginTop: 4 },
  pill: { alignSelf: 'flex-start', backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillTxt: { color: colors.brand, fontWeight: '400', fontSize: 11 },
  mealTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
  mealMeta: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  mealIngredients: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  mealTapHint: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 2 },
  mealInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 8, fontSize: 16, backgroundColor: colors.card },
  portionRow: { flexDirection: 'row', gap: 10 },
  portionLbl: { fontWeight: '400', fontSize: 11, color: colors.muted, marginBottom: 4 },
  portionInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 8,
    fontSize: 14, backgroundColor: colors.card, fontWeight: '400',
  },
  aiHint: { color: colors.muted, fontSize: 12, fontWeight: '400', lineHeight: 17 },
  mealFormActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancelTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  link: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  shareBtn: {
    alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  shareTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
});
