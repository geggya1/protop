import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as W from '../parentHome/ParentHomeWidgets';
import { ClockTile, DateTile } from './HomeTiles';
import ModuleWidget from './WidgetChrome';
import {
  SoftWeatherCard, NextEventPastel, TasksPastel, ChildTasksPastel,
  NotesPastel, AppsPastel, ShortcutRow, AppFolderPastel, TimelinePastel,
  MealsPastel, RewardsPastel, GoalsPastel, WeekPlanPastel,
} from './PastelCards';
import {
  ChatRows, InfoRows, TimedIconRows, EmptyHint,
} from './WidgetBodies';
import {
  withFallback,
  placeText,
  FALLBACK_EVENTS, FALLBACK_TIMELINE, FALLBACK_TASKS, FALLBACK_SCHOOL,
  FALLBACK_HOMEWORK, FALLBACK_BOOKS, FALLBACK_WISHES, FALLBACK_NOTES,
  FALLBACK_ACTIVITIES, FALLBACK_DATES, FALLBACK_CHAT,
} from '../../src/utils/homeWidgetVisuals';
import { DEFAULT_CHILD_HOME_SHORTCUT_TILES } from '../../src/utils/parentHomeShortcuts';
import { moduleChrome } from '../../src/homeWidgetCatalog';
import { widgetIsCompact, widgetIsNarrow, widgetIsWide } from '../../src/homeGrid';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface } from './homeGlass';

const FALLBACK_GOALS = [
  { id: 'g1', title: 'Pakke sekken', done: false },
  { id: 'g2', title: 'Lese 15 min', done: true },
  { id: 'g3', title: 'Rydde rommet', done: false },
];

function EmptyWidget({ label }) {
  const immersive = useHomeImmersive();
  return (
    <View style={[styles.empty, immersive && immersiveCardSurface]}>
      <Text style={styles.emptyTxt}>{label}</Text>
    </View>
  );
}

function openApp(model, handlers, id) {
  const app = model?.appById?.[id];
  if (app) {
    handlers.onAppAction?.(app.action);
    return;
  }
  if (id === 'stars' || id === 'chores') handlers.onOpenTasks?.();
  if (id === 'plan') handlers.onOpenPlan?.();
  if (id === 'chat') handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'chat' });
  if (id === 'notes') handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'notes' });
  if (id === 'meals') handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'meals' });
  if (id === 'activities') handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'activities' });
  if (id === 'rememberDates') handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'rememberDates' });
}

function taskList(model, demo) {
  const items = (model.taskProgress?.items || []).map((t) => ({
    id: t.id,
    title: t.title,
    meta: t.meta || (t.done ? 'Ferdig' : 'Åpen'),
    done: !!t.done,
    raw: t.raw,
  }));
  return withFallback(items, FALLBACK_TASKS, { demo });
}

function childTaskProgress(model, demo) {
  const openItems = (model.taskProgress?.openItems || []).map((t) => ({
    id: t.id,
    title: t.title,
    meta: t.meta || '',
    done: false,
    raw: t.raw,
  }));
  const doneItems = (model.taskProgress?.doneItems || []).map((t) => ({
    id: t.id,
    title: t.title,
    meta: t.meta || 'Ferdig',
    done: true,
    raw: t.raw,
  }));
  if (openItems.length || doneItems.length) {
    return {
      openItems,
      doneItems,
      items: [...openItems, ...doneItems],
      done: model.taskProgress?.done ?? doneItems.length,
      total: model.taskProgress?.total ?? (openItems.length + doneItems.length),
    };
  }
  const flat = taskList(model, demo);
  return {
    openItems: flat.filter((t) => !t.done),
    doneItems: flat.filter((t) => t.done),
    items: flat,
    done: flat.filter((t) => t.done).length,
    total: flat.length,
  };
}

