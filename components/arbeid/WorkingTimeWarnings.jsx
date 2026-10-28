import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checkWorkingTime, formatDateNb } from '../../src/arbeid/workingTimeRules.js';

const INFO_LIMIT = 4;

function hoursText(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return String(n).replace('.', ',');
}

/**
 * Arbeidstid og hviletid etter arbeidsmiljøloven kapittel 10 for én ansatt.
 * Varsler, men sperrer ikke: timene står som de er ført.
 * entries er føringene som er lastet (helst 52 uker tilbake), from/to perioden som vises.
 */
export default function WorkingTimeWarnings({
  colors, entries, employeeId, from = '', to = '', limits = null, nativeID = 'working-time-warnings',
}) {
  const [showAll, setShowAll] = useState(false);
  const result = useMemo(
    () => checkWorkingTime(entries || [], { employeeId, from, to, limits: limits || {} }),
    [entries, employeeId, from, to, limits],
  );
  if (!employeeId) return null;
  const warn = result.warnings.filter((row) => row.level === 'warn');
  const info = result.warnings.filter((row) => row.level === 'info');
  const shownInfo = showAll ? info : info.slice(0, INFO_LIMIT);
  const danger = colors.danger || '#b42318';
  const { limits: used, totals } = result;

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID={nativeID}>
      <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">Arbeidstid og hviletid</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {`Varsler etter arbeidsmiljøloven §§ 10-4, 10-6 og 10-8${from ? ` fra ${formatDateNb(from)}` : ''}. Timene lagres som før.`}
      </Text>
      <Text style={[styles.line, { color: colors.ink }]} nativeID={`${nativeID}-totals`}>
        {`Overtid siste sju dager ${hoursText(totals.overtime7d)} t (grense ${used.overtime7d}) · fire uker ${hoursText(totals.overtime4w)} t (grense ${used.overtime4w}) · 52 uker ${hoursText(totals.overtime52w)} t (grense ${used.overtime52w})`}
      </Text>
      {!warn.length && !info.length ? (
        <Text style={[styles.line, { color: colors.muted }]}>Ingen timer over grensene i perioden.</Text>
      ) : null}
      {warn.map((row) => (
        <View key={row.id} style={styles.row} nativeID={`${nativeID}-${row.rule}`}>
          <Ionicons name="warning-outline" size={16} color={danger} style={styles.icon} />
          <Text style={[styles.line, { color: colors.ink, flex: 1 }]}>
            {row.text}
            <Text style={{ color: colors.muted }}>{` ${row.ref}.`}</Text>
          </Text>
        </View>
      ))}
      {shownInfo.map((row) => (
        <View key={row.id} style={styles.row}>
          <Ionicons name="information-circle-outline" size={16} color={colors.muted} style={styles.icon} />
          <Text style={[styles.line, { color: colors.ink, flex: 1 }]}>{row.text}</Text>
        </View>
      ))}
      {info.length > INFO_LIMIT ? (
        <TouchableOpacity onPress={() => setShowAll((value) => !value)} accessibilityRole="button">
          <Text style={[styles.line, { color: colors.brand }]}>
            {showAll ? 'Vis færre uker med overtid' : `Vis alle ${info.length} uker med overtid`}
          </Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.hint, { color: colors.muted }]}>
        {result.restChecked
          ? `Hviletiden kontrolleres for timer med fra- og til-klokkeslett.${result.unknownDays.length ? ` ${result.unknownDays.length} dager mangler klokkeslett og er ikke med.` : ''}`
          : 'Hviletiden kan ikke kontrolleres: timene er ført uten fra- og til-klokkeslett.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6, marginTop: 16, maxWidth: 760 },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17 },
  line: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  icon: { marginTop: 2 },
});
