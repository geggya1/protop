import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { economyContractRows } from '../../src/economy/desk';
import { useLayout } from '../../src/theme';

const COLUMNS = [
  { key: 'oppdragId', label: 'Oppdrags-ID', width: 108 },
  { key: 'title', label: 'Oppdrag', flex: true, grow: 1.4, minWidth: 200 },
  { key: 'buyer', label: 'Kunde', flex: true, grow: 1, minWidth: 160 },
  { key: 'period', label: 'Periode', width: 210 },
  { key: 'valueLabel', label: 'Sum', width: 120 },
  { key: 'owner', label: 'Ansvarlig', width: 132 },
  { key: 'status', label: 'Status', width: 92 },
];

const TABLE_MIN = COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width), 0);

function phoneFacts(row) {
  return [
    row.oppdragId && row.oppdragId !== '—' ? `Oppdrag ${row.oppdragId}` : '',
    row.period && row.period !== '—' ? row.period : '',
    row.valueLabel && row.valueLabel !== '—' ? row.valueLabel : '',
    row.status || '',
    row.owner && row.owner !== '—' ? row.owner : '',
  ].filter(Boolean);
}

export default function EconomyContracts({
  customers = [],
  contracts = [],
  people = [],
  onOpenRegister,
  onOpenContract,
  onOpenIndex,
}) {
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < TABLE_MIN;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const rows = useMemo(
    () => economyContractRows(customers, contracts, people, query),
    [customers, contracts, people, query],
  );
  const selected = contracts.find((row) => row.id === selectedId) || null;

  const table = rows.length ? (
    <View
      nativeID="economy-contracts-table"
      style={[
        styles.tableWrap,
        stackRows ? styles.tableWrapPhone : styles.tableWrapWide,
        { borderColor: colors.line, backgroundColor: colors.card },
      ]}
    >
      {stackRows ? rows.map((row, index) => {
        const on = row.contractId === selectedId;
        return (
          <TouchableOpacity
            key={row.key}
            onPress={() => setSelectedId(row.contractId)}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            style={[
              styles.phoneRow,
              {
                borderBottomColor: colors.line,
                backgroundColor: on
                  ? (colors.brandSoft || colors.bg)
                  : (index % 2 ? (colors.sunken || colors.bg) : colors.card),
              },
            ]}
          >
            <Text style={[styles.phoneName, { color: colors.ink }]}>{row.title}</Text>
            <Text style={[styles.phoneParty, { color: colors.ink }]}>{row.buyer}</Text>
            <View style={styles.phoneMetaRow}>
              {phoneFacts(row).map((fact, factIndex) => (
                <Text key={fact} style={[styles.phoneMeta, { color: colors.muted }]}>
                  {factIndex ? `· ${fact}` : fact}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        );
      }) : (
        <>
          <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {COLUMNS.map((column) => (
              <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
            ))}
          </View>
          {rows.map((row, index) => {
            const on = row.contractId === selectedId;
            return (
              <TouchableOpacity
                key={row.key}
                onPress={() => setSelectedId(row.contractId)}
                accessibilityRole="button"
                accessibilityLabel={row.title}
                style={[
                  styles.tr,
                  {
                    borderBottomColor: colors.line,
                    backgroundColor: on
                      ? (colors.brandSoft || colors.bg)
                      : (index % 2 ? (colors.sunken || colors.bg) : colors.card),
                  },
                ]}
              >
                {COLUMNS.map((column) => (
                  <Text
                    key={column.key}
                    style={[
                      styles.td,
                      columnStyle(column),
                      { color: colors.ink },
                      (column.key === 'title' || column.key === 'buyer') && styles.nameCell,
                    ]}
                    numberOfLines={column.key === 'oppdragId' ? 1 : 2}
                  >
                    {row[column.key]}
                  </Text>
                ))}
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </View>
  ) : null;

  return (
    <View nativeID="economy-contracts" style={styles.stack}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenRegister} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Åpne avtaleregister</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i oppdrag, kunde, periode, sum"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!contracts.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler er registrert ennå.</Text>
      ) : null}
      {stackRows ? table : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={styles.tableContent}
        >
          {table}
        </ScrollView>
      )}
      {!rows.length && contracts.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler matcher søket.</Text>
      ) : null}
      {selected ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected.title}</Text>
          <Text style={{ color: colors.muted }}>
            {[selected.buyer, selected.value ? rows.find((row) => row.contractId === selected.id)?.valueLabel : ''].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => onOpenIndex?.(selected)}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff' }}>Indeksregulering</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onOpenContract?.(selected.id)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Åpne i avtaleregister</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function columnStyle(column) {
  if (column.flex) {
    return {
      flexGrow: column.grow || 1,
      flexShrink: 1,
      flexBasis: column.minWidth,
      minWidth: column.minWidth,
    };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

const styles = StyleSheet.create({
  stack: { gap: 12, width: '100%', alignSelf: 'stretch' },
  h: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  tableScroll: { width: '100%', alignSelf: 'stretch' },
  tableContent: { flexGrow: 1, minWidth: '100%' },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', width: '100%' },
  tableWrapPhone: { minWidth: 0, alignSelf: 'stretch' },
  tableWrapWide: { minWidth: TABLE_MIN, flexGrow: 1 },
  tr: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, minHeight: 44, alignItems: 'center' },
  head: { minHeight: 40 },
  th: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  td: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  nameCell: { fontWeight: '600' },
  phoneRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 3, borderBottomWidth: 1, width: '100%' },
  phoneName: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  phoneParty: { fontSize: 14, lineHeight: 20 },
  phoneMetaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 2 },
  phoneMeta: { fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
