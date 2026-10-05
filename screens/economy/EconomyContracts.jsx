import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { economyContractRows } from '../../src/economy/desk';

const COLUMNS = [
  { key: 'systemId', label: 'System-ID', width: 92 },
  { key: 'oppdragId', label: 'Oppdrags-ID', width: 110 },
  { key: 'title', label: 'Oppdrag', width: 200 },
  { key: 'buyer', label: 'Kunde', width: 160 },
  { key: 'period', label: 'Periode', width: 160 },
  { key: 'valueLabel', label: 'Sum', width: 110 },
  { key: 'owner', label: 'Ansvarlig', width: 140 },
  { key: 'status', label: 'Status', width: 100 },
];

export default function EconomyContracts({
  customers = [],
  contracts = [],
  people = [],
  onOpenRegister,
  onOpenContract,
  onOpenIndex,
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const rows = useMemo(
    () => economyContractRows(customers, contracts, people, query),
    [customers, contracts, people, query],
  );
  const selected = contracts.find((row) => row.id === selectedId) || null;

  return (
    <View nativeID="economy-contracts" style={styles.stack}>
      <Text style={[styles.h, { color: colors.ink }]}>Avtaler · økonomi</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Økonomisk oversikt over avtaler: nummer, periode, sum og status. Full avtaleinformasjon og dokumenter ligger under Kontrakt / avtale i bedriftsmenyen.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenRegister} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Åpne avtaleregister</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i nummer, kunde, oppdrag, sum"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!contracts.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler er registrert ennå.</Text>
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
              onPress={() => setSelectedId(row.contractId)}
              accessibilityRole="button"
              style={[
                styles.tr,
                {
                  borderBottomColor: colors.line,
                  backgroundColor: row.contractId === selectedId
                    ? (colors.brandSoft || colors.bg)
                    : (index % 2 ? (colors.sunken || colors.bg) : colors.card),
                },
              ]}
            >
              {COLUMNS.map((column) => (
                <Text
                  key={column.key}
                  style={[styles.td, { width: column.width, color: colors.ink }, column.key === 'title' && { fontWeight: '600' }]}
                  numberOfLines={2}
                >
                  {row[column.key]}
                </Text>
              ))}
            </TouchableOpacity>
          ))}
        </View>
      ) : contracts.length ? (
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
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
