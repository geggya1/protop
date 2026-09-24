import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { soft } from '../parentHome/softTheme';
import { colors, useLayout } from '../../src/theme';
import { useWeather } from '../../src/hooks/useWeather';
import { roundTemp } from '../../src/utils/weather';
import { isDoneOn } from '../../src/utils/todoStatus';
import {
  childHomePeriod,
  childTimelineFocus,
  partitionChildDayTasks,
} from '../../src/utils/childHome';
import { usePullToRefresh, hardReloadApp } from '../../src/hooks/usePullToRefresh';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import { useBottomChromeInset } from '../../src/utils/useBottomChromeInset';
import { useOptionalRoute } from '../../src/hooks/useOptionalRoute';
import { homeSceneTitle, homeSceneTagline, HOME_SCENE_SUBTITLE } from '../../src/homeBanners';
import { dashboardDayPart } from '../../src/utils/dashboardTimeArt';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import {
  childHomeStorageAliases,
  childHomeStorageId,
} from '../../src/utils/childHomeLayout';
import WidgetBoard from '../home/WidgetBoard';

/**
 * Child home — same fixed widget layout as the adult home.
 * Banner and dock persist per child profile.
 */
export default function ChildDashboardThemeHost({
  child,
  firstName,
  dateLabel,
  now,
  dayDone,
  dayTasks,
  homeworkTasks,
  dayRemaining,
  myEventsToday,
  myEventsTomorrow,
  showChores,
  showCalendar,
  weekProgram,
  onToggle,
  onOpenDetail,
  onOpenSummary,
  onOpenCalendar,
  onOpenWeekPlan,
  onStartTask,
  todayKey,
  onAddTodo,
  dashboardApps,
  unreadByModule,
  onAppAction,
  onOpenSettings,
  weekEarned,
  weekCap,
  unitLabel,
  weekPct,
}) {
  const nav = useNavigation();
  const route = useOptionalRoute();
  const childId = childHomeStorageId(child);
  const layoutAliases = useMemo(() => childHomeStorageAliases(child), [child]);
  const clock = now || new Date();
  const home = useHomeLayout(childId, { role: 'child', aliases: layoutAliases });
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [setupEdit, setSetupEdit] = useState(false);

  useEffect(() => {
    if (!route?.params?.editHome) return;
    setEditing(true);
    setSetupEdit(true);
    nav.setParams?.({ editHome: undefined });
  }, [route?.params?.editHome, nav]);
  const { forecast, place } = useWeather();
  const { isPhone } = useLayout();
  const immersive = useHomeImmersive() && isPhone;
  const pageBg = immersive ? 'transparent' : soft.bg;

  const { refreshControl } = usePullToRefresh(async () => {
    if (hardReloadApp()) return;
    await home.reload();
  });

  const greeting = useMemo(() => {
    const name = firstName || child?.name?.split(' ')[0] || 'deg';
    return `Hei, ${name}`;
  }, [firstName, child]);

  const taskProgress = useMemo(() => {
    if (!showChores) {
      return { done: 0, total: 0, open: 0, items: [], openItems: [], doneItems: [] };
    }
    const { open, done, sorted } = partitionChildDayTasks(dayTasks || [], todayKey);
    const mapItem = (t) => ({
      id: t.id,
      title: t.title || t.name || 'Gjøremål',
      meta: t.dueLabel || '',
      done: isDoneOn(t, todayKey),
      raw: t,
    });
    const items = sorted.slice(0, 8).map(mapItem);
    return {
      done: dayDone || done.length,
      total: (dayTasks || []).length,
      open: dayRemaining || open.length,
      items,
      openItems: open.map(mapItem),
      doneItems: done.map(mapItem),
    };
  }, [dayTasks, dayDone, dayRemaining, todayKey, showChores]);

  const timelineFocus = useMemo(
    () => childTimelineFocus({
      eventsToday: showCalendar ? (myEventsToday || []) : [],
      eventsTomorrow: showCalendar ? (myEventsTomorrow || []) : [],
      now: clock,
    }),
    [myEventsToday, myEventsTomorrow, clock, showCalendar],
  );

  const timeline = useMemo(
    () => timelineFocus.upcoming.slice(0, 6).map((e) => ({
      id: e.id,
      time: String(e.startTime || '').slice(0, 5) || 'Heldag',
      title: e.title || 'Avtale',
      place: e.place || e.location || '',
      color: e.color || soft.sage,
      raw: e,
    })),
    [timelineFocus],
  );

  const apps = useMemo(() => (dashboardApps || []).slice(0, 9).map((app) => ({
    id: app.id,
    label: app.label || app.title,
    icon: app.icon || 'apps',
    sub: app.sub || app.meta,
    module: app.module,
    action: app.action || app,
  })), [dashboardApps]);

  const appById = useMemo(() => {
    const map = {};
    (dashboardApps || []).forEach((app) => {
      if (!app?.id) return;
      map[app.id] = {
        id: app.id,
        label: app.label || app.title,
        icon: app.icon || 'apps',
        sub: app.sub || app.meta,
        module: app.module,
        action: app.action || app,
      };
    });
    return map;
  }, [dashboardApps]);

  const homeworkItems = useMemo(() => (
    (homeworkTasks || []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title || item.name || 'Lekse',
      done: isDoneOn(item, todayKey),
    }))
  ), [homeworkTasks, todayKey]);

  const temp = forecast?.current?.temp ?? forecast?.today?.temp;
  const weather = useMemo(() => ({
    temp: Number.isFinite(Number(temp)) ? roundTemp(temp) : null,
    icon: forecast?.current?.icon || forecast?.today?.icon || 'partly-sunny',
    label: forecast?.current?.summary || forecast?.today?.summary || '',
    place: place?.name || '',
    high: Number.isFinite(Number(forecast?.today?.max)) ? roundTemp(forecast.today.max) : null,
    low: Number.isFinite(Number(forecast?.today?.min)) ? roundTemp(forecast.today.min) : null,
    periods: (forecast?.todayPeriods || []).map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      temp: p.tempMax ?? p.tempMin ?? null,
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
  }), [temp, forecast, place]);

  const rewardHint = useMemo(() => {
    if (weekCap == null) return 'Se hva du har opptjent';
    const left = Math.max(0, Number(weekCap) - Number(weekEarned || 0));
    const unit = unitLabel || 'poeng';
    return left > 0 ? `${left} ${unit} igjen denne uken` : `Ukens mål er nådd!`;
  }, [weekCap, weekEarned, unitLabel]);

  const weekGoals = useMemo(() => {
    const open = (taskProgress.openItems || []).slice(0, 3).map((t) => ({
      id: t.id,
      title: t.title,
      done: false,
    }));
    const done = (taskProgress.doneItems || []).slice(0, 3 - open.length).map((t) => ({
      id: t.id,
      title: t.title,
      done: true,
    }));
    return [...open, ...done];
  }, [taskProgress]);

  const model = useMemo(() => ({
    isPreview: false,
    greeting,
    firstName: firstName || child?.name?.split(' ')[0] || '',
    dateLabel,
    weather,
    timeline,
    focusTomorrow: timelineFocus.focusTomorrow,
    focusCopy: timelineFocus.focusCopy,
    taskProgress,
    homeworkItems,
    weekProgram: weekProgram || null,
    apps,
    appById,
    dashboardApps: apps,
    unreadByModule,
    showChores,
    showCalendar,
    period: childHomePeriod(clock),
    dayPart: dashboardDayPart(clock),
    rewardBalance: weekEarned,
    rewardHint,
    weekGoals,
    weekPct: weekPct || 0,
    unitLabel: unitLabel || 'poeng',
  }), [
    greeting, firstName, child, dateLabel, weather, timeline, timelineFocus,
    taskProgress, homeworkItems, weekProgram, apps, appById, unreadByModule, showChores,
    showCalendar, clock, weekEarned, rewardHint, weekGoals, weekPct, unitLabel,
  ]);

  const handlers = useMemo(() => ({
    onOpenEvent: (row) => {
      const ev = row?.event || row?.raw || row;
      if (ev) onOpenDetail?.(ev);
    },
    onOpenPlan: () => onOpenCalendar?.(),
    onOpenWeekPlan: () => onOpenWeekPlan?.(),
    onAppAction: (action) => onAppAction?.(action),
    onToggleTask: (item) => {
      if (item?.raw) onToggle?.(item.raw);
    },
    onOpenTasks: () => onOpenSummary?.(),
    onAddTodo,
    onStartTask,
    onOpenSettings: () => {
      if (onOpenSettings) onOpenSettings();
      else nav.navigate('ChildSettings', { child });
    },
  }), [
    onOpenDetail, onOpenCalendar, onOpenWeekPlan, onAppAction, onToggle, onOpenSummary,
    onAddTodo, onStartTask, onOpenSettings, nav, child,
  ]);

  const { contentPaddingBottom } = useBottomChromeInset();

  if (!childId || !home.ready) {
    return (
      <View style={[styles.loading, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const dayPart = dashboardDayPart(clock);

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        scrollEnabled={!dragging}
      >
        <WidgetBoard
          role="child"
          layout={home.layout}
          model={model}
          handlers={handlers}
          greeting={greeting}
          title={homeSceneTitle(dayPart)}
          subtitle={immersive ? homeSceneTagline(dayPart) : HOME_SCENE_SUBTITLE}
          onOpenBannerSettings={() => nav.navigate('ChildDashboardThemeSettings', { child })}
          canEdit
          editing={editing}
          setupEditHint={setupEdit}
          onToggleEdit={() => {
            setEditing((v) => {
              if (v) setSetupEdit(false);
              return !v;
            });
          }}
          onAddWidget={home.toggleType}
          onRemoveWidget={home.remove}
          onMoveWidget={home.moveTo}
          onCycleSize={home.cycleSize}
          onResetWidgets={home.resetWidgets}
          onDraggingChange={setDragging}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40,
    backgroundColor: 'transparent',
  },
  body: { paddingHorizontal: 10, paddingTop: 0, paddingBottom: 20, backgroundColor: 'transparent' },
});
