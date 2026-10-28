import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { payGapReport } from '../../src/hr/payGap';
import { formatMoney } from '../../src/hr/model';
import { EmptyHint, HrCard, HrSectionTitle } from './HrShared';

function pct(value) {
  return value == null ? '—' : `${String(value).replace('.', ',')} %`;
}

function cell(stats, minGroup) {
  if (!stats.count) return '—';
  if (stats.average == null) return `${stats.count} (under ${minGroup} i en gruppe)`;
  return `${stats.count} · ${formatMoney(stats.average)}`;
}

/**
 * Lønnskartlegging fordelt på kjønn (ARP) på HR → Lønn. Bare tall per gruppe, uten navn.
 * employees er de ansatte i listen (egne ansatte).
 */
export default function HrPayGap({ colors, employees, hr }) {
  const report = useMemo(() => payGapReport({
    employees,
    salaries: hr?.salaries || [],
    contracts: hr?.contracts || [],
  }), [employees, hr?.salaries, hr?.contracts]);
  const { minGroup } = report;

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-pay-gap" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Lønnskartlegging fordelt på kjønn"
          subtitle={`Gjeldende årslønn per stilling for kvinner og menn (likestillings- og diskrimineringsloven § 26 a). Grupper med færre enn ${minGroup} av ett kjønn vises uten beløp.`}
        />
        {!report.categories.length ? (
          <EmptyHint colors={colors} text="Ingen ansatte har både registrert lønn og kjønn ennå." />
        ) : (
          <>
            <View style={[styles.row, styles.head, { borderColor: colors.line }]}>
              <Text style={[styles.cat, styles.headText, { color: colors.muted }]}>Stilling</Text>
              <Text style={[styles.num, styles.headText, { color: colors.muted }]}>Kvinner · snitt</Text>
              <Text style={[styles.num, styles.headText, { color: colors.muted }]}>Menn · snitt</Text>
              <Text style={[styles.ratio, styles.headText, { color: colors.muted }]}>Kvinners lønn av menns</Text>
            </View>
            {report.categories.map((row) => (
              <View key={row.category} style={[styles.row, { borderColor: colors.line }]}>
                <Text style={[styles.cat, { color: colors.ink }]}>{row.category}</Text>
                <Text style={[styles.num, { color: colors.ink }]}>{cell(row.women, minGroup)}</Text>
                <Text style={[styles.num, { color: colors.ink }]}>{cell(row.men, minGroup)}</Text>
                <Text style={[styles.ratio, { color: colors.ink }]}>{pct(row.ratio)}</Text>
              </View>
            ))}
            <View style={[styles.row, { borderColor: colors.line }]} nativeID="hr-pay-gap-total">
              <Text style={[styles.cat, { color: colors.ink, fontWeight: '700' }]}>Alle</Text>
              <Text style={[styles.num, { color: colors.ink, fontWeight: '700' }]}>{cell(report.total.women, minGroup)}</Text>
              <Text style={[styles.num, { color: colors.ink, fontWeight: '700' }]}>{cell(report.total.men, minGroup)}</Text>
              <Text style={[styles.ratio, { color: colors.ink, fontWeight: '700' }]}>{pct(report.total.ratio)}</Text>
            </View>
          </>
        )}
        {report.missingGender || report.missingSalary ? (
          <Text style={[styles.note, { color: colors.muted }]}>
            {[
              report.missingGender ? `${report.missingGender} uten registrert kjønn` : '',
              report.missingSalary ? `${report.missingSalary} uten registrert lønn` : '',
            ].filter(Boolean).join(' og ')}
            {' er ikke med. Kjønn registreres på den ansatte, lønn her under Lønn.'}
          </Text>
        ) : null}
        <Text style={[styles.note, { color: colors.muted }]}>
          Plikten gjelder arbeidsgivere med mer enn 50 ansatte annethvert år, og med 20–50 ansatte når en arbeidsgiver- eller arbeidstakerorganisasjon ber om det. Årslønn er slik den er registrert i HR, uten omregning for deltid.
        </Text>
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  head: { paddingTop: 0 },
  headText: { fontSize: 12, fontWeight: '600' },
  cat: { flexGrow: 2, flexBasis: 180, fontSize: 13 },
  num: { flexGrow: 1, flexBasis: 150, fontSize: 13 },
  ratio: { flexGrow: 1, flexBasis: 120, fontSize: 13 },
  note: { fontSize: 12, lineHeight: 17 },
});
