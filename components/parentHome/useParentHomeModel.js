import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useWeather } from '../../src/hooks/useWeather';
import { useDeskHomeExternalEvents } from '../../src/hooks/useDeskHomeExternalEvents';
import { useNow } from '../../src/hooks/useNow';
import {
  deskGreetingTitle,
  mergeDeskDayEvents,
  nextTimedEvent,
  homeFocusIsTomorrow,
  homeFocusCopy,
  eventSourceHint,
  joinFirstNames,
  upcomingDayEvents,
} from '../../src/utils/deskHome';
import { firstNameFromProfile, formatGreetingDate } from '../../src/utils/timeGreeting';
import { roundTemp } from '../../src/utils/weather';
import { addDays, dateKey, startOfWeekMonday } from '../../src/utils/dates';
import { listenChildTodos } from '../../src/utils/todos';
import { kidProgressRows } from '../../src/utils/familyProgress';
import {
  custodyEnabled,
  custodyParentSlotForDate,
  resolveCustodyLabels,
  childrenWithCustody,
  countFamilyCustodyHandoffsInWeek,
} from '../../src/utils/custodySchedule';
import { resolveEventMembers } from '../MemberAvatarStack';
import { useParentDashboardTheme } from '../../src/hooks/useParentDashboardTheme';
import { placeText } from '../../src/utils/homeWidgetVisuals';
import {
  dashboardDayPart,
  resolveThemeHeroArt,
  resolveThemeAccentArt,
  resolveThemeBackgroundArt,
} from '../../src/utils/dashboardTimeArt';

