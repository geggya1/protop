import React from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ProgressRing, ColorGlyph, AvatarGlyph, CheckCircle, PillRow,
} from './WidgetChrome';
import {
  groceryVisual, eventVisual, personTint, placeText,
} from '../../src/utils/homeWidgetVisuals';
import { soft } from '../parentHome/softTheme';

const sans = Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined;
const chevron = soft.muted;

export function EmptyHint({ text }) {
  return (
    <View style={styles.emptyHint}>
      <Text style={styles.emptyHintTxt}>{text}</Text>
    </View>
  );
}

export function GroceryRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 4);
  return (
    <View style={styles.stack}>
      {shown.map((it) => {
        const vis = groceryVisual(it.title);
        return (
          <PillRow key={it.id || it.title}>
            <ColorGlyph icon={vis.icon} bg={vis.bg} color={vis.color} />
            <Text style={[styles.rowTitle, it.done && styles.struck]} numberOfLines={1}>
              {it.title}
            </Text>
            <CheckCircle done={!!it.done} />
          </PillRow>
        );
      })}
    </View>
  );
}

export function ChatRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View style={styles.stack}>
      {shown.map((m, i) => (
        <PillRow key={m.id || m.name}>
          <View>
            <AvatarGlyph name={m.name} tint={m.tint || personTint(i)} size={36} />
            <View style={styles.bubbleDot}>
              <Ionicons name="chatbubble" size={9} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{m.name}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>{m.preview}</Text>
          </View>
          <Text style={styles.timeMuted}>{m.time}</Text>
          <Ionicons name="chevron-forward" size={14} color={chevron} />
        </PillRow>
      ))}
    </View>
  );
}

export function CalendarEventRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View style={styles.stack}>
      {shown.map((ev) => {
        const vis = eventVisual(ev.title, ev.color);
        return (
          <PillRow key={ev.id || ev.title}>
            <View style={styles.timeStack}>
              <Text style={styles.timeBold}>{ev.time || 'Heldag'}</Text>
              {ev.end ? <Text style={styles.timeEnd}>{ev.end}</Text> : null}
            </View>
            <View style={[styles.colorBar, { backgroundColor: vis.bar }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{ev.title}</Text>
              {placeText(ev.place) ? (
                <View style={styles.placeRow}>
                  <Ionicons name="location-outline" size={11} color={soft.muted} />
                  <Text style={styles.rowMeta} numberOfLines={1}>{placeText(ev.place)}</Text>
                </View>
              ) : null}
            </View>
            <ColorGlyph icon={vis.icon} bg={soft.lavender} color={soft.ink} size={30} radius={9} />
          </PillRow>
        );
      })}
    </View>
  );
}

export function MealRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View style={styles.stack}>
      {shown.map((m) => (
        <PillRow key={m.id || m.title} style={{ paddingLeft: 0, overflow: 'hidden' }}>
          <View style={[styles.mealStripe, { backgroundColor: m.accent || '#E8A317' }]} />
          <ColorGlyph icon={m.icon || 'restaurant'} bg={m.bg} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>{m.meta}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={chevron} />
        </PillRow>
      ))}
    </View>
  );
}

export function TimelineRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View style={styles.stack}>
      {shown.map((ev) => {
        const vis = eventVisual(ev.title, ev.color);
        return (
          <PillRow key={ev.id || ev.title}>
            <Text style={styles.timeBold}>{ev.time || 'Heldag'}</Text>
            <View style={styles.vLine} />
            <ColorGlyph icon={vis.icon} bg={vis.bg} />
            <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{ev.title}</Text>
            <Ionicons name="chevron-forward" size={14} color={chevron} />
          </PillRow>
        );
      })}
    </View>
  );
}

