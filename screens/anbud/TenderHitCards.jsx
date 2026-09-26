import React, { useState } from 'react';
import {
  Linking, StyleSheet, Text, TextInput, TouchableOpacity, View,
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
        <Text style={{ color: colors.muted, fontSize: 13, alignSelf: 'center' }}>{rows.length} treff</Text>
      </View>
      {sortOpen ? (
        <View style={styles.tools}>
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
        </View>
      ) : null}
      {filtersOpen ? (
        <View style={[styles.filters, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {columns.map((col) => (
            <View key={col.key} style={styles.filterField}>
              <Text style={[styles.metaLabel, { color: colors.muted }]}>{col.label}</Text>
              <TextInput
                value={colFilter[col.key] || ''}
                onChangeText={(value) => onColFilter((current) => ({ ...current, [col.key]: value }))}
                placeholder="Filtrer"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`Filtrer ${col.label}`}
                style={[styles.filterInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ))}
        </View>
      ) : null}
      {rows.map((row) => {
        const open = openId === row.id;
        const aktuell = row.decision === 'aktuell';
        const uaktuell = row.decision === 'forkastet' || row.decision === 'arkiv';
        const soon = soonDeadline(row);
        const place = (row.places || []).join(', ');
        return (
          <View
            key={row.id}
            style={[styles.card, {
              borderColor: open || aktuell ? colors.brand : colors.line,
              backgroundColor: aktuell ? colors.brandSoft : colors.card,
            }]}
          >
            <TouchableOpacity
              onPress={() => onToggle(row.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${row.title}. ${sourceName(row)}. Publisert ${day(row.publishedAt)}. Frist ${day(row.deadline)}`}
              style={styles.cardBody}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.title, { color: colors.ink }]}>{row.title}</Text>
                <Text style={[styles.chevron, { color: colors.muted }]}>{open ? '▴' : '▾'}</Text>
              </View>
              <Text style={[styles.buyer, { color: colors.ink }]}>{row.buyer || '—'}</Text>
              <Text style={[styles.place, { color: colors.muted }]}>{place || '—'}</Text>
              <View style={styles.facts}>
                <Text style={[styles.fact, { color: colors.brand, fontWeight: '600' }]}>{sourceName(row)}</Text>
                <Text style={[styles.fact, { color: colors.muted }]}>·</Text>
                <Text style={[styles.fact, { color: colors.muted }]}>
                  Publisert <Text style={{ color: colors.ink }}>{day(row.publishedAt)}</Text>
                </Text>
                <Text style={[styles.fact, { color: colors.muted }]}>·</Text>
                <Text style={[styles.fact, { color: colors.muted }]}>
                  Frist <Text style={{ color: soon ? colors.danger : colors.ink, fontWeight: soon ? '600' : '400' }}>{day(row.deadline)}</Text>
                </Text>
              </View>
              <Text style={[styles.match, { color: colors.ink }]}>
                <Text style={{ color: colors.muted }}>Matcher </Text>
                {formatMatchLabel(row, matchWatch)}
              </Text>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => onMark(row.id, 'aktuell')}
                accessibilityRole="button"
                accessibilityLabel={`Merk ${row.title} som aktuell`}
                style={[styles.action, { backgroundColor: aktuell ? colors.brand : colors.sunken, borderColor: aktuell ? colors.brand : colors.line }]}
              >
                <Text style={{ color: aktuell ? '#fff' : colors.ink, fontSize: 14 }}>Aktuell</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onMark(row.id, 'forkastet')}
                accessibilityRole="button"
                accessibilityLabel={`Merk ${row.title} som uaktuell`}
                style={[styles.action, { backgroundColor: uaktuell ? colors.danger : colors.sunken, borderColor: uaktuell ? colors.danger : colors.line }]}
              >
                <Text style={{ color: uaktuell ? '#fff' : colors.ink, fontSize: 14 }}>Uaktuell</Text>
              </TouchableOpacity>
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
  list: { gap: 10, width: '100%' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tool: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  filters: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  filterField: { gap: 4 },
  filterInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  cardBody: { gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 21 },
  chevron: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  buyer: { fontSize: 14, fontWeight: '400' },
  place: { fontSize: 13, fontWeight: '400' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  fact: { fontSize: 13, fontWeight: '400' },
  match: { fontSize: 13, fontWeight: '400' },
  metaLabel: { fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  detail: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  interest: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
