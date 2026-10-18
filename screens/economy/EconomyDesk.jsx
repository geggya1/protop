import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { coverFromRecord, coverGroups, kindLabel } from '../../src/anbud/agreementTemplate';
import { formatOrgnr, maskPersonnummer } from '../../src/anbud/customers';
import { formatNok } from '../../src/anbud/model';
import {
  contractsForProject,
  matchCustomer,
  relatedContracts,
} from '../../src/economy/desk';
import { INDEX_BANDS, indexProjectGroups } from '../../src/indeksregulering/groups';
import { osloDate } from '../../src/indeksregulering/watch';

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
    <View style={styles.due} accessibilityLabel={reason || 'Ny indeks krever regulering'}>
      <Ionicons name="alert-circle" size={16} color={colors.danger || '#b45309'} />
      <Text style={{ color: colors.danger || '#b45309', fontSize: 12 }}>Ny indeks</Text>
    </View>
  );
}

function ProjectLine({ row, selected, colors, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.pick, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.bg }]}
    >
      <View style={styles.pickHead}>
        <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>
          {[row.project.number, row.title].filter(Boolean).join(' · ')}
        </Text>
        <DueMark due={!!row.attention} reason={row.attention?.reason} colors={colors} />
      </View>
      <Text style={{ color: colors.muted }}>
        {row.contracts.length
          ? `${row.contracts.length} avtale${row.contracts.length === 1 ? '' : 'r'}`
          : 'Koblet avtale mangler i listen'}
      </Text>
    </TouchableOpacity>
  );
}

export default function EconomyDesk({
  customers = [],
  contracts = [],
  projects = [],
  dueById = {},
  timeEntries = [],
  chosenContractId = '',
  hint = '',
  title = 'Kunder og avtaler',
  lead = 'Velg en kunde, et prosjekt eller en avtale. Full kunde- og avtaleinformasjon ligger i bedriftsmenyen under Kunder og Kontrakt / avtale.',
  onChooseContract,
  onOpenIndex,
  searchPlaceholder = 'Søk i kunder, prosjekt og avtaler',
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [focusedId, setFocusedId] = useState('');
  const [chosenId, setChosenId] = useState(chosenContractId);
  const [openWith, setOpenWith] = useState(true);
  const [openWithout, setOpenWithout] = useState(false);

  useEffect(() => {
    if (chosenContractId) setChosenId(chosenContractId);
  }, [chosenContractId]);

  const groups = useMemo(
    () => indexProjectGroups({
      projects,
      contracts,
      timeEntries,
      dueById,
      today: osloDate(),
      query,
    }),
    [projects, contracts, timeEntries, dueById, query],
  );
  const attentionCount = INDEX_BANDS.reduce(
    (sum, band) => sum + groups.withAgreement[band.id].filter((row) => row.attention).length,
    0,
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
      {title ? <Text style={[styles.h, { color: colors.ink }]}>{title}</Text> : null}
      {lead ? <Text style={{ color: colors.muted, lineHeight: 20 }}>{lead}</Text> : null}
      {attentionCount ? (
        <Text style={{ color: colors.danger || '#b45309' }}>
          {attentionCount} aktivt prosjekt{attentionCount === 1 ? '' : 'er'} har ny indeks og bør reguleres.
        </Text>
      ) : null}
      {hint ? <Text style={{ color: colors.brand }}>{hint}</Text> : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!customers.length && !contracts.length && !projects.length ? (
        <Text style={{ color: colors.muted }}>
          Ingen kunder, prosjekt eller avtaler er registrert ennå. Registrer dem under Kunder eller Kontrakt / avtale i bedriftsmenyen.
        </Text>
      ) : null}
      {[{
        id: 'with',
        title: 'Prosjekter med avtale',
        open: openWith,
        toggle: () => setOpenWith((value) => !value),
        bands: groups.withAgreement,
        nativeID: 'index-group-with-agreement',
      }, {
        id: 'without',
        title: 'Prosjekter uten avtale',
        open: openWithout,
        toggle: () => setOpenWithout((value) => !value),
        bands: groups.withoutAgreement,
        nativeID: 'index-group-without-agreement',
      }].map((group) => {
        const count = INDEX_BANDS.reduce((sum, band) => sum + group.bands[band.id].length, 0);
        return (
          <View key={group.id} nativeID={group.nativeID} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={group.toggle} accessibilityRole="button" style={styles.pickHead}>
              <Ionicons name={group.open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.ink} />
              <Text style={[styles.h, { color: colors.ink, flex: 1 }]}>{group.title}</Text>
              <Text style={{ color: colors.muted }}>{count}</Text>
            </TouchableOpacity>
            {group.open ? (
              <View style={{ gap: 12 }}>
                {INDEX_BANDS.map((band) => (
                  <View key={band.id} style={{ gap: 6 }}>
                    <Text style={{ color: colors.ink, fontWeight: '600' }}>
                      {band.label} ({group.bands[band.id].length})
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{band.lead}</Text>
                    {group.bands[band.id].length ? group.bands[band.id].map((row) => (
                      <ProjectLine
                        key={row.project.id}
                        row={row}
                        selected={row.project.id === projectId && !focusedId}
                        colors={colors}
                        onPress={() => pickRow({ kind: 'prosjekt', projectId: row.project.id })}
                      />
                    )) : <Text style={{ color: colors.muted }}>Ingen prosjekt.</Text>}
                  </View>
                ))}
                {group.id === 'with' && groups.unassigned.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.ink, fontWeight: '600' }}>
                      Avtaler uten prosjekt ({groups.unassigned.length})
                    </Text>
                    {groups.unassigned.map((row) => {
                      const due = !!dueById?.[row.id]?.due;
                      return (
                        <TouchableOpacity
                          key={row.id}
                          onPress={() => pickRow({ kind: 'avtale', contractId: row.id })}
                          accessibilityRole="button"
                          style={[styles.pick, { borderColor: row.id === focusedId ? colors.brand : colors.line, backgroundColor: row.id === focusedId ? colors.brandSoft : colors.bg }]}
                        >
                          <View style={styles.pickHead}>
                            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{row.title || 'Avtale uten navn'}</Text>
                            <DueMark due={due} reason={dueById?.[row.id]?.reason} colors={colors} />
                          </View>
                          <Text style={{ color: colors.muted }}>{row.buyer || 'Uten kunde'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

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
