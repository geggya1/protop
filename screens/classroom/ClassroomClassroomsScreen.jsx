import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { archiveEmptyDuplicateClassrooms, listUserClassrooms } from '../../src/utils/classroom';
import { isGroupDeactivated, reactivateGroup } from '../../src/utils/groups';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { classroomColors as c } from '../../src/classroomTheme';
import { AvatarBubble } from '../../components/AvatarPicker';
import HelpTarget from '../../components/HelpTarget';

export default function ClassroomClassroomsScreen({ embedded, onOpenClassroom }) {
  const nav = useNavigation();
  const { uid, familyId, selectFamily, applyFamilyPatch } = useApp();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cleanupNote, setCleanupNote] = useState('');
  const [reactivateBusyId, setReactivateBusyId] = useState(null);

  const load = useCallback(async (fromRefresh = false) => {
    if (!uid) {
      setRooms([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (fromRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const archivedIds = await archiveEmptyDuplicateClassrooms(uid, { keepId: familyId || undefined });
      if (archivedIds.length > 0) {
        setCleanupNote(
          archivedIds.length === 1
            ? 'Én tom duplikat-klasse ble arkivert.'
            : `${archivedIds.length} tomme duplikat-klasser ble arkivert.`,
        );
      }
      const list = await listUserClassrooms(uid, { includeDeactivated: true });
      setRooms(Array.isArray(list) ? list : []);
    } catch (e) {
      setRooms([]);
      setError(e?.message || 'Kunne ikke hente klasser.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, familyId]);

  useEffect(() => { load(false); }, [load]);

  const live = useMemo(() => rooms.filter((r) => !isGroupDeactivated(r)), [rooms]);
  const deactivated = useMemo(() => rooms.filter((r) => isGroupDeactivated(r)), [rooms]);

  const canManage = (room) => {
    if (!uid || !room) return false;
    return room.ownerUid === uid || room.ownerId === uid
      || (Array.isArray(room.adminUids) && room.adminUids.includes(uid));
  };

  const open = async (room) => {
    if (!room?.id || isGroupDeactivated(room)) return;
    try {
      await selectFamily(room.id);
      if (onOpenClassroom) onOpenClassroom(room.id);
      else nav.navigate('ClassroomHome', { module: 'home' });
    } catch (e) {
      setError(e?.message || 'Kunne ikke åpne klassen.');
    }
  };

  const openSettings = async (room) => {
    if (!room?.id) return;
    try {
      await selectFamily(room.id);
      nav.navigate('GroupSettings', { familyId: room.id });
    } catch (e) {
      setError(e?.message || 'Kunne ikke åpne innstillinger.');
    }
  };

  const onReactivate = async (room) => {
    if (!room?.id || reactivateBusyId) return;
    setReactivateBusyId(room.id);
    try {
      await reactivateGroup(room.id);
      applyFamilyPatch?.(room.id, {
        archived: false,
        active: true,
        reactivatedAt: new Date().toISOString(),
      });
      await load(true);
    } catch (e) {
      setError(e?.message || 'Klarte ikke å reaktivere.');
    } finally {
      setReactivateBusyId(null);
    }
  };

  const renderRow = (item, { off = false } = {}) => (
    <View key={item.id} style={[styles.rowWrap, off && styles.rowWrapOff]}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => (off ? openSettings(item) : open(item))}
        activeOpacity={0.85}
      >
        <View style={off ? { opacity: 0.55 } : null}>
          <AvatarBubble
            group
            avatarId={item.avatarId}
            photoURL={item.photoURL}
            name={item.name}
            size={48}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.rowName, off && styles.rowNameOff]} numberOfLines={1}>
            {item.name || 'Klasse'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {[item.school, item.grade].filter(Boolean).join(' · ') || 'Klasserom'}
          </Text>
          {off ? <Text style={styles.badgeOff}>Deaktivert</Text> : null}
        </View>
        {!off ? (
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        ) : (
          <Ionicons name="settings-outline" size={20} color={c.muted} />
        )}
      </TouchableOpacity>
      {canManage(item) ? (
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => openSettings(item)}
          accessibilityLabel="Klasseinnstillinger"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={18} color={c.brand} />
        </TouchableOpacity>
      ) : null}
      {off && canManage(item) ? (
        <TouchableOpacity
          style={styles.reactivateBtn}
          onPress={() => onReactivate(item)}
          disabled={!!reactivateBusyId}
        >
          {reactivateBusyId === item.id
            ? <ActivityIndicator size="small" color={c.brand} />
            : <Text style={styles.reactivateTxt}>Reaktiver</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
        <Text style={styles.loadingTxt}>Henter klasser…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, embedded ? styles.wrapEmbedded : styles.wrapSolo]}>
      {!embedded && (
        <View style={styles.head}>
          <Text style={styles.title}>Klasser</Text>
          <HelpTarget id="add">
            <TouchableOpacity style={styles.plus} onPress={() => nav.navigate('ClassroomCreate')}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </HelpTarget>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.brand} />
        )}
      >
        {embedded ? (
          <TouchableOpacity style={styles.createBtn} onPress={() => nav.navigate('ClassroomCreate')}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnTxt}>Opprett ny klasse</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.joinBtn} onPress={() => nav.navigate('ClassroomJoin')}>
          <Ionicons name="key-outline" size={18} color={c.brand} />
          <Text style={styles.joinTxt}>Har du en klassekode?</Text>
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>{error}</Text>
            <TouchableOpacity onPress={() => load(false)}>
              <Text style={styles.retryTxt}>Prøv igjen</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!cleanupNote && (
          <View style={styles.noteBox}>
            <Text style={styles.noteTxt}>{cleanupNote}</Text>
            <TouchableOpacity onPress={() => setCleanupNote('')}>
              <Text style={styles.retryTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        {live.length === 0 && deactivated.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen klasser ennå</Text>
            <Text style={styles.emptySub}>
              Bruk + for å opprette klasserom, eller bli med med unik kode.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => nav.navigate('ClassroomCreate')}>
              <Text style={styles.emptyBtnTxt}>Opprett klasse</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {live.length > 0 ? (
          <>
            <Text style={styles.section}>Aktive ({live.length})</Text>
            <Text style={styles.hint}>
              Trykk tannhjulet for å deaktivere eller slette et klasserom (samme som for familier).
            </Text>
            {live.map((item) => renderRow(item))}
          </>
        ) : null}

        {deactivated.length > 0 ? (
          <>
            <Text style={[styles.section, { marginTop: 16 }]}>
              Deaktivert ({deactivated.length})
            </Text>
            {deactivated.map((item) => renderRow(item, { off: true }))}
          </>
        ) : null}

        <TouchableOpacity style={styles.familyLink} onPress={() => goPlatformOverview(nav)}>
          <Ionicons name="swap-horizontal-outline" size={18} color={c.tint} />
          <Text style={styles.familyLinkTxt}>Skift plattform</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  wrapEmbedded: { backgroundColor: 'transparent' },
  wrapSolo: { backgroundColor: c.bg },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 10,
  },
  loadingTxt: { color: c.muted, fontWeight: '700', fontSize: 13 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '900', color: c.ink },
  plus: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.fab,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: 16, paddingVertical: 14, marginBottom: 12,
    borderWidth: 1, borderColor: c.line,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 16, paddingVertical: 14, marginBottom: 10,
  },
  createBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  joinTxt: { color: c.brand, fontWeight: '800', fontSize: 15 },
  section: {
    color: c.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', marginBottom: 6,
  },
  hint: {
    color: c.muted, fontWeight: '600', fontSize: 12, lineHeight: 17, marginBottom: 10,
  },
  errorBox: {
    backgroundColor: '#fef2f2', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#fecaca', gap: 8,
  },
  errorTxt: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  noteBox: {
    backgroundColor: '#eef2ff', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#c7d2fe', gap: 8,
  },
  noteTxt: { color: c.ink, fontWeight: '700', fontSize: 13 },
  retryTxt: { color: c.brand, fontWeight: '800', fontSize: 13 },
  rowWrap: {
    backgroundColor: c.surface, borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: c.line, overflow: 'hidden',
  },
  rowWrapOff: { backgroundColor: '#eef1f5', borderColor: '#d5dbe3' },
  rowMain: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
  },
  settingsBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.brandSoft,
  },
  reactivateBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#d5dbe3',
    backgroundColor: '#e4f5ea',
  },
  reactivateTxt: { color: '#15803d', fontWeight: '800', fontSize: 13 },
  rowName: { color: c.ink, fontWeight: '800', fontSize: 16 },
  rowNameOff: { color: c.muted },
  rowSub: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  badgeOff: {
    marginTop: 4, alignSelf: 'flex-start',
    color: c.muted, fontWeight: '800', fontSize: 11, textTransform: 'uppercase',
  },
  empty: {
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20,
    backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { color: c.ink, fontWeight: '800', fontSize: 17 },
  emptySub: { color: c.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '600' },
  emptyBtn: {
    marginTop: 16, backgroundColor: c.brand, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '800' },
  familyLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12,
  },
  familyLinkTxt: { color: c.tint, fontWeight: '800' },
});
