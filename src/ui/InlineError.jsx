import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { radius, space } from './tokens';

/**
 * Feil i siden (UX-28): ikon, tekst og «Prøv igjen». Leses opp av skjermleser
 * (role alert + live region), og virker likt på web og i appen, der det ikke
 * finnes noen «last siden på nytt».
 */
export default function InlineError({
  message,
  onRetry,
  retryLabel = 'Prøv igjen',
  busy = false,
  nativeID,
  style,
}) {
  const colors = useColors();
  const text = String(message ?? '').trim();
  if (!text) return null;
  return (
    <View
      nativeID={nativeID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.box, { borderColor: `${colors.danger}55`, backgroundColor: colors.dangerSoft || colors.card }, style]}
    >
      <Ionicons name="alert-circle-outline" size={18} color={colors.dangerInk || colors.danger} />
      <Text style={[styles.text, { color: colors.ink }]}>{text}</Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={busy ? undefined : onRetry}
          accessibilityRole="button"
          accessibilityState={{ busy: !!busy, disabled: !!busy }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.retry, { borderColor: colors.line, backgroundColor: colors.card, opacity: busy ? 0.6 : 1 }]}
        >
          <Ionicons name="refresh" size={14} color={colors.ink} />
          <Text style={[styles.retryText, { color: colors.ink }]}>{busy ? 'Prøver…' : retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  text: { flex: 1, minWidth: 160, fontSize: 13, lineHeight: 19 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    minHeight: 32,
  },
  retryText: { fontSize: 13, fontWeight: '600' },
});
