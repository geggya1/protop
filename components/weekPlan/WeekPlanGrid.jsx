import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLayout } from '../../src/theme';
import {
  WEEKPLAN_DAYS,
  WEEKPLAN_DAY_KEYS,
  timetableToGridEvents,
  weekPlanHourRange,
  formatSlotRange,
  layoutWeekPlanDay,
  isScheduleBreak,
} from '../../src/utils/weekPlanGrid';
import { subjectStyle } from '../../src/utils/weekPlanView';

const HOUR_H = 58;
const TIME_GUTTER = 46;

export default function WeekPlanGrid({ timetable, colors, onPressSlot, canEdit, weekDays }) {
  const { isDesktop, isPhone } = useLayout();
  const events = useMemo(() => timetableToGridEvents(timetable), [timetable]);
  const { startHour, endHour } = useMemo(() => weekPlanHourRange(timetable), [timetable]);
  const hours = Math.max(1, endHour - startHour);
  const gridH = hours * HOUR_H;
  const minDayW = isPhone ? 96 : 114;
  const heads = weekDays || WEEKPLAN_DAYS;

  const byDay = useMemo(() => {
    const map = {};
    WEEKPLAN_DAY_KEYS.forEach((day) => {
      map[day] = layoutWeekPlanDay(events.filter((e) => e.day === day));
    });
    return map;
  }, [events]);

  return (
    <ScrollView
      horizontal={!isDesktop}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ minWidth: isDesktop ? '100%' : TIME_GUTTER + minDayW * 5 }}
    >
      <View style={{ flex: 1, minWidth: isDesktop ? undefined : TIME_GUTTER + minDayW * 5 }}>
        <View style={gridStyles.headerRow}>
          <View style={[gridStyles.gutter, { width: TIME_GUTTER }]} />
          {heads.map((d) => (
            <View key={d.key} style={gridStyles.dayHead}>
              <Text style={[gridStyles.dayHeadTxt, { color: colors.ink }]}>{d.short}</Text>
              {d.date ? (
                <Text style={[gridStyles.dayHeadDate, { color: colors.muted }]}>
                  {d.date.getDate()}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <View style={[gridStyles.bodyRow, { height: gridH }]}>
          <View style={[gridStyles.gutter, { width: TIME_GUTTER, height: gridH }]}>
            {Array.from({ length: hours }, (_, i) => (
              <Text
                key={startHour + i}
                style={[gridStyles.hourLbl, { color: colors.muted, top: i * HOUR_H - 7 }]}
              >
                {`${String(startHour + i).padStart(2, '0')}:00`}
              </Text>
            ))}
          </View>
          {WEEKPLAN_DAYS.map((d) => (
            <View
              key={d.key}
              style={[gridStyles.dayCol, { borderColor: colors.line, height: gridH }]}
            >
              {Array.from({ length: hours }, (_, i) => (
                <View
                  key={i}
                  style={[gridStyles.hourLine, { top: i * HOUR_H, borderColor: colors.line }]}
                />
              ))}
              {(byDay[d.key] || []).map((laid) => {
                const top = ((laid.start - startHour * 60) / 60) * HOUR_H;
                const isBreak = laid.isBreak || isScheduleBreak(laid.event.title);
                const style = subjectStyle(laid.event.title);
                const minBlockH = isBreak ? 20 : 32;
                const height = Math.max(minBlockH, ((laid.end - laid.start) / 60) * HOUR_H - 6);
                const widthPct = 100 / laid.colCount;
                return (
                  <TouchableOpacity
                    key={laid.event.id}
                    style={[
                      gridStyles.block,
                      isBreak && gridStyles.breakBlock,
                      {
                        top: top + 2,
                        height,
                        left: isBreak ? 2 : `${laid.col * widthPct}%`,
                        width: isBreak ? undefined : `${widthPct}%`,
                        right: isBreak ? 2 : undefined,
                        zIndex: isBreak ? 2 : 1,
                        backgroundColor: style.soft,
                        borderColor: style.color,
                      },
                    ]}
                    onPress={() => canEdit && onPressSlot?.(d.key, laid.event)}
                    activeOpacity={canEdit ? 0.8 : 1}
                    disabled={!canEdit}
                  >
                    <Text
                      style={[gridStyles.blockTime, { color: style.color }]}
                      numberOfLines={1}
                    >
                      {formatSlotRange(laid.event)}
                    </Text>
                    <Text
                      style={[
                        gridStyles.blockTitle,
                        isBreak && gridStyles.breakTitle,
                        { color: colors.ink },
                      ]}
                      numberOfLines={isBreak ? 1 : 2}
                    >
                      {laid.event.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const gridStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  gutter: { position: 'relative' },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 1 },
  dayHeadTxt: { fontWeight: '500', fontSize: 13 },
  dayHeadDate: { fontWeight: '400', fontSize: 11 },
  bodyRow: { flexDirection: 'row' },
  hourLbl: {
    position: 'absolute',
    left: 0,
    fontSize: 10,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  dayCol: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  block: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 3,
  },
  breakBlock: {
    paddingVertical: 2,
    borderRadius: 8,
  },
  blockTime: { fontSize: 10, fontWeight: '500' },
  blockTitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  breakTitle: { fontSize: 10, fontWeight: '500', textTransform: 'capitalize' },
});
