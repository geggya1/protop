import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CASE_STATUS_LABEL, classifyContract, formatKr } from '../../src/indeksregulering/cases';
import { periodLabel } from '../../src/indeksregulering/engine';
import { loadIndexCache } from '../../src/indeksregulering/storage';

export default function ProjectIndexArchive({
  project,
  contracts = [],
  colors,
  onOpenIndex,
}) {
  const [series, setSeries] = useState(null);
  useEffect(() => {
    let live = true;
    loadIndexCache().then((cache) => {
      if (live) setSeries(cache?.series || null);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const rows = useMemo(() => (contracts || []).filter((row) => (
    row?.projectId === project?.id || row?.id === project?.contractId
  )), [contracts, project?.id, project?.contractId]);
  const assessed = rows.map((contract) => ({
    contract,
    status: classifyContract({ contract, contracts, series }),
  }));
  const cases = rows.flatMap((contract) => (contract.indexCases || []).map((entry) => ({ ...entry, contract })));
  const prices = rows.flatMap((contract) => (contract.priceVersions || []).map((entry) => ({ ...entry, title: contract.title })));
  const attention = assessed.filter((row) => row.status.attention).length;

  return (
    <View nativeID="project-index-archive" style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Indeksregulering</Text>
      <Text style={{ color: colors.muted }}>
        {rows.length} avtale{rows.length === 1 ? '' : 'r'} med tilknytning til prosjektet.
        {attention ? ` ${attention} krever oppfølging.` : ''}
      </Text>
      {assessed.map(({ contract, status }) => (
        <View key={contract.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{contract.title}</Text>
          <Text style={{ color: colors.muted }}>{status.label} · {status.reason}</Text>
          <TouchableOpacity onPress={() => onOpenIndex?.(contract)}>
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Åpne regulering</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Saker</Text>
        {!cases.length ? <Text style={{ color: colors.muted }}>Ingen reguleringssaker er lagret.</Text> : null}
        <ScrollView horizontal>
          <View>
            {cases.map((row) => (
              <View key={row.id} style={styles.tr}>
                <Text style={[styles.td, { color: colors.ink }]}>{row.number || row.id}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{periodLabel(row.newPeriod)}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.effectiveFrom || '–'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.newPrice ? formatKr(row.newPrice) : '–'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{CASE_STATUS_LABEL[row.status] || row.status}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Prisversjoner eks. mva</Text>
        {!prices.length ? <Text style={{ color: colors.muted }}>Ingen godkjent prisversjon er registrert.</Text> : null}
        {prices.map((row) => (
          <Text key={row.id} style={{ color: colors.ink }}>
            {row.validFrom} – {row.validTo || 'inntil videre'} · {formatKr(row.rateExVat)} · {row.title}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 18, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  tr: { flexDirection: 'row' },
  td: { width: 120, paddingVertical: 6, paddingRight: 8 },
});
