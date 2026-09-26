import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../src/theme';
import { webDataSet } from '../src/desktop';
import { dateKey, isToday } from '../src/utils/dates';

const GUTTER = 56;
const MIN_H = 88;
const MAX_H = 320;
const DEFAULT_H = 152;
const COLLAPSED_H = 32;
const HEIGHT_KEY = 'wp-cal-task-pane-height';
const COLLAPSED_KEY = 'wp-cal-task-pane-collapsed';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function PaneRow({ item, onOpen, onToggle }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowBody}
        onPress={() => onOpen?.(item)}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        {item.meta ? (
          <Text style={styles.rowMeta} numberOfLines={1}>{item.meta}</Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onToggle?.(item)}
        hitSlop={6}
        accessibilityLabel={item.kind === 'chore' ? 'Marker gjøremål ferdig' : 'Marker oppgave ferdig'}
        disabled={!onToggle}
      >
        <Ionicons
          name="flag"
          size={12}
          color={item.overdue ? colors.danger : '#94a3b8'}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function CalendarTaskPane({
  days = [],
  itemsForDay,
  onOpenItem,
  onToggleItem,
  onCreateItem,
  canCreate = false,
  label = 'Oppgaver',
  createLabel,
  columnInset = 0,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(DEFAULT_H);
  const heightRef = useRef(DEFAULT_H);
  heightRef.current = height;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, h] = await Promise.all([
          AsyncStorage.getItem(COLLAPSED_KEY),
          AsyncStorage.getItem(HEIGHT_KEY),
        ]);
        if (!alive) return;
        if (c === '1') setCollapsed(true);
        const n = Number(h);
        if (Number.isFinite(n)) setHeight(clamp(n, MIN_H, MAX_H));
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const persistCollapsed = (next) => {
    setCollapsed(next);
    AsyncStorage.setItem(COLLAPSED_KEY, next ? '1' : '0').catch(() => {});
  };

  const onDragStart = (evt) => {
    if (Platform.OS !== 'web' || collapsed) return;
    const startY = evt?.nativeEvent?.pageY;
    if (typeof startY !== 'number') return;
    const startH = heightRef.current;
    const move = (e) => {
      setHeight(clamp(startH + (startY - e.pageY), MIN_H, MAX_H));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      AsyncStorage.setItem(HEIGHT_KEY, String(heightRef.current)).catch(() => {});
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const paneH = collapsed ? COLLAPSED_H : height;
  const addLabel = createLabel || (label === 'Oppgaver' ? 'Ny oppgave' : `Nytt ${String(label).toLowerCase()}`);

  return (
    <View style={[styles.wrap, { height: paneH }]} accessibilityLabel={label}>
      <View style={styles.split}>
        <View
          style={styles.drag}
          onMouseDown={onDragStart}
          accessibilityLabel={`Endre høyde på ${label.toLowerCase()}-felt`}
        />
        <TouchableOpacity
          style={styles.chev}
          onPress={() => persistCollapsed(!collapsed)}
          accessibilityLabel={collapsed ? `Vis ${label.toLowerCase()}` : `Skjul ${label.toLowerCase()}`}
        >
          <Ionicons
            name={collapsed ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.muted}
          />
        </TouchableOpacity>
      </View>
      {collapsed ? null : (
        <View style={[styles.body, columnInset > 0 ? { paddingRight: columnInset } : null]}>
          <View style={styles.gutter}>
            <Text style={styles.gutterLbl}>{label}</Text>
          </View>
          <View style={styles.main}>
            <Text style={styles.filterLbl}>Vis etter: Forfallsdato</Text>
            <View style={styles.cols}>
              {days.map((d) => {
                const k = dateKey(d);
                const items = itemsForDay?.(d) || [];
                const today = isToday(d);
                return (
                  <View
                    key={k}
                    style={[styles.col, today && styles.colToday]}
                    {...webDataSet({ wpCalCol: 'task' })}
                  >
                    <ScrollView style={styles.colScroll} nestedScrollEnabled>
                      {items.map((item) => (
                        <PaneRow
                          key={item.key}
                          item={item}
                          onOpen={onOpenItem}
                          onToggle={onToggleItem}
                        />
                      ))}
                    </ScrollView>
                    {canCreate ? (
                      <TouchableOpacity
                        style={styles.add}
                        onPress={() => onCreateItem?.(k)}
                        accessibilityLabel={addLabel}
                      >
                        <Text style={styles.addTxt}>+</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    flexShrink: 0,
    overflow: 'hidden',
  },
  split: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  drag: {
    flex: 1,
    height: 16,
    cursor: Platform.OS === 'web' ? 'ns-resize' : undefined,
  },
  chev: {
    width: 28,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  gutter: {
    width: GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  gutterLbl: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.ink,
    letterSpacing: 0.6,
    transform: [{ rotate: '-90deg' }],
    width: 96,
    textAlign: 'center',
  },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  filterLbl: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.muted,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  cols: { flex: 1, flexDirection: 'row', minWidth: 0, minHeight: 0 },
  col: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.line,
  },
  colToday: { backgroundColor: '#f8fbff' },
  colScroll: { flex: 1, minHeight: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f6',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 11, fontWeight: '400', color: colors.ink },
  rowMeta: { fontSize: 9, fontWeight: '400', color: colors.muted, marginTop: 1 },
  add: { alignSelf: 'flex-end', paddingHorizontal: 6, paddingVertical: 2 },
  addTxt: { color: colors.brand, fontWeight: '400', fontSize: 14, lineHeight: 16 },
});
