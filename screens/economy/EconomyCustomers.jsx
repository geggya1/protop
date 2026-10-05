import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { formatOrgnr, maskPersonnummer } from '../../src/anbud/customers';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { formatNok } from '../../src/anbud/model';
import { customerEconomy } from '../../src/economy/facts';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export default function EconomyCustomers({ customers = [], contracts = [], onOpenContract }) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = Array.isArray(customers) ? customers : [];
    if (!q) return rows;
    return rows.filter((row) => `${row.name} ${row.orgnr} ${row.contactName} ${row.place}`.toLowerCase().includes(q));
  }, [customers, query]);
  const selected = customers.find((row) => row.id === selectedId) || null;
  const economy = selected ? customerEconomy(selected, contracts) : null;

  return (
    <View nativeID="economy-customers" id="economy-customers" style={styles.stack}>
      <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi · Kunder</Text>
      <Text style={[styles.h, { color: colors.ink }]}>Kunder</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Bla og velg en kunde for å se økonomiske aspekt knyttet til den.
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i kunder"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      {!customers.length ? (
        <Text style={{ color: colors.muted }}>Ingen kunder er registrert ennå.</Text>
      ) : null}
      {visible.map((row) => {
        const on = row.id === selectedId;
        const facts = customerEconomy(row, contracts);
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => setSelectedId(row.id)}
            accessibilityRole="button"
            style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
            <Text style={{ color: colors.muted }}>
              {[
                row.kind === 'person' ? 'Privatkunde' : 'Virksomhet',
                formatOrgnr(row.orgnr),
                facts.contractCount === 1 ? '1 avtale' : `${facts.contractCount} avtaler`,
                facts.totalLabel,
              ].filter(Boolean).join(' · ')}
            </Text>
          </TouchableOpacity>
        );
      })}

      {selected && economy ? (
        <View nativeID="economy-customer-detail" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Økonomi for kunden</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{selected.name}</Text>
          <View style={styles.grid}>
            <Fact label="Type" value={selected.kind === 'person' ? 'Privatkunde' : 'Virksomhet'} colors={colors} />
            <Fact label="Org.nr" value={formatOrgnr(selected.orgnr)} colors={colors} />
            <Fact label="Personnummer" value={maskPersonnummer(selected.personnummer)} colors={colors} />
            <Fact label="Avtaler" value={String(economy.contractCount)} colors={colors} />
            <Fact label="Aktive" value={String(economy.activeCount)} colors={colors} />
            <Fact label="Avtalt verdi" value={economy.totalLabel} colors={colors} />
            <Fact label="Med indeksfelt" value={String(economy.indexedCount)} colors={colors} />
            <Fact label="Kontakt" value={selected.contactName} colors={colors} />
            <Fact label="E-post" value={selected.email} colors={colors} />
          </View>
          {economy.related.length ? economy.related.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => onOpenContract?.(row.id)}
              accessibilityRole="button"
              style={[styles.pick, { borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>{row.title || 'Avtale'}</Text>
              <Text style={{ color: colors.muted }}>
                {[kindLabel(row.kind), [row.start, row.end].filter(Boolean).join(' – '), row.value ? formatNok(row.value) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </TouchableOpacity>
          )) : (
            <Text style={{ color: colors.muted }}>Ingen avtaler er knyttet til kunden.</Text>
          )}
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
  pick: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
});
