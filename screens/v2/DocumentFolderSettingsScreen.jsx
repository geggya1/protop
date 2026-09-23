import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { Screen, Mute } from '../../components/ui';
import { DeskBtn } from '../../components/DeskBtn';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import {
  listenFolder, updateFolder, setFolderMembers, deleteFolder,
  canManageFolder, isChildFolder,
} from '../../src/utils/familyDocuments';
import { shareDocumentFolderWithFriends } from '../../src/utils/friends';

export default function DocumentFolderSettingsScreen({ folderId, onBack, onDeleted }) {
  const { isDesktop } = useLayout();
  const { familyId, uid, members, friendPeople, isAdmin } = useApp();
  const [folder, setFolder] = useState(null);
  const [name, setName] = useState('');
  const [pickedMembers, setPickedMembers] = useState([]);
  const [shareMode, setShareMode] = useState('private');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!familyId || !folderId) return undefined;
    return listenFolder(familyId, folderId, (data) => {
      setFolder(data);
      if (data) {
        setName(data.name || '');
        setPickedMembers(data.memberIds || []);
        if (data.scope === 'family' || data.visibility === 'family') setShareMode('family');
        else if (isChildFolder(data) || (data.memberIds || []).length > 1) setShareMode('shared');
        else setShareMode('private');
      }
    });
  }, [familyId, folderId]);

  const canManage = canManageFolder(folder, uid, isAdmin);
  const isDefault = !!folder?.isDefault;
  const childLocked = isChildFolder(folder) && isDefault;

  const toggleMember = (memberUid) => {
    if (memberUid === folder?.ownerUid) return;
    setPickedMembers((prev) => (
      prev.includes(memberUid) ? prev.filter((id) => id !== memberUid) : [...prev, memberUid]
    ));
  };

  const save = async () => {
    if (!familyId || !folderId || !canManage) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setDialog({ title: 'Navn mangler', message: 'Gi mappen et navn.' });
      return;
    }
    setSaving(true);
    try {
      let memberIds = [folder.ownerUid || uid];
      let visibility = 'private';
      let scope = folder.scope || 'personal';

      if (childLocked) {
        // Barnas standardmappe: behold scope/child, oppdater medlemmer
        memberIds = [...new Set([folder.ownerUid || uid, ...pickedMembers].filter(Boolean))];
        visibility = 'shared';
        scope = 'child';
      } else if (shareMode === 'family') {
        memberIds = [...new Set(members.map((m) => m.uid).filter(Boolean))];
        visibility = 'family';
        scope = 'family';
      } else if (shareMode === 'shared') {
        memberIds = [...new Set([folder.ownerUid || uid, ...pickedMembers])];
        visibility = 'shared';
      } else {
        memberIds = [folder.ownerUid || uid];
        visibility = 'private';
      }

      const patch = { name: trimmed, scope, visibility };
      if (folder.forChildId) {
        patch.forChildId = folder.forChildId;
        patch.forChildName = folder.forChildName || null;
      }
      await updateFolder(familyId, folderId, patch);
      await setFolderMembers(familyId, folderId, memberIds, visibility);
      const familyUids = new Set((members || []).map((m) => m.uid).filter(Boolean));
      const friendUids = memberIds.filter((id) => id && id !== uid && !familyUids.has(id));
      if (friendUids.length) {
        await shareDocumentFolderWithFriends({
          familyId,
          folderId,
          folderName: trimmed,
          ownerUid: uid,
          friendUids,
        });
      }
      setDialog({
        title: 'Lagret',
        message: 'Mappeinnstillingene er lagret.',
        onOk: () => onBack?.(),
      });
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke lagre. Prøv igjen.' });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = () => {
    if (isDefault) {
      setDialog({
        title: 'Kan ikke slette',
        message: 'Standardmapper kan ikke slettes, men du kan endre hvem som har tilgang.',
      });
      return;
    }
    setConfirm({
      title: 'Slett mappe',
      message: 'Mappen og filene skjules. Filene ligger fortsatt i lagring.',
      confirmText: 'Slett',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteFolder(familyId, folderId);
          onDeleted?.();
        } catch {
          setDialog({ title: 'Feil', message: 'Klarte ikke slette mappen.' });
        }
      },
    });
  };

  if (!folder) {
    return (
      <Screen>
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (!canManage) {
    return (
      <Screen>
        <View style={[styles.body, isDesktop && styles.bodyDesk]}>
          <CompactBackLink onPress={onBack} label="Mappe" />
          <Mute>Du har ikke tilgang til å endre denne mappen.</Mute>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <EdgeSwipeBack onBack={onBack}>
        <ScrollView
          contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CompactBackLink onPress={onBack} label="Mappe" />

          {isDesktop ? (
            <View style={styles.deskSaveWrap}>
              <DeskBtn
                primary
                icon="checkmark"
                label={saving ? 'Lagrer…' : 'Lagre'}
                onPress={saving ? undefined : save}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.saveBtnTop, saving && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveBtnTopTxt}>{saving ? 'Lagrer…' : 'Lagre'}</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.pageTitle, isDesktop && styles.pageTitleDesk]}>Mappe-innstillinger</Text>
          <Text style={styles.pageSub}>{folder.name}</Text>
          {isChildFolder(folder) && folder.forChildName ? (
            <Text style={styles.childHint}>Barnemappe · {folder.forChildName}</Text>
          ) : null}

          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            <Text style={styles.lbl}>Navn</Text>
            <TextInput
              style={[styles.input, isDesktop && styles.inputDesk]}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.muted}
            />

            {!childLocked ? (
              <>
                <Text style={[styles.lbl, { marginTop: 12 }]}>Tilgang</Text>
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
                        style={[styles.modeBtn, isDesktop && styles.modeBtnDesk, on && styles.modeBtnOn]}
                        onPress={() => setShareMode(m.id)}
                      >
                        <Ionicons name={m.icon} size={15} color={on ? '#fff' : colors.brand} />
                        <Text style={[styles.modeTxt, on && styles.modeTxtOn]}>{m.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <Text style={styles.childHint}>
                Standard barnemappe — foreldre og barnet har tilgang. Du kan justere deling under.
              </Text>
            )}

            {(shareMode === 'shared' || childLocked) ? (
              <>
                <Text style={[styles.lbl, { marginTop: 12 }]}>Del med</Text>
                <Text style={styles.hint}>Eieren har alltid tilgang.</Text>
                {members.filter((m) => m.uid && m.uid !== folder.ownerUid).map((m) => {
                  const on = pickedMembers.includes(m.uid);
                  return (
                    <TouchableOpacity
                      key={m.uid}
                      style={[styles.memberRow, isDesktop && styles.memberRowDesk, on && styles.memberRowOn]}
                      onPress={() => toggleMember(m.uid)}
                    >
                      <Text style={styles.memberName}>
                        {m.name}
                        {m.role === 'child' ? ' · barn' : ''}
                      </Text>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={on ? colors.brand : colors.muted}
                      />
                    </TouchableOpacity>
                  );
                })}
                {(friendPeople || []).length > 0 ? (
                  <>
                    <Text style={[styles.lbl, { marginTop: 10 }]}>Venner</Text>
                    {(friendPeople || []).map((m) => {
                      const on = pickedMembers.includes(m.uid);
                      return (
                        <TouchableOpacity
                          key={`friend-${m.uid}`}
                          style={[styles.memberRow, isDesktop && styles.memberRowDesk, on && styles.memberRowOn]}
                          onPress={() => toggleMember(m.uid)}
                        >
                          <Text style={styles.memberName}>{m.name} · venn</Text>
                          <Ionicons
                            name={on ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={on ? colors.brand : colors.muted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}
          </View>

          {!isDefault ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={doDelete}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={styles.deleteTxt}>Slett mappe</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </EdgeSwipeBack>

      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => {
          dialog?.onOk?.();
          setDialog(null);
        }}
      />
      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const fn = confirm?.onConfirm;
          setConfirm(null);
          fn?.();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28, gap: 4 },
  bodyDesk: { maxWidth: 520, width: '100%', alignSelf: 'center', paddingTop: 12 },
  deskSaveWrap: { alignItems: 'flex-end', marginBottom: 6 },
  saveBtnTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.brand,
    marginBottom: 6,
  },
  saveBtnTopTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pageTitle: { fontWeight: '600', fontSize: 17, color: colors.ink, marginTop: 4 },
  pageTitleDesk: { fontWeight: '500', fontSize: 15 },
  pageSub: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 8 },
  childHint: {
    color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 16, marginBottom: 8, marginTop: 4,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  lbl: {
    fontSize: 11, fontWeight: '600', color: colors.muted, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '500',
    backgroundColor: colors.bg, color: colors.ink,
  },
  inputDesk: { borderRadius: 8, paddingVertical: 8, fontSize: 13, fontWeight: '400' },
  modeRow: { gap: 6 },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.card,
  },
  modeBtnDesk: { paddingVertical: 8 },
  modeBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeTxt: { fontWeight: '500', color: colors.brand, fontSize: 13 },
  modeTxtOn: { color: '#fff' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, marginBottom: 6,
  },
  memberRowDesk: { paddingVertical: 8 },
  memberRowOn: { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' },
  memberName: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, paddingVertical: 10,
  },
  deleteTxt: { color: colors.danger, fontWeight: '500', fontSize: 13 },
});
