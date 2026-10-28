import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';

/**
 * Tom liste som forteller hva siden er til og hva man gjør først:
 * ikon, tittel, én setning og en hovedhandling (pluss en ekstra, f.eks. import).
 *
 * actions: [{ id, label, icon, onPress, primary, nativeID, disabled }]
 */
export default function EmptyState({ icon = 'albums-outline', title, text, actions = [], nativeID, style }) {
  const colors = useColors();
  const shown = (actions || []).filter((row) => row && row.onPress);
  return (
    <View
      nativeID={nativeID}
      style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.card }, style]}
    >
      <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={26} color={colors.brand} />
      </View>
      <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">{title}</Text>
      {text ? <Text style={[styles.text, { color: colors.muted }]}>{text}</Text> : null}
      {shown.length ? (
        <View style={styles.actions}>
          {shown.map((row) => (
            <TouchableOpacity
              key={row.id || row.label}
              onPress={row.onPress}
              disabled={!!row.disabled}
              accessibilityRole="button"
              nativeID={row.nativeID}
              style={[
                styles.btn,
                row.primary
                  ? { backgroundColor: colors.brand }
                  : [styles.btnGhost, { borderColor: colors.line, backgroundColor: colors.card }],
                row.disabled && { opacity: 0.6 },
              ]}
            >
              {row.icon ? <Ionicons name={row.icon} size={16} color={row.primary ? '#fff' : colors.ink} /> : null}
              <Text style={[styles.btnTxt, { color: row.primary ? '#fff' : colors.ink }]}>{row.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  text: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 520 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  btnGhost: { borderWidth: 1 },
  btnTxt: { fontSize: 15, fontWeight: '600' },
});
