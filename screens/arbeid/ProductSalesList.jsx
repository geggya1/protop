import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatMoney } from '../../src/economy/invoices.js';
import { SALE_STATUSES } from '../../src/economy/products.js';
import { saleStatusLabel } from '../../src/economy/productSalesView.js';

const COLUMNS = [
  ['Dato', 112],
  ['Produkt', 240],
  ['Antall', 96],
  ['Kunde', 180],
  ['Prosjekt', 180],
  ['Medarbeider', 150],
  ['Beløp', 130],
  ['Status', 110],
];

function dash(value) {
  const text = String(value || '').trim();
  return text || '—';
}

export function ProductSalesList({
  colors,
  ready = true,
  rows = [],
  totalCount = 0,
  query = '',
  onQuery,
  status = '',
  onStatus,
}) {
  const total = rows.reduce((sum, row) => sum + (Number(row.amountInclVat) || 0), 0);
  const filters = [{ id: '', label: 'Alle' }, ...SALE_STATUSES];
  return (
    <View style={styles.stack} nativeID="produktsalg-liste">
      <TextInput
        nativeID="produktsalg-search"
        value={query}
        onChangeText={onQuery}
        placeholder="Søk i produkt, varenr, kunde, prosjekt eller dato"
        placeholderTextColor={colors.placeholder || colors.muted}
        accessibilityLabel="Søk i produktsalg"
        style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      <View style={styles.chips}>
        {filters.map((row) => {
          const on = status === row.id;
          return (
            <TouchableOpacity
              key={row.id || 'all'}
              nativeID={`produktsalg-status-${row.id || 'all'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onStatus?.(row.id)}
              style={[styles.chip, {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? `${colors.brand}18` : colors.card,
              }]}
            >
              <Text style={{ color: colors.ink, fontSize: 13 }}>{row.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="produktsalg-summary">
        {!ready
          ? 'Henter produktsalg…'
          : !totalCount
            ? 'Ingen produktsalg er registrert ennå.'
            : `${rows.length === totalCount ? `${totalCount} salg` : `${rows.length} av ${totalCount}`} · ${formatMoney(total)} inkl. mva`}
      </Text>
      {!ready ? null : !totalCount ? (
        <Text style={{ color: colors.muted }} nativeID="produktsalg-empty">
          Når et produkt registreres under Produkt og selges til en kunde, vises salget i tabellen. Salg fra timelisten kommer også hit.
        </Text>
      ) : !rows.length ? (
        <Text style={{ color: colors.muted }} nativeID="produktsalg-no-hits">
          Ingen produktsalg treffer søket.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View nativeID="produktsalg-table" accessibilityRole="table" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={[styles.line, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}>
              {COLUMNS.map(([label, width]) => (
                <Text key={label} style={[styles.cell, { width, color: colors.muted, fontWeight: '600' }]}>{label}</Text>
              ))}
            </View>
            {rows.map((row) => (
              <View key={row.id || `${row.date}-${row.name}`} nativeID={`produktsalg-row-${row.id}`} style={[styles.line, { borderBottomColor: colors.line }]}>
                <Text style={[styles.cell, { width: 112, color: colors.ink }]}>{dash(row.date)}</Text>
                <View style={[styles.cell, { width: 240 }]}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
                  {row.sku ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.sku}</Text> : null}
                  {row.title && row.title !== row.name ? (
                    <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{row.title}</Text>
                  ) : null}
                </View>
                <Text style={[styles.cell, { width: 96, color: colors.ink }]}>{row.quantity} {row.unit || 'stk'}</Text>
                <Text style={[styles.cell, { width: 180, color: colors.ink }]}>{dash(row.customerName)}</Text>
                <Text style={[styles.cell, { width: 180, color: colors.ink }]}>
                  {row.projectNumber ? `#${row.projectNumber} ` : ''}{dash(row.projectName)}
                </Text>
                <Text style={[styles.cell, { width: 150, color: colors.ink }]}>{dash(row.employeeName)}</Text>
                <Text style={[styles.cell, { width: 130, color: colors.ink }]}>{formatMoney(row.amountInclVat)}</Text>
                <Text style={[styles.cell, { width: 110, color: colors.ink }]}>{saleStatusLabel(row.status)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, maxWidth: 560 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', minWidth: 1198 },
  line: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  cell: { paddingHorizontal: 10, paddingVertical: 10, fontSize: 13 },
});
