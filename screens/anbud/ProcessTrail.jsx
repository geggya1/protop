import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatWhen } from '../../src/anbud/model';

function whenLabel(step) {
  if (step.at) return formatWhen(step.at);
  return step.done ? '' : 'Venter';
}

export default function ProcessTrail({ steps = [], colors }) {
  const spoken = steps.map((step) => [step.label, step.detail, whenLabel(step)].filter(Boolean).join(', ')).join('. ');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={spoken}
      contentContainerStyle={styles.row}
    >
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const lineOn = !!next && step.done && next.done;
        return (
          <View key={step.id} style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.dot, {
                backgroundColor: step.done ? colors.brand : colors.card,
                borderColor: step.done ? colors.brand : colors.line,
              }]}
              />
              {next ? (
                <View style={[styles.line, {
                  borderColor: lineOn ? colors.brand : colors.muted,
                  borderStyle: lineOn ? 'solid' : 'dashed',
                }]}
                />
              ) : null}
            </View>
            <Text style={[styles.label, { color: colors.ink }]}>{step.label}</Text>
            {step.detail ? <Text style={[styles.detail, { color: colors.muted }]}>{step.detail}</Text> : null}
            <Text style={[styles.when, { color: step.done ? colors.ink : colors.muted }]}>{whenLabel(step)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2 },
  item: { width: 168, paddingRight: 8, gap: 2 },
  rail: { flexDirection: 'row', alignItems: 'center', height: 22, marginBottom: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  line: { flex: 1, marginLeft: 6, borderTopWidth: 2 },
  label: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 16 },
  when: { fontSize: 12 },
});
