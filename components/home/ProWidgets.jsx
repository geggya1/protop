/**
 * ProTop-widgetene på Hjem: arbeidsdagen, ikke familien.
 *
 * Ett felles kort (ProCard) med ikon og tittel, og innhold som tilpasser seg
 * størrelsen i rutenettet (gw × gh). Fargene kommer fra useHomePalette: ProTop-kortet
 * uten bakgrunnsbilde, mørkt glass i bildets farge med hvit tekst på bilde.
 *
 * Bedrift: Mine timer, Prosjekter, Teamet i dag, Nyheter.
 * Begge: Dagen din, Kalender, Neste avtale, Uken, Oppgaver, Notater, Husk,
 * Hurtigvalg, E-post og ProTop AI.
 */
import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHomePalette } from './homeGlass';
import { useNow } from '../../src/hooks/useNow';
import {
  countdownLabel, hoursLabel, quickActionsFor, relativeDay, kmLabel, krLabel,
} from '../../src/utils/proHome';
import { dayRibbon, daySentence, weekBars } from '../../src/utils/proHomeMore';
import {
  useMyWeekHours, useHomeProjects, useTeamToday, useCompanyNewsPeek, useMyMileage,
} from '../../src/hooks/useProHomeData';
import QuickReportButton from '../../screens/iso/QuickReport';

const FONT = Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined;

function gridSize(widget) {
  return { gw: Number(widget?.gw) || 5, gh: Number(widget?.gh) || 2 };
}

/* ------------------------------------------------------------------ */
/* Felles byggeklosser                                                 */
/* ------------------------------------------------------------------ */

/**
 * Ikonplaten i kortets topp: rund, og på bilde en nesten hvit plate
 * med fargen i glyfen, så ikonet står fram mot glasset.
 */
export function IconDisc({ icon, color, size = 26 }) {
  const pal = useHomePalette();
  const glyph = color || (pal.glass ? '#1F6FB2' : pal.accentInk);
  return (
    <View
      style={[
        s.disc,
        { width: size, height: size, borderRadius: size / 2 },
        pal.glass ? s.discGlass : { backgroundColor: pal.accentSoft },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.54)} color={glyph} />
    </View>
  );
}

/**
 * Kortet rundt hver widget. Er hele kortet trykkbart og toppen har en egen lenke
 * (onRight), blir toppen og innholdet to trykkflater ved siden av hverandre, så det
 * aldri blir en knapp inni en knapp.
 */
export function ProCard({
  title, icon, iconColor, right, onPress, onRight, children, style, testID, pad = 12, accessibilityLabel,
}) {
  const pal = useHomePalette();
  const split = !!onPress && !!onRight && !!title;
  const Wrap = onPress && !split ? TouchableOpacity : View;
  const rightTxt = right ? (
    <Text style={[s.headRight, { color: pal.glass ? pal.muted : pal.accentInk }]} numberOfLines={1}>{right}</Text>
  ) : null;
  const titleRow = (
    <>
      {icon ? <IconDisc icon={icon} color={iconColor} /> : null}
      <Text style={[s.headTitle, { color: pal.ink }]} numberOfLines={1}>{title}</Text>
    </>
  );
  return (
    <Wrap
      style={[s.card, pal.card, { padding: pad }, style]}
      {...(Wrap === TouchableOpacity ? {
        onPress, activeOpacity: 0.9, accessibilityRole: 'button',
      } : null)}
      accessibilityLabel={accessibilityLabel || title}
      testID={testID}
    >
      {title ? (
        <View style={s.head}>
          {split ? (
            <TouchableOpacity style={s.headMain} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
              {titleRow}
            </TouchableOpacity>
          ) : titleRow}
          {right && onRight && (split || !onPress) ? (
            <TouchableOpacity onPress={onRight} hitSlop={8} accessibilityRole="button">
              {rightTxt}
            </TouchableOpacity>
          ) : rightTxt}
        </View>
      ) : null}
      {split ? (
        <TouchableOpacity style={s.splitBody} onPress={onPress} activeOpacity={0.9} accessible={false}>
          {children}
        </TouchableOpacity>
      ) : children}
    </Wrap>
  );
}

export function Pill({ label, icon, tone = 'accent', onPress, testID }) {
  const pal = useHomePalette();
  const map = {
    accent: { bg: pal.accentSoft, fg: pal.glass ? pal.ink : pal.accentInk },
    warn: { bg: pal.warnSoft, fg: pal.warnInk },
    danger: { bg: pal.dangerSoft, fg: pal.glass ? pal.danger : '#B42318' },
    success: { bg: pal.successSoft, fg: pal.glass ? pal.success : '#157F3D' },
    muted: { bg: pal.chip, fg: pal.muted },
  };
  const c = map[tone] || map.accent;
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={[s.pill, { backgroundColor: c.bg }]}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={11} color={c.fg} /> : null}
      <Text style={[s.pillTxt, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </Wrap>
  );
}

