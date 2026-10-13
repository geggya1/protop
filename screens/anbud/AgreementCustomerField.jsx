import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollSheet from '../../components/ScrollSheet';
import { formatOrgnr, rankCustomerMatches } from '../../src/anbud/customers';
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
  const [sheet, setSheet] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = customers.find((row) => row.id === customerId) || null;
  const matches = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];
    return rankCustomerMatches(customers, needle);
  }, [customers, query]);
  const shown = matches.slice(0, 8);

  function closeSheet() {
    setSheet(false);
    setQuery('');
  }

  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        nativeID="agreement-customer-open"
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Kunde ${selected.name}` : 'Søk opp kunde'}
        style={[styles.trigger, { borderColor: colors.line, backgroundColor: colors.bg }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Kunde</Text>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected ? selected.name : 'Søk opp kunde'}</Text>
          {selected ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {[meta(selected), selected.email].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.brand }}>{selected ? 'Endre' : 'Søk'}</Text>
      </TouchableOpacity>
      {selected ? (
        <TouchableOpacity
          onPress={() => onSelect?.(null)}
          accessibilityRole="button"
          accessibilityLabel="Fjern valgt kunde"
        >
          <Text style={{ color: colors.brand }}>Fjern kunde</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollSheet visible={sheet} title="Kunde" onClose={closeSheet}>
        <View style={{ gap: 8 }}>
          <TextInput
            nativeID="agreement-customer-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på navn, org.nr eller kundenummer"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TouchableOpacity
            nativeID="agreement-customer-new"
            onPress={() => { closeSheet(); setCreateOpen(true); }}
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
                      closeSheet();
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
          ) : (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Skriv for å søke. Kundelisten vises ikke før det er et søk.
            </Text>
          )}
        </View>
      </ScrollSheet>
      <CustomerCreateModal
        visible={createOpen}
        colors={colors}
        companyId={companyId}
        customers={customers}
        people={people}
        onClose={() => setCreateOpen(false)}
        onSaved={(customer, saved) => {
          if (saved) onSavedState?.(saved);
          if (customer) onSelect?.(customer);
          setQuery('');
          setCreateOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 },
  create: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  trigger: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
