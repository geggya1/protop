import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';

function ProfileTile({ name, sub, avatarId, photoURL, selected, onPress, isParent }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tile, selected && styles.tileSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={[styles.avatarRing, selected && styles.avatarRingSelected]}>
        <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={64} />
      </View>
      <Text style={styles.tileName} numberOfLines={1}>{name}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
      {selected && (
        <View style={styles.check}>
          <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Netflix-style profilvelger — foresatt + barn. */
export default function ProfileSwitcherModal({
  visible,
  onClose,
  parentProfile,
  kids = [],
  activeKind,
  activeChildId,
  onSelectParent,
  onSelectChild,
  canSwitchProfiles = true,
}) {
  if (!canSwitchProfiles) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Bytt bruker</Text>
          <Text style={styles.sub}>Velg hvem du vil bruke appen som.</Text>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {parentProfile && (
              <ProfileTile
                name={parentProfile.name?.split(' ')[0] || 'Meg'}
                sub="Foresatt"
                avatarId={parentProfile.avatarId}
                photoURL={parentProfile.photoURL}
                selected={activeKind === 'parent'}
                onPress={() => { onSelectParent?.(); onClose?.(); }}
                isParent
              />
            )}
            {kids.filter((k) => k.active !== false).map((kid) => (
              <ProfileTile
                key={kid.id}
                name={kid.name?.split(' ')[0] || 'Barn'}
                sub="Barn"
                avatarId={kid.avatarId}
                photoURL={kid.photoURL || kid.photoUrl}
                selected={activeKind === 'child' && activeChildId === kid.id}
                onPress={() => { onSelectChild?.(kid); onClose?.(); }}
              />
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>Avbryt</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg || 20,
    padding: 20,
    maxHeight: '85%',
  },
  title: { fontSize: 22, fontWeight: '400', color: colors.ink, textAlign: 'center' },
  sub: { color: colors.muted, fontWeight: '400', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  tile: {
    width: 108,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  tileSelected: { backgroundColor: colors.brandSoft },
  avatarRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  avatarRingSelected: { borderColor: colors.brand },
  tileName: { marginTop: 8, fontWeight: '400', fontSize: 14, color: colors.ink },
  tileSub: { fontWeight: '400', fontSize: 12, color: colors.muted, marginTop: 2 },
  check: { position: 'absolute', top: 4, right: 4 },
  closeBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeTxt: { color: colors.muted, fontWeight: '400', fontSize: 15 },
});
