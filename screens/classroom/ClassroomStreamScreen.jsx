import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenClassMessages, listenSubjects, MESSAGE_AUDIENCES, messageVisibleTo,
  isClassroomAdmin, staffRoleOf, markClassMessageRead,
  listenMessageComments, addMessageComment, resolvePrimaryStudent,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';
import { formatThreadTime } from '../../src/utils/aiChats';

/** Strøm — Google Classroom-inspirert kunngjøring + kommentarer. */
export default function ClassroomStreamScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid, activeProfile, viewingChildId, activeChildId } = useApp();
  const [messages, setMessages] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenClassMessages(classroomId, (list) => { setMessages(list); setLoading(false); }),
      listenSubjects(classroomId, setSubjects),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId || !expandedId) { setComments([]); return undefined; }
    return listenMessageComments(classroomId, expandedId, setComments);
  }, [classroomId, expandedId]);

  const isStaff = !!staffRoleOf(classroom, uid, staff);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const myStudent = useMemo(
    () => resolvePrimaryStudent(students, staff, uid, viewingChildId || activeChildId),
    [students, staff, uid, viewingChildId, activeChildId],
  );

  const visible = useMemo(
    () => messages.filter((m) => messageVisibleTo({
      message: m,
      uid,
      isStaff,
      studentId: myStudent?.id,
      studentSubjectIds: myStudent?.subjectIds,
    })),
    [messages, uid, isStaff, myStudent?.id, myStudent?.subjectIds],
  );

  const audLabel = (m) => MESSAGE_AUDIENCES.find((a) => a.id === m.audience)?.label || m.audience;
  const subjectNames = (ids) => (ids || []).map((id) => subjects.find((s) => s.id === id)?.name).filter(Boolean).join(', ');

  const openPost = (m) => {
    setExpandedId((cur) => (cur === m.id ? null : m.id));
    markClassMessageRead(classroomId, m.id, uid).catch(() => {});
  };

  const sendComment = async () => {
    if (sending || !expandedId) return;
    setSending(true);
    try {
      await addMessageComment(classroomId, expandedId, {
        body: draft,
        authorUid: uid,
        authorName: activeProfile?.name || activeProfile?.displayName || '',
        authorRole: isStaff ? 'staff' : 'student',
      });
      setDraft('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke kommentere.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        Strøm — kunngjøringer fra lærere, med kommentarer. Oppgaver ligger under Klassearbeid.
      </Text>
      {isStaff && (
        <TouchableOpacity
          style={styles.cta}
          onPress={() => nav.navigate('ClassroomComposeMessage', { classroomId, classroom })}
        >
          <Ionicons name="megaphone-outline" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Ny kunngjøring</Text>
        </TouchableOpacity>
      )}
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen innlegg ennå</Text>
          <Text style={styles.emptySub}>Lærere deler kunngjøringer her — elever kan kommentere.</Text>
        </View>
      ) : visible.map((m) => {
        const read = !!(m.readBy && m.readBy[uid]);
        const open = expandedId === m.id;
        return (
          <View key={m.id} style={[styles.card, !read && styles.cardUnread]}>
            <TouchableOpacity onPress={() => openPost(m)} activeOpacity={0.85}>
              <Text style={styles.meta}>
                {audLabel(m)}
                {m.subjectIds?.length ? ` · ${subjectNames(m.subjectIds)}` : ''}
              </Text>
              {!!m.title && <Text style={styles.title}>{m.title}</Text>}
              <Text style={styles.bodyTxt}>{m.body}</Text>
              <Text style={styles.foot}>
                {m.authorName || 'Lærer'}
                {m.createdAt ? ` · ${formatThreadTime(m.createdAt)}` : ''}
                {` · ${m.commentCount || 0} kommentarer`}
                {isAdmin && m.readBy ? ` · ${Object.keys(m.readBy).length} sett` : ''}
              </Text>
            </TouchableOpacity>
            {open ? (
              <View style={styles.thread}>
                {comments.map((cm) => (
                  <View key={cm.id} style={styles.comment}>
                    <Text style={styles.commentAuthor}>
                      {cm.authorName || (cm.authorRole === 'staff' ? 'Lærer' : 'Elev')}
                      {cm.createdAt ? ` · ${formatThreadTime(cm.createdAt)}` : ''}
                    </Text>
                    <Text style={styles.commentBody}>{cm.body}</Text>
                  </View>
                ))}
                <View style={styles.commentRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Skriv en kommentar…"
                    placeholderTextColor={c.muted}
                  />
                  <TouchableOpacity
                    style={[styles.commentSend, (!draft.trim() || sending) && { opacity: 0.45 }]}
                    onPress={sendComment}
                    disabled={!draft.trim() || sending}
                  >
                    {sending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Ionicons name="send" size={16} color="#fff" />}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  empty: {
    alignItems: 'center', padding: 24, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { marginTop: 8, color: c.ink, fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: c.muted, textAlign: 'center', fontWeight: '600' },
  card: {
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.line,
  },
  cardUnread: { borderColor: c.brand, backgroundColor: '#f5f3ff' },
  meta: { color: c.muted, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  title: { marginTop: 6, color: c.ink, fontWeight: '900', fontSize: 16 },
  bodyTxt: { marginTop: 6, color: c.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  foot: { marginTop: 10, color: c.muted, fontWeight: '600', fontSize: 12 },
  thread: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 8,
  },
  comment: {
    backgroundColor: c.surface2, borderRadius: 10, padding: 10,
  },
  commentAuthor: { color: c.muted, fontWeight: '700', fontSize: 11, marginBottom: 4 },
  commentBody: { color: c.ink, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  commentRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  commentInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: c.line,
    paddingHorizontal: 12, paddingVertical: 10, color: c.ink, fontWeight: '600',
  },
  commentSend: {
    width: 42, borderRadius: 12, backgroundColor: c.brand,
    alignItems: 'center', justifyContent: 'center',
  },
});
