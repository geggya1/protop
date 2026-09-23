import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import {
  addDays, dateKey, isSameMonth, isToday, monthGrid, sameDay,
  WEEKDAYS_LONG, WEEKDAYS_SHORT, MONTHS_NO,
} from '../src/utils/dates';
import {
  calendarEventSurface,
  formatWeekRangeNo,
  isAllDayEvent,
  layoutTimedEvents,
  minutesToTime,
  visibleHourRange,
} from '../src/utils/timeGrid';
import { FAMILY_CALENDAR_COLOR } from '../src/utils/calendarColors';
import { webDataSet } from '../src/desktop';
import { DeskBtn } from './DeskBtn';
import CalendarLayerList from './CalendarLayerList';
import CalendarTaskPane from './CalendarTaskPane';
import { custodyCellTint } from '../src/utils/custodySchedule';

const HOUR_H = 52;
const GUTTER = 56;
const PANE_W = 220;
const NOW_COLOR = '#c50f1f';
const VIEWS = [
  { id: 'day', label: 'Dag' },
  { id: 'week', label: 'Uke' },
  { id: 'month', label: 'Måned' },
  { id: 'meals', label: 'Mat' },
];

function eventKey(e) {
  return `${e.id}-${e.occurrenceDateKey || e.dateKey || ''}`;
}

