import React, { useState, useCallback, useLayoutEffect, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, RefreshControl, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from '../firebase';
import {
  collection, getDocs, query, where, getDoc, doc,
} from 'firebase/firestore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';
import { isOrganizationType, platformTypeLabel } from '../src/utils/groupTypes';
import { isProtopWorkspace } from '../src/utils/platformAccess';
import { isPersonalShell } from '../src/utils/personalShell';
import {
  isGroupDeactivated,
  isGroupDeleted,
  reactivateGroup,
  listenIncomingFamilyInvites,
  acceptFamilyMemberInvite,
  declineFamilyMemberInvite,
} from '../src/utils/groups';
import { archiveEmptyDuplicateClassrooms } from '../src/utils/classroom';
import HelpTarget from '../components/HelpTarget';
import { openPlatformHome } from '../src/utils/platformNav';
import { AvatarBubble } from '../components/AvatarPicker';
import ConfirmActionModal from '../components/ConfirmActionModal';

function GroupCard({
  item, team, classroom, friends, congregation, daycare, flexGroup, deactivated, canReactivate, canManage, onPress, onSettings, onReactivate,
  reactivating, deactivatedLabel, reactivateLabel,
}) {
  const accent = congregation ? '#475569' : daycare ? '#e11d48' : friends ? '#0ea5e9' : flexGroup ? '#334155' : classroom ? '#4338ca' : team ? '#0f766e' : colors.brand;
  const subLabel = platformTypeLabel(item.type);
  return (
    <View style={[
      styles.groupCard,
      team && styles.groupCardTeam,
      classroom && styles.groupCardClass,
      friends && styles.groupCardFriends,
      congregation && styles.groupCardCongregation,
      daycare && styles.groupCardDaycare,
      flexGroup && styles.groupCardFlex,
      deactivated && styles.groupCardOff,
    ]}>
      <TouchableOpacity
        style={styles.groupCardMain}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={deactivated ? { opacity: 0.55 } : null}>
          <AvatarBubble group avatarId={item.avatarId} photoURL={item.photoURL} name={item.name} size={48} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.groupName, deactivated && styles.groupNameOff]} numberOfLines={1}>
            {item.name || '—'}
          </Text>
          <Text style={styles.groupSub} numberOfLines={1}>
            {item.isPersonal ? 'Ditt arbeidsområde' : (isOrganizationType(item.type) ? 'Organisasjon' : subLabel)}
          </Text>
          {deactivated ? (
            <Text style={styles.badgeOff}>{deactivatedLabel}</Text>
          ) : null}
        </View>
        {!deactivated ? (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        ) : (
          <Ionicons name="settings-outline" size={18} color={colors.muted} />
        )}
      </TouchableOpacity>
      {canManage && onSettings ? (
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Innstillinger"
        >
          <Ionicons name="settings-outline" size={16} color={accent} />
          <Text style={[styles.settingsTxt, { color: accent }]}>
            Innstillinger
          </Text>
        </TouchableOpacity>
      ) : null}
      {deactivated && canReactivate ? (
        <TouchableOpacity
          style={styles.reactivateBtn}
          onPress={onReactivate}
          disabled={reactivating}
          accessibilityRole="button"
        >
          {reactivating ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <Text style={styles.reactivateTxt}>{reactivateLabel}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function FamilyOverviewScreen({ reloadKey }) {
  const navigation = useNavigation();
  const { selectFamily, applyFamilyPatch } = useApp();
  const { t } = useI18n();

  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingReactivate, setPendingReactivate] = useState(null);
  const [reactivateBusy, setReactivateBusy] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteBusyId, setInviteBusyId] = useState(null);
  const [inviteError, setInviteError] = useState('');

  const user = auth.currentUser;
  const isChild = !!user?.email?.endsWith('@weekplan.app');

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!user?.uid || isChild) {
      setPendingInvites([]);
      return undefined;
    }
    return listenIncomingFamilyInvites(user.uid, setPendingInvites);
  }, [user?.uid, isChild]);

  const sortAndFilter = useCallback((list) => {
    return (list || [])
      .filter((family) => !isGroupDeleted(family))
      .sort((a, b) => {
        const aArch = a.archived === true || a.active === false;
        const bArch = b.archived === true || b.active === false;
        if (aArch !== bArch) return aArch ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, []);

  const fetchFamilies = useCallback(async ({ fromRefresh = false } = {}) => {
    if (fromRefresh) setRefreshing(true); else setLoading(true);
    try {
      if (!user?.uid) { setFamilies([]); return; }
      if (isChild) {
        const childSnap = await getDocs(query(collection(db, 'children'), where('uid', '==', user.uid)));
        const seen = new Set();
        const list = [];
        for (const s of childSnap.docs) {
          const familyId = s.data()?.familyId;
          if (!familyId || seen.has(familyId)) continue;
          seen.add(familyId);
          const fsnap = await getDoc(doc(db, 'families', familyId));
          if (fsnap.exists()) list.push({ id: fsnap.id, ...fsnap.data() });
        }
        setFamilies(sortAndFilter(list));
        return;
      }
      const [mSnap, aSnap, oSnap] = await Promise.all([
        getDocs(query(collection(db, 'families'), where('members', 'array-contains', user.uid))),
        getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', user.uid))),
        getDocs(query(collection(db, 'families'), where('ownerUid', '==', user.uid))),
      ]);
      const map = new Map();
      [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
      // Tomme duplikat-klasserom (f.eks. etter trippel-trykk på Opprett) arkiveres automatisk.
      try {
        const archivedIds = await archiveEmptyDuplicateClassrooms(user.uid);
        archivedIds.forEach((id) => {
          const cur = map.get(id);
          if (cur) map.set(id, { ...cur, archived: true, active: false });
        });
      } catch { /* behold første liste */ }
      setFamilies(sortAndFilter([...map.values()]));
    } catch {
      Alert.alert(t('common.error'));
      setFamilies([]);
    } finally {
      if (fromRefresh) setRefreshing(false); else setLoading(false);
    }
  }, [user?.uid, isChild, sortAndFilter, t]);

  useFocusEffect(useCallback(() => { fetchFamilies(); return () => {}; }, [fetchFamilies, reloadKey]));

  const openFamily = async (family) => {
    await selectFamily(family.id);
    openPlatformHome(navigation, family);
  };

  const openSettings = async (family) => {
    await selectFamily(family.id);
    navigation.navigate('GroupSettings', { familyId: family.id });
  };

  const onAcceptInvite = async (inv) => {
    const inviteId = inv.inviteId || inv.id;
    const familyId = inv.familyId;
    if (!user?.uid || !inviteId || !familyId || inviteBusyId) return;
    setInviteBusyId(inviteId);
    setInviteError('');
    try {
      const res = await acceptFamilyMemberInvite({ familyId, inviteId, uid: user.uid });
      if (res?.familyId) {
        await selectFamily(res.familyId, {
          name: res.familyName || inv.familyName,
          type: inv.groupType || 'family',
        });
        await fetchFamilies({ fromRefresh: true });
        openPlatformHome(navigation, {
          id: res.familyId,
          name: res.familyName || inv.familyName,
          type: inv.groupType || 'family',
        });
      }
    } catch (e) {
      setInviteError(
        e?.message === 'already-handled'
          ? t('member.inviteAlreadyHandled')
          : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error')),
      );
    } finally {
      setInviteBusyId(null);
    }
  };

  const onDeclineInvite = async (inv) => {
    const inviteId = inv.inviteId || inv.id;
    const familyId = inv.familyId;
    if (!user?.uid || !inviteId || !familyId || inviteBusyId) return;
    setInviteBusyId(inviteId);
    setInviteError('');
    try {
      await declineFamilyMemberInvite({ familyId, inviteId, uid: user.uid });
    } catch (e) {
      setInviteError(
        e?.message === 'already-handled'
          ? t('member.inviteAlreadyHandled')
          : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error')),
      );
    } finally {
      setInviteBusyId(null);
    }
  };

  const confirmReactivate = async () => {
    const item = pendingReactivate;
    if (!item?.id || reactivateBusy) return;
    setReactivateBusy(true);
    try {
      await reactivateGroup(item.id);
      applyFamilyPatch?.(item.id, {
        archived: false,
        active: true,
        deleted: false,
        hiddenFromApp: false,
      });
      setPendingReactivate(null);
      await fetchFamilies();
    } catch {
      Alert.alert(t('common.error'));
    } finally {
      setReactivateBusy(false);
    }
  };

  const workspaces = families.filter((f) => isProtopWorkspace(f));
  const live = workspaces.filter((f) => !isGroupDeactivated(f));
  const deactivated = workspaces.filter((f) => isGroupDeactivated(f));
  const personalList = live.filter((f) => isPersonalShell(f));
  const orgList = live.filter((f) => isOrganizationType(f.type));
  const canCreate = !isChild;

  const canManage = (item) => {
    const uid = user?.uid;
    if (!uid || !item) return false;
    return item.ownerUid === uid || item.ownerId === uid
      || (Array.isArray(item.adminUids) && item.adminUids.includes(uid));
  };

  const renderGroup = (item, flags = {}) => (
    <GroupCard
      key={item.id}
      item={item}
      {...flags}
      deactivated={flags.off}
      canManage={canManage(item)}
      canReactivate={flags.off && canManage(item)}
      deactivatedLabel={t('group.deactivated')}
      reactivateLabel={t('group.reactivate')}
      reactivating={reactivateBusy && pendingReactivate?.id === item.id}
      onPress={() => (flags.off ? openSettings(item) : openFamily(item))}
      onSettings={canManage(item) ? () => openSettings(item) : undefined}
      onReactivate={() => setPendingReactivate(item)}
    />
  );

  const pickCreate = (action) => {
    setCreateOpen(false);
    if (action === 'join') {
      navigation.navigate('GroupJoin', { platformType: 'organization' });
      return;
    }
    navigation.navigate('Home', { openShell: { tab: 'projects' } });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Organisasjon</Text>
          <Text style={styles.hello}>Velg organisasjon</Text>
        </View>
        {canCreate && (
          <HelpTarget id="add">
            <TouchableOpacity
              style={styles.plus}
              onPress={() => setCreateOpen(true)}
              accessibilityLabel="Ny organisasjon"
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </HelpTarget>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchFamilies({ fromRefresh: true })} tintColor={colors.brand} />
        )}
      >
        {pendingInvites.length > 0 ? (
          <>
            <Text style={styles.section}>{t('member.pendingInvites')}</Text>
            {inviteError ? <Text style={styles.inviteError}>{inviteError}</Text> : null}
            {pendingInvites.map((inv) => {
              const inviteId = inv.inviteId || inv.id;
              const busy = inviteBusyId === inviteId;
              const label = inv.familyName || t('group.family');
              return (
                <View key={inviteId} style={styles.inviteCard}>
                  <View style={styles.inviteIcon}>
                    <Ionicons name="mail-unread-outline" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inviteTitle} numberOfLines={1}>{label}</Text>
                    <Text style={styles.inviteSub}>{t('member.homeInviteQuestion')}</Text>
                    <View style={styles.inviteActions}>
                      <TouchableOpacity
                        style={styles.inviteDecline}
                        onPress={() => onDeclineInvite(inv)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        <Text style={styles.inviteDeclineTxt}>{t('member.declineInvite')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inviteAccept}
                        onPress={() => onAcceptInvite(inv)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.inviteAcceptTxt}>{t('member.acceptInvite')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        <Text style={styles.section}>Ditt arbeidsområde</Text>
        {personalList.length === 0 ? (
          <Text style={styles.empty}>Du kan bruke ProTop alene. En organisasjon er valgfritt.</Text>
        ) : personalList.map((item) => renderGroup(item))}

        <Text style={[styles.section, { marginTop: 18 }]}>Organisasjoner ({orgList.length})</Text>
        {orgList.length === 0 ? (
          <Text style={styles.empty}>Ingen organisasjon ennå. Trykk + for å opprette eller bli med, hvis du er med i et firma.</Text>
        ) : orgList.map((item) => renderGroup(item))}

        {deactivated.length > 0 ? (
          <>
            <Text style={[styles.section, { marginTop: 18 }]}>
              {t('group.deactivatedSection')} ({deactivated.length})
            </Text>
            {deactivated.map((item) => renderGroup(item, { off: true }))}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Organisasjon</Text>
            <Text style={styles.sheetLead}>Du trenger ikke være med i flere. Opprett et firma, eller bli med hvis du er invitert.</Text>

            <TouchableOpacity style={styles.sheetRow} onPress={() => pickCreate('create')}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="business-outline" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowTitle}>Opprett bedrift</Text>
                <Text style={styles.sheetRowSub}>Søk opp virksomheten i Brønnøysund</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetRow} onPress={() => pickCreate('join')}>
              <View style={[styles.sheetIcon, { backgroundColor: '#f1f5f9' }]}>
                <Ionicons name="key-outline" size={22} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowTitle}>Bli med i eksisterende</Text>
                <Text style={styles.sheetRowSub}>Kode fra en administrator i firmaet</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancel} onPress={() => setCreateOpen(false)}>
              <Text style={styles.sheetCancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={!!pendingReactivate}
        title={t('group.reactivateGroup')}
        body={t('group.reactivateBody')}
        confirmLabel={t('group.reactivate')}
        cancelLabel={t('common.cancel')}
        busy={reactivateBusy}
        onCancel={() => !reactivateBusy && setPendingReactivate(null)}
        onConfirm={confirmReactivate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  hello: { fontSize: 24, fontWeight: '900', color: colors.ink, marginTop: 2 },
  plus: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fab,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 10, fontSize: 13, fontWeight: '800', color: colors.ink,
  },
  inviteCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.brand,
    padding: 14,
    marginBottom: 10,
  },
  inviteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTitle: { fontWeight: '900', fontSize: 16, color: colors.ink },
  inviteSub: { fontWeight: '600', fontSize: 13, color: colors.muted, marginTop: 2 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inviteAccept: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  inviteAcceptTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  inviteDecline: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 40,
  },
  inviteDeclineTxt: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  inviteError: { color: colors.danger, fontWeight: '700', fontSize: 13, marginBottom: 8 },
  empty: { color: colors.muted, fontWeight: '600', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  tileGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20,
  },
  tile: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontWeight: '800', color: colors.ink, marginTop: 8, fontSize: 12, textAlign: 'center' },
  tileSub: { color: colors.muted, fontWeight: '600', fontSize: 10, marginTop: 2, textAlign: 'center' },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  groupCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  groupCardTeam: { borderColor: '#cce7df' },
  groupCardClass: { borderColor: '#c7d2fe' },
  groupCardFriends: { borderColor: '#bae6fd' },
  groupCardCongregation: { borderColor: '#cbd5e1' },
  groupCardDaycare: { borderColor: '#fecdd3' },
  groupCardFlex: { borderColor: '#cbd5e1' },
  groupCardOff: { backgroundColor: '#eef1f5', borderColor: '#d5dbe3' },
  groupName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  groupNameOff: { color: '#94a3b8' },
  groupSub: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '600' },
  badgeOff: {
    marginTop: 4,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: '#f8fafc',
  },
  settingsTxt: {
    color: colors.brand,
    fontWeight: '800',
    fontSize: 13,
  },
  reactivateBtn: {
    backgroundColor: '#e4f5ea',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#d5dbe3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactivateTxt: { color: colors.success, fontWeight: '800', fontSize: 12 },
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(26, 39, 68, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: colors.ink },
  sheetLead: { marginTop: 6, marginBottom: 16, color: colors.muted, fontWeight: '600', fontSize: 14 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  sheetIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  sheetRowTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sheetRowSub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.muted },
  sheetCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  sheetCancelTxt: { color: colors.muted, fontWeight: '800', fontSize: 15 },
});