function capitalizeNb(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function eventTimeLabel(ev) {
  if (ev?.startTime) return String(ev.startTime).slice(0, 5);
  if (ev?.endTime) return String(ev.endTime).slice(0, 5);
  return 'Heldag';
}

function eventEndLabel(ev) {
  if (ev?.endTime) return String(ev.endTime).slice(0, 5);
  return null;
}

/**
 * Shared view-model for themed parent mobile home layouts.
 */
export function useParentHomeModel({
  familyEventsToday = [],
  familyEventsTomorrow = [],
  allMembers = [],
  dashboardApps = [],
  widgetData = null,
  unreadByModule = null,
}) {
  const {
    activeProfile, uid, familyId, isParent, kids, parents, members,
  } = useApp();
  const now = useNow(30000);
  const { forecast, place } = useWeather();
  const todayKey = dateKey(now);
  const tomorrowDate = useMemo(() => addDays(now, 1), [now]);

  const {
    ready: themeReady,
    theme,
    bottomShortcutIds,
    reload: reloadTheme,
  } = useParentDashboardTheme();

  useFocusEffect(useCallback(() => { reloadTheme(); }, [reloadTheme]));

  const [externalRefresh, setExternalRefresh] = useState(0);
  useFocusEffect(useCallback(() => setExternalRefresh((n) => n + 1), []));

  const refreshHome = useCallback(async () => {
    await reloadTheme();
    setExternalRefresh((n) => n + 1);
  }, [reloadTheme]);

  const dayPart = useMemo(() => dashboardDayPart(now), [now]);
  const heroArt = useMemo(() => resolveThemeHeroArt(theme, now), [theme, now]);
  const accentArt = useMemo(() => resolveThemeAccentArt(theme, now), [theme, now]);
  const backgroundArt = useMemo(() => resolveThemeBackgroundArt(theme, now), [theme, now]);

  const externalEvents = useDeskHomeExternalEvents({
    enabled: !!(isParent && uid),
    uid,
    familyId,
    todayKey,
    refreshKey: externalRefresh,
  });

  const focusTomorrow = homeFocusIsTomorrow(now);
  const focusCopy = homeFocusCopy(focusTomorrow);
  const focusDate = focusTomorrow ? tomorrowDate : now;

  const eventsToday = useMemo(
    () => mergeDeskDayEvents(familyEventsToday, externalEvents, now),
    [familyEventsToday, externalEvents, now],
  );
  const eventsTomorrow = useMemo(
    () => mergeDeskDayEvents(familyEventsTomorrow, externalEvents, tomorrowDate),
    [familyEventsTomorrow, externalEvents, tomorrowDate],
  );
  const focusEvents = focusTomorrow ? eventsTomorrow : eventsToday;

  const nextEvent = useMemo(() => {
    if (focusTomorrow) return focusEvents[0] || null;
    return nextTimedEvent(focusEvents, now);
  }, [focusTomorrow, focusEvents, now]);

  const nextPeople = useMemo(
    () => resolveEventMembers(allMembers, nextEvent?.memberIds),
    [allMembers, nextEvent],
  );

  const firstName = firstNameFromProfile(activeProfile, 'du');
  const greeting = deskGreetingTitle(now, firstName);
  const dateLabel = capitalizeNb(formatGreetingDate(focusDate));
  const temp = forecast?.current?.temp ?? forecast?.today?.temp;
  const weatherIcon = forecast?.current?.icon || forecast?.today?.icon || 'partly-sunny';
  const weatherLabel = forecast?.current?.label || forecast?.today?.label || '';
  const placeName = place?.name || '';

  const taskItems = widgetData?.tasks?.items || [];
  const taskCount = Number(widgetData?.tasks?.count || 0);
  const shopCount = Number(widgetData?.shopping?.count || 0);
  const shopItems = widgetData?.shopping?.openItems || widgetData?.shopping?.items || [];
  const dinner = widgetData?.meals?.items?.[0] || null;
  const mealItems = widgetData?.meals?.items || [];
  const mealCount = Number(widgetData?.meals?.count || mealItems.length || 0);
  const notes = widgetData?.notes?.items || [];
  const noteCount = Number(widgetData?.notes?.count || notes.length || 0);

  // Progress: open today + completed today when available. Never invent a total of 1.
  const taskDone = Math.max(0, Number(widgetData?.tasks?.doneToday || 0));
  const taskOpen = Math.max(0, taskCount, (taskItems || []).length);
  const taskTotalRaw = Number(widgetData?.tasks?.totalToday);
  const taskTotal = Number.isFinite(taskTotalRaw) && taskTotalRaw >= 0
    ? Math.max(taskTotalRaw, taskDone + taskOpen, taskOpen)
    : Math.max(taskDone + taskOpen, taskOpen);
  const taskProgress = {
    done: taskDone,
    total: taskTotal,
    open: taskOpen,
    items: taskItems,
  };

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false && k.archived !== true),
    [kids],
  );

  const [kidMap, setKidMap] = useState({});
  const kidsKey = useMemo(
    () => activeKids.map((k) => k.id).filter(Boolean).sort().join('|'),
    [activeKids],
  );
  const weekKeys = useMemo(() => {
    const mon = startOfWeekMonday(now);
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i)));
  }, [now]);

  useEffect(() => {
    if (!familyId || !kidsKey) {
      setKidMap({});
      return undefined;
    }
    const ids = kidsKey.split('|');
    const unsubs = ids.map((kidId) => listenChildTodos(familyId, kidId, (items) => {
      setKidMap((prev) => ({ ...prev, [kidId]: items }));
    }));
    return () => unsubs.forEach((u) => u && u());
  }, [familyId, kidsKey]);

  const kidProgress = useMemo(
    () => kidProgressRows(activeKids, kidMap, weekKeys, todayKey),
    [activeKids, kidMap, weekKeys, todayKey],
  );

  const custodyWeekLabel = useMemo(() => {
    const withCustody = childrenWithCustody(activeKids);
    if (!withCustody.length) return null;
    const child = withCustody[0];
    if (!custodyEnabled(child)) return null;
    const labels = resolveCustodyLabels(child.custody, {
      parents: parents || [],
      viewerUid: uid,
    });
    const slot = custodyParentSlotForDate(child.custody, now);
    if (!slot || !labels) return null;
    const name = slot === 'parentA' ? labels.parentA : labels.parentB;
    const first = String(name || '').split(' ')[0] || 'forelder';
    return `Denne uken hos ${first.toLowerCase() === 'meg' ? 'deg' : first}`;
  }, [activeKids, parents, uid, now]);

  const weekStats = useMemo(() => {
    // Real calendar appointments we know about (today + tomorrow from home feed).
    const appointments = (eventsToday?.length || 0) + (eventsTomorrow?.length || 0);
    // Open tasks as actionable reminders — not a fake 0/1 flag.
    const reminders = Math.max(0, taskCount);
    // Real custody handoffs this calendar week (not a hardcoded 2).
    const swaps = countFamilyCustodyHandoffsInWeek(activeKids, now);
    return {
      swaps,
      activities: appointments,
      appointments,
      reminders,
      eventsToday: eventsToday?.length || 0,
      eventsTomorrow: eventsTomorrow?.length || 0,
    };
  }, [eventsToday, eventsTomorrow, taskCount, activeKids, now]);

  const remainingHints = useMemo(() => {
    const bits = [];
    if (shopCount > 0) bits.push('Dagligvarer');
    if (!dinner) bits.push('Planlegg middag');
    if (taskCount > 0 && bits.length < 2) bits.push('Oppgaver');
    return bits.slice(0, 2);
  }, [shopCount, dinner, taskCount]);

  const remainingCount = (taskCount > 0 ? 1 : 0) + (shopCount > 0 ? 1 : 0) + (!dinner ? 1 : 0);

  const appById = useMemo(() => {
    const map = {};
    (dashboardApps || []).forEach((a) => { map[a.id] = a; });
    return map;
  }, [dashboardApps]);

  const timeline = useMemo(
    () => {
      const source = focusTomorrow
        ? (focusEvents || [])
        : upcomingDayEvents(focusEvents || [], now);
      return source.slice(0, 8).map((ev, idx) => ({
        id: ev.id || `ev-${idx}`,
        time: eventTimeLabel(ev),
        end: eventEndLabel(ev),
        title: ev.title || 'Hendelse',
        place: placeText(ev.place) || placeText(ev.location),
        people: resolveEventMembers(allMembers, ev.memberIds),
        color: ['#2563eb', '#7c3aed', '#059669', '#ea580c'][idx % 4],
        event: ev,
      }));
    },
    [focusEvents, focusTomorrow, allMembers, now],
  );

  const appointmentsPeek = useMemo(() => {
    const rows = [];
    upcomingDayEvents(eventsToday || [], now).slice(0, 4).forEach((ev) => {
      rows.push({
        id: ev.id,
        when: 'I dag',
        time: eventTimeLabel(ev),
        title: ev.title || 'Hendelse',
        place: placeText(ev.place) || placeText(ev.location),
        color: '#ef4444',
        event: ev,
      });
    });
    if (rows.length < 4) {
      (eventsTomorrow || []).slice(0, 4 - rows.length).forEach((ev) => {
        rows.push({
          id: ev.id,
          when: 'I morgen',
          time: eventTimeLabel(ev),
          title: ev.title || 'Hendelse',
          place: placeText(ev.place) || placeText(ev.location),
          color: '#2563eb',
          event: ev,
        });
      });
    }
    return rows;
  }, [eventsToday, eventsTomorrow, now]);

  const assistantSuggestions = useMemo(() => {
    const out = [];
    if (nextEvent) {
      out.push({
        id: 'prep-event',
        icon: 'checkmark-circle',
        color: '#16a34a',
        text: `Husk å forberede «${nextEvent.title || 'avtalen'}»`,
      });
    }
    if (taskItems[0]) {
      out.push({
        id: 'task',
        icon: 'calendar',
        color: '#7c3aed',
        text: `Sett av tid til «${taskItems[0].title}»`,
      });
    }
    if (!out.length) {
      out.push({
        id: 'calm',
        icon: 'checkmark-circle',
        color: '#16a34a',
        text: 'Dagen ser rolig ut — nyt den',
      });
    }
    return out.slice(0, 2);
  }, [nextEvent, taskItems]);

  const weather = {
    temp: Number.isFinite(Number(temp)) ? roundTemp(temp) : null,
    icon: weatherIcon,
    label: weatherLabel,
    hint: dayPart === 'evening' ? 'Det blir en fin uke' : 'En nydelig dag venter',
    place: placeName,
    high: forecast?.today?.max ?? null,
    low: forecast?.today?.min ?? null,
    periods: (forecast?.todayPeriods || []).map((p) => ({
      id: p.id,
      label: p.label || p.id,
      temp: p.tempMax ?? p.tempMin ?? null,
      icon: p.icon,
    })),
    hours: (forecast?.nextHours || []).map((h) => ({
      id: h.id,
      hour: h.hour,
      temp: h.temp,
      icon: h.icon,
    })),
    days: (forecast?.days || []).map((d) => ({
      weekday: d.weekday,
      icon: d.icon,
      max: d.max,
      min: d.min,
      label: d.label,
    })),
  };

  return {
    themeReady,
    theme,
    themeId: theme?.id,
    dayPart,
    heroArt,
    accentArt,
    backgroundArt,
    bottomShortcutIds,
    greeting,
    firstName,
    dateLabel,
    focusTomorrow,
    focusLabel: focusCopy.focusLabel,
    focusCopy,
    isPreview: false,
    weather,
    nextEvent: nextEvent ? {
      title: nextEvent.title || 'Hendelse',
      time: eventTimeLabel(nextEvent),
      end: eventEndLabel(nextEvent),
      place: placeText(nextEvent.place) || placeText(nextEvent.location),
      peopleLine: joinFirstNames(nextPeople) || eventSourceHint(nextEvent) || 'Familie',
      raw: nextEvent,
    } : null,
    timeline,
    appointmentsPeek,
    eventsToday,
    eventsTomorrow,
    focusEvents,
    taskProgress,
    taskCount,
    shopCount,
    shopItems,
    unreadByModule: unreadByModule || {},
    dinner,
    mealItems,
    mealCount,
    notes,
    noteCount,
    remainingHints,
    remainingCount: Math.min(remainingCount, 2) || (taskCount + (shopCount > 0 ? 1 : 0)),
    custodyWeekLabel,
    weekStats,
    activeKids,
    kidProgress,
    allMembers,
    parents: parents || [],
    members: members || [],
    appById,
    dashboardApps,
    assistantSuggestions,
    activeProfile,
    refreshHome,
  };
}

export { eventTimeLabel };
