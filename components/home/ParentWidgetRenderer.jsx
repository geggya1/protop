import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as W from '../parentHome/ParentHomeWidgets';
import { ClockTile, DateTile } from './HomeTiles';
import ModuleWidget from './WidgetChrome';
import { DEFAULT_HOME_SHORTCUT_TILES } from '../../src/utils/parentHomeShortcuts';
import { widgetIsCompact, widgetIsNarrow, widgetIsWide } from '../../src/homeGrid';
import { isProtopHomeWidget } from '../../src/navigation/protopShell';
import {
  SoftWeatherCard, NextEventPastel, TasksPastel, ShoppingPastel, MealsPastel,
  CalendarPeek, RewardsPastel, GoalsPastel, KidsProgressPastel, AssistantPastel, NotesPastel,
  AppsPastel, ShortcutRow, AppFolderPastel, TimelinePastel,
} from './PastelCards';
import {
  ChatRows, PeopleGrid, LocationRows, InfoRows,
  TimedIconRows, EmptyHint,
} from './WidgetBodies';
import { soft } from '../parentHome/softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface } from './homeGlass';
import {
  firstName, personTint, withFallback, wishVisual, placeText,
  FALLBACK_SHOP, FALLBACK_CHAT, FALLBACK_EVENTS, FALLBACK_TIMELINE,
  FALLBACK_TASKS, FALLBACK_NOTES, FALLBACK_DATES, FALLBACK_ACTIVITIES,
  FALLBACK_WISHES, FALLBACK_BOOKS, FALLBACK_TRIPS,
} from '../../src/utils/homeWidgetVisuals';
import { moduleChrome } from '../../src/homeWidgetCatalog';

function openApp(model, handlers, id) {
  const app = model?.appById?.[id];
  if (app) {
    handlers.onAppAction?.(app.action);
    return;
  }
  if (id === 'progress') {
    handlers.onAppAction?.({ type: 'tab', tab: 'more', subView: 'progress' });
  }
}

function EmptyWidget({ label }) {
  const immersive = useHomeImmersive();
  return (
    <View style={[styles.empty, immersive && immersiveCardSurface]}>
      <Text style={styles.emptyTxt}>{label}</Text>
    </View>
  );
}

function kidPlace(kid) {
  return placeText(kid.place) || placeText(kid.location) || placeText(kid.status) || '';
}

function familyStatus(person) {
  return placeText(person.status)
    || placeText(person.meta)
    || placeText(person.place)
    || placeText(person.location)
    || '';
}

function chatItems(model, demo) {
  if (model.chatPreview?.length) return model.chatPreview;
  return demo ? FALLBACK_CHAT : [];
}

function familyPeople(model, demo) {
  const parents = (model.parents || []).map((p, i) => ({
    id: p.id || p.uid || `p-${i}`,
    name: firstName(p),
    meta: familyStatus(p),
    tint: personTint(i),
  }));
  const kids = (model.activeKids || []).map((p, i) => ({
    id: p.id || p.uid || `k-${i}`,
    name: firstName(p),
    meta: familyStatus(p),
    tint: personTint(parents.length + i),
  }));
  const people = [...parents, ...kids];
  if (people.length) return people.slice(0, 4);
  if (!demo) return [];
  return [
    { id: 'm', name: 'Mamma', tint: personTint(0) },
    { id: 'p', name: 'Pappa', tint: personTint(1) },
    { id: 'c', name: 'Celine', tint: personTint(2) },
    { id: 'v', name: 'Vanessa', tint: personTint(3) },
  ];
}

function shopList(model, demo) {
  const items = (model.shopItems || []).map((it, i) => ({
    id: it.id || `s-${i}`,
    title: it.title || it.name || 'Vare',
    done: !!it.done,
  }));
  return withFallback(items, FALLBACK_SHOP, { demo });
}

function taskList(model, demo) {
  const items = (model.taskProgress?.items || []).map((t) => ({
    id: t.id,
    title: t.title,
    meta: t.meta || (t.done ? 'Ferdig' : 'Åpen'),
    done: !!t.done,
  }));
  return withFallback(items, FALLBACK_TASKS, { demo });
}

