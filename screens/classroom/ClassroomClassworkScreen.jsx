import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, Pressable, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenClassTopics, createClassTopic, listenClasswork, CLASSWORK_TYPES,
  classworkTypeMeta, classworkVisibleToStudent, isClassroomAdmin, staffRoleOf,
  listenSubjects, resolvePrimaryStudent,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

/** Klassearbeid — emner, oppgaver, materiell og spørsmål (Google Classroom-inspirert). */
export default function ClassroomClassworkScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid, viewingChildId, activeChildId } = useApp();
  const [topics, setTopics] = useState([]);
  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const isStaff = !!staffRoleOf(classroom, uid, staff);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const myStudent = useMemo(
    () => resolvePrimaryStudent(students, staff, uid, viewingChildId || activeChildId),
    [students, staff, uid, viewingChildId, activeChildId],
  );

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenClassTopics(classroomId, setTopics),
      // Utkast/planlagt kun synlig for ansatte — elever filtreres i visibleItems + classworkVisibleToStudent
      listenClasswork(
        classroomId,
        (list) => { setItems(list); setLoading(false); },
        { includeDrafts: true },
      ),
      listenSubjects(classroomId, setSubjects),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.deleted !== true && s.active !== false));
      }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  const visibleItems = useMemo(() => {
    if (isStaff) return items;
    return items.filter((it) => classworkVisibleToStudent(it, myStudent?.id));
  }, [items, isStaff, myStudent?.id]);

  const grouped = useMemo(() => {
    const byTopic = new Map();
    const uncategorized = [];
    visibleItems.forEach((it) => {
      if (it.topicId) {
        const arr = byTopic.get(it.topicId) || [];
        arr.push(it);
        byTopic.set(it.topicId, arr);
      } else uncategorized.push(it);
    });
    const sections = topics
      .filter((t) => byTopic.has(t.id) || isStaff)
      .map((t) => ({ topic: t, items: byTopic.get(t.id) || [] }));
    if (uncategorized.length || (isStaff && !topics.length && !visibleItems.length)) {
      sections.push({ topic: { id: '_none', name: 'Uten emne' }, items: uncategorized });
    } else if (uncategorized.length) {
      sections.push({ topic: { id: '_none', name: 'Uten emne' }, items: uncategorized });
    }
    return sections;
  }, [topics, visibleItems, isStaff]);

  const addTopic = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createClassTopic(classroomId, { name: topicName, createdBy: uid });
      setTopicName('');
      setTopicOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette emne.');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (type) => {
    setCreateOpen(false);
    nav.navigate('ClassroomClassworkEditor', {
      classroomId, classroom, type, topics, subjects,
    });
  };

  const openItem = (item) => {
    nav.navigate('ClassroomAssignmentDetail', {
      classroomId, classroom, classworkId: item.id, item,
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          Klassearbeid — oppgaver, materiell og spørsmål organisert i emner (som i Google Classroom).
        </Text>

        {isStaff ? (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.primary} onPress={() => setCreateOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.primaryTxt}>Opprett</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => setTopicOpen(true)}>
              <Ionicons name="folder-outline" size={18} color={c.brand} />
              <Text style={styles.secondaryTxt}>Nytt emne</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="documents-outline" size={36} color={c.muted} />
            <Text style={styles.emptyTitle}>Ingen klassearbeid ennå</Text>
            <Text style={styles.emptySub}>
              Lærere oppretter oppgaver, materiell og spørsmål her — elevene leverer under hver oppgave.
            </Text>
          </View>
        ) : grouped.map((sec) => (
          <View key={sec.topic.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.topic.name}</Text>
            {sec.items.length === 0 ? (
              <Text style={styles.emptySec}>Ingen elementer i dette emnet.</Text>
            ) : sec.items.map((it) => {
              const meta = classworkTypeMeta(it.type);
              const subject = subjects.find((s) => s.id === it.subjectId);
              return (
                <TouchableOpacity key={it.id} style={styles.row} onPress={() => openItem(it)}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={`${meta.icon}-outline`} size={20} color={c.brand} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowType}>
                      {meta.label}
                      {it.status === 'draft' ? ' · Utkast' : ''}
                      {it.scheduledDate && it.status !== 'draft' ? ` · Planlagt ${it.scheduledDate}` : ''}
                    </Text>
                    <Text style={styles.rowTitle} numberOfLines={2}>{it.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[
                        subject?.name,
                        it.dueDate ? `Frist ${it.dueDate}` : null,
                        it.maxPoints != null ? `${it.maxPoints} poeng` : null,
                        (it.assignedStudentIds || []).length
                          ? `${it.assignedStudentIds.length} elever`
                          : null,
                      ].filter(Boolean).join(' · ') || 'Hele klassen'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.sheetBg} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Opprett</Text>
            {CLASSWORK_TYPES.map((t) => (
              <TouchableOpacity key={t.id} style={styles.sheetRow} onPress={() => openCreate(t.id)}>
                <Ionicons name={`${t.icon}-outline`} size={20} color={c.brand} />
                <Text style={styles.sheetRowTxt}>{t.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setCreateOpen(false)}>
              <Text style={styles.sheetCancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={topicOpen} transparent animationType="fade" onRequestClose={() => setTopicOpen(false)}>
        <Pressable style={styles.sheetBg} onPress={() => setTopicOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Nytt emne</Text>
            <TextInput
              style={styles.input}
              value={topicName}
              onChangeText={setTopicName}
              placeholder="F.eks. Uke 12 · Norsk"
              placeholderTextColor={c.muted}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primary, { marginTop: 12 }, (!topicName.trim() || busy) && { opacity: 0.45 }]}
              onPress={addTopic}
              disabled={!topicName.trim() || busy}
            >
              <Text style={styles.primaryTxt}>{busy ? 'Lagrer…' : 'Opprett emne'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  primary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12,
  },
  primaryTxt: { color: '#fff', fontWeight: '400' },
  secondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: c.line,
  },
  secondaryTxt: { color: c.brand, fontWeight: '400' },
  empty: {
    alignItems: 'center', padding: 24, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { marginTop: 8, color: c.ink, fontWeight: '400', fontSize: 16 },
  emptySub: { marginTop: 6, color: c.muted, textAlign: 'center', fontWeight: '400', lineHeight: 18 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: c.tint, fontWeight: '400', fontSize: 13, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 8,
  },
  emptySec: { color: c.muted, fontWeight: '400', fontSize: 13, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rowType: { color: c.muted, fontWeight: '400', fontSize: 11, textTransform: 'uppercase' },
  rowTitle: { color: c.ink, fontWeight: '400', fontSize: 15, marginTop: 2 },
  rowMeta: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
  },
  sheetTitle: { fontSize: 20, fontWeight: '400', color: c.ink, marginBottom: 12 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  sheetRowTxt: { color: c.ink, fontWeight: '400', fontSize: 16 },
  sheetCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  sheetCancelTxt: { color: c.muted, fontWeight: '400' },
  input: {
    borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 12, color: c.ink, fontWeight: '400', backgroundColor: c.surface2,
  },
});
