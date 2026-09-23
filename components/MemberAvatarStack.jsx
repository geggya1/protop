import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AvatarBubble } from './AvatarPicker';
import { colors } from '../src/theme';
import {
  resolveEventPeople,
  whoVisibilityLabel,
} from '../src/utils/eventSharing';

/** Match event.memberIds against family members + optional friends. */
export function resolveEventMembers(members, memberIds, friendPeople = []) {
  return resolveEventPeople(members, memberIds, friendPeople);
}

/**
 * Overlapping avatar stack for “hvem” på aktivitet/hendelse.
 * Empty memberIds → “Alle” label (family-wide).
 * Pass `people` to render a resolved list (ønskeliste-visere, etc.).
 */
export default function MemberAvatarStack({
  members = [],
  memberIds,
  audience,
  friendPeople = [],
  people: peopleProp,
  size = 22,
  max = 4,
  showAllLabel = true,
  allLabel = 'Alle',
}) {
  const people = useMemo(() => {
    if (Array.isArray(peopleProp)) return peopleProp.filter(Boolean);
    return resolveEventMembers(members, memberIds, friendPeople);
  }, [members, memberIds, friendPeople, peopleProp]);
  const overlap = Math.round(size * 0.32);
  const ids = Array.isArray(memberIds) ? memberIds.filter(Boolean) : [];
  const familyWide = peopleProp == null && (
    audience === 'family'
    || (audience !== 'selected' && !ids.length)
  );

  if (familyWide) {
    if (!showAllLabel) return null;
    return (
      <View style={styles.allPill}>
        <Text style={styles.allTxt}>{allLabel}</Text>
      </View>
    );
  }

  if (peopleProp != null && !people.length) return null;

  if (!people.length) {
    return (
      <View style={styles.allPill}>
        <Text style={styles.allTxt}>{ids.length} pers.</Text>
      </View>
    );
  }

  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <View style={styles.row}>
      {shown.map((m, i) => (
        <View
          key={m.uid || m.id || m.childId || i}
          style={[
            styles.avWrap,
            {
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: shown.length - i,
              borderRadius: size / 2,
            },
          ]}
        >
          <AvatarBubble
            avatarId={m.avatarId}
            photoURL={m.photoURL || m.photoUrl}
            name={m.name}
            size={size - 2}
          />
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.extra, { width: size, height: size, borderRadius: size / 2, marginLeft: -overlap }]}>
          <Text style={[styles.extraTxt, { fontSize: size * 0.38 }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export function whoCountLabel(memberIds, peopleCount, audience, members, friendPeople = []) {
  if (audience === 'family') return 'Hele familien';

  const people = members
    ? resolveEventMembers(members, memberIds, friendPeople)
    : [];
  if (people.length) {
    return whoVisibilityLabel(memberIds, audience, members || [], friendPeople);
  }

  if (audience === 'selected') {
    const n = peopleCount || (Array.isArray(memberIds) ? memberIds.filter(Boolean).length : 0);
    if (!n) return '1 person';
    return n === 1 ? '1 person' : `${n} personer`;
  }
  // Legacy uten audience
  if (!Array.isArray(memberIds) || !memberIds.filter(Boolean).length) return 'Hele familien';
  const n = peopleCount || memberIds.filter(Boolean).length;
  return n === 1 ? '1 person' : `${n} personer`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avWrap: {
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  extra: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraTxt: { fontWeight: '800', color: colors.brand },
  allPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  allTxt: { fontSize: 10, fontWeight: '800', color: colors.brand },
});
