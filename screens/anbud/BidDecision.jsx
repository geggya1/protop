import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { STRATEGY_ITEMS } from '../../src/anbud/lifecycle';

export default function BidDecision({ notice, colors, busy, onToggle, onGive, onDecline }) {
  const strategy = notice?.consideration?.strategy || {};
  const names = [
    ...(notice?.dossier?.portalFiles || []).map((file) => file.name),
    ...(notice?.dossier?.documents || []).map((doc) => doc.title),
  ].filter(Boolean);
  const answers = notice?.dossier?.qa || [];
  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Ta stilling til tilbud</Text>
      <Text style={{ color: colors.muted }}>
        {names.length ? `${names.length} dokumenter er hentet inn` : 'Ingen vedlegg er publisert ennå'}
        {` · ${answers.length ? `${answers.length} spørsmål og svar` : 'ingen spørsmål og svar er publisert ennå'}.`}
      </Text>
      {names.slice(0, 6).map((name) => <Text key={name} style={{ color: colors.ink }}>{name}</Text>)}
      {answers.slice(0, 3).map((row) => (
        <Text key={`${row.question}-${row.answer}`} style={{ color: colors.ink }}>{row.question}{row.answer ? `: ${row.answer}` : ''}</Text>
      ))}
      {STRATEGY_ITEMS.map((item) => {
        const on = !!strategy[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onToggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Text style={{ color: on ? colors.ink : colors.muted }}>{on ? '✓' : '○'} {item.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={styles.row}>
        <TouchableOpacity onPress={onGive} disabled={busy} accessibilityRole="button" style={[styles.give, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>{busy ? 'Henter grunnlag …' : 'Gi tilbud'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDecline} disabled={busy} accessibilityRole="button" style={[styles.decline, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>Ikke gi tilbud</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  give: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  decline: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
});
