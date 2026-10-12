/**
 * Forhåndsvisning av kundeliste uten innlogging.
 * Manuell QA via /customers-list-preview (web).
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../src/theme';
import FilterMenu from '../../components/FilterMenu';
import {
  filterCustomers,
  projectCountsByCustomer,
  projectLinkSummary,
} from '../../src/anbud/customers';

const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'Novaform AS', kind: 'org', customerNumber: '10002', orgnr: '921234567' },
  { id: 'c2', name: 'Sola Kommune', kind: 'org', customerNumber: '10003', orgnr: '964967668' },
  { id: 'c3', name: 'Ola Nordmann', kind: 'person', customerNumber: '10004' },
  { id: 'c4', name: 'Bygg Partner AS', kind: 'org', customerNumber: '10005', orgnr: '999999999' },
];

const MOCK_PROJECTS = [
  { id: 'p1', number: '1', name: 'A', customerId: 'c1', status: 'aktiv' },
  { id: 'p2', number: '2', name: 'B', customerId: 'c1', status: 'aktiv' },
  { id: 'p3', number: '3', name: 'C', customerId: 'c2', status: 'aktiv' },
  { id: 'p4', number: '4', name: 'D', customerId: 'c2', status: 'aktiv' },
  { id: 'p5', number: '5', name: 'E', customerId: 'c2', status: 'aktiv' },
  { id: 'p6', number: '6', name: 'F', customerId: '', client: 'Uten kunde', status: 'aktiv' },
  { id: 'p7', number: '7', name: 'G', customerId: 'c4', status: 'arkivert' },
];

export default function CustomersListPreview() {
  const [kindFilter, setKindFilter] = useState('');
  const visible = useMemo(
    () => filterCustomers(MOCK_CUSTOMERS, '', { kind: kindFilter }),
    [kindFilter],
  );
  const counts = useMemo(
    () => projectCountsByCustomer(MOCK_PROJECTS, MOCK_CUSTOMERS),
    [],
  );
  const summary = useMemo(
    () => projectLinkSummary(MOCK_PROJECTS, MOCK_CUSTOMERS),
    [],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.inner}>
      <Text style={[styles.banner, { color: colors.muted, borderColor: colors.line, backgroundColor: colors.card }]}>
        Forhåndsvisning · /customers-list-preview
      </Text>
      <Text style={[styles.title, { color: colors.ink }]}>Kunder</Text>
      <FilterMenu
        groups={[
          {
            id: 'kind',
            label: 'Type',
            value: kindFilter,
            onChange: setKindFilter,
            options: [
              { id: '', label: 'Alle', nativeID: 'customer-filter-kind-all' },
              { id: 'org', label: 'Virksomhet', nativeID: 'customer-filter-kind-org' },
              { id: 'person', label: 'Privat', nativeID: 'customer-filter-kind-person' },
            ],
          },
        ]}
      />
      <Text nativeID="customer-project-summary" style={{ color: colors.muted, fontSize: 13 }}>
        {visible.length === MOCK_CUSTOMERS.length
          ? `${MOCK_CUSTOMERS.length} kunder`
          : `${visible.length} av ${MOCK_CUSTOMERS.length}`}
        {` · ${summary.linked} prosjekt på kunder · ${summary.total} aktive i systemet`}
        {summary.unlinked ? ` (${summary.unlinked} uten kunde)` : ''}
        {' · sortert etter kundenummer · neste ledige er 10006'}
      </Text>
      <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <View style={[styles.row, styles.head, { borderColor: colors.line }]}>
          <Text style={[styles.cell, { color: colors.muted, width: 72 }]}>Nr</Text>
          <Text style={[styles.cell, { color: colors.muted, flex: 1 }]}>Kunde</Text>
          <Text style={[styles.cell, { color: colors.muted, width: 88 }]}>Prosjekt</Text>
        </View>
        {visible.map((row) => (
          <View key={row.id} style={[styles.row, { borderColor: colors.line }]}>
            <Text style={[styles.cell, { color: colors.ink, width: 72, fontWeight: '700' }]}>
              {row.customerNumber}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {row.kind === 'person' ? 'Privatkunde' : 'Virksomhet'}
              </Text>
            </View>
            <Text style={[styles.cell, { color: colors.ink, width: 88, fontWeight: '600' }]}>
              {counts.get(row.id) || '—'}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 20, paddingBottom: 48, maxWidth: 920, width: '100%', alignSelf: 'center', gap: 12 },
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 22, fontWeight: '700' },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  head: { borderTopWidth: 0 },
  cell: { fontSize: 14 },
});
