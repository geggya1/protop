import React, { useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { directoryFacetCounts, filterHrDirectory } from '../../src/hr/directory';
import { EmptyHint, HrChip } from './HrShared';

export function useHrDirectory(employees) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [kind, setKind] = useState('all');
  const counts = useMemo(
    () => directoryFacetCounts(employees, { status, kind }),
    [employees, status, kind],
  );
  const rows = useMemo(
    () => filterHrDirectory(employees, { query, status, kind }),
    [employees, query, status, kind],
  );
  return {
    query, setQuery, status, setStatus, kind, setKind, rows, counts,
  };
}

export function HrFilterBar({
  colors, query, onQuery, status, onStatus, kind, onKind, counts,
}) {
  return (
    <View style={styles.filters} nativeID="hr-filters">
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder="Søk etter navn, tittel eller e-post"
        placeholderTextColor={colors.muted}
        style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      <View style={styles.chips}>
        <HrChip
          colors={colors}
          label={`Aktive · ${counts.active}`}
          active={status === 'active'}
          onPress={() => onStatus('active')}
        />
        <HrChip
          colors={colors}
          label={`Deaktiverte · ${counts.inactive}`}
          active={status === 'inactive'}
          onPress={() => onStatus('inactive')}
        />
        <HrChip
          colors={colors}
          label={`Intern · ${counts.internal}`}
          active={kind === 'internal'}
          onPress={() => onKind(kind === 'internal' ? 'all' : 'internal')}
        />
        <HrChip
          colors={colors}
          label={`Ekstern · ${counts.external}`}
          active={kind === 'external'}
          onPress={() => onKind(kind === 'external' ? 'all' : 'external')}
        />
      </View>
    </View>
  );
}

export function HrTable({
  colors, columns, rows, onPressRow, emptyText, rowKey,
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator nativeID="hr-table">
      <View>
        <View style={[styles.head, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          {columns.map((col) => (
            <Text key={col.key} style={[styles.th, { width: col.width, color: colors.muted }]}>
              {col.label}
            </Text>
          ))}
        </View>
        {rows.length === 0 ? (
          <EmptyHint colors={colors} text={emptyText || 'Ingen treff.'} />
        ) : rows.map((row) => (
          <Pressable
            key={rowKey(row)}
            onPress={() => onPressRow?.(row)}
            style={[styles.tr, { borderColor: colors.line }]}
          >
            {columns.map((col) => {
              const value = col.value(row);
              const warn = col.warn?.(row);
              return (
                <Text
                  key={col.key}
                  numberOfLines={2}
                  style={[
                    styles.td,
                    {
                      width: col.width,
                      color: warn ? (colors.danger || '#b91c1c') : colors.ink,
                      fontWeight: col.key === 'name' ? '600' : '400',
                    },
                  ]}
                >
                  {value}
                </Text>
              );
            })}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 10 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  head: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  th: { fontSize: 12, fontWeight: '600', paddingRight: 12 },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  td: { fontSize: 14, lineHeight: 18, paddingRight: 12 },
});
