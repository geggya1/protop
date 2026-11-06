import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, useBreakpoints } from '../../src/theme';
import {
  addDays, dateKey, startOfWeekMonday, monthGrid, isSameMonth, WEEKDAYS_SHORT, MONTHS_NO, sameDay, isToday, getISOWeek,
} from '../../src/utils/dates';
import { formatWeekRangeShortNo, calendarIdOf, isCalendarLayerHidden, calendarConnectionLayerId, calendarSubLayerId, connectionDisplayLabel, icsSidebarLabel, shouldListEventAsCalendarLayer, HIDDEN_CALENDAR_LAYERS_KEY, equipmentGroupLayerId, equipmentLayerId } from '../../src/utils/timeGrid';
import { eventOccursOnDate, eventOnOwnCalendar, eventVisibleToUser } from '../../src/utils/events';
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
import { toggleParentTodo } from '../../src/utils/todos';
import { buildCalendarPaneItems } from '../../src/utils/calendarTaskPane';
import { isExternalCalendarEvent } from '../../src/utils/externalEventVisibility';
import {
  useExternalEventVisibilityMap,
  useEventsWithExternalVisibility,
} from '../../src/hooks/useExternalEventVisibility';
import { listenEventsSharedWithMe } from '../../src/utils/friends';
import MemberAvatarStack, { whoCountLabel, resolveEventMembers } from '../../components/MemberAvatarStack';
import { Screen } from '../../components/ui';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorForConnection, colorForExternalCalendar, colorForFamilyEvent, FAMILY_CALENDAR_COLOR, isDefaultLayerCalendar } from '../../src/utils/calendarColors';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadProjectState } from '../../src/project/storage';
import {
  SHOWN_EQUIPMENT_CALENDARS_KEY,
  equipmentViewerAccess,
  equipmentCalendarGroup,
  equipmentEventsFromBookings,
  withEquipmentChecks,
} from '../../src/equipment/calendars';
import { lazyScreen } from '../../src/ui/lazyScreen';
const CalendarSettingsScreen = lazyScreen(() => import('./CalendarSettingsScreen'), { name: 'CalendarSettingsScreen' });
const OutlookCalendar = lazyScreen(() => import('../../components/OutlookCalendar'), { name: 'OutlookCalendar', silent: true });

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
  const { pad, isDesktop, isTablet } = useBreakpoints();
  const {
    familyId, members, uid, family, families, isParent, friendPeople,
  } = useApp();
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState(() => peekFamilyEventsCache(familyId ? [familyId] : []) || []);
  const [friendSharedEvents, setFriendSharedEvents] = useState([]);
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
  const [shownEquipment, setShownEquipment] = useState(() => new Set());
  const [projectState, setProjectState] = useState(null);
  const access = useCompanyAccess();
  const isCompany = isOrganizationType(family?.type);
  // Firmautstyr følger Utstyr i tilgangsstyringen. «Se som» viser den valgte personens utstyr.
  const gearAccess = equipmentViewerAccess(access, { employees: access.employees });
  const manageEquipment = gearAccess.manage;
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [parentTodos, setParentTodos] = useState([]);

  useEffect(() => {
    if (!isParent) return undefined;
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
      if (sessionStorage.getItem(OPEN_CALENDAR_SETTINGS_KEY) === '1') {
        sessionStorage.removeItem(OPEN_CALENDAR_SETTINGS_KEY);
        setShowCalendarSettings(true);
      }
    } catch { /* ignore */ }
    return undefined;
  }, [isParent]);

  const selectedKey = dateKey(anchor);
  // Barnekalender, delt bosted og «vis som barn» hørte til familieproduktet.
  const parentCalendarSettings = isParent;
  const canCreateCalendarEvent = isParent;

  const viewerIds = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    const ids = [familyId];
    const cached = peekFamilyEventsCache(ids);
    if (cached?.length) setEvents(cached);
    return listenEventsAcrossPlatforms({
      platformIds: ids,
      activePlatformId: familyId,
      viewerIds,
      platforms: families,
      onChange: (next) => {
        putFamilyEventsCache(ids, next);
        setEvents(next);
      },
    });
  }, [familyId, viewerIds, families]);

  useEffect(() => {
    if (!uid) {
      setFriendSharedEvents([]);
      return undefined;
    }
    return listenEventsSharedWithMe(uid, {
      excludeFamilyIds: platformIds,
      onChange: setFriendSharedEvents,
    });
  }, [uid, platformIds]);

  useEffect(() => {
    if (!familyId || !isDesktop) {
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
  }, [familyId, isDesktop, platformIds, uid, viewerIds, families]);

  useFocusEffect(useCallback(() => {
    if (!isCompany || !familyId) {
      setProjectState(null);
      return undefined;
    }
    let live = true;
    loadProjectState(familyId, { force: true }).then((loaded) => {
      if (live) setProjectState(loaded);
    }).catch(() => {});
    return () => { live = false; };
  }, [isCompany, familyId]));

  useEffect(() => {
    if (!uid) {
      setShownEquipment(new Set());
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${SHOWN_EQUIPMENT_CALENDARS_KEY}.${uid}`);
        if (!alive) return;
        const list = raw ? JSON.parse(raw) : [];
        setShownEquipment(new Set(Array.isArray(list) ? list : []));
      } catch {
        if (alive) setShownEquipment(new Set());
      }
    })();
    return () => { alive = false; };
  }, [uid]);

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
    if (mode === 'day') {
      const k = dateKey(anchor);
      return { start: k, end: k };
    }
    const days = mode === 'month' ? grid : weekDays;
    if (!days.length) return null;
    return { start: dateKey(days[0]), end: dateKey(days[days.length - 1]) };
  }, [mode, grid, weekDays, anchor]);

  useFocusEffect(useCallback(() => {
    if (!isParent || !uid || !rangeKeys) {
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

  const canManageEvent = useCallback((e) => {
    if (!e || e.readOnly || e.sharedFromFriend) return false;
    if (isParent) return true;
    // Egen privat/personlig hendelse — også når den ligger i en annen familie.
    return !!(uid && e.createdBy && e.createdBy === uid);
  }, [isParent, uid]);

  /** Foreldre kan åpne alle; barn kan lese synlige hendelser (redigering krever calendarSelfEdit). */
  const canOpenEvent = useCallback((e) => {
    if (!e) return false;
    if (e.source === 'equipment') return true;
    if (e.sharedFromFriend) return true;
    if (isParent) return true;
    if (e.readOnly) return false;
    return !!(uid && e.createdBy && e.createdBy === uid);
  }, [isParent, uid]);

  const openEventForm = useCallback((e) => {
    if (!canOpenEvent(e)) return;
    if (e?.source === 'equipment') {
      const linked = e.eventId
        ? events.find((row) => row.id === e.eventId)
        : null;
      if (linked) {
        nav.navigate('EventForm', {
          familyId: linked.familyId || familyId,
          event: linked,
        });
        return;
      }
      nav.navigate('EventForm', {
        familyId,
        equipmentBookingId: e.equipmentBookingId,
        equipmentIds: e.equipmentId ? [e.equipmentId] : [],
        event: {
          source: 'equipment',
          equipmentBookingId: e.equipmentBookingId,
          equipmentIds: e.equipmentId ? [e.equipmentId] : [],
          title: e.bookingPurpose || e.title,
          dateKey: e.dateKey,
          endDateKey: e.endDateKey || e.dateKey,
          startTime: e.startTime,
          endTime: e.endTime,
          place: e.place,
          recurring: e.recurring,
          recurrenceType: e.recurrenceType,
          recurrenceInterval: e.recurrenceInterval,
          recurrenceByDays: e.recurrenceByDays,
          recurrenceUntilKey: e.recurrenceUntilKey,
          readOnly: !(manageEquipment || (e.employeeId && access.employee?.id && e.employeeId === access.employee.id)),
        },
      });
      return;
    }
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
  }, [canOpenEvent, canManageEvent, familyId, nav, events, manageEquipment, access.employee]);

  const equipmentGroup = useMemo(() => (
    isCompany && gearAccess.canSee
      ? equipmentCalendarGroup({
        equipment: projectState?.equipment,
        employees: access.employees,
        viewer: gearAccess.viewer,
        manage: manageEquipment,
      })
      : null
  ), [isCompany, projectState, access.employees, gearAccess.canSee, gearAccess.viewer, manageEquipment]);

  const itemsForDay = useCallback((d) => {
    const k = dateKey(d);
    const familyEv = events
      .filter((e) => eventOccursOnDate(e, d))
      .filter((e) => !(isParent && e.sharedFromExternal))
      // Kalenderen er din egen ProTop-kalender, ikke hele selskapet.
      .filter((e) => {
        if (e.crossPlatform) return false;
        if (isParent) return eventOnOwnCalendar(e, viewerIds, members);
        return eventVisibleToUser(e, viewerIds, { asChild: false, members });
      })
      .map((e) => ({
        ...e,
        occurrenceDateKey: k,
        color: e.color || colorForFamilyEvent(e, members),
      }));
    const privateEv = isParent
      ? visibleExternalEvents.filter((e) => eventOccursOnDate(e, d))
      : [];
    const friendEv = friendSharedEvents
      .filter((e) => eventOccursOnDate(e, d))
      .map((e) => ({
        ...e,
        occurrenceDateKey: k,
        color: e.color || colorForFamilyEvent(e, members),
      }));
    const visibleGear = new Set(
      (equipmentGroup?.children || [])
        .filter((child) => shownEquipment.has(child.id))
        .map((child) => child.id),
    );
    const equipmentEv = isCompany
      ? equipmentEventsFromBookings(projectState?.equipmentBookings, projectState?.equipment)
        .filter((e) => visibleGear.has(equipmentLayerId(e.equipmentId)))
        .filter((e) => eventOccursOnDate(e, d))
        .map((e) => ({ ...e, occurrenceDateKey: k }))
      : [];
    const seen = new Set();
    const ev = [...familyEv, ...privateEv, ...friendEv, ...equipmentEv]
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
  }, [events, visibleExternalEvents, friendSharedEvents, isParent, viewerIds, members, hiddenCals, familyId, isCompany, projectState, shownEquipment, equipmentGroup]);

  const paneItemsForDay = useCallback((d) => buildCalendarPaneItems({
    date: d,
    parentTodos,
    kids: [],
    kidsTodosById: {},
    viewer: {
      uid,
      ids: viewerIds,
      asChild: false,
    },
  }), [parentTodos, uid, viewerIds]);

  const onOpenPaneItem = useCallback((item) => {
    if (!item) return;
    const t = item.task;
    const resolved = t.crossPlatform ? { ...t, id: t.sourceTodoId || t.id } : t;
    nav.navigate('ParentTask', {
      task: resolved,
      familyId: t.familyId || familyId,
      readOnly: false,
    });
  }, [nav, familyId]);

  const onTogglePaneItem = useCallback(async (item) => {
    if (!item) return;
    try {
      await toggleParentTodo(item.task.familyId || familyId, item.task, item.date);
    } catch { /* ignore */ }
  }, [familyId]);

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
    // Kun ekte eksterne feeder uten tilkoblingsrad. ProTop-hendelser
    // (private/readOnly med selskaps- eller hjemmenavn) er ikke egne lag.
    externalEvents.forEach((e) => {
      if (!shouldListEventAsCalendarLayer(e)) return;
      addFlat(
        calendarIdOf(e, familyId),
        e.sourceLabel || (e.source === 'ics' ? 'ICS' : 'Google'),
        e.color,
        { type: e.source },
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

    const gear = withEquipmentChecks(equipmentGroup, shownEquipment);
    if (gear) list.push(gear);

    return list;
  }, [
    familyId, externalEvents,
    calendarConnections, externalLayers, externalSyncErrors,
    equipmentGroup, shownEquipment,
  ]);

  const syncNotice = useMemo(
    () => calendarSyncNotice({
      connections: calendarConnections,
      fetchErrors: externalSyncErrors,
    }),
    [calendarConnections, externalSyncErrors],
  );

  const toggleCal = useCallback((id) => {
    if (id === equipmentGroupLayerId() || String(id || '').startsWith('eq:')) {
      setShownEquipment((prev) => {
        const next = new Set(prev);
        const visibleIds = (equipmentGroup?.children || []).map((child) => child.id);
        if (id === equipmentGroupLayerId()) {
          const allOn = visibleIds.length > 0 && visibleIds.every((layerId) => next.has(layerId));
          visibleIds.forEach((layerId) => {
            if (allOn) next.delete(layerId);
            else next.add(layerId);
          });
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        if (uid) {
          AsyncStorage.setItem(
            `${SHOWN_EQUIPMENT_CALENDARS_KEY}.${uid}`,
            JSON.stringify([...next]),
          ).catch(() => {});
        }
        return next;
      });
      return;
    }
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
  }, [uid, equipmentGroup]);

  const presetEquipmentIds = useMemo(() => {
    const shown = (equipmentGroup?.children || []).filter((child) => shownEquipment.has(child.id));
    return shown.length === 1 ? [shown[0].equipmentId] : [];
  }, [equipmentGroup, shownEquipment]);

  const calendarAddBtn = useMemo(() => {
    if (!canCreateCalendarEvent) return null;
    return (
      <ShellAddButton
        label="Ny hendelse"
        accessibilityLabel="Ny hendelse"
        onPress={() => nav.navigate('EventForm', {
          familyId,
          dateKey: selectedKey,
          equipmentIds: presetEquipmentIds,
        })}
      />
    );
  }, [isDesktop, canCreateCalendarEvent, mode, familyId, selectedKey, nav, presetEquipmentIds]);
  useShellTitleRight(calendarAddBtn, { active });

  const shift = (dir) => {
    if (mode === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else if (mode === 'day') setAnchor((d) => addDays(d, dir));
    else setAnchor((d) => addDays(d, dir * 7));
  };

  const dayLabel = `${WEEKDAYS_SHORT[(anchor.getDay() + 6) % 7]} ${anchor.getDate()}. ${MONTHS_NO[anchor.getMonth()]}`;

  if (showCalendarSettings && parentCalendarSettings) {
    return (
      <CalendarSettingsScreen
        inShell
        onBack={() => setShowCalendarSettings(false)}
        calendars={calendars}
        hiddenCals={hiddenCals}
        onToggleCal={toggleCal}
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
            equipmentIds: presetEquipmentIds,
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
          paneItemsForDay={paneItemsForDay}
          paneLabel={t('tabs.tasks')}
          paneCreateLabel="Ny oppgave"
          onOpenPaneItem={onOpenPaneItem}
          onTogglePaneItem={onTogglePaneItem}
          onCreatePaneItem={isParent ? onCreatePaneItem : null}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={[styles.wrap, { paddingHorizontal: pad }]}>
        <View style={styles.toolbar}>
          <View style={styles.seg}>
            {[['day', 'Dag'], ['week', 'Uke'], ['month', 'Måned']].map(([m, label]) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segOn]}>
                <Text style={[styles.segTxt, mode === m && styles.segTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isParent ? (
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => setShowCalendarSettings(true)}
              accessibilityLabel="Kalenderinnstillinger"
            >
              <Ionicons name="settings-outline" size={20} color={colors.ink} />
            </TouchableOpacity>
          ) : null}
        </View>

        {mode === 'day' || mode === 'week' ? (
          <View style={[styles.homeWeek, { marginBottom: 6 }]}>
            {weekDays.map((d) => {
              const k = dateKey(d);
              const { ev } = itemsForDay(d);
              const selectedDay = sameDay(d, anchor);
              const todayDay = isToday(d);
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => setAnchor(d)}
                  style={[
                    styles.homeWeekCell,
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
          <TouchableOpacity onPress={() => shift(-1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Forrige periode">
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navLbl} numberOfLines={1}>
            {mode === 'month'
              ? `${MONTHS_NO[anchor.getMonth()]} ${anchor.getFullYear()}`
              : mode === 'day'
                ? dayLabel
                : `Uke ${iso.week} · ${formatWeekRangeShortNo(weekDays, MONTHS_NO)}`}
          </Text>
          <TouchableOpacity onPress={() => shift(1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Neste periode">
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {!isToday(anchor) && (
          <TouchableOpacity style={styles.todayJump} onPress={() => setAnchor(new Date())}>
            <Text style={styles.todayJumpTxt}>Gå til i dag</Text>
          </TouchableOpacity>
        )}

        <CalendarSyncBanner
          notice={parentCalendarSettings ? syncNotice : null}
          onPress={() => setShowCalendarSettings(true)}
        />

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
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setAnchor(d)}
                      style={[
                        styles.cell,
                        (isDesktop || isTablet) && styles.cellWide,
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
            externalLoading && isParent ? (
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
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  seg: { flex: 1, flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: colors.line },
  segBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.brand },
  segTxt: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  segTxtOn: { color: '#fff' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  navLbl: { fontWeight: '400', color: colors.ink, fontSize: 12, flex: 1, textAlign: 'center', marginHorizontal: 6 },
  todayJump: { alignSelf: 'center', marginBottom: 8, paddingVertical: 4, paddingHorizontal: 10 },
  todayJumpTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.starSoft,
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  syncBannerTxt: { flex: 1, color: colors.warnInk, fontWeight: '400', fontSize: 12, lineHeight: 16 },
  syncBannerLink: { color: colors.warnInk, fontWeight: '400', fontSize: 12 },
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
});
