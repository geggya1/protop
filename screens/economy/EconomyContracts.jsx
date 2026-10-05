import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { formatOrgnr } from '../../src/anbud/customers';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { draftFromContract, filterContracts } from '../../src/anbud/directContract';
import { contractEconomy } from '../../src/economy/facts';
import IndeksreguleringPanel from '../project/IndeksreguleringPanel';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export default function EconomyContracts({
  customers = [],
  contracts = [],
  company = null,
  selectedId: incomingId = '',
  seedDraft = null,
  project = null,
  onBook = null,
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(incomingId);

  useEffect(() => {
    if (incomingId) setSelectedId(incomingId);
  }, [incomingId]);

  const visible = useMemo(
    () => filterContracts(contracts, { query }),
    [contracts, query],
  );
  const selected = contracts.find((row) => row.id === selectedId) || null;
  const economy = selected ? contractEconomy(selected, customers) : null;
  const extras = {
    supplier: company?.navn || '',
    supplierOrgnr: company?.organisasjonsnummer || '',
    website: company?.hjemmeside || '',
    phone: company?.telefon || '',
    email: company?.epostadresse || '',
  };
  const draft = selected
    ? (seedDraft && incomingId === selected.id ? seedDraft : draftFromContract(selected, extras))
    : null;

  return (
    <View nativeID="economy-contracts" id="economy-contracts" style={styles.stack}>
      <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi · Avtaler</Text>
      <Text style={[styles.h, { color: colors.ink }]}>Avtaler</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Velg en avtale for å se økonomien og indeksreguleringen som hører til den. Feltene hentes fra kontrakten.
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i avtaler"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!contracts.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler er registrert ennå. Registrer dem under Kontrakt / avtale.</Text>
      ) : null}
      {visible.map((row) => {
        const on = row.id === selectedId;
        const facts = contractEconomy(row, customers);
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => setSelectedId(row.id)}
            accessibilityRole="button"
            style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title || 'Avtale uten navn'}</Text>
            <Text style={{ color: colors.muted }}>
              {[facts.buyer, facts.kind, facts.period, facts.valueLabel].filter(Boolean).join(' · ')}
            </Text>
          </TouchableOpacity>
        );
      })}

      {selected && economy ? (
        <View nativeID="economy-contract-detail" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Økonomi for avtalen</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{economy.title || 'Avtale'}</Text>
          <View style={styles.grid}>
            <Fact label="Kunde" value={economy.buyer} colors={colors} />
            <Fact label="Type" value={economy.kind} colors={colors} />
            <Fact label="Periode" value={economy.period} colors={colors} />
            <Fact label="Verdi" value={economy.valueLabel} colors={colors} />
            <Fact label="Status" value={economy.status} colors={colors} />
            <Fact label="Standard" value={economy.standard} colors={colors} />
            <Fact label="Referanse" value={economy.reference} colors={colors} />
            <Fact label="Honorar" value={economy.honorar} colors={colors} />
          </View>
          {economy.customer ? (
            <Text style={{ color: colors.muted }}>
              {[economy.customer.name, formatOrgnr(economy.customer.orgnr), economy.customer.contactName].filter(Boolean).join(' · ')}
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}>Ingen kunde er koblet til avtalen i registeret.</Text>
          )}
        </View>
      ) : null}

      {selected && draft ? (
        <View nativeID="economy-contract-index">
          <Text style={[styles.h, { color: colors.ink }]}>Indeksregulering av denne avtalen</Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Opplysningene er hentet fra kontrakten. Tomme felt vises ikke.
          </Text>
          <IndeksreguleringPanel
            project={project}
            onBook={project ? onBook : null}
            seedDraft={draft}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  kicker: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  h: { fontSize: 22, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15 },
});
