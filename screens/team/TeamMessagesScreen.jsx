import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  collection, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';
import { formatThreadTime } from '../../src/utils/aiChats';
import { ensureChatDoc } from '../../src/utils/chats';
import { teamColors as c } from '../../src/teamTheme';
import { AvatarBubble } from '../../components/AvatarPicker';

const AVATAR = 40;
const TEAM_CHAT_ID = 'team';

function dmChatId(a, b) {
  return ['dm', ...[a, b].sort()].join('_');
}

function groupChatId(uids) {
  const sorted = [...new Set(uids.filter(Boolean))].sort();
  if (sorted.length <= 1) return null;
  if (sorted.length === 2) return dmChatId(sorted[0], sorted[1]);
  return `g_${sorted.join('_')}`;
}

function ThreadRow({
  avatar, name, preview, timeLabel, onPress,
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <View style={styles.avWrap}>{avatar}</View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!timeLabel && <Text style={styles.time}>{timeLabel}</Text>}
        </View>
        <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TeamMessagesScreen({ teamId, team }) {
  const nav = useNavigation();
  const { uid, familyId, family } = useApp();
  const dockPreferred = useChatDockPreferred();
  const { openThread } = useChatDock();
  const fid = teamId || familyId;
  const teamDoc = team || family;
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [selected, setSelected] = useState({});
  const [teamPreview, setTeamPreview] = useState('Skriv til hele laget…');
  const [teamUpdatedAt, setTeamUpdatedAt] = useState(null);
  const [dmMeta, setDmMeta] = useState({});

  const people = useMemo(() => (
    (parents || [])
      .map((p) => ({
        ...p,
        uid: p.uid || (String(p.id || '').length > 20 ? p.id : null),
      }))
      .filter((p) => p.uid && p.active !== false && p.placeholder !== true && p.deleted !== true)
  ), [parents]);

  const others = useMemo(
    () => people.filter((p) => p.uid !== uid),
    [people, uid],
  );

  const allMemberIds = useMemo(
    () => people.map((p) => p.uid).filter(Boolean),
    [people],
  );

  useEffect(() => {
    if (!fid) { setLoading(false); return undefined; }
    return onSnapshot(
      collection(db, 'families', fid, 'parents'),
      (snap) => {
        setParents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => { setParents([]); setLoading(false); },
    );
  }, [fid]);

  const allMemberKey = useMemo(
    () => [...new Set(allMemberIds.filter(Boolean))].sort().join('|'),
    [allMemberIds],
  );

  useEffect(() => {
    if (!fid || !allMemberKey) return undefined;
    ensureChatDoc(fid, TEAM_CHAT_ID, {
      type: 'team',
      title: teamDoc?.name || 'Laget',
      memberIds: allMemberKey.split('|'),
    }).catch(() => {});
    return undefined;
  }, [fid, teamDoc?.name, allMemberKey]);

  useEffect(() => {
    if (!fid) return undefined;
    const qy = query(
      collection(db, 'families', fid, 'chats', TEAM_CHAT_ID, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    return onSnapshot(qy, (snap) => {
      const d = snap.docs[0];
      if (!d) return;
      const data = d.data() || {};
      setTeamPreview(data.text || (data.type === 'image' ? '📷 Bilde' : 'Skriv til hele laget…'));
      setTeamUpdatedAt(data.createdAt || null);
    }, () => {});
  }, [fid]);

  const othersKey = useMemo(
    () => others.map((p) => p.uid).filter(Boolean).sort().join('|'),
    [others],
  );

  useEffect(() => {
    if (!fid || !uid || !othersKey) return undefined;
    const people = othersKey.split('|');
    const unsubs = people.map((personUid) => {
      const id = dmChatId(uid, personUid);
      const qy = query(
        collection(db, 'families', fid, 'chats', id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      return onSnapshot(qy, (snap) => {
        const d = snap.docs[0];
        setDmMeta((prev) => ({
          ...prev,
          [personUid]: d ? {
            preview: d.data().text || (d.data().type === 'image' ? '📷' : ''),
            at: d.data().createdAt || null,
          } : prev[personUid],
        }));
      }, () => {});
    });
    return () => unsubs.forEach((u) => u && u());
  }, [fid, othersKey, uid]);

  const openTeamChat = () => {
    const thread = {
      familyId: fid,
      chatId: TEAM_CHAT_ID,
      title: teamDoc?.name || 'Laget',
      memberIds: allMemberIds,
    };
    if (dockPreferred) {
      openThread(thread);
      return;
    }
    nav.navigate('ChatThread', thread);
  };

  const openDm = async (person) => {
    if (!person?.uid || !uid) return;
    setPickerOpen(false);
    setMultiMode(false);
    setSelected({});
    const id = dmChatId(uid, person.uid);
    await ensureChatDoc(fid, id, {
      type: 'dm',
      title: person.name || 'Direkte melding',
      memberIds: [uid, person.uid],
    });
    const thread = {
      familyId: fid,
      chatId: id,
      title: person.name || 'Direkte melding',
      memberIds: [uid, person.uid],
      photoURL: person.photoURL || person.photoUrl || null,
      avatarId: person.avatarId || null,
    };
    if (dockPreferred) {
      openThread(thread);
      return;
    }
    nav.navigate('ChatThread', thread);
  };

  const toggleSelect = (personUid) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[personUid]) delete next[personUid];
      else next[personUid] = true;
      return next;
    });
  };

  const startSelectedChat = async () => {
    const picked = Object.keys(selected);
    if (!picked.length || !uid) return;
    const memberIds = [uid, ...picked];
    const id = groupChatId(memberIds);
    if (!id) return;
    const names = others
      .filter((p) => selected[p.uid])
      .map((p) => p.name || 'Medlem');
    const title = names.length === 1
      ? names[0]
      : (names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`);
    setPickerOpen(false);
    setMultiMode(false);
    setSelected({});
    await ensureChatDoc(fid, id, {
      type: picked.length === 1 ? 'dm' : 'group',
      title,
      memberIds,
    });
    const thread = {
      familyId: fid,
      chatId: id,
      title,
      memberIds,
    };
    if (dockPreferred) {
      openThread(thread);
      return;
    }
    nav.navigate('ChatThread', thread);
  };

  const selectedCount = Object.keys(selected).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  if (!fid) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Velg et lag for å chatte.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Meldinger</Text>
          <Text style={styles.pageSub}>Lagchat og direkte meldinger</Text>
        </View>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => { setPickerOpen(true); setMultiMode(false); setSelected({}); }}
          accessibilityLabel="Ny melding"
        >
          <Ionicons name="create-outline" size={18} color={c.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Hele laget</Text>
        <ThreadRow
          name={teamDoc?.name || 'Laget'}
          preview={teamPreview}
          timeLabel={formatThreadTime(teamUpdatedAt)}
          onPress={openTeamChat}
          avatar={(
            <View style={styles.groupAv}>
              <Ionicons name="people" size={18} color={c.brand} />
            </View>
          )}
        />

        <Text style={[styles.section, styles.sectionGap]}>Direkte meldinger</Text>
        {others.length === 0 ? (
          <Text style={styles.empty}>
            Ingen andre foresatte/ledere å chatte med ennå. Inviter deltakere fra Medlemmer.
          </Text>
        ) : others.map((p) => {
          const meta = dmMeta[p.uid] || {};
          return (
            <ThreadRow
              key={p.uid}
              name={p.name || 'Medlem'}
              preview={meta.preview || (p.admin || p.superAdmin ? 'Administrator' : 'Foresatt')}
              timeLabel={formatThreadTime(meta.at)}
              onPress={() => openDm(p)}
              avatar={(
                <AvatarBubble
                  avatarId={p.avatarId}
                  photoURL={p.photoURL}
                  name={p.name}
                  size={AVATAR}
                />
              )}
            />
          );
        })}
        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Ny melding</Text>
            <Text style={styles.sheetLead}>
              Velg én for direkte melding, eller flere for en gruppechat.
            </Text>

            <TouchableOpacity style={styles.pickRow} onPress={() => { setPickerOpen(false); openTeamChat(); }}>
              <View style={styles.groupAv}>
                <Ionicons name="people" size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickName}>Hele laget</Text>
                <Text style={styles.pickSub}>{teamDoc?.name || 'Alle foresatte og ledere'}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.sheetHeadRow}>
              <Text style={styles.sheetSection}>Medlemmer</Text>
              <TouchableOpacity onPress={() => setMultiMode((v) => !v)}>
                <Text style={styles.multiToggle}>{multiMode ? 'Én person' : 'Velg flere'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {others.map((p) => {
                const on = !!selected[p.uid];
                return (
                  <TouchableOpacity
                    key={p.uid}
                    style={styles.pickRow}
                    onPress={() => (multiMode ? toggleSelect(p.uid) : openDm(p))}
                  >
                    <AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickName}>{p.name || 'Medlem'}</Text>
                      <Text style={styles.pickSub}>
                        {p.admin || p.superAdmin ? 'Administrator' : 'Foresatt'}
                      </Text>
                    </View>
                    {multiMode && (
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? c.brand : c.muted}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              {others.length === 0 && (
                <Text style={styles.empty}>Ingen mottakere ennå.</Text>
              )}
            </ScrollView>

            {multiMode && (
              <TouchableOpacity
                style={[styles.startBtn, selectedCount === 0 && { opacity: 0.4 }]}
                disabled={selectedCount === 0}
                onPress={startSelectedChat}
              >
                <Text style={styles.startBtnTxt}>
                  {selectedCount <= 1
                    ? 'Start direkte melding'
                    : `Start gruppechat (${selectedCount})`}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPickerOpen(false)}>
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 4, minHeight: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 6, minHeight: 36,
  },
  pageTitle: { fontSize: 20, fontWeight: '400', color: c.ink },
  pageSub: { fontSize: 12, fontWeight: '400', color: c.muted, marginTop: 1 },
  composeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
    alignItems: 'center', justifyContent: 'center', marginLeft: 'auto',
  },
  section: {
    fontSize: 11, fontWeight: '400', color: c.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 8, paddingBottom: 4, paddingHorizontal: 4,
  },
  sectionGap: { marginTop: 10 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4, minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  avWrap: { width: AVATAR, height: AVATAR },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontWeight: '400', fontSize: 14, color: c.ink },
  time: { fontSize: 11, fontWeight: '400', color: c.muted },
  preview: { color: c.muted, fontWeight: '500', fontSize: 12, marginTop: 2 },
  groupAv: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  empty: { padding: 14, color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(26, 39, 68, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 16, maxHeight: '80%',
  },
  sheetTitle: { fontWeight: '400', fontSize: 18, color: c.ink },
  sheetLead: { color: c.muted, fontWeight: '400', fontSize: 13, marginTop: 4, marginBottom: 10, lineHeight: 18 },
  sheetHeadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8,
  },
  sheetSection: {
    fontSize: 11, fontWeight: '400', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  multiToggle: { color: c.brand, fontWeight: '400', fontSize: 13 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  pickName: { fontWeight: '400', fontSize: 14, color: c.ink },
  pickSub: { color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 1 },
  startBtn: {
    alignSelf: 'flex-start',
    marginTop: 12, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  startBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  cancelBtn: {
    alignSelf: 'flex-start', marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  cancelTxt: { fontWeight: '400', color: c.muted, fontSize: 14 },
});