function shortcutApps(model) {
  const taskOpen = model.taskProgress?.open ?? model.taskCount ?? 0;
  return DEFAULT_CHILD_HOME_SHORTCUT_TILES.map((fallback) => {
    const app = {
      ...fallback,
      ...(model?.appById?.[fallback.id] || {}),
      tileLabel: fallback.tileLabel,
      folder: fallback.folder,
    };
    if (fallback.id === 'stars') {
      return {
        ...app,
        icon: fallback.icon,
        sub: taskOpen === 1 ? '1 oppgave' : `${taskOpen} oppgaver`,
        badge: taskOpen,
      };
    }
    if (fallback.id === 'chores') {
      return { ...app, icon: fallback.icon, sub: 'I dag' };
    }
    if (fallback.id === 'games') {
      return { ...app, icon: fallback.icon, sub: 'Spill sammen' };
    }
    return { ...app, icon: fallback.icon, sub: 'Alle apper' };
  });
}

export default function ChildWidgetRenderer({ widget, model, handlers }) {
  const type = widget.type;
  const demo = !!model.isPreview;
  const timeline = model.timeline || [];
  const focusTomorrow = !!model.focusTomorrow;

  if (type === 'weather') {
    return (
      <SoftWeatherCard
        weather={model.weather}
        compact={widgetIsNarrow(widget)}
        look={widget.variant === 'day' || widget.variant === 'hours' ? widget.variant : 'now'}
      />
    );
  }
  if (type === 'clock') return <ClockTile variant={widget.variant} />;
  if (type === 'date') return <DateTile variant={widget.variant} />;

  if (type === 'nextEvent') {
    const events = withFallback(
      timeline.map((t) => ({
        id: t.id, time: t.time, end: t.end, title: t.title, place: placeText(t.place), color: t.color,
      })),
      FALLBACK_EVENTS,
      { demo },
    );
    const next = model.nextEvent || events[0] || null;
    return (
      <NextEventPastel
        next={next}
        wide={widgetIsWide(widget) || widget.variant === 'wide'}
        onPress={handlers.onOpenPlan}
      />
    );
  }

  if (type === 'timeline') {
    if (!model.showCalendar) return <EmptyWidget label="Kalender er slått av" />;
    const rows = withFallback(timeline, FALLBACK_TIMELINE, { demo });
    const gh = widget.gh || 2;
    const focusTomorrow = !!model.focusTomorrow;
    const title = model.focusCopy?.appointmentsTitle
      || (focusTomorrow ? 'Avtaler i morgen' : 'I dag');
    return (
      <TimelinePastel
        title={title}
        items={rows}
        emptyLabel={focusTomorrow ? 'Ingenting planlagt i morgen' : 'Ingenting planlagt i dag'}
        seeAllLabel={focusTomorrow ? 'Se morgendagen →' : 'Se hele dagen →'}
        compact={gh <= 1}
        maxItems={gh <= 1 ? 2 : 8}
        onOpen={(ev) => (ev?.raw ? handlers.onOpenEvent?.(ev) : handlers.onOpenPlan?.())}
        onSeeAll={handlers.onOpenPlan}
      />
    );
  }

  if (type === 'tasks') {
    if (!model.showChores) return <EmptyWidget label="Oppgaver er slått av" />;
    const progress = childTaskProgress(model, demo);
    return (
      <ChildTasksPastel
        progress={progress}
        compact={(widget.gh || 2) <= 1}
        maxOpen={6}
        maxDone={4}
        onOpen={handlers.onOpenTasks}
        onToggle={handlers.onToggleTask}
      />
    );
  }

  if (type === 'homework') {
    const fromModel = (model.homeworkItems || []).map((t) => ({
      id: t.id,
      title: t.title,
      done: !!t.done,
    }));
    const lekser = fromModel.length
      ? fromModel
      : (model.taskProgress?.items || [])
        .filter((t) => /leks|matte|norsk|engelsk|skole|les/i.test(String(t.title || '')))
        .map((t) => ({ id: t.id, title: t.title, done: !!t.done }));
    const rows = withFallback(lekser, FALLBACK_HOMEWORK.map((h) => ({
      id: h.id, title: h.title, done: false,
    })), { demo });
    const done = rows.filter((t) => t.done).length;
    const hwGh = widget.gh || 2;
    return (
      <TasksPastel
        title="Leksehjelpen"
        compact={widgetIsNarrow(widget) || hwGh <= 1}
        maxItems={6}
        progress={{ items: rows, done, total: rows.length }}
        onOpen={() => handlers.onAppAction?.({ type: 'nav', screen: 'Leksehjelp' })}
        onToggle={() => handlers.onAppAction?.({ type: 'nav', screen: 'Leksehjelp' })}
      />
    );
  }

  if (type === 'school') {
    const focus = model.weekProgram || null;
    const demoLessons = FALLBACK_SCHOOL.map((s) => ({
      id: s.id,
      time: s.time || '',
      title: s.title,
      color: s.bg || '#2F80ED',
    }));
    const lessons = withFallback(focus?.lessons || [], demoLessons, { demo });
    const weekDays = focus?.weekDays?.length
      ? focus.weekDays
      : (demo ? [
        { id: 'mon', label: 'Man', first: 'Norsk', count: 1, active: false },
        { id: 'tue', label: 'Tir', first: 'Matte', count: 1, active: false },
        { id: 'wed', label: 'Ons', first: 'Engelsk', count: 1, active: true },
        { id: 'thu', label: 'Tor', first: 'Gym', count: 1, active: false },
        { id: 'fri', label: 'Fre', first: 'Kunst', count: 1, active: false },
      ] : []);
    const schoolGh = widget.gh || 2;
    return (
      <WeekPlanPastel
        programTitle={focus?.programTitle || (demo ? 'Dagens program' : 'Dagens program')}
        weekLabel={focus?.weekLabel}
        weekDays={weekDays}
        lessons={lessons}
        emptyLabel={focus?.photoMode ? 'Åpne ukeplan for bilde' : 'Ingen timeplan ennå'}
        compact={widgetIsNarrow(widget) || schoolGh < 3}
        onPress={() => {
          if (handlers.onOpenWeekPlan) handlers.onOpenWeekPlan();
          else handlers.onAppAction?.({ type: 'nav', screen: 'ChildSchedule' });
        }}
      />
    );
  }

  if (type === 'rewards') {
    const amount = model.rewardBalance;
    const unit = model.unitLabel || 'poeng';
    return (
      <RewardsPastel
        amount={amount != null ? amount : (demo ? 36 : null)}
        unit={unit}
        hint={model.rewardHint || (demo ? `64 ${unit} igjen denne uken` : 'Se hva du har opptjent')}
        onPress={() => openApp(model, handlers, 'stars')}
      />
    );
  }

  if (type === 'goals') {
    const items = withFallback(model.weekGoals || [], FALLBACK_GOALS, { demo });
    const done = items.filter((t) => t.done).length;
    return (
      <GoalsPastel
        items={items}
        done={done}
        total={items.length}
        compact={widgetIsNarrow(widget)}
        onPress={() => openApp(model, handlers, 'stars')}
      />
    );
  }

  if (type === 'meals') {
    const dinner = model.dinner || (demo ? { title: 'Pasta med tomatsaus' } : null);
    return (
      <MealsPastel
        dinner={dinner}
        compact={widgetIsCompact(widget)}
        onPress={() => openApp(model, handlers, 'meals')}
      />
    );
  }

  if (type === 'notes') {
    const notes = withFallback(model.notes || [], FALLBACK_NOTES, { demo });
    return (
      <NotesPastel
        notes={notes}
        onPress={() => openApp(model, handlers, 'notes')}
      />
    );
  }

  if (type === 'messages') {
    const items = withFallback(model.chatItems || [], FALLBACK_CHAT, { demo });
    const unread = model.unreadByModule?.chat || 0;
    return (
      <ModuleWidget
        title="Chat"
        subtitle="Familien"
        {...moduleChrome('messages')}
        badge={unread ? `${unread} nye` : (items.length ? `${items.length}` : 'Chat')}
        badgeTone={unread ? 'green' : 'muted'}
        footerCta="Åpne chat ›"
        onPress={() => openApp(model, handlers, 'chat')}
        compact
      >
        {items.length ? <ChatRows items={items} compact /> : <EmptyHint text="Ingen meldinger ennå" />}
      </ModuleWidget>
    );
  }

  if (type === 'activities') {
    const rows = withFallback(
      timeline.filter((t) => /fotball|svøm|turn|trening|aktiv|piano|korps|dans/i.test(t.title || '')).slice(0, 2),
      FALLBACK_ACTIVITIES,
      { demo },
    ).map((t) => ({
      id: t.id,
      time: t.time,
      title: t.title,
      meta: placeText(t.meta) || placeText(t.place) || `${t.time || ''}`.trim(),
    }));
    return (
      <ModuleWidget
        title="Aktiviteter"
        subtitle={focusTomorrow ? 'I morgen' : 'Ettermiddagen'}
        {...moduleChrome('activities')}
        onPress={() => openApp(model, handlers, 'activities')}
        compact
      >
        {rows.length ? (
          <TimedIconRows items={rows.slice(0, 3)} />
        ) : (
          <EmptyHint text="Ingen aktiviteter planlagt" />
        )}
      </ModuleWidget>
    );
  }

  if (type === 'rememberDates') {
    const live = (model.rememberDates || []).map((h, i) => ({
      id: h.id || `r-${i}`,
      title: h.title || h,
      meta: h.meta || (i === 0 ? 'Snart' : 'Denne uken'),
      icon: h.icon || (i === 0 ? 'gift' : 'people'),
      bg: h.bg || (i === 0 ? '#F3B6C2' : '#8EB4F0'),
    }));
    const rows = withFallback(live, FALLBACK_DATES, { demo });
    return (
      <ModuleWidget
        title="Husk dato"
        subtitle="Det viktige først"
        {...moduleChrome('rememberDates')}
        onPress={() => openApp(model, handlers, 'rememberDates')}
        compact
      >
        {rows.length ? (
          <InfoRows items={rows.slice(0, 3).map((r) => ({
            id: r.id,
            title: r.title,
            meta: r.meta,
            icon: r.icon,
            bg: r.bg,
          }))} />
        ) : (
          <EmptyHint text="Ingen merkedager snart" />
        )}
      </ModuleWidget>
    );
  }

  if (type === 'books') {
    return (
      <NotesPastel
        title="Bokhylla"
        notes={demo ? FALLBACK_BOOKS : []}
        onPress={() => handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'books' })}
      />
    );
  }

  if (type === 'wishes') {
    return (
      <NotesPastel
        title="Ønsker"
        notes={demo ? FALLBACK_WISHES : []}
        onPress={() => handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'wishes' })}
      />
    );
  }

  if (type === 'appFolder') {
    const apps = (model.apps || []).slice(0, 3).map((app) => ({
      ...app,
      badge: model.unreadByModule?.[app.id] || 0,
    }));
    return (
      <AppFolderPastel
        apps={apps}
        onOpenApp={(a) => handlers.onAppAction?.(a.action)}
        onOpenMore={() => handlers.onAppAction?.({ type: 'tab', tab: 'more' })}
      />
    );
  }

  if (type === 'shortcuts') {
    if (widget.variant === 'row' || widgetIsWide(widget)) {
      const apps = shortcutApps(model);
      if (!apps.length) return <EmptyWidget label="Ingen snarveier" />;
      return <ShortcutRow apps={apps} onPress={(a) => handlers.onAppAction?.(a.action)} />;
    }
    const apps = (model.apps || []).slice(0, 4);
    return (
      <AppsPastel
        apps={apps}
        onPress={(a) => handlers.onAppAction?.(a.action)}
      />
    );
  }

  if (type === 'reminders') {
    return (
      <W.RememberCard
        count={model.taskProgress?.open || model.taskProgress?.total || 0}
        hints={(model.taskProgress?.openItems || model.taskProgress?.items || []).slice(0, 2).map((t) => t.title)}
        onPress={handlers.onOpenTasks}
      />
    );
  }

  return <EmptyWidget label="Ukjent widget" />;
}

const styles = StyleSheet.create({
  empty: {
    minHeight: 112,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4DC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyTxt: { fontSize: 14, color: '#8A93A3' },
});
