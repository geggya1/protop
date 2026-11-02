/**
 * Svarprosent med mål (standard 70 %, som NHO og KS anbefaler for medarbeiderundersøkelser;
 * kundeundersøkelsen bruker 50 %).
 * Søylen viser andelen som har svart, en strek viser målet, og teksten under sier om det holder,
 * med ikon i tillegg til tekst (ikke bare farge).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, type } from '../../src/ui/tokens';

export const RESPONSE_TARGET = 70;

/** Vurdering av svarprosenten: { level: 'good' | 'ok' | 'low', text }. */
export function responseLevel(pct, { target = RESPONSE_TARGET, open = true } = {}) {
  if (pct == null) return null;
  if (pct >= target) return { level: 'good', text: `Over målet på ${target} %. Resultatet er godt representativt.` };
  if (pct >= Math.round(target * 0.7)) {
    return { level: 'ok', text: open ? `Under målet på ${target} %. Send en påminnelse.` : `Under målet på ${target} %. Ta det med når dere tolker resultatet.` };
  }
  return {
    level: 'low',
    text: open
      ? `Lav svarprosent (mål ${target} %). Send en påminnelse.`
      : `Lav svarprosent (mål ${target} %). Resultatet er usikkert, og gjelder ikke nødvendigvis alle.`,
  };
}

export default function ResponseMeter({
  colors, pct, count, of, target = RESPONSE_TARGET, open = true, nativeID, label,
}) {
  const chart = chartColorsFor(colors);
  const lv = responseLevel(pct, { target, open });
  const icon = { good: 'checkmark-circle', ok: 'alert-circle', low: 'warning' };
  const tint = { good: colors.success, ok: colors.warn, low: colors.danger };
  return (
    <View style={styles.stack} nativeID={nativeID}>
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: colors.ink }]}>
          {label || (pct == null ? `${count} har svart` : `${count} av ${of} har svart`)}
        </Text>
        {pct != null ? <Text style={[styles.value, { color: colors.ink }]}>{`${pct} %`}</Text> : null}
      </View>
      <View style={styles.trackWrap} accessibilityLabel={pct == null ? `${count} svar` : `${pct} prosent har svart, målet er ${target} prosent`}>
        <View style={[styles.track, { backgroundColor: chart.barTrack }]}>
          <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, pct || 0))}%`, backgroundColor: chart.bar }]} />
        </View>
        <View style={[styles.target, { left: `${target}%`, backgroundColor: colors.ink }]} />
      </View>
      {lv ? (
        <View style={styles.status}>
          <Ionicons name={icon[lv.level]} size={14} color={tint[lv.level]} />
          <Text style={[styles.caption, { color: colors.ink, flex: 1 }]}>{lv.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { ...type.label, fontWeight: '400' },
  value: { ...type.bodyStrong },
  trackWrap: { position: 'relative', paddingVertical: 3 },
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
  target: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { ...type.caption },
});