function noteList(model, demo) {
  const fromNotes = (model.notes || []).map((n, i) => ({
    id: n.id || `n-${i}`,
    title: n.title || 'Notat',
    meta: n.meta || n.body || '',
    highlight: i === 0,
  }));
  if (fromNotes.length) return fromNotes;
  const hints = (model.remainingHints || []).map((h, i) => ({
    id: `h-${i}`,
    title: h,
    meta: 'Huskelapp',
    highlight: i === 0,
  }));
  return withFallback(hints, FALLBACK_NOTES, { demo });
}

function calendarEvents(model, demo) {
  const fromTl = (model.timeline || []).map((t) => ({
    id: t.id,
    time: t.time,
    end: t.end,
    title: t.title,
    place: t.place,
    color: t.color,
  }));
  return withFallback(fromTl, FALLBACK_EVENTS, { demo });
}

const FALLBACK_GOALS = [
  { id: 'g1', title: 'Være snill', done: true },
  { id: 'g2', title: 'Lese bok', done: true },
  { id: 'g3', title: 'Hjelpe hjemme' },
];

const FALLBACK_KID_PROGRESS = [
  { kidId: 'k1', name: 'Adelen', doneToday: 2, todayTotal: 3, pct: 67 },
  { kidId: 'k2', name: 'Celine', doneToday: 0, todayTotal: 2, pct: 0 },
  { kidId: 'k3', name: 'Vanessa', doneToday: 3, todayTotal: 3, pct: 100 },
];

function shortcutApps(model, demo) {
  const shopCount = model.shopCount || (model.shopItems || []).length;
  const taskOpen = model.taskProgress?.open ?? model.taskCount ?? 0;
  return DEFAULT_HOME_SHORTCUT_TILES.map((fallback) => {
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
    if (fallback.id === 'shop') {
      return { ...app, icon: fallback.icon, sub: shopCount === 1 ? '1 vare' : `${shopCount} varer`, badge: shopCount };
    }
    if (fallback.id === 'games') {
      return { ...app, icon: fallback.icon, sub: 'Spill sammen' };
    }
    return { ...app, icon: fallback.icon, sub: 'Alle apper' };
  });
}

function progressRows(model, kids, demo) {
  if (model.kidProgress?.length) return model.kidProgress;
  if (kids.length) {
    return kids.map((k) => ({
      kidId: k.id || k.uid,
      name: firstName(k),
      photoURL: k.photoURL || k.photoUrl,
      avatarId: k.avatarId,
      color: k.color,
      doneToday: 0,
      todayTotal: 0,
      pct: 0,
    }));
  }
  return demo ? FALLBACK_KID_PROGRESS : [];
}

const FOLDER_APP_IDS = ['stars', 'shop', 'plan', 'games', 'mail', 'chat', 'meals'];

function folderApps(model, demo) {
  const fromIds = FOLDER_APP_IDS
    .map((id) => model?.appById?.[id])
    .filter(Boolean);
  const extras = Object.values(model?.appById || {}).filter(
    (app) => app?.id && !FOLDER_APP_IDS.includes(app.id),
  );
  const list = [...fromIds, ...extras].slice(0, 3).map((app) => ({
    ...app,
    badge: model?.unreadByModule?.[app.id] || app.badge || 0,
  }));
  if (list.length || !demo) return list;
  return DEFAULT_HOME_SHORTCUT_TILES.slice(0, 3).map((app) => ({ ...app, badge: 0 }));
}

