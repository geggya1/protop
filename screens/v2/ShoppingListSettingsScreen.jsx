import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { Screen, Title, Mute, ScrollBody, BigButton } from '../../components/ui';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import {
  listenList, updateList, archiveList, deleteList, setListMembersForList,
  canManageList, isPrivateList, isPersonalList, isPersonalMirror, scopeFromList,
} from '../../src/utils/shoppingLists';
import { syncShoppingListFriendShares } from '../../src/utils/friends';
import { GROCERY_STORES } from '../../src/data/groceryStores';

function Frame({ inShell, children }) {
  if (inShell) return <View style={styles.shellFrame}>{children}</View>;
  return <Screen>{children}</Screen>;
}

function inferShareMode(list, parentUids, friendUids) {
  const ids = list?.memberIds || [];
  const hasFriend = ids.some((id) => friendUids.has(id));
  const familySelected = ids.filter((id) => parentUids.has(id));
  if (ids.length <= 1 && !hasFriend) return 'private';
  if (
    !hasFriend
    && parentUids.size > 0
    && [...parentUids].every((id) => ids.includes(id))
    && familySelected.length === parentUids.size
  ) {
    return 'family';
  }
  return 'shared';
}

export default function ShoppingListSettingsScreen({
  listId, listScope = null, onBack, onDeleted, onScopeChanged, inShell = false,
}) {
  const { familyId, uid, members, friendPeople, isAdmin, isParent } = useApp();
  const [scope, setScope] = useState(listScope || { personal: false, familyId, listId });
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [preferredStoreId, setPreferredStoreId] = useState(null);
  const [pickedMembers, setPickedMembers] = useState([]);
  const [shareMode, setShareMode] = useState('private');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const parentMembers = useMemo(
    () => (members || []).filter((m) => m.role !== 'child' && m.uid),
    [members],
  );
  const parentUidSet = useMemo(
    () => new Set(parentMembers.map((m) => m.uid)),
    [parentMembers],
  );
  const friendUidSet = useMemo(
    () => new Set((friendPeople || []).map((m) => m.uid).filter(Boolean)),
    [friendPeople],
  );
  const friends = friendPeople || [];

  useEffect(() => {
    if (listScope) setScope(listScope);
  }, [listScope?.listId, listScope?.personal, listScope?.ownerUid, listScope?.familyId]);

  useEffect(() => {
    if (!scope?.listId) return undefined;
    return listenList(scope, (data) => {
      setList(data);
      if (data) {
        setName(data.name || '');
        setPreferredStoreId(data.preferredStoreId || null);
        const ids = data.memberIds || [uid].filter(Boolean);
        setPickedMembers(ids);
        setShareMode(inferShareMode(data, parentUidSet, friendUidSet));
      }
    });
  }, [scope?.listId, scope?.personal, scope?.ownerUid, scope?.familyId, uid, parentUidSet, friendUidSet]);

  if (!isParent) {
    return (
      <Frame inShell={inShell}>
        <View style={{ padding: 16 }}>
          <Mute>Handlelister er kun for foresatte.</Mute>
        </View>
      </Frame>
    );
  }

  const canManage = canManageList(list, uid, isAdmin);
  const personal = isPersonalList(list) && !isPersonalMirror(list);
  const ownerUid = list?.createdBy || uid;

  const toggleMember = (memberUid) => {
    if (memberUid === ownerUid) return;
    setPickedMembers((prev) => (
      prev.includes(memberUid) ? prev.filter((id) => id !== memberUid) : [...prev, memberUid]
    ));
    if (shareMode === 'private') setShareMode('shared');
    if (shareMode === 'family') setShareMode('shared');
  };

  const applyShareMode = (mode) => {
    setShareMode(mode);
    if (mode === 'private') {
      setPickedMembers([ownerUid].filter(Boolean));
      return;
    }
    if (mode === 'family') {
      const familyIds = parentMembers.map((m) => m.uid).filter(Boolean);
      setPickedMembers([...new Set([ownerUid, ...familyIds].filter(Boolean))]);
      return;
    }
    setPickedMembers((prev) => {
      const keep = prev.filter((id) => id === ownerUid || parentUidSet.has(id) || friendUidSet.has(id));
      return [...new Set([ownerUid, ...keep].filter(Boolean))];
    });
  };

  const resolveMemberIds = () => {
    if (shareMode === 'private') {
      return [ownerUid].filter(Boolean);
    }
    if (shareMode === 'family') {
      return [...new Set([
        ownerUid,
        ...parentMembers.map((m) => m.uid),
      ].filter(Boolean))];
    }
    return [...new Set([ownerUid, ...pickedMembers].filter(Boolean))];
  };

  const save = async () => {
    if (!list || !canManage) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setDialog({ title: 'Navn mangler', message: 'Gi listen et navn.' });
      return;
    }
    const ids = resolveMemberIds();
    const familyUids = parentUidSet;
    const nextFriendUids = ids.filter((id) => id && id !== ownerUid && friendUidSet.has(id));
    const prevFriendUids = (list.memberIds || []).filter(
      (id) => id && id !== ownerUid && friendUidSet.has(id),
    );

    if (nextFriendUids.length && !familyId) {
      setDialog({
        title: 'Familie mangler',
        message: 'Velg en familie før du deler listen med venner.',
      });
      return;
    }

    setSaving(true);
    try {
      const currentScope = scopeFromList(list, { familyId, uid }) || scope;
      await updateList(currentScope, {
        name: trimmed,
        preferredStoreId: preferredStoreId || null,
      });
      const { list: nextList, scope: nextScope } = await setListMembersForList(
        { ...list, name: trimmed },
        familyId,
        ids,
        ids.length <= 1 ? 'private' : 'shared',
      );
      const shareFamilyId = nextScope?.familyId || nextList?.familyId || familyId;
      await syncShoppingListFriendShares({
        familyId: shareFamilyId,
        listId: nextList.id,
        listTitle: trimmed,
        ownerUid,
        ownerName: parentMembers.find((m) => m.uid === ownerUid)?.name || null,
        friendUids: nextFriendUids,
        previousFriendUids: prevFriendUids,
      });
      setScope(nextScope);
      setList(nextList);
      onScopeChanged?.(nextList);

      let message = 'Listen er privat og følger deg mellom familier.';
      if (ids.length > 1) {
        const familyCount = ids.filter((id) => familyUids.has(id)).length;
        const friendCount = nextFriendUids.length;
        if (friendCount && familyCount > 1) {
          message = `Listen er delt med valgte familiemedlemmer og ${friendCount === 1 ? '1 venn' : `${friendCount} venner`}.`;
        } else if (friendCount) {
          message = friendCount === 1
            ? 'Listen er delt med 1 venn.'
            : `Listen er delt med ${friendCount} venner.`;
        } else if (shareMode === 'family') {
          message = 'Listen er delt med hele familien.';
        } else {
          message = 'Listen er delt med valgte medlemmer i denne familien.';
        }
      }

      setDialog({
        title: 'Lagret ✓',
        message,
        onOk: () => onBack?.(),
      });
    } catch (e) {
      setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke lagre. Prøv igjen.' });
    } finally {
      setSaving(false);
    }
  };

  const doArchive = () => {
    const nextArchived = !list?.archived;
    const targetScope = scopeFromList(list, { familyId, uid }) || scope;
    setConfirm({
      title: list?.archived ? 'Gjenopprett liste' : 'Arkiver liste',
      message: list?.archived
        ? 'Listen vises igjen blant aktive handlelister.'
        : 'Listen skjules fra hovedoversikten, men beholdes.',
      confirmText: list?.archived ? 'Gjenopprett' : 'Arkiver',
      onConfirm: async () => {
        try {
          await archiveList(targetScope, nextArchived);
          onBack?.();
        } catch (e) {
          setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke endre arkivstatus.' });
        }
      },
    });
  };

  const doDelete = () => {
    const targetScope = scopeFromList(list, { familyId, uid }) || scope;
    setConfirm({
      title: 'Slett handleliste',
      message: 'Listen og alle varer slettes permanent. Dette kan ikke angres.',
      confirmText: 'Slett',
      danger: true,
      onConfirm: async () => {
        try {
          const prevFriendUids = (list.memberIds || []).filter(
            (id) => id && id !== ownerUid && friendUidSet.has(id),
          );
          await syncShoppingListFriendShares({
            familyId: list.familyId || familyId,
            listId: list.id,
            listTitle: list.name,
            ownerUid,
            friendUids: [],
            previousFriendUids: prevFriendUids,
          });
          await deleteList(targetScope);
          onDeleted?.();
        } catch (e) {
          setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke slette listen.' });
        }
      },
    });
  };

  if (!list) {
    return (
      <Frame inShell={inShell}>
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Frame>
    );
  }

  const showPicker = shareMode === 'shared';
  const previewIds = resolveMemberIds();
  let statusHint = '👥 Delt med valgte medlemmer i denne familien';
  if (isPrivateList({ ...list, memberIds: previewIds }) || previewIds.length <= 1) {
    statusHint = personal || previewIds.length <= 1
      ? '🔒 Privat liste — følger deg på tvers av familier'
      : '🔒 Privat liste';
  } else {
    const friendCount = previewIds.filter((id) => friendUidSet.has(id)).length;
    if (shareMode === 'family' && !friendCount) {
      statusHint = '👥 Delt med hele familien';
    } else if (friendCount) {
      statusHint = friendCount === 1
        ? '👥 Delt med familie og 1 venn'
        : `👥 Delt med familie og ${friendCount} venner`;
    }
  }

  return (
    <Frame inShell={inShell}>
      <EdgeSwipeBack onBack={onBack}>
      <ScrollBody>
        <CompactBackLink onPress={onBack} label="Liste" accessibilityLabel="Tilbake til liste" />

        <Title size={22}>Innstillinger</Title>
        <Mute>{list.name}</Mute>

        {!canManage && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTxt}>Kun eier eller admin kan endre denne listen.</Text>
          </View>
        )}

        <Text style={styles.label}>Navn på liste</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          editable={canManage}
          placeholder="F.eks. Ukeshandel"
        />

        <Text style={styles.label}>Foretrukket butikk</Text>
        <Text style={styles.hint}>Brukes til hyllesortering under handletur.</Text>
        <View style={styles.chipRow}>
          {GROCERY_STORES.map((s) => {
            const on = preferredStoreId === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, on && styles.chipOn, !canManage && styles.chipDisabled]}
                onPress={() => canManage && setPreferredStoreId(on ? null : s.id)}
                disabled={!canManage}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                  {s.emoji} {s.shortName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Deling og medlemmer</Text>
        <Text style={styles.hint}>
          Privat liste følger deg mellom familier. Del med valgte foresatte — og venner om du vil.
        </Text>
        <View style={styles.modeRow}>
          {[
            { id: 'private', icon: 'lock-closed-outline', label: 'Kun meg' },
            { id: 'shared', icon: 'people-outline', label: 'Valgte / venner' },
            { id: 'family', icon: 'home-outline', label: 'Hele familien' },
          ].map((m) => {
            const on = shareMode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.modeChip, on && styles.modeChipOn, !canManage && styles.chipDisabled]}
                onPress={() => canManage && applyShareMode(m.id)}
                disabled={!canManage}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={m.icon} size={14} color={on ? '#fff' : colors.brand} />
                <Text style={[styles.modeTxt, on && styles.modeTxtOn]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {showPicker ? (
          <>
            <Text style={styles.subLabel}>I denne familien</Text>
            <View style={styles.chipRow}>
              {parentMembers.map((m) => {
                const on = pickedMembers.includes(m.uid);
                const isOwner = m.uid === ownerUid;
                return (
                  <TouchableOpacity
                    key={m.uid}
                    disabled={!canManage || isOwner}
                    onPress={() => toggleMember(m.uid)}
                    style={[
                      styles.chip,
                      on && styles.chipOn,
                      isOwner && styles.chipOwner,
                      !canManage && styles.chipDisabled,
                    ]}
                  >
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                      {m.name}{isOwner ? ' (eier)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 12 }]}>Venner</Text>
            <Text style={styles.hint}>
              Valgfritt. Venner kan se listen og krysse av varer, uten å bli med i familien.
            </Text>
            {friends.length > 0 ? (
              <View style={styles.chipRow}>
                {friends.map((m) => {
                  const mid = m.uid;
                  if (!mid) return null;
                  const on = pickedMembers.includes(mid);
                  return (
                    <TouchableOpacity
                      key={`friend-${mid}`}
                      disabled={!canManage}
                      onPress={() => toggleMember(mid)}
                      style={[
                        styles.chip,
                        on && styles.chipOn,
                        !canManage && styles.chipDisabled,
                      ]}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                        {(m.name || '').split(' ')[0] || 'Venn'} · venn
                      </Text>
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

        <Text style={styles.statusTxt}>{statusHint}</Text>

        {canManage && (
          <>
            <Text style={styles.section}>Handlinger</Text>
            <TouchableOpacity style={styles.actionRow} onPress={doArchive}>
              <Ionicons name={list.archived ? 'arrow-undo' : 'archive-outline'} size={20} color={colors.brand} />
              <Text style={styles.actionTxt}>{list.archived ? 'Gjenopprett fra arkiv' : 'Arkiver liste'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionRow, styles.actionDanger]} onPress={doDelete}>
              <Ionicons name="trash-outline" size={20} color="#b91c1c" />
              <Text style={[styles.actionTxt, { color: '#b91c1c' }]}>Slett liste permanent</Text>
            </TouchableOpacity>
            <BigButton label={saving ? 'Lagrer…' : 'Lagre endringer'} onPress={save} disabled={saving} />
          </>
        )}
      </ScrollBody>
      </EdgeSwipeBack>

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText || 'OK'}
        cancelText="Avbryt"
        danger={!!confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const fn = confirm?.onConfirm;
          setConfirm(null);
          fn?.();
        }}
        onClose={() => setConfirm(null)}
      />
      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => {
          const ok = dialog?.onOk;
          setDialog(null);
          ok?.();
        }}
      />
    </Frame>
  );
}

const styles = StyleSheet.create({
  shellFrame: { flex: 1, minHeight: 0 },
  label: { fontWeight: '400', color: colors.ink, marginTop: 16, marginBottom: 8 },
  subLabel: {
    fontWeight: '400', color: colors.muted, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8, marginTop: 4,
  },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 10 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '400', color: colors.ink,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  modeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  modeTxtOn: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipOwner: { opacity: 0.9 },
  chipDisabled: { opacity: 0.5 },
  chipTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  chipTxtOn: { color: '#fff' },
  emptyFriends: {
    color: colors.muted, fontWeight: '400', fontSize: 13, lineHeight: 18,
    marginBottom: 4, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  statusTxt: { marginTop: 10, fontWeight: '400', color: colors.brand, fontSize: 13 },
  section: { fontWeight: '400', color: colors.ink, fontSize: 16, marginTop: 24, marginBottom: 8 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  actionDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  actionTxt: { fontWeight: '400', color: colors.ink, fontSize: 15 },
  infoBox: {
    backgroundColor: '#fff7ed', borderRadius: radius.md, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  infoTxt: { color: '#9a3412', fontWeight: '400', fontSize: 13 },
});
