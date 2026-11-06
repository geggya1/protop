/** Kort på innstillingssidene (Innstillinger på personen). Ingen hooks, så det kan rendres i tester. */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevation, radius, space, type } from '../../src/ui/tokens';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

/** Kort på en innstillingsside: tittel med ikon, valgfri knapp til høyre, innhold under. */
export default function SettingsCard({
  colors, title, icon, hint, action, onAction, actionId, actionIcon = 'create-outline', nativeID, children, style,
}) {
  return (
    <View nativeID={nativeID} style={[styles.card, lift, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            {icon ? (
              <View style={[styles.cardIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name={icon} size={16} color={colors.brand} />
              </View>
            ) : null}
            <View style={styles.shrink}>
              <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
              {hint ? <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text> : null}
            </View>
          </View>
          {action && onAction ? (
            <Pressable
              nativeID={actionId}
              onPress={onAction}
              accessibilityRole="button"
              hitSlop={6}
              style={({ hovered }) => [styles.action, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}
            >
              <Ionicons name={actionIcon} size={14} color={colors.brand} />
              <Text style={[type.label, { color: colors.brand }]}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  cardIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 5 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
