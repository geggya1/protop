import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { filterCustomers, formatOrgnr } from '../../src/anbud/customers';
import CustomerCreateModal from '../customers/CustomerCreateModal';

function meta(item) {
  return [
    item.customerNumber ? `Kundenr ${item.customerNumber}` : '',
    item.kind === 'person' ? 'Privatkunde' : (formatOrgnr(item.orgnr) || 'Virksomhet'),
    item.place || '',
  ].filter(Boolean).join(' · ');
}

export default function AgreementCustomerField({
  colors,
  customers = [],
  customerId = '',
  companyId,
  people = [],
  onSelect,
  onSavedState,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find((row) => row.id === customerId) || null;
  const matches = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];
    return filterCustomers(customers, needle);
  }, [customers, query]);
  const shown = matches.slice(0, 8);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.muted }}>Kunde</Text>
      {selected ? (
        <View
          nativeID="agreement-customer-selected"
          style={[styles.picked, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {[meta(selected), selected.email].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onSelect?.(null)}
            accessibilityRole="button"
            accessibilityLabel="Fjern valgt kunde"
          >
            <Text style={{ color: colors.brand }}>Fjern</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TextInput
        nativeID="agreement-customer-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i eksisterende kunder"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      <TouchableOpacity
        nativeID="agreement-customer-new"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[styles.create, { borderColor: colors.brand }]}
      >
        <Text style={{ color: colors.brand, fontWeight: '600' }}>Ny kunde</Text>
      </TouchableOpacity>
      {query.trim() ? (
        shown.length ? (
          <View nativeID="agreement-customer-results" style={[styles.results, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {shown.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  onSelect?.(item);
                  setQuery('');
                }}
                accessibilityRole="button"
                style={[styles.result, { borderBottomColor: colors.line }]}
              >
                <Text style={{ color: colors.ink }}>{item.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{meta(item)}</Text>
              </TouchableOpacity>
            ))}
            {matches.length > shown.length ? (
              <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>
                {`Viser ${shown.length} av ${matches.length}. Skriv mer for å snevre inn.`}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: colors.muted }}>Ingen kunder treffer søket. Opprett en ny kunde.</Text>
        )
      ) : !selected ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Søk på navn, org.nr eller kundenummer, eller opprett en ny kunde.
        </Text>
      ) : null}
      <CustomerCreateModal
        visible={open}
        colors={colors}
        companyId={companyId}
        customers={customers}
        people={people}
        onClose={() => setOpen(false)}
        onSaved={(customer, saved) => {
          if (saved) onSavedState?.(saved);
          if (customer) onSelect?.(customer);
          setQuery('');
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 },
  create: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  picked: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