function MiniMonth({ monthDate, anchor, onPickDay, onShiftMonth, daysWithEvents, showNav = true, getCustodyOverlay }) {
  const days = useMemo(() => monthGrid(monthDate), [monthDate]);
  return (
    <View style={styles.mini}>
      <View style={styles.miniHead}>
        <TouchableOpacity
          onPress={() => onShiftMonth(-1)}
          style={[styles.miniNav, !showNav && { opacity: 0 }]}
          disabled={!showNav}
          accessibilityLabel="Forrige måned"
        >
          <Ionicons name="chevron-back" size={14} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.miniTitle} numberOfLines={1}>
          {MONTHS_NO[monthDate.getMonth()]} {monthDate.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => onShiftMonth(1)}
          style={[styles.miniNav, !showNav && { opacity: 0 }]}
          disabled={!showNav}
          accessibilityLabel="Neste måned"
        >
          <Ionicons name="chevron-forward" size={14} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <View style={styles.miniDowRow}>
        {WEEKDAYS_SHORT.map((d) => (
          <Text key={d} style={styles.miniDow}>{d}</Text>
        ))}
      </View>
      <View style={styles.miniGrid}>
        {days.map((d) => {
          const k = dateKey(d);
          const outside = !isSameMonth(d, monthDate);
          const today = isToday(d);
          const selected = sameDay(d, anchor);
          const has = daysWithEvents?.has(k);
          const custodyTint = getCustodyOverlay
            ? custodyCellTint(getCustodyOverlay(d), { selected, today })
            : null;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => onPickDay(d)}
              style={[styles.miniCell, custodyTint]}
              accessibilityLabel={k}
            >
              <View style={[
                styles.miniNumWrap,
                today && styles.miniNumToday,
                selected && !today && styles.miniNumSelected,
              ]}
              >
                <Text style={[
                  styles.miniNum,
                  outside && styles.miniNumOut,
                  today && styles.miniNumTodayTxt,
                  selected && !today && styles.miniNumSelectedTxt,
                ]}
                >
                  {d.getDate()}
                </Text>
              </View>
              {has && !today ? <View style={styles.miniDot} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function EventBlock({ layout, hourStart, canOpen, onPress }) {
  const { event: e, start, end, col, colCount } = layout;
  const top = ((start - hourStart * 60) / 60) * HOUR_H;
  const height = Math.max(18, ((end - start) / 60) * HOUR_H - 2);
  const widthPct = 100 / colCount;
  const surface = calendarEventSurface(e.color || FAMILY_CALENDAR_COLOR);
  const timeLbl = e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
  const narrow = colCount >= 3;
  const showTime = height >= 32 && !narrow;
  const titleLines = height >= 48 && !narrow ? 3 : height >= 28 ? 2 : 1;
  const tip = timeLbl ? `${timeLbl} · ${e.title}` : e.title;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!canOpen}
      activeOpacity={0.85}
      style={[
        styles.evBlock,
        {
          top,
          height,
          left: `${col * widthPct}%`,
          width: `${widthPct}%`,
        },
      ]}
      {...webDataSet({ wpCalEvent: '1' })}
      accessibilityLabel={tip}
      {...(Platform.OS === 'web' ? { title: tip } : null)}
    >
      <View
        style={[
          styles.evInner,
          narrow && styles.evInnerNarrow,
          { backgroundColor: surface.bg, borderColor: surface.border, borderLeftColor: surface.accent },
        ]}
      >
        {showTime ? (
          <Text style={[styles.evTime, { color: surface.ink }]} numberOfLines={1}>{timeLbl}</Text>
        ) : null}
        <Text
          style={[styles.evTitle, { color: surface.ink }, narrow && styles.evTitleNarrow]}
          numberOfLines={titleLines}
        >
          {e.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function NowLine({ startHour, endHour, now }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < startHour * 60 || minutes > endHour * 60) return null;
  const top = ((minutes - startHour * 60) / 60) * HOUR_H;
  return (
    <View pointerEvents="none" style={[styles.nowLine, { top }]}>
      <View style={styles.nowDot} />
      <View style={styles.nowHair} />
    </View>
  );
}

function TimeGrid({
  days, itemsForDay, startHour, endHour, now,
  canOpenEvent, openEventForm, onCreateAt, canCreateCalendarEvent, getCustodyOverlay,
}) {
  const hours = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  const bodyH = (endHour - startHour) * HOUR_H;

  return (
    <View style={styles.gridBody}>
      <View style={[styles.timeGutter, { height: bodyH }]}>
        {hours.map((h) => (
          <Text
            key={h}
            style={[styles.timeLbl, { top: (h - startHour) * HOUR_H - 7 }]}
          >
            {`${String(h).padStart(2, '0')}:00`}
          </Text>
        ))}
      </View>
      <View style={[styles.lanes, { height: bodyH }]}>
        {days.map((d) => {
          const k = dateKey(d);
          const { ev } = itemsForDay(d);
          const timed = layoutTimedEvents(ev.filter((e) => !isAllDayEvent(e)));
          const today = isToday(d);
          const custodyTint = getCustodyOverlay
            ? custodyCellTint(getCustodyOverlay(d), { today })
            : null;
          return (
            <View key={k} style={[styles.lane, today && styles.laneToday, custodyTint]}>
              {hours.map((h) => (
                <View
                  key={`line-${h}`}
                  pointerEvents="none"
                  style={[styles.hourLine, { top: (h - startHour) * HOUR_H }]}
                />
              ))}
              {hours.slice(0, -1).map((h) => (
                <View
                  key={`half-${h}`}
                  pointerEvents="none"
                  style={[styles.halfLine, { top: (h - startHour) * HOUR_H + HOUR_H / 2 }]}
                />
              ))}
              {hours.slice(0, -1).map((h) => (
                <TouchableOpacity
                  key={`${k}-${h}`}
                  style={[styles.slot, { top: (h - startHour) * HOUR_H, height: HOUR_H }]}
                  onPress={() => onCreateAt?.(k, h * 60)}
                  disabled={!canCreateCalendarEvent}
                  {...webDataSet({ wpCalSlot: '1' })}
                  accessibilityLabel={`Legg til ${k} ${String(h).padStart(2, '0')}:00`}
                >
                  {canCreateCalendarEvent ? (
                    <View style={styles.slotPlus} {...webDataSet({ wpCalPlus: '1' })}>
                      <Text style={styles.slotPlusTxt}>+</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
              {timed.map((layout) => (
                <EventBlock
                  key={eventKey(layout.event)}
                  layout={layout}
                  hourStart={startHour}
                  canOpen={!!canOpenEvent?.(layout.event)}
                  onPress={() => openEventForm(layout.event)}
                />
              ))}
              {today ? <NowLine startHour={startHour} endHour={endHour} now={now} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function OutlookCalendar({
  mode,
  setMode,
  anchor,
  setAnchor,
  weekDays,
  grid,
  iso,
  itemsForDay,
  canManageEvent,
  canOpenEvent,
  openEventForm,
  onCreateEvent,
  isParent,
  canCreateCalendarEvent,
  showCalendarSettings,
  onSettings,
  familyName,
  calendars,
  hiddenCals,
  onToggleCal,
  syncNotice,
  mealsBody,
  paneItemsForDay,
  paneLabel,
  paneCreateLabel,
  onOpenPaneItem,
  onTogglePaneItem,
  onCreatePaneItem,
  getCustodyOverlay,
  custodyOverlayActive,
  showCustodyToggle = false,
  onToggleCustodyOverlay,
  custodyLegend,
}) {
  const canCreate = canCreateCalendarEvent ?? isParent;
  const canOpenSettings = showCalendarSettings ?? isParent;
  const canOpen = useCallback(
    (e) => (typeof canOpenEvent === 'function' ? canOpenEvent(e) : canManageEvent?.(e)),
    [canOpenEvent, canManageEvent],
  );
  const [viewOpen, setViewOpen] = useState(false);
  const [paneMonth, setPaneMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef(null);
  const didScroll = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const a = anchor.getFullYear() * 12 + anchor.getMonth();
    const p = paneMonth.getFullYear() * 12 + paneMonth.getMonth();
    if (a < p || a > p + 1) {
      setPaneMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
  }, [anchor, paneMonth]);

  const viewDays = useMemo(
    () => (mode === 'day' ? [anchor] : weekDays),
    [mode, anchor, weekDays],
  );
  const allTimed = useMemo(() => {
    const days = mode === 'month' || mode === 'meals' ? [] : viewDays;
    const list = [];
    days.forEach((d) => {
      itemsForDay(d).ev.forEach((e) => list.push(e));
    });
    return list;
  }, [mode, viewDays, itemsForDay]);

  const { startHour, endHour } = useMemo(
    () => visibleHourRange(allTimed),
    [allTimed],
  );

  useEffect(() => {
    if (didScroll.current || mode === 'month' || mode === 'meals') return;
    const y = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) - startHour * 60) * (HOUR_H / 60) - 72);
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    const id = raf(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
      didScroll.current = true;
    });
    return () => caf(id);
  }, [mode, startHour, now]);

  const daysWithEvents = useMemo(() => {
    const set = new Set();
    const months = [paneMonth, new Date(paneMonth.getFullYear(), paneMonth.getMonth() + 1, 1)];
    months.forEach((m) => {
      monthGrid(m).forEach((d) => {
        if (itemsForDay(d).ev.length) set.add(dateKey(d));
      });
    });
    return set;
  }, [paneMonth, itemsForDay]);

  const shift = (dir) => {
    if (mode === 'month' || mode === 'meals') {
      setAnchor((d) => (mode === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + dir, 1)
        : addDays(d, dir * 7)));
    } else if (mode === 'day') setAnchor((d) => addDays(d, dir));
    else setAnchor((d) => addDays(d, dir * 7));
  };

  const rangeLabel = mode === 'month'
    ? `${MONTHS_NO[anchor.getMonth()]} ${anchor.getFullYear()}`
    : mode === 'day'
      ? `${WEEKDAYS_LONG[(anchor.getDay() + 6) % 7]} ${anchor.getDate()}. ${MONTHS_NO[anchor.getMonth()].toLowerCase()} ${anchor.getFullYear()}`
      : formatWeekRangeNo(weekDays, MONTHS_NO);

  const viewLabel = VIEWS.find((v) => v.id === mode)?.label || 'Uke';

  const createAt = (k, minutes) => {
    if (!onCreateEvent) return;
    const start = minutesToTime(minutes);
    const end = minutesToTime(minutes + 60);
    onCreateEvent(k, { startTime: start, endTime: end, allDay: false });
  };

  const createAllDay = (k) => {
    if (!onCreateEvent) return;
    onCreateEvent(k, { allDay: true });
  };

  const nextMonth = new Date(paneMonth.getFullYear(), paneMonth.getMonth() + 1, 1);

  return (
    <View style={styles.shell}>
      <View style={styles.pane}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.paneInner}>
          <MiniMonth
            monthDate={paneMonth}
            anchor={anchor}
            onPickDay={(d) => setAnchor(d)}
            onShiftMonth={(dir) => setPaneMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1))}
            daysWithEvents={daysWithEvents}
            getCustodyOverlay={custodyOverlayActive ? getCustodyOverlay : null}
          />
          <MiniMonth
            monthDate={nextMonth}
            anchor={anchor}
            onPickDay={(d) => setAnchor(d)}
            onShiftMonth={(dir) => setPaneMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1))}
            daysWithEvents={daysWithEvents}
            showNav={false}
            getCustodyOverlay={custodyOverlayActive ? getCustodyOverlay : null}
          />
          <View style={styles.paneSectionRow}>
            <Text style={styles.paneSection}>Mine kalendere</Text>
            {canOpenSettings ? (
              <TouchableOpacity
                onPress={onSettings}
                hitSlop={8}
                accessibilityLabel="Kalenderinnstillinger"
              >
                <Ionicons name="settings-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <CalendarLayerList
            calendars={calendars}
            hiddenCals={hiddenCals}
            onToggleCal={onToggleCal}
          />
          {familyName && !(calendars || []).length ? (
            <CalendarLayerList
              calendars={[{ id: 'fam-fallback', label: familyName, color: FAMILY_CALENDAR_COLOR }]}
              hiddenCals={hiddenCals}
              onToggleCal={onToggleCal}
            />
          ) : null}
          {canOpenSettings ? (
            <TouchableOpacity
              style={styles.paneAdd}
              onPress={onSettings}
              accessibilityLabel="Koble til ekstern kalender"
            >
              <Ionicons name="add" size={16} color={colors.brand} />
              <Text style={styles.paneAddTxt}>Koble til kalender</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.main}>
        <View style={styles.toolbar}>
          <TouchableOpacity
            onPress={() => setAnchor(new Date())}
            style={styles.todayBtn}
            accessibilityLabel="I dag"
          >
            <Text style={styles.todayBtnTxt}>I dag</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shift(-1)} style={styles.chev} accessibilityLabel="Forrige">
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shift(1)} style={styles.chev} accessibilityLabel="Neste">
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.rangeLbl} numberOfLines={1}>{rangeLabel}</Text>
          {mode === 'week' ? (
            <Text style={styles.weekNum}>Uke {iso?.week}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {showCustodyToggle ? (
            <TouchableOpacity
              style={[styles.iconBtn, custodyOverlayActive && styles.custodyBtnOn]}
              onPress={onToggleCustodyOverlay}
              accessibilityLabel={custodyOverlayActive ? 'Skjul delt bosted' : 'Vis delt bosted'}
            >
              <Ionicons
                name={custodyOverlayActive ? 'home' : 'home-outline'}
                size={18}
                color={custodyOverlayActive ? colors.brand : colors.ink}
              />
            </TouchableOpacity>
          ) : null}
          <View style={styles.viewWrap}>
            <TouchableOpacity
              onPress={() => setViewOpen((v) => !v)}
              style={styles.viewBtn}
              accessibilityLabel="Visning"
            >
              <Text style={styles.viewBtnTxt}>{viewLabel}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.ink} />
            </TouchableOpacity>
            {viewOpen ? (
              <View style={styles.viewMenu}>
                {VIEWS.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => { setMode(v.id); setViewOpen(false); }}
                    style={[styles.viewItem, mode === v.id && styles.viewItemOn]}
                  >
                    <Text style={[styles.viewItemTxt, mode === v.id && styles.viewItemTxtOn]}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          {canCreate && canOpenSettings ? (
            <DeskBtn
              icon="settings-outline"
              label="Innstillinger"
              onPress={onSettings}
              accessibilityLabel="Kalenderinnstillinger"
            />
          ) : null}
        </View>
        {viewOpen ? (
          <Pressable style={styles.viewDismiss} onPress={() => setViewOpen(false)} />
        ) : null}

        {syncNotice?.message && canOpenSettings ? (
          <TouchableOpacity
            style={styles.syncBanner}
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel={syncNotice.message}
          >
            <Ionicons name="warning-outline" size={16} color="#92400e" />
            <Text style={styles.syncBannerTxt}>{syncNotice.message}</Text>
            <Text style={styles.syncBannerLink}>{syncNotice.reconnect ? 'Koble til' : 'Åpne'}</Text>
          </TouchableOpacity>
        ) : null}

        {custodyLegend}

        {mode === 'meals' ? (
          <View style={styles.mealsWrap}>{mealsBody}</View>
        ) : mode === 'month' ? (
          <View style={styles.monthWrap}>
            <View style={styles.monthHead}>
              {WEEKDAYS_LONG.map((d, i) => (
                <Text key={d} style={[styles.monthHeadTxt, (new Date().getDay() + 6) % 7 === i && styles.colTodayTxt]}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.monthBoard}>
              {grid.map((d) => {
                const k = dateKey(d);
                const { ev } = itemsForDay(d);
                const today = isToday(d);
                const selected = sameDay(d, anchor);
                const outside = !isSameMonth(d, anchor);
                const custodyTint = custodyOverlayActive && getCustodyOverlay
                  ? custodyCellTint(getCustodyOverlay(d), { selected, today })
                  : null;
                return (
                  <View key={k} style={[styles.monthCell, today && styles.monthCellToday, outside && { opacity: 0.45 }, custodyTint]}>
                    <View style={styles.monthCellTop}>
                      <TouchableOpacity
                        onPress={() => { setAnchor(d); setMode('day'); }}
                        style={[styles.monthNumBtn, today && styles.monthNumToday, selected && !today && styles.monthNumOn]}
                      >
                        <Text style={[styles.monthNum, today && styles.monthNumTodayTxt, selected && !today && styles.monthNumOnTxt]}>
                          {d.getDate()}
                        </Text>
                      </TouchableOpacity>
                      {canCreate ? (
                        <TouchableOpacity onPress={() => createAllDay(k)} hitSlop={6}>
                          <Text style={styles.monthAdd}>+</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {ev.slice(0, 4).map((e) => {
                      const surface = calendarEventSurface(e.color || FAMILY_CALENDAR_COLOR);
                      return (
                        <TouchableOpacity
                          key={eventKey(e)}
                          onPress={() => (canOpen(e) ? openEventForm(e) : setAnchor(d))}
                          style={[styles.monthChip, {
                            backgroundColor: surface.bg,
                            borderColor: surface.border,
                            borderLeftColor: surface.accent,
                          }]}
                        >
                          <Text style={[styles.monthChipTxt, { color: surface.ink }]} numberOfLines={1}>
                            {e.startTime ? `${e.startTime} ${e.title}` : e.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {ev.length > 4 ? <Text style={styles.monthMore}>+{ev.length - 4}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.weekWrap}>
            <View style={styles.colHeadRow}>
              <View style={styles.gutterHead} />
              {viewDays.map((d) => {
                const today = isToday(d);
                const selected = sameDay(d, anchor);
                const i = (d.getDay() + 6) % 7;
                const custodyTint = custodyOverlayActive && getCustodyOverlay
                  ? custodyCellTint(getCustodyOverlay(d), { selected, today })
                  : null;
                return (
                  <TouchableOpacity
                    key={dateKey(d)}
                    onPress={() => { setAnchor(d); if (mode === 'week') setMode('day'); }}
                    style={[styles.colHead, today && styles.colHeadToday, selected && !today && styles.colHeadOn, custodyTint]}
                  >
                    <Text style={[styles.colDow, today && styles.colTodayTxt]}>
                      {WEEKDAYS_LONG[i]} {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.allDayRow}>
              <Text style={styles.allDayLbl}>Heldag</Text>
              {viewDays.map((d) => {
                const k = dateKey(d);
                const allDay = itemsForDay(d).ev.filter(isAllDayEvent);
                return (
                  <View key={k} style={styles.allDayCell}>
                    {allDay.map((e) => {
                      const surface = calendarEventSurface(e.color || FAMILY_CALENDAR_COLOR);
                      return (
                        <TouchableOpacity
                          key={eventKey(e)}
                          onPress={() => (canOpen(e) ? openEventForm(e) : null)}
                          disabled={!canOpen(e)}
                          style={[styles.allDayChip, {
                            backgroundColor: surface.bg,
                            borderColor: surface.border,
                            borderLeftColor: surface.accent,
                          }]}
                        >
                          <Text style={[styles.allDayChipTxt, { color: surface.ink }]} numberOfLines={1}>{e.title}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {canCreate ? (
                      <TouchableOpacity style={styles.allDayAdd} onPress={() => createAllDay(k)}>
                        <Text style={styles.slotPlusTxt}>+</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={{ minHeight: (endHour - startHour) * HOUR_H + 8 }}
              showsVerticalScrollIndicator
            >
              <TimeGrid
                days={viewDays}
                itemsForDay={itemsForDay}
                startHour={startHour}
                endHour={endHour}
                now={now}
                canOpenEvent={canOpen}
                openEventForm={openEventForm}
                onCreateAt={createAt}
                canCreateCalendarEvent={canCreate}
                getCustodyOverlay={custodyOverlayActive ? getCustodyOverlay : null}
              />
            </ScrollView>
            <CalendarTaskPane
              days={viewDays}
              itemsForDay={paneItemsForDay}
              onOpenItem={onOpenPaneItem}
              onToggleItem={onTogglePaneItem}
              onCreateItem={onCreatePaneItem}
              canCreate={!!isParent && !!onCreatePaneItem}
              label={paneLabel || 'Oppgaver'}
              createLabel={paneCreateLabel || 'Ny oppgave'}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: 0, backgroundColor: colors.card },
  pane: {
    width: PANE_W, borderRightWidth: 1, borderRightColor: colors.line, backgroundColor: colors.card,
  },
  paneInner: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 20 },
  paneSectionRow: {
    marginTop: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  paneSection: {
    flex: 1, fontSize: 11, fontWeight: '800',
    color: colors.ink, letterSpacing: 0.2,
  },
  paneAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 4,
  },
  paneAddTxt: { fontSize: 12, fontWeight: '700', color: colors.brand },
  mini: { marginBottom: 10 },
  miniHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  miniNav: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  miniTitle: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 12, color: colors.ink },
  miniDowRow: { flexDirection: 'row' },
  miniDow: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700', color: colors.muted },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniCell: { width: `${100 / 7}%`, height: 26, alignItems: 'center', justifyContent: 'center' },
  miniNumWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  miniNumToday: { backgroundColor: colors.brand },
  miniNumSelected: { borderWidth: 1, borderColor: colors.brand },
  miniNum: { fontSize: 11, fontWeight: '600', color: colors.ink },
  miniNumOut: { color: '#94a3b8' },
  miniNumTodayTxt: { color: '#fff', fontWeight: '800' },
  miniNumSelectedTxt: { color: colors.brand, fontWeight: '800' },
  miniDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.brand, marginTop: -3 },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line, zIndex: 4,
  },
  todayBtn: {
    height: 28, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  todayBtnTxt: { fontWeight: '600', fontSize: 13, color: colors.ink },
  chev: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rangeLbl: { fontWeight: '600', fontSize: 15, color: colors.ink, marginLeft: 4 },
  weekNum: { fontWeight: '600', fontSize: 12, color: colors.muted, marginLeft: 8 },
  viewWrap: { position: 'relative', zIndex: 6 },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 28,
    paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  viewBtnTxt: { fontWeight: '600', fontSize: 13, color: colors.ink },
  viewMenu: {
    position: 'absolute', top: 32, right: 0, minWidth: 140, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, zIndex: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.12)' } : { elevation: 6 }),
  },
  viewItem: { paddingVertical: 8, paddingHorizontal: 12 },
  viewItemOn: { backgroundColor: colors.brandSoft },
  viewItemTxt: { fontWeight: '700', fontSize: 13, color: colors.ink },
  viewItemTxtOn: { color: colors.brand },
  viewDismiss: { ...StyleSheet.absoluteFillObject, zIndex: 3 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  syncBannerTxt: { flex: 1, color: '#9a3412', fontWeight: '700', fontSize: 12, lineHeight: 16 },
  syncBannerLink: { color: '#9a3412', fontWeight: '800', fontSize: 12 },
  iconBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  custodyBtnOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  mealsWrap: { flex: 1, minHeight: 0, paddingHorizontal: 12, paddingTop: 8 },
  weekWrap: { flex: 1, minHeight: 0 },
  colHeadRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  gutterHead: { width: GUTTER },
  colHead: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  colHeadToday: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  colHeadOn: { backgroundColor: '#f8fafc' },
  colDow: { fontSize: 13, fontWeight: '600', color: colors.ink, textTransform: 'lowercase' },
  colTodayTxt: { color: colors.brand, fontWeight: '800' },
  allDayRow: {
    flexDirection: 'row', minHeight: 28, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'stretch',
  },
  allDayLbl: {
    width: GUTTER, fontSize: 9, fontWeight: '700', color: colors.muted,
    textAlign: 'right', paddingRight: 6, paddingTop: 8,
  },
  allDayCell: { flex: 1, padding: 2, gap: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  allDayChip: { borderRadius: 4, borderWidth: 1, borderLeftWidth: 3, paddingHorizontal: 5, paddingVertical: 2 },
  allDayChipTxt: { fontSize: 11, fontWeight: '700' },
  allDayAdd: { alignSelf: 'flex-end', paddingHorizontal: 4 },
  scroll: { flex: 1, minHeight: 0 },
  gridBody: { flexDirection: 'row' },
  timeGutter: { width: GUTTER, position: 'relative' },
  timeLbl: {
    position: 'absolute', right: 6, fontSize: 10, fontWeight: '600', color: colors.muted, width: GUTTER - 10,
    textAlign: 'right',
  },
  lanes: { flex: 1, flexDirection: 'row', position: 'relative' },
  hourLine: {
    position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line, zIndex: 0,
  },
  halfLine: {
    position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
    backgroundColor: '#eef2f6', zIndex: 0,
  },
  lane: {
    flex: 1, minWidth: 0, position: 'relative', zIndex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line,
  },
  laneToday: { backgroundColor: '#f8fbff' },
  slot: { position: 'absolute', left: 0, right: 0, zIndex: 2 },
  slotPlus: {
    position: 'absolute', top: 2, right: 2, width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, opacity: Platform.OS === 'web' ? 0 : 0.55,
  },
  slotPlusTxt: { color: colors.brand, fontWeight: '800', fontSize: 12, lineHeight: 14 },
  evBlock: {
    position: 'absolute',
    zIndex: 5,
    paddingLeft: 1,
    paddingRight: 2,
    ...(Platform.OS === 'android' ? { elevation: 3 } : {}),
  },
  evInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  evInnerNarrow: { paddingHorizontal: 3, paddingVertical: 1 },
  evTime: { fontSize: 10, fontWeight: '800' },
  evTitle: { fontSize: 12, fontWeight: '700' },
  evTitleNarrow: { fontSize: 10, fontWeight: '700' },
  nowLine: {
    position: 'absolute', left: 0, right: 0, height: 2, zIndex: 7, flexDirection: 'row', alignItems: 'center',
  },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NOW_COLOR, marginLeft: -4 },
  nowHair: { flex: 1, height: 2, backgroundColor: NOW_COLOR },
  monthWrap: { flex: 1, minHeight: 0 },
  monthHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  monthHeadTxt: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.ink, textTransform: 'lowercase' },
  monthBoard: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: `${100 / 7}%`, minHeight: 96, padding: 4,
    borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  monthCellToday: { backgroundColor: '#f8fbff' },
  monthCellTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  monthNumBtn: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  monthNumToday: { backgroundColor: colors.brand },
  monthNumOn: { borderWidth: 1, borderColor: colors.brand },
  monthNum: { fontWeight: '700', fontSize: 12, color: colors.ink },
  monthNumTodayTxt: { color: '#fff' },
  monthNumOnTxt: { color: colors.brand },
  monthAdd: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  monthChip: { borderRadius: 3, borderWidth: 1, borderLeftWidth: 3, paddingHorizontal: 4, paddingVertical: 1, marginBottom: 2 },
  monthChipTxt: { fontSize: 11, fontWeight: '700' },
  monthMore: { fontSize: 10, fontWeight: '700', color: colors.muted },
});
