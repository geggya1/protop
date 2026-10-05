import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { economyCustomerRows } from '../../src/economy/desk';

const COLUMNS = [
  { key: 'name', label: 'Kunde', width: 220 },
  { key: 'identity', label: 'Identitet', width: 140 },
  { key: 'agreements', label: 'Avtaler', width: 90 },
  { key: 'valueLabel', label: 'Sum', width: 120 },
  { key: 'owner', label: 'Ansvarlig', width: 150 },
];

export default function EconomyCustomers({
  customers = [],
  contracts = [],
  people = [],
  onOpenRegister,
  onOpenCustomer,
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => economyCustomerRows(customers, contracts, people, query),
    [customers, contracts, people, query],
  );

  return (
    <View nativeID="economy-customers" style={styles.stack}>
      <Text style={[styles.h, { color: colors.ink }]}>Kunder · økonomi</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Økonomisk oversikt over kunder: antall avtaler, kontraktsum og ansvarlig. Full kunderegistrering ligger under Kunder i bedriftsmenyen.
      </Text>
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
      {rows.length ? (
        <View style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {COLUMNS.map((column) => (
              <Text key={column.key} style={[styles.th, { width: column.width, color: colors.muted }]}>{column.label}</Text>
            ))}
          </View>
          {rows.map((row, index) => (
            <TouchableOpacity
              key={row.key}
              onPress={() => onOpenCustomer?.(row.customerId)}
              accessibilityRole="button"
              style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
            >
              {COLUMNS.map((column) => (
                <Text
                  key={column.key}
                  style={[styles.td, { width: column.width, color: colors.ink }, column.key === 'name' && { fontWeight: '600' }]}
                  numberOfLines={2}
                >
                  {column.key === 'agreements' ? String(row.agreements) : row[column.key]}
                </Text>
              ))}
            </TouchableOpacity>
          ))}
        </View>
      ) : customers.length ? (
        <Text style={{ color: colors.muted }}>Ingen kunder matcher søket.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  h: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, minHeight: 44, alignItems: 'center' },
  head: { minHeight: 40 },
  th: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  td: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
