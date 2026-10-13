import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Mobilrad i prosjektlisten: nummer, navn, kunde og status. Avtale bare når den mangler. */
export default function ProjectPhoneRow({
  lines,
  colors,
  first = false,
  canSelect = false,
  checked = false,
  onToggle,
  onPress,
}) {
  const danger = colors.danger || '#b42318';
  const title = lines?.title || 'Prosjekt';
  const label = [title, lines?.meta, lines?.missingAgreement ? 'Avtale mangler' : '']
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.line },
        checked && { backgroundColor: colors.brandSoft || colors.card },
      ]}
    >
      {canSelect ? (
        <TouchableOpacity
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Merk ${title}`}
          style={styles.check}
        >
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={20}
            color={checked ? colors.brand : colors.muted}
          />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.body}
      >
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>{title}</Text>
        {lines?.meta ? (
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>{lines.meta}</Text>
        ) : null}
        {lines?.missingAgreement ? (
          <View style={styles.warn}>
            <Ionicons name="warning" size={14} color={danger} accessibilityLabel="Avtale mangler" />
            <Text style={[styles.meta, { color: danger, flex: 1 }]} numberOfLines={1}>Avtale mangler</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '100%',
  },
  check: { paddingTop: 2 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 18 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
});
