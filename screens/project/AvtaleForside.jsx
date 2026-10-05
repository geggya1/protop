import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function Fact({ row, colors }) {
  const missing = row.value === 'Ikke oppgitt';
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{row.label}</Text>
      <Text style={[styles.value, { color: missing ? colors.muted : colors.ink }]}>{row.value}</Text>
    </View>
  );
}

function visibleRows(group) {
  return (group?.rows || []).filter((row) => row.value && row.value !== 'Ikke oppgitt');
}

function FactCard({ group, colors, emphasis }) {
  const rows = visibleRows(group);
  if (!rows.length) return null;
  return (
    <View style={[styles.card, { borderColor: emphasis ? colors.brand : colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>{group.title}</Text>
      <View style={styles.grid}>
        {rows.map((row) => (
          <Fact key={`${group.title}-${row.label}`} row={row} colors={colors} />
        ))}
      </View>
    </View>
  );
}

export default function AvtaleForside({ sheet, colors }) {
  if (!sheet) return null;
  const groups = (sheet.groups || []).filter((group) => visibleRows(group).length);
  const [lead, ...rest] = groups;
  return (
    <View style={styles.stack}>
      <View style={[styles.cover, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.kicker, { color: colors.muted }]}>Avtale</Text>
        <Text style={[styles.title, { color: colors.ink }]}>{sheet.title}</Text>
        {sheet.reference ? <Text style={[styles.reference, { color: colors.muted }]}>{sheet.reference}</Text> : null}
      </View>
      {lead ? <FactCard group={lead} colors={colors} emphasis /> : null}
      {rest.map((group) => (
        <FactCard key={group.title} group={group} colors={colors} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  cover: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  kicker: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '500', lineHeight: 30 },
  reference: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  heading: { fontSize: 15, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 16 },
  fact: { flexGrow: 1, flexBasis: 210, minWidth: 180, gap: 3 },
  label: { fontSize: 12, lineHeight: 16 },
  value: { fontSize: 16, lineHeight: 22 },
});
