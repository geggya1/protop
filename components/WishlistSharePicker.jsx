import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';
import { isFamilyType } from '../src/utils/groupTypes';

/**
 * Velg hvem som ser en ønskeliste: bare meg, hele familien, utvalgte, andre familier.
 */
export default function WishlistSharePicker({
  mode,
  viewerUids = [],
  sharedFamilyIds = [],
  members = [],
  friends = [],
  families = [],
  familyId,
  uid,
  ownerIds = [],
  disabled = false,
  onChange,
  title = 'Hvem ser listen?',
  hint = 'Del når listen er ferdig. Eieren ser aldri hvem som reserverer eller kjøper.',
  hideOtherFamilies = false,
}) {
  const otherFamilies = hideOtherFamilies ? [] : (families || []).filter((f) => (
    f?.id && f.id !== familyId && isFamilyType(f.type) && f.archived !== true && f.active !== false
  ));

  const setMode = (next) => {
    if (disabled) return;
    onChange?.({
      mode: next,
      viewerUids: next === 'shared' ? viewerUids : viewerUids,
      sharedFamilyIds,
    });
  };

  const toggleMember = (memberUid) => {
    if (disabled || ownerIds.includes(memberUid)) return;
    const on = viewerUids.includes(memberUid);
    const next = on
      ? viewerUids.filter((id) => id !== memberUid)
      : [...viewerUids, memberUid];
    onChange?.({
      mode: 'shared',
      viewerUids: next,
      sharedFamilyIds,
    });
  };

  const toggleFamily = (fid) => {
    if (disabled) return;
    const on = sharedFamilyIds.includes(fid);
    const next = on
      ? sharedFamilyIds.filter((id) => id !== fid)
      : [...sharedFamilyIds, fid];
    onChange?.({
      mode: mode === 'private' ? 'shared' : mode,
      viewerUids,
      sharedFamilyIds: next,
    });
  };

  return (
    <View>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.hint}>
        {hint}
      </Text>
      <View style={styles.modeRow}>
        {[
          { id: 'private', label: 'Bare meg', icon: 'lock-closed-outline' },
          { id: 'family', label: 'Hele familien', icon: 'home-outline' },
          { id: 'shared', label: 'Utvalgte', icon: 'people-outline' },
        ].map((opt) => {
          const on = mode === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.modeChip, on && styles.modeChipOn]}
              onPress={() => setMode(opt.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={opt.icon} size={14} color={on ? '#fff' : colors.brand} />
              <Text style={[styles.modeTxt, on && styles.modeTxtOn]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {(mode === 'shared' || mode === 'family') && (
        <>
          <Text style={styles.subLabel}>I denne familien</Text>
          <View style={styles.people}>
            {members.map((m) => {
              const mid = m.uid;
              if (!mid) return null;
              const isOwner = ownerIds.includes(mid) || mid === uid;
              const on = mode === 'family' || viewerUids.includes(mid) || isOwner;
              const locked = mode === 'family' || isOwner;
              return (
                <TouchableOpacity
                  key={mid}
                  style={[styles.person, on && styles.personOn, locked && styles.personLocked]}
                  onPress={() => toggleMember(mid)}
                  disabled={disabled || locked}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <AvatarBubble
                    avatarId={m.avatarId}
                    photoURL={m.photoURL || m.photoUrl}
                    name={m.name}
                    size={28}
                  />
                  <Text style={[styles.personName, on && styles.personNameOn]} numberOfLines={1}>
                    {isOwner ? 'Deg' : ((m.name || '').split(' ')[0] || 'Ukjent')}
                  </Text>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={14} color={on && !locked ? colors.brand : colors.muted} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {mode !== 'private' ? (
        <>
          <Text style={styles.subLabel}>Venner</Text>
          <Text style={styles.hint}>
            {mode === 'shared'
              ? 'Valgfritt. Venner kan se og reservere, men ikke redigere listen.'
              : 'Velg en venn for å dele utenfor familien (bytter til «Utvalgte»).'}
          </Text>
          {friends.length > 0 ? (
            <View style={styles.people}>
              {friends.map((m) => {
                const mid = m.uid || m.friendUid || m.id;
                if (!mid) return null;
                const on = viewerUids.includes(mid);
                return (
                  <TouchableOpacity
                    key={`friend-${mid}`}
                    style={[styles.person, on && styles.personOn]}
                    onPress={() => toggleMember(mid)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <AvatarBubble
                      avatarId={m.avatarId}
                      photoURL={m.photoURL || m.photoUrl}
                      name={m.name}
                      size={28}
                    />
                    <Text style={[styles.personName, on && styles.personNameOn]} numberOfLines={1}>
                      {(m.name || '').split(' ')[0] || 'Venn'}
                    </Text>
                    {on ? (
                      <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyFriends}>
              Ingen venner ennå. Legg til venner under Venner-modulen for å dele hit.
            </Text>
          )}
        </>
      ) : null}

      {otherFamilies.length > 0 && mode !== 'private' && (
        <>
          <Text style={styles.subLabel}>Andre familier</Text>
          <Text style={styles.hint}>
            De du deler med kan se og reservere, men ikke hvem som eier listen.
          </Text>
          {otherFamilies.map((f) => {
            const on = sharedFamilyIds.includes(f.id);
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.familyRow, on && styles.familyRowOn]}
                onPress={() => toggleFamily(f.id)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={styles.familyIcon}>
                  <Ionicons name="people" size={16} color={on ? '#fff' : colors.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.familyName, on && styles.familyNameOn]} numberOfLines={1}>
                    {f.name || 'Familie'}
                  </Text>
                  <Text style={styles.familyMeta} numberOfLines={1}>
                    {(Array.isArray(f.members) ? f.members.length : 0)
                      ? `${Array.isArray(f.members) ? f.members.length : 0} medlemmer kan se og reservere`
                      : 'Kan se og reservere'}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={on ? colors.brand : colors.muted}
                />
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '500', color: colors.muted, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, marginTop: 2,
  },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  modeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  modeTxtOn: { color: '#fff' },
  subLabel: {
    fontWeight: '500', color: colors.muted, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8, marginTop: 4,
  },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  person: {
    width: 72, alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  personOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  personLocked: { opacity: 0.95 },
  personName: { fontWeight: '500', fontSize: 11, color: colors.ink, maxWidth: 64, textAlign: 'center' },
  personNameOn: { color: colors.ink },
  emptyFriends: {
    color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 17,
    marginBottom: 12, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  familyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card, marginBottom: 8,
  },
  familyRowOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  familyIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  familyName: { fontWeight: '600', fontSize: 13, color: colors.ink },
  familyNameOn: { color: colors.ink },
  familyMeta: { fontWeight: '400', fontSize: 11, color: colors.muted, marginTop: 1 },
});
