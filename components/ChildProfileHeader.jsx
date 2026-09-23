import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';
import ChildSwitcherPills from './ChildSwitcherPills';

/**
 * Felles profil-header for barnsider — avatar, navn, valgfri bryter mellom barn.
 */
export default function ChildProfileHeader({
  child,
  kids = [],
  kicker,
  heading,
  sub,
  showSwitcher = false,
  onSelectChild,
  showBack = false,
  onBack,
  backLabel = 'Tilbake',
  compact = false,
}) {
  const firstName = child?.name?.split(' ')[0] || 'Barn';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showBack && onBack && (
        <TouchableOpacity
          style={styles.backRow}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.brand} />
          <Text style={styles.backTxt}>{backLabel}</Text>
        </TouchableOpacity>
      )}

      {!!kicker && <Text style={styles.kicker}>{kicker}</Text>}

      <View style={styles.identityRow}>
        <AvatarBubble
          avatarId={child?.avatarId}
          photoURL={child?.photoURL || child?.photoUrl}
          name={child?.name || firstName}
          size={compact ? 44 : 52}
        />
        <View style={styles.identityText}>
          <Text style={[styles.heading, compact && styles.headingCompact]} numberOfLines={1}>
            {heading || child?.name || firstName}
          </Text>
          {!!sub && <Text style={styles.sub} numberOfLines={2}>{sub}</Text>}
        </View>
      </View>

      {showSwitcher && (
        <ChildSwitcherPills
          kids={kids}
          selectedId={child?.id}
          onSelect={onSelectChild}
          showAvatar
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  wrapCompact: { paddingTop: 6, paddingBottom: 6 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 6 },
  backTxt: { fontWeight: '700', color: colors.brand, fontSize: 13 },
  kicker: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    letterSpacing: 1, marginBottom: 4,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  identityText: { flex: 1, minWidth: 0 },
  heading: { fontSize: 24, fontWeight: '900', color: colors.ink },
  headingCompact: { fontSize: 20 },
  sub: { color: colors.muted, fontWeight: '600', marginTop: 4, fontSize: 13, lineHeight: 18 },
});