export function EmptyLine({ icon = 'checkmark-circle', text, action, onAction, testID }) {
  const pal = useHomePalette();
  return (
    <View style={s.emptyLine} testID={testID}>
      <Ionicons name={icon} size={16} color={pal.glass ? pal.success : pal.success} />
      <Text style={[s.emptyTxt, { color: pal.muted }]} numberOfLines={2}>{text}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={[s.emptyAction, { color: pal.glass ? pal.ink : pal.accentInk }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Bar({ ratio = 0, color, track, height = 6 }) {
  const pct = Math.max(0, Math.min(1, Number(ratio) || 0));
  return (
    <View style={[s.bar, { backgroundColor: track, height, borderRadius: height / 2 }]}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

function open(handlers, action) {
  if (action) handlers?.onAppAction?.(action);
}

/* ------------------------------------------------------------------ */
/* Dagen din                                                           */
/* ------------------------------------------------------------------ */

/**
 * Dagen din: arbeidsdagen som et bånd (07–17) med avtalene som blokker og en strek
 * der klokka er nå, og én setning om dagen. Ingen tall i bokser.
 */
export function DayBriefWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const now = useNow(60000);
  const { gh } = gridSize(widget);
  const tasks = model?.taskProgress || {};
  const overdue = (tasks.items || []).filter((t) => /forfalt/i.test(t.meta || '')).length;
  const focusTomorrow = !!model?.focusTomorrow;
  const events = (focusTomorrow ? model?.eventsTomorrow : model?.eventsToday) || [];
  const rows = model?.timeline || [];
  const ribbon = useMemo(
    () => dayRibbon(rows, { now, showNow: !focusTomorrow }),
    [rows, now, focusTomorrow],
  );
  const sentence = daySentence({
    events: events.length || rows.length,
    freeMin: ribbon.freeMin,
    openTasks: Number(tasks.open) || 0,
    overdue,
    focusTomorrow,
  });
  const next = model?.nextEvent;
  const soon = next && !focusTomorrow ? countdownLabel(next.time, next.end, now) : null;
  const openNext = () => (next?.raw ? handlers?.onOpenEvent?.(next.raw) : handlers?.onOpenPlan?.());
  const compact = gh <= 1;
  const ribbonH = compact ? 14 : 22;
  const nextTime = next?.time && next.time !== 'Heldag' ? `${next.time} ` : '';

  const band = (
    <TouchableOpacity onPress={handlers?.onOpenPlan} accessibilityRole="button" accessibilityLabel={sentence} testID="pro-day-ribbon">
      <View style={[s.ribbon, { height: ribbonH, backgroundColor: pal.track }]}>
        {ribbon.blocks.map((b) => (
          <View
            key={b.id}
            style={[s.ribbonBlock, {
              left: `${b.from * 100}%`,
              width: `${Math.max(2, (b.to - b.from) * 100)}%`,
              backgroundColor: b.color || pal.accent,
            }]}
          />
        ))}
        {ribbon.nowRatio != null ? (
          <View style={[s.ribbonNow, { left: `${ribbon.nowRatio * 100}%`, backgroundColor: pal.glass ? '#FFFFFF' : pal.danger }]} />
        ) : null}
      </View>
      {!compact ? (
        <View style={s.ribbonTicks}>
          {ribbon.ticks.map((t) => (
            <Text key={t.hour} style={[s.ribbonTick, { left: `${t.at * 100}%`, color: pal.faint }]}>{t.label}</Text>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );

  if (compact) {
    return (
      <ProCard pad={8} testID="pro-day-brief">
        <View style={s.dayCompact}>
          <IconDisc icon="sunny" size={22} color={pal.glass ? '#E0A106' : null} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {band}
            <Text style={[s.daySentence, { color: pal.ink }]} numberOfLines={1}>
              {next ? `Neste ${nextTime}· ${next.title}` : sentence}
            </Text>
          </View>
        </View>
      </ProCard>
    );
  }

  return (
    <ProCard
      title={focusTomorrow ? 'Dagen i morgen' : 'Dagen din'}
      icon="sunny"
      iconColor={pal.glass ? '#E0A106' : null}
      right={soon || (ribbon.allDay ? `${ribbon.allDay} heldag` : null)}
      onRight={openNext}
      testID="pro-day-brief"
    >
      {band}
      <TouchableOpacity style={s.briefLine} onPress={next ? openNext : handlers?.onOpenTasks} accessibilityRole="button">
        <Text style={[s.daySentence, { color: pal.ink }]} numberOfLines={gh >= 3 ? 3 : 2}>
          {next ? (
            <>
              <Text style={{ fontWeight: '600' }}>{`Neste ${nextTime}`}</Text>
              {`${next.title}. `}
              <Text style={{ color: pal.muted }}>{sentence}</Text>
            </>
          ) : sentence}
        </Text>
      </TouchableOpacity>
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Kalender (timeline) og Neste avtale                                 */
/* ------------------------------------------------------------------ */

export function CalendarWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const now = useNow(60000);
  const { gh } = gridSize(widget);
  const rows = model?.timeline || [];
  const focusTomorrow = !!model?.focusTomorrow;
  const title = focusTomorrow ? 'Kalender i morgen' : 'Kalender i dag';
  const newEvent = () => open(handlers, { type: 'nav', screen: 'EventForm' });

  // Tom kalender: én rad, ikke et stort tomt kort.
  if (!rows.length) {
    return (
      <ProCard pad={10} testID="pro-calendar-empty">
        <View style={s.chipRow}>
          <IconDisc icon="calendar" />
          <TouchableOpacity style={s.chipMain} onPress={handlers?.onOpenPlan} accessibilityRole="button">
            <Text style={[s.chipTitle, { color: pal.ink }]} numberOfLines={1}>
              {focusTomorrow ? 'Ingen avtaler i morgen' : 'Ingen flere avtaler i dag'}
            </Text>
          </TouchableOpacity>
          <Pill label="Ny avtale" icon="add" onPress={newEvent} testID="pro-calendar-new" />
          <Pill label="Uka" tone="muted" onPress={handlers?.onOpenPlan} />
        </View>
        {gh >= 2 ? (
          <Text style={[s.calmTxt, { color: pal.muted }]}>
            Ledig tid. Legg inn møter, befaringer og frister så de dukker opp her.
          </Text>
        ) : null}
      </ProCard>
    );
  }

  const max = gh <= 1 ? 1 : 8;
  return (
    <ProCard
      title={title}
      icon="calendar"
      right="Se alle ›"
      onRight={handlers?.onOpenPlan}
      testID="pro-calendar"
    >
      <ScrollView style={s.scroll} nestedScrollEnabled showsVerticalScrollIndicator={rows.length > 3}>
        {rows.slice(0, max).map((ev, i) => {
          const soon = !focusTomorrow && i === 0 ? countdownLabel(ev.time, ev.end, now) : null;
          return (
            <TouchableOpacity
              key={ev.id || i}
              style={[s.evRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}
              onPress={() => (ev.event ? handlers?.onOpenEvent?.(ev.event) : handlers?.onOpenPlan?.())}
              accessibilityRole="button"
              accessibilityLabel={`${ev.time} ${ev.title}`}
            >
              <View style={s.evTimeCol}>
                <Text style={[s.evTime, { color: pal.ink }]}>{ev.time}</Text>
                {ev.end ? <Text style={[s.evEnd, { color: pal.muted }]}>{ev.end}</Text> : null}
              </View>
              <View style={[s.evBar, { backgroundColor: ev.color || pal.accent }]} />
              <View style={s.evBody}>
                <Text style={[s.evTitle, { color: pal.ink }]} numberOfLines={1}>{ev.title}</Text>
                {ev.place ? <Text style={[s.evMeta, { color: pal.muted }]} numberOfLines={1}>{ev.place}</Text> : null}
              </View>
              {soon ? <Pill label={soon} tone="accent" /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ProCard>
  );
}

export function NextEventWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const now = useNow(30000);
  const { gw } = gridSize(widget);
  const next = model?.nextEvent;
  const soon = next && !model?.focusTomorrow ? countdownLabel(next.time, next.end, now) : null;
  if (!next) {
    return (
      <ProCard title="Neste avtale" icon="today" onPress={handlers?.onOpenPlan} testID="pro-next-empty">
        <EmptyLine icon="cafe-outline" text={model?.focusTomorrow ? 'Ingenting i morgen' : 'Ingenting mer i dag'} />
      </ProCard>
    );
  }
  return (
    <ProCard
      title={model?.focusTomorrow ? 'I morgen' : 'Neste avtale'}
      icon="today"
      onPress={() => (next.raw ? handlers?.onOpenEvent?.(next.raw) : handlers?.onOpenPlan?.())}
      testID="pro-next"
    >
      <View style={s.nextBody}>
        <Text style={[s.nextTitle, { color: pal.ink }]} numberOfLines={gw <= 2 ? 3 : 2}>{next.title}</Text>
        <Text style={[s.nextMeta, { color: pal.muted }]} numberOfLines={1}>
          {next.time}{next.end ? `–${next.end}` : ''}{next.place && gw > 2 ? ` · ${next.place}` : ''}
        </Text>
        {soon ? <View style={{ marginTop: 6, flexDirection: 'row' }}><Pill label={soon} icon="time" /></View> : null}
      </View>
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Uken                                                                */
/* ------------------------------------------------------------------ */

/** Uka: én stolpe per dag for hvor travel den er. Ukedager uten datotall. */
export function WeekAgendaWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh } = gridSize(widget);
  const week = useMemo(() => weekBars(model?.weekCounts || {}, new Date()), [model?.weekCounts]);
  const tall = gh >= 3;
  return (
    <ProCard
      title={`Uke ${week.week}`}
      icon="calendar-number"
      right={week.headline}
      onPress={handlers?.onOpenPlan}
      testID="pro-week"
    >
      <View style={s.weekRow}>
        {week.days.map((d) => {
          const strong = d.isToday;
          const faded = d.past && !strong;
          return (
            <View
              key={d.key}
              style={s.weekDay}
              accessibilityLabel={`${d.long}: ${d.count || 'ingen'} ${d.count === 1 ? 'avtale' : 'avtaler'}`}
            >
              <View style={[s.weekCol, { backgroundColor: pal.track }, strong && { borderWidth: 1.5, borderColor: pal.accent }]}>
                <View
                  style={{
                    height: `${d.count ? Math.max(22, Math.round(d.ratio * 100)) : 0}%`,
                    backgroundColor: pal.accent,
                    opacity: faded ? 0.45 : 1,
                    borderRadius: 6,
                    width: '100%',
                    alignItems: 'center',
                  }}
                >
                  {d.count ? (
                    <Text style={[s.weekColNum, { color: pal.glass ? '#0B2236' : '#FFFFFF' }]}>{d.count}</Text>
                  ) : null}
                </View>
              </View>
              <Text style={[s.weekLbl, { color: strong ? pal.ink : (d.weekend ? pal.faint : pal.muted), fontWeight: strong ? '600' : '400' }]}>
                {strong ? 'I dag' : d.label}
              </Text>
            </View>
          );
        })}
      </View>
      {tall && week.hint ? <Text style={[s.calmTxt, { color: pal.muted }]}>{week.hint}</Text> : null}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Oppgaver, Notater, Husk                                             */
/* ------------------------------------------------------------------ */

export function TasksWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const tp = model?.taskProgress || {};
  const items = tp.items || [];
  const open = Number(tp.open) || items.length;
  const done = Number(tp.done) || 0;
  const overdue = items.filter((t) => /forfalt/i.test(t.meta || '')).length;
  const newTask = () => handlers?.onAppAction?.({ type: 'nav', screen: 'ParentTask' });
  const right = open ? (overdue && gw >= 4 ? `${open} åpne · ${overdue} forfalt` : `${open} åpne`) : null;
  return (
    <ProCard
      title="Oppgaver"
      icon="checkbox"
      right={right}
      onRight={handlers?.onOpenTasks}
      testID="pro-tasks"
    >
      {!items.length ? (
        <View style={s.tasksEmpty}>
          <EmptyLine
            text={done ? `Alt unnagjort · ${done} ferdig i dag` : 'Ingen åpne oppgaver'}
            action={gh >= 2 ? '+ Ny' : null}
            onAction={newTask}
            testID="pro-tasks-empty"
          />
        </View>
      ) : (
        <ScrollView style={s.scroll} nestedScrollEnabled showsVerticalScrollIndicator={items.length > 3}>
            {items.map((t, i) => {
              const late = /forfalt/i.test(t.meta || '');
              return (
                <TouchableOpacity
                  key={t.id || i}
                  style={s.taskRow}
                  onPress={handlers?.onOpenTasks}
                  accessibilityRole="button"
                  accessibilityLabel={t.title}
                >
                  <View style={[s.taskCircle, { borderColor: late ? pal.danger : pal.faint }]} />
                  <Text style={[s.taskTitle, { color: pal.ink }]} numberOfLines={1}>{t.title}</Text>
                  {t.meta && t.meta !== 'Åpen' && (gw >= 4 || late) ? (
                    <Text style={[s.taskMeta, { color: late ? pal.danger : pal.muted }]} numberOfLines={1}>
                      {late && gw < 4 ? '!' : t.meta}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      )}
    </ProCard>
  );
}

export function NotesWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const notes = model?.notes || [];
  const openNotes = () => handlers?.onAppAction?.({ type: 'tab', tab: 'notes' });
  const newNote = () => handlers?.onAppAction?.({ type: 'tab', tab: 'notes', mode: 'create' });
  const max = gh >= 3 ? 3 : (gw >= 3 ? 2 : 1);
  return (
    <ProCard title="Notater" icon="document-text" right={notes.length ? '+' : null} onRight={notes.length ? newNote : null} onPress={notes.length ? openNotes : null} testID="pro-notes">
      {!notes.length ? (
        <TouchableOpacity style={[s.noteNew, { borderColor: pal.line }]} onPress={newNote} accessibilityRole="button" testID="pro-notes-new">
          <Ionicons name="create-outline" size={16} color={pal.accent} />
          <Text style={[s.noteNewTxt, { color: pal.muted }]} numberOfLines={2}>Skriv eller snakk inn et notat</Text>
        </TouchableOpacity>
      ) : notes.slice(0, max).map((n, i) => (
        <View key={n.id || i} style={[s.note, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          <Text style={[s.noteTitle, { color: pal.ink }]} numberOfLines={1}>{n.title}</Text>
          {n.meta && n.meta !== 'Notat' ? (
            <Text style={[s.noteMeta, { color: pal.muted }]} numberOfLines={gh >= 3 || max === 1 ? 2 : 1}>{n.meta}</Text>
          ) : null}
        </View>
      ))}
    </ProCard>
  );
}

export function RemindersWidget({ model, handlers }) {
  const pal = useHomePalette();
  const hints = model?.remainingHints || [];
  return (
    <ProCard title="Husk" icon="notifications" right={hints.length ? `${hints.length}` : null} onPress={handlers?.onOpenTasks} testID="pro-reminders">
      {!hints.length ? <EmptyLine text="Alt er unna for i dag" /> : hints.slice(0, 4).map((h, i) => (
        <View key={`${h}-${i}`} style={s.hintRow}>
          <Ionicons name="ellipse" size={7} color={pal.warn} />
          <Text style={[s.hintTxt, { color: pal.ink }]} numberOfLines={1}>{h}</Text>
        </View>
      ))}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Hurtigvalg, E-post, AI                                              */
/* ------------------------------------------------------------------ */

function ActionTile({ item, compact, onPress }) {
  const pal = useHomePalette();
  const warn = item.tone === 'warn';
  const fg = warn ? pal.warnInk : (pal.glass ? pal.ink : pal.accentInk);
  const bg = warn ? pal.warnSoft : pal.accentSoft;
  return (
    <TouchableOpacity
      style={[s.action, { backgroundColor: pal.chip, borderColor: pal.line }, compact && s.actionCompact]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      testID={`pro-action-${item.id}`}
    >
      <View style={[s.actionIcon, { backgroundColor: bg }, compact && s.actionIconCompact]}>
        <Ionicons name={item.icon} size={compact ? 14 : 18} color={fg} />
      </View>
      <Text style={[s.actionLbl, { color: pal.ink }]} numberOfLines={1}>{item.label}</Text>
    </TouchableOpacity>
  );
}

export function QuickActionsWidget({ model, handlers, widget, board = 'private' }) {
  const { gh } = gridSize(widget);
  const actions = useMemo(
    () => quickActionsFor(board, { iso: !!model?.isoActive, mileage: !!model?.mileageActive }),
    [board, model?.isoActive, model?.mileageActive],
  );
  const compact = gh <= 1;
  return (
    <ProCard title={compact ? null : 'Hurtigvalg'} icon="flash" pad={compact ? 8 : 12} testID="pro-quick">
      <View style={s.actionRow}>
        {actions.map((item) => {
          if (item.action?.type === 'ruh') {
            return (
              <QuickReportButton
                key={item.id}
                label="Meld RUH"
                renderTrigger={({ open: openSheet }) => (
                  <ActionTile item={item} compact={compact} onPress={openSheet} />
                )}
              />
            );
          }
          return (
            <ActionTile
              key={item.id}
              item={item}
              compact={compact}
              onPress={() => handlers?.onAppAction?.(item.action)}
            />
          );
        })}
      </View>
    </ProCard>
  );
}

export function MailWidget({ model, handlers }) {
  const pal = useHomePalette();
  const unread = Number(model?.unreadByModule?.mail) || 0;
  return (
    <ProCard title="E-post" icon="mail" onPress={() => handlers?.onAppAction?.({ type: 'tab', tab: 'mail' })} testID="pro-mail">
      <View style={s.bigNumWrap}>
        <Text style={[s.bigNum, { color: pal.ink }]}>{unread}</Text>
        <Text style={[s.bigNumLbl, { color: pal.muted }]} numberOfLines={2}>{unread === 1 ? 'ulest e-post' : 'uleste e-poster'}</Text>
      </View>
    </ProCard>
  );
}

export function AssistantWidget({ handlers, widget, board = 'private' }) {
  const pal = useHomePalette();
  const { gw } = gridSize(widget);
  const ideas = board === 'company'
    ? ['Hva har jeg igjen i dag?', 'Oppsummer uken min']
    : ['Planlegg dagen min', 'Hva haster mest?'];
  const ask = () => handlers?.onOpenAssistant?.();
  return (
    <ProCard title="ProTop AI" icon="sparkles" onPress={ask} testID="pro-ai">
      <View style={[s.askBox, { backgroundColor: pal.chip, borderColor: pal.line }]}>
        <Text style={[s.askTxt, { color: pal.muted }]} numberOfLines={1}>Spør om hva som helst …</Text>
        <Ionicons name="arrow-up-circle" size={20} color={pal.accent} />
      </View>
      {gw >= 3 ? (
        <View style={s.ideaRow}>
          {ideas.map((t) => <Pill key={t} label={t} tone="muted" onPress={ask} />)}
        </View>
      ) : null}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Mine timer, Prosjekter, Teamet, Nyheter                    */
/* ------------------------------------------------------------------ */

export function MyHoursWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh } = gridSize(widget);
  const liveHours = useMyWeekHours(model?.companyId);
  const { summary, ready, linked } = model?.preview?.hours || liveHours;
  const logHours = () => handlers?.onAppAction?.({ type: 'tab', tab: 'timeliste' });

  if (ready && !linked) {
    return (
      <ProCard title="Mine timer" icon="time" onPress={logHours} testID="pro-hours-unlinked">
        <EmptyLine icon="information-circle" text="Du er ikke koblet til en ansatt i bedriften ennå." action="Timeliste ›" onAction={logHours} />
      </ProCard>
    );
  }

  const compact = gh <= 1;
  const ctaInk = pal.glass ? pal.ink : pal.onAccent;
  const cta = (
    <TouchableOpacity
      style={[s.cta, { backgroundColor: pal.glass ? pal.chipStrong : pal.accentInk }]}
      onPress={logHours}
      accessibilityRole="button"
      testID="pro-hours-log"
    >
      <Ionicons name="add" size={14} color={ctaInk} />
      <Text style={[s.ctaTxt, { color: ctaInk }]}>Før timer</Text>
    </TouchableOpacity>
  );
  const totals = (
    <TouchableOpacity
      style={s.hoursTotals}
      onPress={logHours}
      accessibilityRole="button"
      accessibilityLabel={`${hoursLabel(summary.total)} av ${hoursLabel(summary.target)} denne uken`}
    >
      <Text style={[s.hoursBig, { color: pal.ink }]}>{ready ? hoursLabel(summary.total) : '…'}</Text>
      <Text style={[s.hoursSub, { color: pal.muted }]} numberOfLines={1}>
        av {hoursLabel(summary.target)} · i dag {hoursLabel(summary.todayHours)}
      </Text>
      {!compact && summary.missing.length ? (
        <Text style={[s.hoursWarn, { color: pal.warnInk }]} numberOfLines={1}>
          Mangler: {summary.missing.join(', ')}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  if (compact) {
    return (
      <ProCard pad={8} testID="pro-hours">
        <View style={s.hoursTop}>
          {totals}
          {cta}
        </View>
      </ProCard>
    );
  }

  return (
    <ProCard title={`Mine timer · uke ${summary.week}`} icon="time" testID="pro-hours">
      <View style={s.hoursHeadCta}>{cta}</View>
      <View style={s.hoursBody}>
        {totals}
        <View style={s.hoursBars}>
          {summary.days.map((d) => (
            <View key={d.key} style={s.hoursDay}>
              <View style={[s.hoursCol, { backgroundColor: pal.track }]}>
                <View
                  style={{
                    height: `${Math.max(d.hours ? 10 : 0, Math.round(d.ratio * 100))}%`,
                    backgroundColor: d.full ? pal.success : pal.accent,
                    borderRadius: 4,
                    width: '100%',
                  }}
                />
              </View>
              <Text
                style={[s.hoursDayLbl, {
                  color: d.isToday ? (pal.glass ? pal.ink : pal.accentInk) : (d.weekend ? pal.faint : pal.muted),
                  fontWeight: d.isToday ? '600' : '400',
                }]}
              >
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ProCard>
  );
}

export function ProjectsWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const { summary } = useMyWeekHours(model?.companyId);
  const max = gh >= 4 ? 4 : (gh >= 3 ? 3 : 2);
  const liveProjects = useHomeProjects(model?.companyId, { recentIds: summary.topProjectIds, limit: max });
  const data = model?.preview?.projects || liveProjects;
  const openProjects = () => handlers?.onAppAction?.({ type: 'tab', tab: 'projects' });
  return (
    <ProCard
      title="Prosjekter"
      icon="business"
      right={data.running ? `${data.running} pågår` : (data.total ? `${data.total}` : null)}
      onPress={openProjects}
      testID="pro-projects"
    >
      {!data.items.length ? (
        <EmptyLine icon="business-outline" text={data.ready ? 'Ingen aktive prosjekter' : 'Henter prosjekter …'} />
      ) : data.items.map((p, i) => (
        <View key={p.id} style={[s.projRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          {p.number && gw >= 3 ? (
            <View style={[s.projNum, { backgroundColor: pal.chip, borderColor: pal.line }]}>
              <Text style={[s.projNumTxt, { color: pal.muted }]} numberOfLines={1}>{p.number}</Text>
            </View>
          ) : null}
          <View style={s.projBody}>
            <Text style={[s.projName, { color: pal.ink }]} numberOfLines={1}>{p.name}</Text>
            <View style={s.projMetaRow}>
              <View style={[s.phaseDot, { backgroundColor: p.phase === 'produksjon' ? pal.success : (p.phase === 'tilbud' ? pal.warn : pal.accent) }]} />
              <Text style={[s.projMeta, { color: pal.muted }]} numberOfLines={1}>
                {p.mine ? 'Timer denne uken' : p.phaseLabel}{p.place && gw >= 3 ? ` · ${p.place}` : ''}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ProCard>
  );
}

export function TeamWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gw, gh } = gridSize(widget);
  const limit = gw >= 3 ? 10 : (gh >= 3 ? 6 : 4);
  const liveTeam = useTeamToday(model?.companyId, { limit });
  const team = model?.preview?.team || liveTeam;
  const openTeam = () => handlers?.onAppAction?.(
    team.manager ? { type: 'tab', tab: 'arbeid', subView: 'godkjenning' } : { type: 'tab', tab: 'selskap' },
  );
  const size = gw >= 3 ? 34 : 30;
  return (
    <ProCard title="Teamet i dag" icon="people" onPress={openTeam} testID="pro-team">
      <Text style={[s.teamHead, { color: pal.muted }]} numberOfLines={2}>{team.headline}</Text>
      {team.known && team.total ? (
        <Bar ratio={team.loggedCount / Math.max(1, team.total)} color={pal.success} track={pal.track} height={5} />
      ) : null}
      <View style={s.avatars}>
        {team.people.map((p) => (
          <View key={p.id} style={s.avatarWrap} accessibilityLabel={`${p.name}${p.logged ? ', har ført timer' : ''}`}>
            <View style={[
              s.avatar,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: p.me ? pal.accentSoft : pal.chip, borderColor: p.logged ? pal.success : pal.line },
            ]}>
              <Text style={[s.avatarTxt, { color: pal.ink }]}>{p.initials}</Text>
            </View>
            {p.logged ? <View style={[s.avatarDot, { backgroundColor: pal.success, borderColor: pal.glass ? 'transparent' : '#fff' }]} /> : null}
          </View>
        ))}
        {team.more ? (
          <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: pal.chip, borderColor: pal.line }]}>
            <Text style={[s.avatarTxt, { color: pal.muted }]}>+{team.more}</Text>
          </View>
        ) : null}
      </View>
    </ProCard>
  );
}

export function CompanyNewsWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh } = gridSize(widget);
  const max = gh >= 3 ? 3 : (gh >= 2 ? 2 : 1);
  const liveNews = useCompanyNewsPeek(model?.companyId, { limit: max });
  const news = model?.preview?.news || liveNews;
  const openNews = () => handlers?.onAppAction?.({ type: 'tab', tab: 'selskap', subView: 'nyheter' });
  return (
    <ProCard title="Nyheter" icon="megaphone" right="Alle ›" onRight={openNews} onPress={openNews} testID="pro-news">
      {!news.items.length ? (
        <EmptyLine icon="megaphone-outline" text={news.ready ? 'Ingen nyheter ennå' : 'Henter nyheter …'} />
      ) : news.items.map((n, i) => (
        <View key={n.id || i} style={[s.newsRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          <View style={s.newsBody}>
            <Text style={[s.newsTitle, { color: pal.ink }]} numberOfLines={1}>{n.title}</Text>
            <Text style={[s.newsMeta, { color: pal.muted }]} numberOfLines={1}>
              {[relativeDay(n.date), n.author].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {n.pinned ? <Ionicons name="pin" size={13} color={pal.muted} /> : null}
        </View>
      ))}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Kjørebok                                                            */
/* ------------------------------------------------------------------ */

function shortDate(key) {
  const [, m, d] = String(key || '').split('-').map(Number);
  return m && d ? `${d}.${m}.` : '';
}

/**
 * Kjøreboken min: km og godtgjørelse denne måneden, yrkeskjøring i år mot 6 000 km,
 * turer som ikke er sendt, og de siste turene. I Privat vises kjøreboken fra bedriften
 * personen jobber i, og trykk bytter til Bedrift.
 */
export function MileageWidget({ model, handlers, widget, board = 'private' }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const companyId = board === 'company' ? model?.companyId : model?.mileageCompanyId;
  const liveMileage = useMyMileage(companyId);
  const { summary, ready, linked } = model?.preview?.mileage || liveMileage;
  const openLog = () => {
    if (board === 'company') {
      handlers?.onAppAction?.({ type: 'tab', tab: 'okonomi', subView: 'kjorebok' });
    } else {
      handlers?.onOpenCompany?.(companyId);
    }
  };
  const ctaLabel = board === 'company' ? 'Registrer tur' : 'Åpne i bedrift';
  const ctaInk = pal.glass ? pal.ink : pal.onAccent;
  const cta = (
    <TouchableOpacity
      style={[s.cta, { backgroundColor: pal.glass ? pal.chipStrong : pal.accentInk }]}
      onPress={openLog}
      accessibilityRole="button"
      testID="pro-mileage-add"
    >
      <Ionicons name={board === 'company' ? 'add' : 'swap-horizontal'} size={14} color={ctaInk} />
      <Text style={[s.ctaTxt, { color: ctaInk }]}>{ctaLabel}</Text>
    </TouchableOpacity>
  );

  if (board === 'company' && model?.mileageActive === false) {
    return (
      <ProCard title="Kjørebok" icon="car" testID="pro-mileage-off">
        <EmptyLine icon="information-circle" text="Kjørebok er ikke slått på i bedriften." />
      </ProCard>
    );
  }
  if ((!companyId && !model?.preview?.mileage) || (ready && !linked)) {
    return (
      <ProCard title="Kjørebok" icon="car" testID="pro-mileage-unlinked">
        <EmptyLine
          icon="information-circle"
          text={companyId ? 'Du er ikke koblet til en ansatt i bedriften ennå.' : 'Kjøreboken hører til bedriften du jobber i.'}
        />
      </ProCard>
    );
  }

  const compact = gh <= 1;
  const month = (
    <TouchableOpacity
      style={s.mileTotals}
      onPress={openLog}
      accessibilityRole="button"
      accessibilityLabel={`${kmLabel(summary.monthKm)} denne måneden, omtrent ${krLabel(summary.monthAmount)}`}
    >
      <Text style={[s.hoursBig, { color: pal.ink }]}>{ready ? kmLabel(summary.monthKm) : '…'}</Text>
      <Text style={[s.hoursSub, { color: pal.muted }]} numberOfLines={1}>
        denne måneden{summary.monthAmount ? ` · ≈ ${krLabel(summary.monthAmount)}` : ''}
      </Text>
    </TouchableOpacity>
  );

  if (compact) {
    return (
      <ProCard pad={8} testID="pro-mileage">
        <View style={s.hoursTop}>
          {month}
          {summary.drafts ? <Pill label={`${summary.drafts} ikke sendt`} tone="warn" onPress={openLog} /> : null}
          {cta}
        </View>
      </ProCard>
    );
  }

  const rows = gh >= 3 ? 3 : (gw >= 4 ? 2 : 1);
  return (
    <ProCard title={board === 'company' ? 'Kjørebok' : `Kjørebok · ${model?.mileageCompanyName || 'bedrift'}`} icon="car" testID="pro-mileage">
      <View style={s.hoursHeadCta}>{cta}</View>
      <View style={s.mileTop}>
        {month}
        <View style={s.mileYear}>
          <View style={s.mileYearHead}>
            <Text style={[s.mileYearTxt, { color: pal.muted }]} numberOfLines={1}>
              I år {kmLabel(summary.yearKm)}
            </Text>
            {summary.drafts ? (
              <Text style={[s.mileYearTxt, { color: pal.warnInk }]} numberOfLines={1}>
                {summary.drafts} ikke sendt
              </Text>
            ) : null}
          </View>
          <Bar
            ratio={summary.yearRatio}
            color={summary.overLimit ? pal.warn : pal.accent}
            track={pal.track}
          />
          <Text style={[s.mileLimit, { color: summary.overLimit ? pal.warnInk : pal.faint }]} numberOfLines={1}>
            {summary.overLimit ? 'Over 6 000 km i år' : `${kmLabel(Math.max(0, summary.limitKm - summary.yearKm))} til 6 000 km`}
          </Text>
        </View>
      </View>
      {summary.recent.length ? summary.recent.slice(0, rows).map((t, i) => (
        <TouchableOpacity
          key={t.id || i}
          style={[s.tripRow, { borderTopColor: pal.line }]}
          onPress={openLog}
          accessibilityRole="button"
          accessibilityLabel={`${shortDate(t.date)} ${t.route} ${kmLabel(t.km)}`}
        >
          <Text style={[s.tripDate, { color: pal.muted }]}>{shortDate(t.date)}</Text>
          <Text style={[s.tripRoute, { color: pal.ink }]} numberOfLines={1}>{t.route}</Text>
          {t.draft ? <View style={[s.tripDraft, { backgroundColor: pal.warn }]} /> : null}
          <Text style={[s.tripKm, { color: pal.ink }]}>{kmLabel(t.km)}</Text>
        </TouchableOpacity>
      )) : (
        <Text style={[s.calmTxt, { color: pal.muted }]}>Ingen turer ennå. Registrer en kjøretur, så regnes km og godtgjørelse ut.</Text>
      )}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 22 },
  headMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitBody: { flex: 1, minHeight: 0 },
  disc: { alignItems: 'center', justifyContent: 'center' },
  discGlass: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(20, 28, 45, 0.12)' } : null),
  },
  headTitle: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: FONT },
  headRight: { fontSize: 12, fontFamily: FONT, maxWidth: 170 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26, borderRadius: 13,
  },
  pillTxt: { fontSize: 12, fontFamily: FONT },

  emptyLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  emptyTxt: { flex: 1, fontSize: 13, fontFamily: FONT },
  emptyAction: { fontSize: 13, fontWeight: '600', fontFamily: FONT },
  bar: { width: '100%', overflow: 'hidden' },
  scroll: { flex: 1, minHeight: 0 },
  calmTxt: { fontSize: 12, marginTop: 8, lineHeight: 16, fontFamily: FONT },

  statRow: { flexDirection: 'row', gap: 6 },
  stat: {
    flex: 1, minWidth: 0, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8,
  },
  statCompact: { paddingVertical: 6 },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statNum: { fontSize: 22, fontWeight: '600', lineHeight: 26, fontFamily: FONT },
  statNumCompact: { fontSize: 18, lineHeight: 22 },
  statLbl: { fontSize: 11, marginTop: 1, fontFamily: FONT },
  briefLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  daySentence: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: FONT },
  dayCompact: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  ribbon: { width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' },
  ribbonBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6, opacity: 0.9 },
  ribbonNow: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1 },
  ribbonTicks: { height: 14, position: 'relative', marginTop: 2 },
  ribbonTick: { position: 'absolute', fontSize: 10, marginLeft: -6, fontFamily: FONT },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  chipMain: { flex: 1, minWidth: 0 },
  chipTitle: { fontSize: 14, fontFamily: FONT },

  evRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  evTimeCol: { width: 42 },
  evTime: { fontSize: 13, fontWeight: '600', fontFamily: FONT },
  evEnd: { fontSize: 11, fontFamily: FONT },
  evBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  evBody: { flex: 1, minWidth: 0 },
  evTitle: { fontSize: 14, fontFamily: FONT },
  evMeta: { fontSize: 12, marginTop: 1, fontFamily: FONT },

  nextBody: { flex: 1, justifyContent: 'center' },
  nextTitle: { fontSize: 17, fontWeight: '600', lineHeight: 22, fontFamily: FONT },
  nextMeta: { fontSize: 13, marginTop: 3, fontFamily: FONT },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flex: 1, minHeight: 0 },
  weekDay: { flex: 1, alignItems: 'center', gap: 4, minHeight: 0 },
  weekCol: {
    flex: 1, width: '100%', maxWidth: 34, minHeight: 22, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden', padding: 2,
  },
  weekColNum: { fontSize: 11, fontWeight: '700', marginTop: 2, fontFamily: FONT },
  weekLbl: { fontSize: 11, fontFamily: FONT },

  tasksEmpty: { flex: 1, justifyContent: 'center' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  taskCircle: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: FONT },
  taskMeta: { fontSize: 11, fontFamily: FONT, maxWidth: 80 },

  noteNew: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 10,
  },
  noteNewTxt: { flex: 1, fontSize: 13, fontFamily: FONT },
  note: { paddingVertical: 6 },
  noteTitle: { fontSize: 14, fontWeight: '600', fontFamily: FONT },
  noteMeta: { fontSize: 12, marginTop: 2, lineHeight: 16, fontFamily: FONT },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  hintTxt: { flex: 1, fontSize: 13, fontFamily: FONT },

  actionRow: { flexDirection: 'row', gap: 6, flex: 1 },
  action: {
    flex: 1, minWidth: 0, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 5,
  },
  actionCompact: { flexDirection: 'row', paddingVertical: 4, gap: 5 },
  actionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionIconCompact: { width: 24, height: 24, borderRadius: 8 },
  actionLbl: { fontSize: 12, fontFamily: FONT, textAlign: 'center' },

  bigNumWrap: { flex: 1, justifyContent: 'center' },
  bigNum: { fontSize: 30, fontWeight: '600', lineHeight: 34, fontFamily: FONT },
  bigNumLbl: { fontSize: 12, fontFamily: FONT },

  askBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, height: 38,
  },
  askTxt: { flex: 1, fontSize: 13, fontFamily: FONT },
  ideaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },

  hoursTop: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hoursHeadCta: { position: 'absolute', top: 8, right: 10 },
  hoursBody: { flexDirection: 'row', alignItems: 'stretch', gap: 12, flex: 1, minHeight: 0 },
  hoursTotals: { minWidth: 112, maxWidth: 150, justifyContent: 'center' },
  hoursBig: { fontSize: 26, fontWeight: '600', lineHeight: 30, fontFamily: FONT },
  hoursSub: { fontSize: 12, fontFamily: FONT },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: 28, paddingHorizontal: 10, borderRadius: 14,
  },
  ctaTxt: { fontSize: 12, fontWeight: '600', fontFamily: FONT },
  hoursBars: { flexDirection: 'row', gap: 5, flex: 1, minHeight: 40 },
  hoursDay: { flex: 1, alignItems: 'center', gap: 3 },
  hoursCol: {
    flex: 1, width: '100%', maxWidth: 22, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden', minHeight: 20,
  },
  hoursDayLbl: { fontSize: 10, fontFamily: FONT },
  hoursWarn: { fontSize: 11, marginTop: 2, fontFamily: FONT },

  projRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  projNum: {
    width: 54, height: 22, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  projNumTxt: { fontSize: 11, fontFamily: FONT },
  projBody: { flex: 1, minWidth: 0 },
  projName: { fontSize: 14, fontFamily: FONT },
  projMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  phaseDot: { width: 6, height: 6, borderRadius: 3 },
  projMeta: { flex: 1, fontSize: 11, fontFamily: FONT },

  teamHead: { fontSize: 12, marginBottom: 6, fontFamily: FONT },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  avatarWrap: { position: 'relative' },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarTxt: { fontSize: 11, fontWeight: '600', fontFamily: FONT },
  avatarDot: {
    position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5,
  },

  mileTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  mileTotals: { minWidth: 110, maxWidth: 160, justifyContent: 'center' },
  mileYear: { flex: 1, minWidth: 0, gap: 4 },
  mileYearHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  mileYearTxt: { fontSize: 12, fontFamily: FONT },
  mileLimit: { fontSize: 11, fontFamily: FONT },
  tripRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth,
  },
  tripDate: { width: 40, fontSize: 12, fontFamily: FONT },
  tripRoute: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: FONT },
  tripDraft: { width: 6, height: 6, borderRadius: 3 },
  tripKm: { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  newsBody: { flex: 1, minWidth: 0 },
  newsTitle: { fontSize: 14, fontFamily: FONT },
  newsMeta: { fontSize: 11, marginTop: 1, fontFamily: FONT },
});
