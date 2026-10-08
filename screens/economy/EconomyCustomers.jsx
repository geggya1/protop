import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { economyCustomerRows } from '../../src/economy/desk';
import { useLayout } from '../../src/theme';

const COLUMNS = [
  { key: 'name', label: 'Kunde', flex: true, minWidth: 280 },
  { key: 'identity', label: 'Identitet', width: 148 },
  { key: 'agreements', label: 'Avtaler', width: 88 },
  { key: 'valueLabel', label: 'Sum', width: 128 },
  { key: 'owner', label: 'Ansvarlig', width: 160 },
];

const TABLE_MIN = COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width), 0);

function cellText(row, column) {
  if (column.key === 'agreements') return String(row.agreements);
  return row[column.key] || '—';
}

function phoneFacts(row) {
  return [
    `${row.agreements} ${row.agreements === 1 ? 'avtale' : 'avtaler'}`,
    row.valueLabel && row.valueLabel !== '—' ? row.valueLabel : '',
    row.owner && row.owner !== '—' ? row.owner : '',
  ].filter(Boolean).join(' · ');
}

export default function EconomyCustomers({
  customers = [],
  contracts = [],
  people = [],
  onOpenRegister,
  onOpenCustomer,
}) {
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < TABLE_MIN;
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => economyCustomerRows(customers, contracts, people, query),
    [customers, contracts, people, query],
  );

  const table = rows.length ? (
    <View
      nativeID="economy-customers-table"
      style={[
        styles.tableWrap,
        stackRows ? styles.tableWrapPhone : styles.tableWrapWide,
        { borderColor: colors.line, backgroundColor: colors.card },
      ]}
    >
      {stackRows ? rows.map((row, index) => (
        <TouchableOpacity
          key={row.key}
          onPress={() => onOpenCustomer?.(row.customerId)}
          accessibilityRole="button"
          accessibilityLabel={row.name}
          style={[styles.phoneRow, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
        >
          <Text style={[styles.phoneName, { color: colors.ink }]}>{row.name}</Text>
          <Text style={[styles.phoneIdentity, { color: colors.ink }]} numberOfLines={1}>{row.identity || '—'}</Text>
          <Text style={[styles.phoneMeta, { color: colors.muted }]}>{phoneFacts(row)}</Text>
        </TouchableOpacity>
      )) : (
        <>
          <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {COLUMNS.map((column) => (
              <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
            ))}
          </View>
          {rows.map((row, index) => (
            <TouchableOpacity
              key={row.key}
              onPress={() => onOpenCustomer?.(row.customerId)}
              accessibilityRole="button"
              accessibilityLabel={row.name}
              style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
            >
              {COLUMNS.map((column) => (
                <Text
                  key={column.key}
                  style={[styles.td, columnStyle(column), { color: colors.ink }, column.key === 'name' && styles.nameCell]}
                  numberOfLines={column.key === 'name' ? 2 : 1}
                >
                  {cellText(row, column)}
                </Text>
              ))}
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  ) : null;

  return (
    <View nativeID="economy-customers" style={styles.stack}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenRegister} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Åpne kunderegister</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i kunde, org.nr, ansvarlig"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!customers.length ? (
        <Text style={{ color: colors.muted }}>Ingen kunder er registrert ennå.</Text>
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
      {!rows.length && customers.length ? (
        <Text style={{ color: colors.muted }}>Ingen kunder matcher søket.</Text>
      ) : null}
    </View>
  );
}

function columnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth, minWidth: column.minWidth };
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
  phoneIdentity: { fontSize: 14, lineHeight: 20 },
  phoneMeta: { fontSize: 13, lineHeight: 18 },
});
