import React, { useState } from 'react';
import {
  Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { formatMatchLabel, formatWhen } from '../../src/anbud/model';

function day(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw ? formatWhen(raw) : '—';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function sourceName(row) {
  return row.source === 'ted' ? 'TED' : 'Doffin';
}

function soonDeadline(row) {
  return !!(row.deadline && new Date(row.deadline).getTime() - Date.now() < 14 * 86400000);
}

export default function TenderHitCards({
  rows,
  columns,
  colors,
  sort,
  onSort,
  colFilter,
  onColFilter,
  openId,
  onToggle,
  onMark,
  onInterest,
  matchWatch,
  archiveOn,
  syncing,
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeSort = columns.find((col) => col.key === sort.key) || columns[0];
  const sortArrow = sort.dir === 'asc' ? '↑' : '↓';
  const activeFilters = columns.filter((col) => String(colFilter[col.key] || '').trim()).length;

  function pressSort(col) {
    onSort((current) => (
      current.key === col.key
        ? { key: col.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: col.kind === 'date' ? 'desc' : 'asc' }
    ));
  }

  return (
    <View style={styles.list}>
      <View style={styles.tools}>
        <TouchableOpacity
          onPress={() => setSortOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={`Sorter på ${activeSort?.label || 'Publisert'}`}
          style={[styles.tool, { backgroundColor: sortOpen ? colors.brand : colors.sunken }]}
        >
          <Text style={{ color: sortOpen ? '#fff' : colors.ink, fontSize: 13 }}>
            Sorter: {activeSort?.label} {sortArrow}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFiltersOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel="Kolonnefilter"
          style={[styles.tool, { backgroundColor: filtersOpen || activeFilters ? colors.brand : colors.sunken }]}
        >
          <Text style={{ color: filtersOpen || activeFilters ? '#fff' : colors.ink, fontSize: 13 }}>
            Kolonnefilter{activeFilters ? ` (${activeFilters})` : ''}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{rows.length} treff</Text>
      </View>
      {sortOpen ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.toolScroll}
          contentContainerStyle={styles.toolScrollContent}
        >
          {columns.map((col) => {
            const on = sort.key === col.key;
            return (
              <TouchableOpacity
                key={col.key}
                onPress={() => pressSort(col)}
                accessibilityRole="button"
                accessibilityLabel={`Sorter på ${col.label}`}
                style={[styles.tool, { backgroundColor: on ? colors.brand : colors.sunken }]}
              >
                <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>
                  {col.label}{on ? ` ${sortArrow}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
      {filtersOpen ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.toolScroll}
          contentContainerStyle={styles.toolScrollContent}
        >
          {columns.map((col) => (
            <View key={col.key} style={styles.filterField}>
              <Text style={[styles.filterLabel, { color: colors.muted }]}>{col.label}</Text>
              <TextInput
                value={colFilter[col.key] || ''}
                onChangeText={(value) => onColFilter((current) => ({ ...current, [col.key]: value }))}
                placeholder="Filtrer"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`Filtrer ${col.label}`}
                style={[styles.filterInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
      {rows.map((row) => {
        const open = openId === row.id;
        const aktuell = row.decision === 'aktuell';
        const uaktuell = row.decision === 'forkastet' || row.decision === 'arkiv';
        const soon = soonDeadline(row);
        const place = Array.isArray(row.places) ? row.places.filter(Boolean).join(', ') : String(row.places || '');
        const match = formatMatchLabel(row, matchWatch);
        return (
          <View
            key={row.id}
            style={[styles.card, {
              borderColor: open || aktuell ? colors.brand : colors.line,
              backgroundColor: aktuell ? colors.brandSoft : colors.card,
            }]}
          >
            <View style={styles.cardRow}>
              <TouchableOpacity
                onPress={() => onToggle(row.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${row.title}. ${sourceName(row)}. Publisert ${day(row.publishedAt)}. Frist ${day(row.deadline)}`}
                style={styles.cardBody}
              >
                <Text style={[styles.title, { color: colors.ink }]} numberOfLines={open ? undefined : 2}>{row.title}</Text>
                <Text style={[styles.buyer, { color: colors.ink }]} numberOfLines={1}>
                  {row.buyer || '—'}
                  <Text style={{ color: colors.muted }}>{` · ${place || '—'}`}</Text>
                </Text>
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                  <Text style={{ color: soon ? colors.danger : colors.ink, fontWeight: soon ? '600' : '400' }}>
                    {`Frist ${day(row.deadline)}`}
                  </Text>
                  {` · `}
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>{sourceName(row)}</Text>
                  {` · ${day(row.publishedAt)}`}
                </Text>
                <Text style={[styles.meta, { color: colors.ink }]} numberOfLines={1}>
                  <Text style={{ color: colors.muted }}>Matcher </Text>
                  {match}
                </Text>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => onMark(row.id, 'aktuell')}
                  accessibilityRole="button"
                  accessibilityLabel={`Merk ${row.title} som aktuell`}
                  style={[styles.action, { backgroundColor: aktuell ? colors.brand : colors.sunken, borderColor: aktuell ? colors.brand : colors.line }]}
                >
                  <Text style={{ color: aktuell ? '#fff' : colors.ink, fontSize: 13 }}>Aktuell</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onMark(row.id, 'forkastet')}
                  accessibilityRole="button"
                  accessibilityLabel={`Merk ${row.title} som uaktuell`}
                  style={[styles.action, { backgroundColor: uaktuell ? colors.danger : colors.sunken, borderColor: uaktuell ? colors.danger : colors.line }]}
                >
                  <Text style={{ color: uaktuell ? '#fff' : colors.ink, fontSize: 13 }}>Uaktuell</Text>
                </TouchableOpacity>
              </View>
            </View>
            {open ? (
              <View style={[styles.detail, { borderTopColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>{row.description || row.noticeType || 'Ingen utdrag.'}</Text>
                <TouchableOpacity onPress={() => row.url && Linking.openURL(row.url)} accessibilityRole="link">
                  <Text style={{ color: colors.brand }}>Åpne kunngjøringen</Text>
                </TouchableOpacity>
                {aktuell ? (
                  <TouchableOpacity onPress={() => onInterest(row.id)} accessibilityRole="button" style={[styles.interest, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: '#fff' }}>Meld interesse</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {!rows.length ? (
        <Text style={{ color: colors.muted, padding: 8 }}>
          {archiveOn ? 'Arkivet er tomt.' : (syncing ? 'Henter treff …' : 'Ingen treff i listen. Oppdater for å søke.')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tool: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  toolScroll: { width: '100%', maxWidth: '100%', flexGrow: 0 },
  toolScrollContent: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 2 },
  filterField: { width: 148, gap: 4 },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  filterInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 8, width: '100%', maxWidth: '100%' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  buyer: { fontSize: 13, fontWeight: '400' },
  meta: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  actions: { width: 92, gap: 6 },
  action: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  detail: { borderTopWidth: 1, paddingTop: 8, gap: 8 },
  interest: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
