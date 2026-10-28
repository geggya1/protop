import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';

/**
 * Prosesslinje: nummererte steg med en kort status under, samme mønster som
 * anbudets ProcessTrail. Steget man står på er fylt. Et steg der noe venter,
 * har mørk og halvfet status. Trykk på et steg åpner siden.
 *
 * steps: [{ id, number, label, detail, current, attention }]
 */
export default function ProcessLine({ steps = [], onSelect, label = 'Prosess', nativeID }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  if (!steps.length) return null;
  return (
    <View
      nativeID={nativeID}
      accessibilityRole="list"
      accessibilityLabel={label}
      style={[styles.wrap, isPhone && styles.wrapPhone, { borderColor: colors.line, backgroundColor: colors.card }]}
    >
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const filled = step.current;
        const spoken = [`Steg ${step.number}: ${step.label}`, step.detail, step.current ? 'du er her' : '']
          .filter(Boolean).join(', ');
        return (
          <Pressable
            key={step.id}
            onPress={step.current ? undefined : () => onSelect?.(step)}
            disabled={step.current || !onSelect}
            accessibilityRole={step.current ? 'text' : 'link'}
            accessibilityState={{ selected: !!step.current }}
            accessibilityLabel={spoken}
            nativeID={nativeID ? `${nativeID}-${step.id}` : undefined}
            style={({ hovered, pressed }) => [
              styles.step,
              (hovered || pressed) && !step.current && { backgroundColor: colors.sunken },
            ]}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  isPhone && styles.dotPhone,
                  {
                    backgroundColor: filled ? colors.brand : colors.card,
                    borderColor: filled ? colors.brand : colors.line,
                  },
                ]}
              >
                <Text style={[styles.dotText, { color: filled ? '#fff' : colors.muted }]}>{step.number}</Text>
              </View>
              {next ? <View style={[styles.line, { backgroundColor: colors.line }]} /> : null}
            </View>
            <Text
              numberOfLines={2}
              style={[
                styles.label,
                isPhone && styles.labelPhone,
                { color: colors.ink, fontWeight: step.current ? '600' : '500' },
              ]}
            >
              {step.label}
            </Text>
            {step.detail ? (
              <Text
                numberOfLines={2}
                style={[
                  styles.detail,
                  isPhone && styles.detailPhone,
                  { color: step.attention ? colors.ink : colors.muted, fontWeight: step.attention ? '600' : '400' },
                ]}
              >
                {step.detail}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    alignSelf: 'stretch',
  },
  wrapPhone: { paddingHorizontal: 2 },
  step: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  rail: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPhone: { width: 22, height: 22, borderRadius: 11 },
  dotText: { fontSize: 12, fontWeight: '600' },
  line: { flex: 1, height: 2, marginLeft: 6, borderRadius: 1 },
  label: { fontSize: 14, lineHeight: 18 },
  labelPhone: { fontSize: 12, lineHeight: 16 },
  detail: { fontSize: 12, lineHeight: 16 },
  detailPhone: { fontSize: 11, lineHeight: 14 },
});