export function TaskBody({ items = [], done = 0, total = 0, compact }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
        </View>
        <Text style={styles.pctTxt}>{pct} %</Text>
      </View>
      <View style={[styles.stack, { marginTop: 10 }]}>
        {shown.map((t) => (
          <View key={t.id || t.title} style={styles.taskRow}>
            <CheckCircle done={!!t.done} size={22} />
            <Text style={[styles.rowTitle, { flex: 1 }, t.done && styles.struck]} numberOfLines={1}>
              {t.title}
            </Text>
            {t.meta ? <Text style={styles.timeMuted}>{t.meta}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function PeopleGrid({ people = [], compact = false, columns }) {
  const list = people || [];
  const cols = columns || (compact || list.length > 2 ? 2 : Math.min(list.length || 1, 4));
  return (
    <ScrollView
      style={styles.peopleScroll}
      contentContainerStyle={styles.peopleScrollBody}
      showsVerticalScrollIndicator={list.length > cols}
      nestedScrollEnabled
    >
      <View style={styles.grid}>
        {list.map((p, i) => (
          <View
            key={p.id || p.name}
            style={[styles.personTile, { flexBasis: `${Math.floor(100 / Math.max(1, cols)) - 2}%` }]}
          >
            <View style={[styles.personIcon, { backgroundColor: p.tint || personTint(i) }]}>
              <Ionicons name="person" size={18} color="#fff" />
            </View>
            <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
            {placeText(p.meta) ? (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: p.busy ? '#F5A524' : '#34C759' }]} />
                <Text style={styles.personMeta} numberOfLines={1}>{placeText(p.meta)}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function WeekOverview({ days = [], stats, progressLabel, progressValue = 0 }) {
  return (
    <View>
      <View style={styles.weekRow}>
        {days.map((d) => (
          <View key={d.id || d.label} style={styles.weekCol}>
            <Text style={styles.weekLbl}>{d.label}</Text>
            {(d.items || []).slice(0, 3).map((it, i) => (
              <View key={`${d.label}-${i}`} style={styles.weekItem}>
                <View style={[styles.weekDot, { backgroundColor: it.color || '#34C759' }]} />
                <Text style={styles.weekHint} numberOfLines={1}>{it.label}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {stats ? (
        <View style={styles.statsPill}>
          <Text style={styles.statsTxt}>{stats}</Text>
          <ProgressRing
            value={progressValue}
            max={100}
            label={progressLabel}
            size={48}
          />
        </View>
      ) : null}
    </View>
  );
}

export function NoteCards({ items = [], compact }) {
  const shown = items.slice(0, compact ? 1 : 2);
  return (
    <View style={styles.stack}>
      {shown.map((n) => (
        <PillRow key={n.id || n.title} style={n.highlight ? styles.noteHi : null}>
          <ColorGlyph
            icon="document-text"
            bg={n.highlight ? '#F2E38A' : soft.sky}
            color={n.highlight ? '#6B5A18' : soft.ink}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>{n.meta}</Text>
          </View>
        </PillRow>
      ))}
    </View>
  );
}

export function LocationRows({ people = [] }) {
  const shown = people || [];
  return (
    <ScrollView
      style={styles.peopleScroll}
      contentContainerStyle={styles.stack}
      showsVerticalScrollIndicator={shown.length > 2}
      nestedScrollEnabled
    >
      {shown.map((p, i) => (
        <PillRow key={p.id || p.name}>
          <View style={[styles.pinAvatar, { backgroundColor: p.tint || personTint(i) }]}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>{placeText(p.meta) || 'Ukjent sted'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={chevron} />
        </PillRow>
      ))}
    </ScrollView>
  );
}

export function InfoRows({ items = [], compact }) {
  const shown = items.slice(0, compact ? 2 : 3);
  return (
    <View style={styles.stack}>
      {shown.map((row) => (
        row.progress != null ? (
          <InfoProgressRow
            key={row.id || row.title}
            title={row.title}
            meta={row.meta}
            label={row.progress}
            value={row.progressValue}
            max={row.progressMax}
          />
        ) : (
          <PillRow key={row.id || row.title}>
            <ColorGlyph icon={row.icon || 'ellipse'} bg={row.bg || '#2F80ED'} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
              {placeText(row.meta) ? <Text style={styles.rowMeta} numberOfLines={1}>{placeText(row.meta)}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={chevron} />
          </PillRow>
        )
      ))}
    </View>
  );
}

export function InfoProgressRow({ title, meta, label, value = 1, max = 1 }) {
  return (
    <PillRow>
      <ProgressRing value={value} max={max} label={label} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {placeText(meta) ? <Text style={styles.rowMeta} numberOfLines={1}>{placeText(meta)}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={chevron} />
    </PillRow>
  );
}

export function TimedIconRows({ items = [] }) {
  return (
    <View style={styles.stack}>
      {items.map((ev) => {
        const vis = eventVisual(ev.title, ev.color);
        const isProgress = ev.progress != null;
        if (isProgress) {
          return (
            <InfoProgressRow
              key={ev.id || ev.title}
              title={ev.title}
              meta={ev.meta}
              label={ev.progress}
              value={ev.progressValue}
              max={ev.progressMax}
            />
          );
        }
        const duration = ev.time && !/^\d{1,2}:\d{2}$/.test(String(ev.time));
        return (
          <PillRow key={ev.id || ev.title}>
            {ev.time ? (
              duration ? (
                <View style={styles.durationChip}>
                  <Ionicons name="time" size={12} color="#fff" />
                  <Text style={styles.durationTxt}>{ev.time}</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.timeBold}>{ev.time}</Text>
                  <View style={styles.vLine} />
                </>
              )
            ) : null}
            {duration ? <View style={styles.vLine} /> : null}
            <ColorGlyph icon={ev.icon || vis.icon} bg={ev.bg || vis.bg} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{ev.title}</Text>
              {ev.meta ? <Text style={styles.rowMeta} numberOfLines={1}>{ev.meta}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={chevron} />
          </PillRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  rowTitle: { flex: 1, fontSize: 14, color: soft.ink, fontFamily: sans, fontWeight: '500' },
  rowMeta: { fontSize: 12, color: soft.muted, fontFamily: sans, marginTop: 1 },
  struck: { textDecorationLine: 'line-through', color: soft.quiet },
  timeMuted: { fontSize: 12, color: soft.muted, fontFamily: sans },
  timeBold: {
    width: 46, fontSize: 14, color: soft.ink, fontWeight: '600', fontFamily: sans, fontVariant: ['tabular-nums'],
  },
  timeEnd: { fontSize: 12, color: soft.muted, fontFamily: sans, fontVariant: ['tabular-nums'] },
  timeStack: { width: 46 },
  colorBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginVertical: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mealStripe: { width: 4, alignSelf: 'stretch', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  vLine: { width: 1, height: 18, backgroundColor: soft.line },
  durationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1F8A4C', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5,
  },
  durationTxt: { fontSize: 12, color: '#fff', fontWeight: '600', fontFamily: sans },
  bubbleDot: {
    position: 'absolute', right: -3, bottom: -2, width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#2F80ED', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: {
    flex: 1, height: 8, borderRadius: 999, backgroundColor: soft.cream, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#34C759', borderRadius: 999 },
  pctTxt: { fontSize: 13, color: soft.muted, width: 40, textAlign: 'right', fontFamily: sans },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28, paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  peopleScroll: { flex: 1, minHeight: 0 },
  peopleScrollBody: { flexGrow: 1 },
  personTile: {
    flexGrow: 1, flexShrink: 1, minWidth: 0, alignItems: 'center',
    backgroundColor: soft.cream, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 6,
  },
  personIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 3,
  },
  personName: {
    fontSize: 12, color: soft.ink, fontFamily: sans, fontWeight: '500',
    width: '100%', textAlign: 'center', minWidth: 0,
  },
  personMeta: { fontSize: 11, color: soft.muted, fontFamily: sans, flexShrink: 1, minWidth: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, maxWidth: '100%' },
  statusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  weekRow: { flexDirection: 'row', gap: 5 },
  weekCol: {
    flex: 1, minWidth: 0, backgroundColor: soft.cream,
    borderRadius: 10, padding: 5, minHeight: 56,
  },
  weekLbl: { fontSize: 12, color: soft.ink, fontWeight: '600', marginBottom: 6, fontFamily: sans },
  weekItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  weekDot: { width: 6, height: 6, borderRadius: 3 },
  weekHint: { fontSize: 10, color: soft.muted, fontFamily: sans, flex: 1 },
  statsPill: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: soft.cream, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  statsTxt: { flex: 1, fontSize: 13, color: soft.ink, fontFamily: sans },
  noteHi: { backgroundColor: 'rgba(242,227,138,0.35)' },
  pinAvatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  emptyHint: {
    minHeight: 52, borderRadius: 16, backgroundColor: soft.cream,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 12,
  },
  emptyHintTxt: { fontSize: 14, color: soft.muted, textAlign: 'center' },
});
