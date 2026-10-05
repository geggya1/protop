import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { coverFromRecord, coverGroups, kindLabel } from '../../src/anbud/agreementTemplate';
import { formatOrgnr, maskPersonnummer } from '../../src/anbud/customers';
import { formatNok } from '../../src/anbud/model';
import {
  contractsForProject,
  economyTableRows,
  matchCustomer,
  relatedContracts,
} from '../../src/economy/desk';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function DueMark({ due, reason, colors }) {
  if (!due) return null;
  return (
    <View style={styles.due} accessibilityLabel={reason || 'Klar for indeksregulering'}>
      <Ionicons name="alert-circle" size={16} color={colors.danger || '#b45309'} />
      <Text style={{ color: colors.danger || '#b45309', fontSize: 12 }}>Ny regulering</Text>
    </View>
  );
}

export default function EconomyDesk({
  customers = [],
  contracts = [],
  projects = [],
  dueById = {},
  chosenContractId = '',
  hint = '',
  title = 'Kunder og avtaler',
  lead = 'Velg en kunde, et prosjekt eller en avtale. Full kunde- og avtaleinformasjon ligger i bedriftsmenyen under Kunder og Kontrakt / avtale.',
  onChooseContract,
  onOpenIndex,
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [focusedId, setFocusedId] = useState('');
  const [chosenId, setChosenId] = useState(chosenContractId);

  useEffect(() => {
    if (chosenContractId) setChosenId(chosenContractId);
  }, [chosenContractId]);

  const rows = useMemo(
    () => economyTableRows(customers, contracts, query, { projects, dueById }),
    [customers, contracts, query, projects, dueById],
  );
  const customer = customers.find((row) => row.id === customerId) || null;
  const project = projects.find((row) => row.id === projectId) || null;
  const focused = contracts.find((row) => row.id === focusedId) || null;
  const chosen = contracts.find((row) => row.id === chosenId) || null;
  const related = customer
    ? relatedContracts(contracts, customer)
    : project
      ? contractsForProject(contracts, project.id)
      : [];
  const dueCount = Object.values(dueById || {}).filter((row) => row?.due).length;

  function pickRow(row) {
    if (row.kind === 'kunde') {
      setCustomerId(row.customerId);
      setProjectId('');
      setFocusedId('');
      setChosenId('');
      return;
    }
    if (row.kind === 'prosjekt') {
      setProjectId(row.projectId);
      setCustomerId('');
      setFocusedId('');
      setChosenId('');
      return;
    }
    const contract = contracts.find((item) => item.id === row.contractId);
    const matched = matchCustomer(customers, contract);
    setCustomerId(matched?.id || '');
    setProjectId(contract?.projectId || '');
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
      <Text style={[styles.h, { color: colors.ink }]}>{title}</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>{lead}</Text>
      {dueCount ? (
        <Text style={{ color: colors.danger || '#b45309' }}>
          {dueCount} avtale{dueCount === 1 ? '' : 'r'} er klar for ny indeksregulering.
        </Text>
      ) : null}
      {hint ? <Text style={{ color: colors.brand }}>{hint}</Text> : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i kunder, prosjekt og avtaler"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!customers.length && !contracts.length && !projects.length ? (
        <Text style={{ color: colors.muted }}>
          Ingen kunder, prosjekt eller avtaler er registrert ennå. Registrer dem under Kunder eller Kontrakt / avtale i bedriftsmenyen.
        </Text>
      ) : null}
      {rows.length ? (
        <ScrollView horizontal style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View>
            <View style={[styles.tr, styles.head, { borderBottomColor: colors.line }]}>
              {['Type', 'Navn', 'Tilknytning', 'Detalj', ''].map((label) => (
                <Text key={label || 'due'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {rows.map((row) => {
              const on = row.kind === 'kunde'
                ? row.customerId === customerId && !focusedId
                : row.kind === 'prosjekt'
                  ? row.projectId === projectId && !focusedId
                  : row.contractId === focusedId;
              return (
                <TouchableOpacity
                  key={row.key}
                  onPress={() => pickRow(row)}
                  accessibilityRole="button"
                  style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
                >
                  <Text style={[styles.td, { color: colors.ink }]}>
                    {row.kind === 'kunde' ? 'Kunde' : row.kind === 'prosjekt' ? 'Prosjekt' : 'Avtale'}
                  </Text>
                  <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]} numberOfLines={2}>{row.title}</Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.party}</Text>
                  <Text style={[styles.td, { color: colors.muted }]} numberOfLines={2}>{row.extra}</Text>
                  <View style={[styles.td, styles.dueCell]}>
                    <DueMark due={row.due} reason={row.dueReason} colors={colors} />
                  </View>
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
      ) : project ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Prosjekt</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{project.name || project.title}</Text>
          <Text style={{ color: colors.muted }}>
            {related.length ? 'Velg avtalen som skal indeksreguleres.' : 'Ingen avtaler er knyttet til prosjektet ennå.'}
          </Text>
        </View>
      ) : focused ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.muted }}>Avtalen har ingen kunde i registeret ennå. Du kan likevel velge den.</Text>
        </View>
      ) : null}

      {customer || project || focused ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Velg avtale</Text>
          {!related.length && !focused ? (
            <Text style={{ color: colors.muted }}>Ingen avtaler er knyttet til valget ennå.</Text>
          ) : null}
          {(related.length ? related : focused ? [focused] : []).map((row) => {
            const on = row.id === focusedId;
            const due = !!dueById?.[row.id]?.due;
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => setFocusedId(row.id)}
                accessibilityRole="button"
                style={[styles.pick, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.bg }]}
              >
                <View style={styles.pickHead}>
                  <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{row.title || 'Avtale uten navn'}</Text>
                  <DueMark due={due} reason={dueById?.[row.id]?.reason} colors={colors} />
                </View>
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
          <Text style={[styles.h, { color: colors.ink }]}>Valgt avtale</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{chosen.title || 'Avtale'}</Text>
          <Text style={{ color: colors.muted }}>
            {[chosen.buyer, kindLabel(chosen.kind)].filter(Boolean).join(' · ')}
          </Text>
          {coverGroups(coverFromRecord(chosen)).map((group) => {
            const rows = group.rows.filter((row) => row.value);
            if (!rows.length) return null;
            return (
              <View key={group.id} style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.muted }]}>{group.title}</Text>
                <View style={styles.grid}>
                  {rows.map((row) => (
                    <Fact
                      key={row.key}
                      label={row.label}
                      value={row.key === 'value' ? formatNok(row.value) : row.value}
                      colors={colors}
                    />
                  ))}
                </View>
              </View>
            );
          })}
          {dueById?.[chosen.id]?.due ? (
            <DueMark due reason={dueById[chosen.id].reason} colors={colors} />
          ) : null}
          <TouchableOpacity
            nativeID="economy-open-index"
            onPress={() => onOpenIndex?.(chosen)}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Indeksregulering av denne avtalen</Text>
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
  tr: { flexDirection: 'row', minWidth: 820, borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  head: { paddingVertical: 8 },
  th: { width: 160, fontSize: 12 },
  td: { width: 160, fontSize: 14, paddingRight: 8 },
  dueCell: { width: 120 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { minWidth: 160, flexGrow: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15 },
  pick: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
