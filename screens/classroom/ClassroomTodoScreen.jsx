import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenClasswork, buildStudentTodo, classworkTypeMeta, staffRoleOf, SUBMISSION_STATUS,
  resolvePrimaryStudent,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

/** Å gjøre — elevens kommende / manglende / innleverte arbeid. */
export default function ClassroomTodoScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid, viewingChildId, activeChildId } = useApp();
  const [work, setWork] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [subsMap, setSubsMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenClasswork(classroomId, (list) => { setWork(list); setLoading(false); }),
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

  const myStudent = useMemo(
    () => resolvePrimaryStudent(students, staff, uid, viewingChildId || activeChildId),
    [students, staff, uid, viewingChildId, activeChildId],
  );
  const isStaff = !!staffRoleOf(classroom, uid, staff);

  useEffect(() => {
    if (!classroomId || !myStudent?.id) return undefined;
    // Oppgaver + materiell (markér som ferdig)
    const tracked = work.filter((w) => (
      classworkTypeMeta(w.type).needsSubmit || w.type === 'material'
    ));
    const unsubs = tracked.map((w) => onSnapshot(
      collection(db, 'families', classroomId, 'classwork', w.id, 'submissions'),
      (snap) => {
        const mine = snap.docs.find((d) => d.id === myStudent.id);
        setSubsMap((prev) => ({
          ...prev,
          [w.id]: mine ? { id: mine.id, ...mine.data() } : null,
        }));
      },
    ));
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId, myStudent?.id, work.map((w) => w.id).join(',')]);

  const todo = useMemo(
    () => buildStudentTodo(work, subsMap, myStudent?.id),
    [work, subsMap, myStudent?.id],
  );

  const open = (item) => {
    nav.navigate('ClassroomAssignmentDetail', {
      classroomId, classroom, classworkId: item.id, item,
    });
  };

  const renderSection = (title, list, tone) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, tone === 'danger' && { color: c.danger }]}>{title}</Text>
      {list.length === 0 ? (
        <Text style={styles.emptySec}>Ingen</Text>
      ) : list.map((it) => {
        const meta = classworkTypeMeta(it.type);
        return (
          <TouchableOpacity key={it.id} style={styles.row} onPress={() => open(it)}>
            <View style={[styles.icon, tone === 'danger' && { backgroundColor: '#fee2e2' }]}>
              <Ionicons
                name={`${meta.icon}-outline`}
                size={18}
                color={tone === 'danger' ? c.danger : c.brand}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{it.title}</Text>
              <Text style={styles.rowMeta}>
                {meta.label}
                {it.dueDate ? ` · Frist ${it.dueDate}` : ''}
                {` · ${SUBMISSION_STATUS[it.status]?.label || it.status}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  if (isStaff && !myStudent) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          Som lærer bruker du Klassearbeid og Karakterbok. Elevens «Å gjøre»-liste vises når du er logget inn som elev.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => nav.navigate('ClassroomHome', { module: 'classwork' })}
        >
          <Text style={styles.ctaTxt}>Gå til klassearbeid</Text>
        </TouchableOpacity>
        <View style={styles.stats}>
          <Text style={styles.statNum}>{work.filter((w) => classworkTypeMeta(w.type).needsSubmit).length}</Text>
          <Text style={styles.statLbl}>vurderbare oppgaver i klassen</Text>
        </View>
      </ScrollView>
    );
  }

  if (!myStudent) {
    return (
      <View style={styles.centerPad}>
        <Ionicons name="checkbox-outline" size={36} color={c.muted} />
        <Text style={styles.emptyTitle}>Å gjøre</Text>
        <Text style={styles.empty}>Du er ikke registrert som elev i denne klassen.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Din arbeidsliste — tildelt, mangler og innlevert (som i Google Classroom).
      </Text>
      {renderSection(`Mangler (${todo.missing.length})`, todo.missing, 'danger')}
      {renderSection(`Tildelt (${todo.assigned.length})`, todo.assigned, 'ok')}
      {renderSection(`Ferdig (${todo.done.length})`, todo.done, 'ok')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: c.tint, fontWeight: '900', fontSize: 12, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8,
  },
  emptySec: { color: c.muted, fontWeight: '600', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  icon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { color: c.ink, fontWeight: '800', fontSize: 15 },
  rowMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  empty: { color: c.muted, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  emptyTitle: { color: c.ink, fontWeight: '800', fontSize: 16 },
  cta: {
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  stats: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: c.line,
  },
  statNum: { color: c.brand, fontWeight: '900', fontSize: 28 },
  statLbl: { color: c.muted, fontWeight: '700', marginTop: 4 },
});
