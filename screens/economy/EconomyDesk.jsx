import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { formatOrgnr, maskPersonnummer } from '../../src/anbud/customers';
import { formatNok } from '../../src/anbud/model';
import { economyTableRows, matchCustomer, relatedContracts } from '../../src/economy/desk';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export default function EconomyDesk({
  customers = [],
  contracts = [],
  chosenContractId = '',
  hint = '',
  onChooseContract,
  onOpenIndex,
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [focusedId, setFocusedId] = useState('');
  const [chosenId, setChosenId] = useState(chosenContractId);

  useEffect(() => {
    if (chosenContractId) setChosenId(chosenContractId);
  }, [chosenContractId]);

  const rows = useMemo(
    () => economyTableRows(customers, contracts, query),
    [customers, contracts, query],
  );
  const customer = customers.find((row) => row.id === customerId) || null;
  const focused = contracts.find((row) => row.id === focusedId) || null;
  const chosen = contracts.find((row) => row.id === chosenId) || null;
  const related = customer ? relatedContracts(contracts, customer) : [];

  function pickRow(row) {
    if (row.kind === 'kunde') {
      setCustomerId(row.customerId);
      setFocusedId('');
      setChosenId('');
      return;
    }
    const contract = contracts.find((item) => item.id === row.contractId);
    const matched = matchCustomer(customers, contract);
    setCustomerId(matched?.id || '');
    setFocusedId(row.contractId);
    setChosenId('');
  }

  function chooseFocused() {
    if (!focused) return;
    setChosenId(focused.id);
    onChooseContract?.(focused);
  }

  return (
    <View nativeID="economy-desk" id="economy-desk" style={styles.stack}>
      <Text style={[styles.h, { color: colors.ink }]}>Kunder og avtaler</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Velg en kunde eller en avtale i tabellen. Først vises kunden, deretter velger du avtalen. Indeksregulering vises når avtalen er valgt.
      </Text>
      {hint ? <Text style={{ color: colors.brand }}>{hint}</Text> : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i kunder og avtaler"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!customers.length && !contracts.length ? (
        <Text style={{ color: colors.muted }}>
          Ingen kunder eller avtaler er registrert ennå. Legg dem inn under Kunder og Kontrakt / avtale.
        </Text>
      ) : null}
      {rows.length ? (
        <ScrollView horizontal style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View>
            <View style={[styles.tr, styles.head, { borderBottomColor: colors.line }]}>
              {['Type', 'Navn', 'Tilknytning', 'Detalj'].map((label) => (
                <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {rows.map((row) => {
              const on = row.kind === 'kunde' ? row.customerId === customerId && !focusedId : row.contractId === focusedId;
              return (
                <TouchableOpacity
                  key={row.key}
                  onPress={() => pickRow(row)}
                  accessibilityRole="button"
                  style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
                >
                  <Text style={[styles.td, { color: colors.ink }]}>{row.kind === 'kunde' ? 'Kunde' : 'Avtale'}</Text>
                  <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]} numberOfLines={2}>{row.title}</Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.party}</Text>
                  <Text style={[styles.td, { color: colors.muted }]} numberOfLines={2}>{row.extra}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {customer ? (
        <View nativeID="economy-customer" id="economy-customer" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Kunde</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{customer.name}</Text>
          <View style={styles.grid}>
            <Fact label="Type" value={customer.kind === 'person' ? 'Privatkunde' : 'Virksomhet'} colors={colors} />
            <Fact label="Org.nr" value={formatOrgnr(customer.orgnr)} colors={colors} />
            <Fact label="Personnummer" value={maskPersonnummer(customer.personnummer)} colors={colors} />
            <Fact label="Adresse" value={[customer.address, customer.postalCode, customer.place].filter(Boolean).join(', ')} colors={colors} />
            <Fact label="Kontakt" value={customer.contactName} colors={colors} />
            <Fact label="E-post" value={customer.email} colors={colors} />
            <Fact label="Telefon" value={customer.phone} colors={colors} />
          </View>
        </View>
      ) : focused ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.muted }}>Avtalen har ingen kunde i registeret ennå. Du kan likevel velge den.</Text>
        </View>
      ) : null}

      {customer || focused ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Velg avtale</Text>
          {!related.length && !focused ? (
            <Text style={{ color: colors.muted }}>Ingen avtaler er knyttet til kunden ennå.</Text>
          ) : null}
          {(related.length ? related : focused ? [focused] : []).map((row) => {
            const on = row.id === focusedId;
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => setFocusedId(row.id)}
                accessibilityRole="button"
                style={[styles.pick, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.bg }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title || 'Avtale uten navn'}</Text>
                <Text style={{ color: colors.muted }}>
                  {[kindLabel(row.kind), [row.start, row.end].filter(Boolean).join(' – '), row.value ? formatNok(row.value) : '']
                    .filter(Boolean)
                    .join(' · ') || 'Uten periode'}
                </Text>
              </TouchableOpacity>
            );
          })}
          {focused ? (
            <TouchableOpacity
              nativeID="economy-choose-contract"
              onPress={chooseFocused}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff' }}>Velg denne avtalen</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ color: colors.muted }}>Marker avtalen du vil regulere.</Text>
          )}
        </View>
      ) : null}

      {chosen ? (
        <View nativeID="economy-index-choice" id="economy-index-choice" style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Indeksregulering</Text>
          <Text style={{ color: colors.ink }}>{chosen.title}</Text>
          <Text style={{ color: colors.muted }}>
            {[chosen.buyer, kindLabel(chosen.kind)].filter(Boolean).join(' · ')}
          </Text>
          <TouchableOpacity
            nativeID="economy-open-index"
            onPress={() => onOpenIndex?.(chosen)}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Åpne indeksregulering av denne avtalen</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  h: { fontSize: 18, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  tableWrap: { borderWidth: 1, borderRadius: 12 },
  tr: { flexDirection: 'row', minWidth: 720, borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 8 },
  head: { paddingVertical: 8 },
  th: { width: 180, fontSize: 12 },
  td: { width: 180, fontSize: 14, paddingRight: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { minWidth: 160, flexGrow: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15 },
  pick: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
