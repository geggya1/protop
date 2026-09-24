import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenClasswork, buildGradebook, classworkTypeMeta, staffRoleOf,
  SUBMISSION_STATUS, resolvePrimaryStudent,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

/** Karakterbok — oversikt over poeng per elev og oppgave. */
export default function ClassroomGradesScreen({ classroomId, classroom }) {
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
      listenClasswork(classroomId, setWork),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.deleted !== true && s.active !== false)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb')));
        setLoading(false);
      }, () => setLoading(false)),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  // Hent innleveringer for vurderbare oppgaver
  useEffect(() => {
    if (!classroomId) return undefined;
    const graded = work.filter((w) => classworkTypeMeta(w.type).needsSubmit);
    const unsubs = graded.map((w) => onSnapshot(
      collection(db, 'families', classroomId, 'classwork', w.id, 'submissions'),
      (snap) => {
        const byStudent = {};
        snap.docs.forEach((d) => { byStudent[d.id] = { id: d.id, ...d.data() }; });
        setSubsMap((prev) => ({ ...prev, [w.id]: byStudent }));
      },
      () => {},
    ));
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId, work.map((w) => w.id).join(',')]);

  const isStaff = !!staffRoleOf(classroom, uid, staff);
  const book = useMemo(
    () => buildGradebook(students, work, subsMap),
    [students, work, subsMap],
  );

  const myStudent = useMemo(
    () => resolvePrimaryStudent(students, staff, uid, viewingChildId || activeChildId),
    [students, staff, uid, viewingChildId, activeChildId],
  );
  const myRow = book.rows.find((r) => r.student.id === myStudent?.id);

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  if (!isStaff && myRow) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>Dine karakterer og tilbakemeldinger.</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryNum}>
            {myRow.pct != null ? `${myRow.pct} %` : '—'}
          </Text>
          <Text style={styles.summaryLbl}>
            {myRow.earned} / {myRow.possible || '—'} poeng
          </Text>
        </View>
        {book.work.length === 0 ? (
          <Text style={styles.empty}>Ingen vurderte oppgaver ennå.</Text>
        ) : book.work.map((w) => {
          const cell = myRow.cells[w.id];
          return (
            <TouchableOpacity
              key={w.id}
              style={styles.row}
              onPress={() => nav.navigate('ClassroomAssignmentDetail', {
                classroomId, classroom, classworkId: w.id, item: w,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{w.title}</Text>
                <Text style={styles.rowMeta}>
                  {SUBMISSION_STATUS[cell?.status]?.label || cell?.status}
                  {w.dueDate ? ` · Frist ${w.dueDate}` : ''}
                </Text>
              </View>
              <Text style={styles.grade}>
                {cell?.grade != null ? cell.grade : '—'}
                {w.maxPoints != null ? ` / ${w.maxPoints}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  if (!isStaff) {
    return (
      <View style={styles.centerPad}>
        <Ionicons name="school-outline" size={36} color={c.muted} />
        <Text style={styles.emptyTitle}>Karakterbok</Text>
        <Text style={styles.empty}>Koble elevprofilen din for å se egne karakterer.</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          Karakterbok — poeng per elev og oppgave. Trykk en oppgave for å vurdere innleveringer.
        </Text>
        {book.work.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Ingen vurderbare oppgaver</Text>
            <Text style={styles.empty}>Opprett oppgaver under Klassearbeid.</Text>
          </View>
        ) : (
          <View>
            <View style={styles.headerRow}>
              <Text style={[styles.corner, { width: 120 }]}>Elev</Text>
              {book.work.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={styles.colHead}
                  onPress={() => nav.navigate('ClassroomAssignmentDetail', {
                    classroomId, classroom, classworkId: w.id, item: w,
                  })}
                >
                  <Text style={styles.colHeadTxt} numberOfLines={2}>{w.title}</Text>
                  <Text style={styles.colHeadPts}>
                    {w.maxPoints != null ? `${w.maxPoints}p` : '—'}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.corner, { width: 64, textAlign: 'center' }]}>Sum</Text>
            </View>
            {book.rows.map((row) => (
              <View key={row.student.id} style={styles.dataRow}>
                <Text style={[styles.nameCell, { width: 120 }]} numberOfLines={2}>
                  {row.student.name || 'Elev'}
                </Text>
                {book.work.map((w) => {
                  const cell = row.cells[w.id];
                  return (
                    <View key={w.id} style={styles.cell}>
                      <Text style={styles.cellGrade}>
                        {cell?.grade != null ? cell.grade : (cell?.status === 'turned_in' ? '✓' : '—')}
                      </Text>
                    </View>
                  );
                })}
                <Text style={[styles.nameCell, { width: 64, textAlign: 'center' }]}>
                  {row.pct != null ? `${row.pct}%` : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  summary: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: c.line, alignItems: 'center',
  },
  summaryNum: { color: c.brand, fontWeight: '900', fontSize: 32 },
  summaryLbl: { color: c.muted, fontWeight: '700', marginTop: 4 },
  empty: { color: c.muted, fontWeight: '600', textAlign: 'center' },
  emptyTitle: { color: c.ink, fontWeight: '800', fontSize: 16, marginBottom: 6, textAlign: 'center' },
  emptyBox: {
    backgroundColor: c.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: c.line, alignItems: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  rowTitle: { color: c.ink, fontWeight: '800', fontSize: 15 },
  rowMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  grade: { color: c.brand, fontWeight: '900', fontSize: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  dataRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: c.line, paddingVertical: 8,
  },
  corner: { color: c.muted, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  colHead: { width: 72, paddingHorizontal: 4 },
  colHeadTxt: { color: c.ink, fontWeight: '700', fontSize: 11 },
  colHeadPts: { color: c.muted, fontWeight: '600', fontSize: 10, marginTop: 2 },
  nameCell: { color: c.ink, fontWeight: '700', fontSize: 12, paddingHorizontal: 8 },
  cell: { width: 72, alignItems: 'center' },
  cellGrade: { color: c.brand, fontWeight: '800', fontSize: 13 },
});
