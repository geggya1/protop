import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CASE_STATUS_LABEL, classifyContract, formatKr } from '../../src/indeksregulering/cases';
import { periodLabel } from '../../src/indeksregulering/engine';
import { frequencyLabel } from '../../src/indeksregulering/settings';
import { loadIndexCache } from '../../src/indeksregulering/storage';
import { formatDate } from '../../src/format/nb';

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
  const primary = assessed[0];

  return (
    <View nativeID="project-index-archive" style={{ gap: 12 }}>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>PROSJEKT {project?.number || ''}</Text>
        <Text style={[styles.h, { color: colors.ink }]}>{project?.name || 'Prosjekt'}</Text>
        <Text style={{ color: colors.muted }}>
          {rows.length} avtale{rows.length === 1 ? '' : 'r'} · {cases.length} reguleringssak{cases.length === 1 ? '' : 'er'}
        </Text>
        {primary ? (
          <View style={styles.stats}>
            <Mini label="Reguleringsindeks" value={primary.status.chain?.name || primary.status.draft?.indexId || '–'} colors={colors} />
            <Mini label="Frekvens" value={frequencyLabel(primary.status.draft?.terms?.frequency) || '–'} colors={colors} />
            <Mini label="Status" value={primary.status.label} colors={colors} />
          </View>
        ) : <Text style={{ color: colors.muted }}>Prosjektet har ingen avtale med indeksregulering.</Text>}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Reguleringssaker</Text>
        {!cases.length ? <Text style={{ color: colors.muted }}>Ingen reguleringssaker er lagret.</Text> : null}
        <ScrollView horizontal>
          <View>
            <View style={styles.tr}>
              {['Sak', 'Periode', 'Gjeldende fra', 'Ny pris', 'Status', ''].map((label) => (
                <Text key={label || 'open'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {cases.map((row) => (
              <View key={row.id} style={[styles.tr, { borderTopColor: colors.line, borderTopWidth: 1 }]}>
                <Text style={[styles.td, { color: colors.ink }]}>{row.number || row.id}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{periodLabel(row.newPeriod)}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.effectiveFrom || '–'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.newPrice ? formatKr(row.newPrice) : '–'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{CASE_STATUS_LABEL[row.status] || row.status}</Text>
                <TouchableOpacity onPress={() => onOpenIndex?.(row.contract, row.id, 'historikk')} accessibilityRole="button">
                  <Text style={{ color: colors.brand, fontWeight: '700' }}>Åpne</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {assessed.map(({ contract, status }) => (
        <View key={contract.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{contract.title}</Text>
          <Text style={{ color: colors.muted }}>{status.label}. {status.reason}</Text>
          <TouchableOpacity onPress={() => onOpenIndex?.(contract)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Åpne regulering</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Prisversjoner eks. mva</Text>
        {!prices.length ? <Text style={{ color: colors.muted }}>Ingen godkjent prisversjon er registrert.</Text> : null}
        {prices.map((row) => (
          <Text key={row.id} style={{ color: colors.ink }}>
            {formatDate(row.validFrom)} – {row.validTo ? formatDate(row.validTo) : 'inntil videre'} · {formatKr(row.rateExVat)} · {row.title}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Mini({ label, value, colors }) {
  return (
    <View style={[styles.mini, { backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mini: { borderRadius: 12, padding: 10, minWidth: 140, flexGrow: 1, gap: 2 },
  tr: { flexDirection: 'row', alignItems: 'center' },
  th: { width: 120, fontSize: 12, paddingVertical: 6, paddingRight: 8 },
  td: { width: 120, paddingVertical: 8, paddingRight: 8 },
});
