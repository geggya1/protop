import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import {
  inviteableFamilyMembers,
  inviteableFriends,
  memberInviteAuthUid,
} from '../src/utils/inviteAuthUid';

/**
 * Hub for familiespill: inviter familiemedlemmer + godta/avslå invitasjoner.
 * Erstatter PIN-basert «Bli med».
 * Only lists members/friends with a real Firebase Auth UID (inbox/push target).
 */
export default function GameInvitePanel({
  title,
  description,
  members = [],
  friends = [],
  selectedIds = [],
  onToggleMember,
  onCreate,
  pendingInvites = [],
  onAcceptInvite,
  onDeclineInvite,
  busy = false,
  createLabel = 'Start spill',
  simpleUi = false,
  maxInvites = null,
  friendsLabel = 'Inviter venner',
  hostUid = null,
  highlightInviteId = null,
  children,
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const invitableMembers = useMemo(
    () => inviteableFamilyMembers(members, hostUid),
    [members, hostUid],
  );
  const invitableFriendsList = useMemo(
    () => inviteableFriends(friends, hostUid),
    [friends, hostUid],
  );
  const canCreate = selectedIds.length > 0 && !busy;
  const atMax = maxInvites != null && selectedIds.length >= maxInvites;

  return (
    <View style={styles.wrap}>
      {title ? <Text style={[styles.title, simpleUi && styles.titleSimple]}>{title}</Text> : null}
      {description ? <Text style={[styles.desc, simpleUi && styles.descSimple]}>{description}</Text> : null}

      {pendingInvites.length > 0 ? (
        <>
          <Text style={styles.section}>Invitasjoner til deg</Text>
          {pendingInvites.map((inv) => {
            const focused = highlightInviteId
              && (inv.gameId === highlightInviteId || inv.id === highlightInviteId);
            return (
            <View
              key={inv.id}
              style={[
                styles.inviteCard,
                simpleUi && styles.inviteCardSimple,
                focused && styles.inviteCardFocus,
              ]}
            >
              <View style={styles.inviteTextCol}>
                <Text style={[styles.inviteTitle, simpleUi && styles.inviteTitleSimple]} numberOfLines={1}>
                  {inv.title || inv.hostName || 'Familiespill'}
                </Text>
                <Text style={styles.inviteSub} numberOfLines={2}>
                  {inv.hostName ? `${inv.hostName} inviterer deg` : 'Du er invitert — bekreft for å bli med'}
                </Text>
              </View>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, busy && { opacity: 0.6 }]}
                  onPress={() => onAcceptInvite?.(inv)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Godta invitasjon"
                >
                  <Text style={styles.acceptTxt}>Godta</Text>
                </TouchableOpacity>
                {onDeclineInvite ? (
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => onDeclineInvite(inv)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Avslå invitasjon"
                  >
                    <Text style={styles.declineTxt}>Avslå</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            );
          })}        </>
      ) : null}

      {children}

      <Text style={styles.section}>Inviter familiemedlemmer</Text>
      {invitableMembers.length === 0 ? (
        <Text style={styles.emptyMembers}>
          Ingen andre med innlogging å invitere ennå. Barn uten egen konto kan ikke få spillvarsel.
        </Text>
      ) : (
        <View style={styles.memberList}>
          {invitableMembers.map((m) => {
            const id = memberInviteAuthUid(m);
            const on = selectedSet.has(id);
            const lockedOut = !on && atMax;
            return (
              <TouchableOpacity
                key={id}
                style={[
                  styles.memberRow,
                  simpleUi && styles.memberRowSimple,
                  on && styles.memberRowOn,
                  lockedOut && { opacity: 0.45 },
                ]}
                onPress={() => onToggleMember?.(id)}
                disabled={busy || lockedOut}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={m.name}
              >
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={simpleUi ? 26 : 22}
                  color={on ? colors.brand : colors.muted}
                />
                <Text style={[styles.memberName, simpleUi && styles.memberNameSimple]} numberOfLines={1}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {invitableFriendsList.length > 0 ? (
        <>
          <Text style={styles.section}>{friendsLabel}</Text>
          <View style={styles.memberList}>
            {invitableFriendsList.map((m) => {
              const id = memberInviteAuthUid(m);
              const on = selectedSet.has(id);
              const lockedOut = !on && atMax;
              return (
                <TouchableOpacity
                  key={`friend-${id}`}
                  style={[
                    styles.memberRow,
                    simpleUi && styles.memberRowSimple,
                    on && styles.memberRowOn,
                    lockedOut && { opacity: 0.45 },
                  ]}
                  onPress={() => onToggleMember?.(id)}
                  disabled={busy || lockedOut}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={m.name}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={simpleUi ? 26 : 22}
                    color={on ? colors.brand : colors.muted}
                  />
                  <Text style={[styles.memberName, simpleUi && styles.memberNameSimple]} numberOfLines={1}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      {maxInvites === 1 ? (
        <Text style={styles.hint}>Velg én spiller å invitere.</Text>
      ) : (
        <Text style={styles.hint}>De du inviterer må godta før spillet starter.</Text>
      )}

      <TouchableOpacity
        style={[styles.primary, simpleUi && styles.primarySimple, !canCreate && { opacity: 0.5 }]}
        onPress={onCreate}
        disabled={!canCreate}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.primaryTxt, simpleUi && styles.primaryTxtSimple]}>{createLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  titleSimple: { fontSize: 26, fontWeight: '800' },
  desc: { color: colors.muted, fontWeight: '500', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  descSimple: { fontSize: 16, lineHeight: 24 },
  section: {
    marginTop: 14, marginBottom: 6, color: colors.muted, fontWeight: '600',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  memberList: { gap: 8 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  memberRowSimple: { borderRadius: 16, borderWidth: 2, paddingVertical: 14 },
  memberRowOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  memberName: { flex: 1, fontWeight: '600', color: colors.ink, fontSize: 14 },
  memberNameSimple: { fontSize: 17, fontWeight: '700' },
  emptyMembers: { color: colors.muted, fontWeight: '500', paddingVertical: 8 },
  hint: { color: colors.muted, fontSize: 12, fontWeight: '500', marginTop: 4, marginBottom: 4 },
  primary: {
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8,
  },
  primarySimple: { borderRadius: 16, paddingVertical: 18 },
  primaryTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  primaryTxtSimple: { fontSize: 18, fontWeight: '800' },
  inviteCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.brand, gap: 10,
  },
  inviteCardFocus: {
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  inviteCardSimple: { borderRadius: 16, borderWidth: 2 },
  inviteTextCol: { gap: 2 },
  inviteTitle: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  inviteTitleSimple: { fontSize: 17 },
  inviteSub: { color: colors.muted, fontWeight: '500', fontSize: 13 },
  inviteActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  acceptTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  declineBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.card,
  },
  declineTxt: { color: colors.muted, fontWeight: '600', fontSize: 14 },
});