export default function ParentWidgetRenderer({ widget, model, handlers }) {
  const type = widget.type;
  if (!isProtopHomeWidget(type)) return null;
  const demo = !!model.isPreview;
  const kids = model.activeKids || [];
  const members = model.allMembers || [];
  const timeline = model.timeline || [];

  if (type === 'weather') {
    return (
      <SoftWeatherCard
        weather={model.weather}
        compact={widgetIsNarrow(widget)}
        look={widget.variant === 'day' || widget.variant === 'hours' ? widget.variant : 'now'}
        onPress={() => handlers.onAppAction?.({ type: 'nav', screen: 'WeatherSettings' })}
      />
    );
  }
  if (type === 'clock') return <ClockTile variant={widget.variant} />;
  if (type === 'date') return <DateTile variant={widget.variant} />;

  if (type === 'weekPlan') {
    const peek = (model.appointmentsPeek || []).map((ev, i) => ({
      id: ev.id || `p-${i}`,
      time: ev.time,
      title: ev.title,
      color: ev.color,
    }));
    const events = peek.length ? peek : calendarEvents(model, demo).slice(0, 3);
    return (
      <CalendarPeek
        events={events}
        title="Kalender"
        linkLabel="Se hele uken ›"
        compact={widgetIsCompact(widget)}
        onPress={handlers.onOpenPlan}
      />
    );
  }

  if (type === 'nextEvent') {
    const events = calendarEvents(model, demo);
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
    const rows = withFallback(timeline, FALLBACK_TIMELINE, { demo });
    const gh = widget.gh || 2;
    const focusTomorrow = !!model.focusTomorrow;
    const title = model.focusCopy?.appointmentsTitle
      || (focusTomorrow ? 'Avtaler i morgen' : 'Dagens avtaler');
    return (
      <TimelinePastel
        items={rows}
        title={title}
        emptyLabel={focusTomorrow ? 'Ingenting planlagt i morgen' : 'Ingenting planlagt i dag'}
        seeAllLabel="Se alle ›"
        icon="calendar"
        compact={gh <= 1}
        maxItems={gh <= 1 ? 2 : 8}
        onOpen={(ev) => (ev?.event ? handlers.onOpenEvent?.(ev.event) : handlers.onOpenPlan?.())}
        onSeeAll={handlers.onOpenPlan}
      />
    );
  }

  if (type === 'tasks') {
    const items = taskList(model, demo);
    const done = model.taskProgress?.done || items.filter((t) => t.done).length;
    const total = model.taskProgress?.total || items.length;
    return (
      <TasksPastel
        progress={{ items, done, total }}
        illustrated={widget.variant === 'illustrated'}
        compact={widgetIsCompact(widget) && (widget.gh || 2) < 2}
        maxItems={8}
        title="Oppgaver"
        onOpen={() => openApp(model, handlers, 'stars')}
        onToggle={() => openApp(model, handlers, 'stars')}
      />
    );
  }

  if (type === 'shopping') {
    const items = shopList(model, demo);
    const count = model.shopCount || items.length;
    return (
      <ShoppingPastel
        count={count}
        items={items}
        compact={widgetIsNarrow(widget) && (widget.gh || 2) < 3}
        maxItems={(widget.gh || 2) >= 3 ? 10 : 6}
        onPress={() => openApp(model, handlers, 'shop')}
      />
    );
  }

  if (type === 'meals') {
    const dinner = model.dinner || (demo ? { title: 'Pasta med tomatsaus' } : null);
    return (
      <MealsPastel
        dinner={dinner}
        link={widget.variant === 'link'}
        compact={widgetIsCompact(widget)}
        onPress={() => openApp(model, handlers, 'meals')}
      />
    );
  }

  if (type === 'rewards') {
    return (
      <RewardsPastel
        amount={model.rewardBalance != null ? model.rewardBalance : (demo ? 36 : null)}
        hint={model.rewardHint || (demo ? '64 kr igjen denne uken' : 'Se hva som er opptjent')}
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

  if (type === 'progress') {
    const rows = progressRows(model, kids, demo);
    return (
      <KidsProgressPastel
        kids={rows}
        maxItems={12}
        onPress={() => openApp(model, handlers, 'progress')}
      />
    );
  }

  if (type === 'notes') {
    const items = noteList(model, demo);
    return (
      <NotesPastel
        notes={items}
        onPress={() => openApp(model, handlers, 'notes')}
      />
    );
  }

  if (type === 'messages') {
    const items = chatItems(model, demo);
    const unread = model.unreadByModule?.chat || 0;
    return (
      <ModuleWidget
        title="Chat"
        subtitle="Familien"
        {...moduleChrome('messages')}
        badge={unread ? `${unread} nye` : (items.length ? `${items.length} tråder` : 'Chat')}
        badgeTone={unread ? 'green' : 'muted'}
        footerCta="Åpne chat ›"
        onPress={() => openApp(model, handlers, 'chat')}
        compact
      >
        {items.length ? <ChatRows items={items} compact /> : <EmptyHint text="Ingen meldinger ennå" />}
      </ModuleWidget>
    );
  }

  if (type === 'family') {
    const people = familyPeople(model, demo);
    const narrow = widgetIsNarrow(widget);
    return (
      <ModuleWidget
        title="Familie"
        subtitle={narrow ? undefined : 'I dag'}
        {...moduleChrome('family')}
        badge={people.length ? `${people.length}` : 'Familie'}
        badgeTone="people"
        footerCta={narrow && (widget.gh || 2) < 3 ? undefined : 'Se familie ›'}
        onPress={() => openApp(model, handlers, 'family')}
        compact
      >
        {people.length ? (
          <PeopleGrid people={people} compact={narrow || people.length > 2} />
        ) : (
          <EmptyHint text="Ingen profiler ennå" />
        )}
      </ModuleWidget>
    );
  }

  if (type === 'location') {
    const people = (kids.length ? kids : (demo ? [{ id: 'e', name: 'Emma' }, { id: 'l', name: 'Lucas' }] : [])).map((k, i) => ({
      id: k.id || k.uid,
      name: firstName(k),
      meta: kidPlace(k) || (demo ? (i === 0 ? 'På skolen' : 'På vei hjem') : ''),
      tint: personTint(i === 0 ? 0 : 1),
    }));
    const showFooter = (widget.gh || 2) >= 3 || people.length <= 2;
    return (
      <ModuleWidget
        title="Posisjon"
        subtitle="Trygg oversikt"
        {...moduleChrome('location')}
        onPress={() => openApp(model, handlers, 'location')}
        compact
      >
        {people.length ? (
          <>
            <LocationRows people={people} />
            {showFooter ? (
              <InfoRows items={[{
                id: 'upd',
                title: 'Oppdatert',
                meta: 'Alle er registrert',
                progress: `${people.length}/${people.length}`,
                progressValue: 1,
                progressMax: 1,
              }]} />
            ) : null}
          </>
        ) : <EmptyHint text="Ingen posisjoner delt ennå" />}
      </ModuleWidget>
    );
  }

  if (type === 'activities') {
    const rows = withFallback(
      timeline.filter((t) => /fotball|svøm|turn|trening|aktiv/i.test(t.title || '')).slice(0, 2),
      FALLBACK_ACTIVITIES,
      { demo },
    ).map((t) => ({
      id: t.id,
      time: t.time,
      title: t.title,
      meta: placeText(t.meta) || placeText(t.place) || `${t.time || ''} i dag`.trim(),
    }));
    const count = model.weekStats?.appointments || rows.length;
    return (
      <ModuleWidget
        title="Aktiviteter"
        subtitle="Ettermiddagen"
        {...moduleChrome('activities')}
        onPress={() => openApp(model, handlers, 'activities')}
        compact
      >
        <TimedIconRows items={[
          ...rows.slice(0, 2),
          {
            id: 'week',
            title: 'Denne uken',
            meta: `${count} planlagte aktiviteter`,
            progress: String(count),
            progressValue: Math.min(count, 5),
            progressMax: 5,
          },
        ]} />
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
          <InfoRows items={[
            ...rows.slice(0, 2),
            {
              id: 'soon',
              title: 'Kommende datoer',
              meta: 'Det nærmer seg',
              progress: String(rows.length),
              progressValue: rows.length,
              progressMax: Math.max(rows.length, 3),
            },
          ]} />
        ) : <EmptyHint text="Ingen merkedager ennå" />}
      </ModuleWidget>
    );
  }

  if (type === 'familyTree') {
    const n = members.length || kids.length + (model.parents || []).length;
    const count = n || (demo ? 6 : 0);
    return (
      <ModuleWidget
        title="Familietreet"
        subtitle="Nære relasjoner"
        {...moduleChrome('familyTree')}
        onPress={() => openApp(model, handlers, 'familyTree')}
        compact
      >
        {count ? (
          <InfoRows items={[
            { id: 'f', icon: 'people', bg: '#2F80ED', title: 'Familien', meta: `${count} profiler knyttet sammen` },
            demo ? { id: 'b', icon: 'gift', bg: '#E07A7A', title: 'Bestemor', meta: 'Bursdag denne uken' } : null,
            {
              id: 'k', title: 'Koblinger', meta: 'Hele familien samlet',
              progress: String(count), progressValue: count, progressMax: Math.max(count, 6),
            },
          ].filter(Boolean)} />
        ) : <EmptyHint text="Koble familiemedlemmer i treet" />}
      </ModuleWidget>
    );
  }

  if (type === 'trips') {
    return (
      <ModuleWidget
        title="Våre reiser"
        subtitle="Neste tur"
        {...moduleChrome('trips')}
        onPress={() => openApp(model, handlers, 'reiseplanlegger')}
        compact
      >
        {demo ? (
          <InfoRows items={[
            ...FALLBACK_TRIPS,
            {
              id: 'ready', title: 'Reiseklar', meta: 'Snart klar for avreise',
              progress: '75%', progressValue: 75, progressMax: 100,
            },
          ]} />
        ) : <EmptyHint text="Ingen reiser planlagt" />}
      </ModuleWidget>
    );
  }

  if (type === 'wishes') {
    const live = (model.wishes || []).map((w) => ({
      id: w.id,
      title: w.title,
      meta: w.meta || 'Ønske',
      icon: wishVisual(w.title).icon,
      bg: wishVisual(w.title).bg,
    }));
    const rows = withFallback(live, FALLBACK_WISHES.map((w) => ({
      ...w,
      icon: wishVisual(w.title).icon,
      bg: wishVisual(w.title).bg,
    })), { demo });
    return (
      <ModuleWidget
        title="Ønsker"
        subtitle="Mine ønsker"
        {...moduleChrome('wishes')}
        onPress={() => openApp(model, handlers, 'wishes')}
        compact
      >
        {rows.length ? (
          <InfoRows items={[
            ...rows.slice(0, 2),
            {
              id: 'list', title: 'Ønskeliste', meta: `${rows.length} aktive ønsker`,
              progress: String(rows.length), progressValue: rows.length, progressMax: Math.max(rows.length, 4),
            },
          ]} />
        ) : <EmptyHint text="Ingen ønsker ennå" />}
      </ModuleWidget>
    );
  }

  if (type === 'books') {
    return (
      <ModuleWidget
        title="Bokhylla"
        subtitle="Lesestund"
        {...moduleChrome('books')}
        onPress={() => openApp(model, handlers, 'books')}
        compact
      >
        {demo ? (
          <InfoRows items={FALLBACK_BOOKS.map((b) => (
            b.progress
              ? { ...b, progressValue: 18, progressMax: 20 }
              : b
          ))} />
        ) : <EmptyHint text="Ingen bøker i lesestund" />}
      </ModuleWidget>
    );
  }

  if (type === 'kids') {
    if (!kids.length && !demo) return null;
    const shown = kids.length ? kids : [
      { id: 'k1', name: 'Adelen' },
      { id: 'k2', name: 'Celine' },
      { id: 'k3', name: 'Vanessa' },
    ];
    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        {widget.gh > 2 ? (
          <W.SectionHeader title="Barnas dag" icon="happy-outline" iconColor={soft.sage} />
        ) : null}
        <W.KidsDayCards
          kids={shown}
          events={model.focusEvents}
          onOpenKid={handlers.onOpenKid}
        />
      </View>
    );
  }

  if (type === 'appFolder') {
    const apps = folderApps(model, demo);
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
      const apps = shortcutApps(model, demo);
      if (!apps.length) return <EmptyWidget label="Ingen snarveier" />;
      return <ShortcutRow apps={apps} onPress={(a) => handlers.onAppAction?.(a.action)} />;
    }
    const apps = ['stars', 'shop', 'plan', 'chat', 'meals', 'mail']
      .map((id) => model?.appById?.[id])
      .filter(Boolean)
      .slice(0, 4);
    if (!apps.length) return <EmptyWidget label="Ingen snarveier" />;
    return <AppsPastel apps={apps} onPress={(a) => handlers.onAppAction?.(a.action)} />;
  }

  if (type === 'reminders') {
    const hints = withFallback(
      (model.remainingHints || []).map((h, i) => ({
        id: `h-${i}`, icon: 'alert-circle', bg: '#C47A4A', title: h,
      })),
      [{ id: 'r', icon: 'notifications', bg: '#C47A4A', title: 'Alt er unna', meta: 'Ingen åpne huskelapper' }],
      { demo: demo || !(model.remainingHints || []).length },
    );
    return (
      <ModuleWidget
        title="Husk"
        subtitle="Det som gjenstår"
        {...moduleChrome('reminders')}
        footerMeta={`${model.remainingCount || hints.length} ting`}
        footerCta="Åpne ›"
        onPress={() => openApp(model, handlers, 'stars')}
        compact
      >
        <InfoRows items={hints} />
      </ModuleWidget>
    );
  }

  if (type === 'assistant') {
    return (
      <AssistantPastel
        banner={widget.variant === 'banner' || widgetIsWide(widget)}
        onPress={handlers.onOpenAssistant}
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
