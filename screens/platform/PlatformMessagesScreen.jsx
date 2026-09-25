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
import { AvatarBubble } from '../../components/AvatarPicker';

function dmChatId(a, b) {
  return ['dm', ...[a, b].sort()].join('_');
}

function ThreadRow({ avatar, name, preview, timeLabel, onPress }) {
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

export default function PlatformMessagesScreen({ config, groupId, group }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid, familyId } = useApp();
  const dockPreferred = useChatDockPreferred();
  const { openThread } = useChatDock();
  const fid = groupId || familyId;
  const chatId = config.chatId || 'group';
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupPreview, setGroupPreview] = useState('Skriv til hele gruppen…');
  const [groupUpdatedAt, setGroupUpdatedAt] = useState(null);
  const [dmMeta, setDmMeta] = useState({});

  const people = useMemo(() => (
    (parents || [])
      .map((p) => ({ ...p, uid: p.uid || (String(p.id || '').length > 20 ? p.id : null) }))
      .filter((p) => p.uid && p.active !== false && p.placeholder !== true && p.deleted !== true)
  ), [parents]);

  const others = useMemo(() => people.filter((p) => p.uid !== uid), [people, uid]);
  const allMemberIds = useMemo(() => people.map((p) => p.uid).filter(Boolean), [people]);

  useEffect(() => {
    if (!fid) { setLoading(false); return undefined; }
    return onSnapshot(collection(db, 'families', fid, 'parents'), (snap) => {
      setParents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setParents([]); setLoading(false); });
  }, [fid]);

  useEffect(() => {
    if (!fid || !allMemberIds.length) return undefined;
    ensureChatDoc(fid, chatId, {
      type: config.type,
      title: group?.name || config.chatTitle,
      memberIds: allMemberIds,
    }).catch(() => {});
    return undefined;
  }, [fid, group?.name, allMemberIds, chatId, config.type, config.chatTitle]);

  useEffect(() => {
    if (!fid) return undefined;
    const qy = query(
      collection(db, 'families', fid, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    return onSnapshot(qy, (snap) => {
      const d = snap.docs[0];
      if (!d) return;
      const data = d.data() || {};
      setGroupPreview(data.text || (data.type === 'image' ? '📷 Bilde' : 'Skriv til hele gruppen…'));
      setGroupUpdatedAt(data.createdAt || null);
    }, () => {});
  }, [fid, chatId]);

  useEffect(() => {
    if (!fid || !uid) return undefined;
    const unsubs = others.map((person) => {
      const id = dmChatId(uid, person.uid);
      const qy = query(
        collection(db, 'families', fid, 'chats', id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      return onSnapshot(qy, (snap) => {
        const d = snap.docs[0];
        setDmMeta((prev) => ({
          ...prev,
          [person.uid]: d ? {
            preview: d.data().text || (d.data().type === 'image' ? '📷' : ''),
            at: d.data().createdAt || null,
          } : prev[person.uid],
        }));
      }, () => {});
    });
    return () => unsubs.forEach((u) => u && u());
  }, [fid, others, uid]);

  const openGroupChat = () => {
    const thread = {
      familyId: fid,
      chatId,
      title: group?.name || config.chatTitle,
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: c.ink }]}>Meldinger</Text>
          <Text style={[styles.pageSub, { color: c.muted }]}>Gruppechat og direkte meldinger</Text>
        </View>
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: c.brandSoft }]}
          onPress={() => setPickerOpen(true)}
        >
          <Ionicons name="create-outline" size={18} color={c.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        <Text style={[styles.section, { color: c.muted }]}>Hele {config.labelShort.toLowerCase()}en</Text>
        <ThreadRow
          name={group?.name || config.chatTitle}
          preview={groupPreview}
          timeLabel={formatThreadTime(groupUpdatedAt)}
          onPress={openGroupChat}
          avatar={(
            <View style={[styles.groupAv, { backgroundColor: c.brandSoft }]}>
              <Ionicons name="people" size={18} color={c.brand} />
            </View>
          )}
        />

        <Text style={[styles.section, styles.sectionGap, { color: c.muted }]}>Direkte meldinger</Text>
        {others.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>Ingen andre medlemmer å chatte med ennå.</Text>
        ) : others.map((p) => {
          const meta = dmMeta[p.uid] || {};
          return (
            <ThreadRow
              key={p.uid}
              name={p.name || 'Medlem'}
              preview={meta.preview || 'Start en samtale'}
              timeLabel={formatThreadTime(meta.at)}
              onPress={() => openDm(p)}
              avatar={<AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={40} />}
            />
          );
        })}
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modalPanel, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.ink }]}>Velg mottaker</Text>
            {others.map((p) => (
              <TouchableOpacity key={p.uid} style={styles.modalRow} onPress={() => openDm(p)}>
                <AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={36} />
                <Text style={[styles.modalName, { color: c.ink }]}>{p.name || 'Medlem'}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 18, fontWeight: '400' },
  pageSub: { fontSize: 12, marginTop: 2 },
  composeBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, paddingHorizontal: 16 },
  section: { fontSize: 11, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sectionGap: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avWrap: { width: 40 },
  groupAv: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '400', flex: 1 },
  time: { fontSize: 11 },
  preview: { fontSize: 13, marginTop: 2 },
  empty: { fontSize: 13, lineHeight: 18 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalPanel: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 16, fontWeight: '400', marginBottom: 12 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  modalName: { fontSize: 15, fontWeight: '400' },
});
