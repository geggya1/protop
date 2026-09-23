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
  isClassroomAdmin, staffRoleOf, listenSubjects, listenTimetableSlots, expandTimetableSlots, weekRangeKeys,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomHomeScreen({ classroomId, classroom, onSelectTab }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [subjects, setSubjects] = useState([]);
  const [slots, setSlots] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const isStaff = !!staffRoleOf(classroom, uid, staff);

  const goTab = (id) => {
    if (onSelectTab) onSelectTab(id);
    else nav.navigate('ClassroomHome', { module: id });
  };

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenSubjects(classroomId, setSubjects),
      listenTimetableSlots(classroomId, setSlots),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.deleted !== true && s.active !== false));
        setLoading(false);
      }, () => { setStudents([]); setLoading(false); }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => setStaff([])),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  const week = useMemo(() => weekRangeKeys(new Date()), []);
  const todayKey = week.keys.find((k) => k === new Date().toISOString().slice(0, 10)) || week.keys[0];
  const todaySlots = useMemo(() => {
    const occ = expandTimetableSlots(slots, todayKey, todayKey);
    const byId = Object.fromEntries(subjects.map((s) => [s.id, s]));
    return occ.map((o) => ({ ...o, subject: byId[o.subjectId] }));
  }, [slots, subjects, todayKey]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.welcome}>
        <Text style={styles.welcomeKicker}>Klasserom</Text>
        <Text style={styles.welcomeTitle}>{classroom?.name || 'Klassen'}</Text>
        <Text style={styles.welcomeSub}>
          {[classroom?.school, classroom?.grade].filter(Boolean).join(' · ')
            || 'Strøm, klassearbeid, karakterer og timeplan — inspirert av Google Classroom.'}
        </Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{students.length}</Text>
          <Text style={styles.statLbl}>Elever</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{subjects.length}</Text>
          <Text style={styles.statLbl}>Fag</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{slots.length}</Text>
          <Text style={styles.statLbl}>Timeplan</Text>
        </View>
      </View>

      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('stream')}>
          <View style={[styles.quickIcon, { backgroundColor: '#dbeafe' }]}>
            <Ionicons name="chatbubbles-outline" size={20} color="#1d4ed8" />
          </View>
          <Text style={styles.quickTxt}>Strøm</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('classwork')}>
          <View style={[styles.quickIcon, { backgroundColor: c.brandSoft }]}>
            <Ionicons name="documents-outline" size={20} color={c.brand} />
          </View>
          <Text style={styles.quickTxt}>Arbeid</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('todo')}>
          <View style={[styles.quickIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="checkbox-outline" size={20} color="#b45309" />
          </View>
          <Text style={styles.quickTxt}>Å gjøre</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('grades')}>
          <View style={[styles.quickIcon, { backgroundColor: '#d1fae5' }]}>
            <Ionicons name="school-outline" size={20} color="#047857" />
          </View>
          <Text style={styles.quickTxt}>Karakter</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('timetable')}>
          <View style={[styles.quickIcon, { backgroundColor: c.brandSoft }]}>
            <Ionicons name="calendar-outline" size={20} color={c.brand} />
          </View>
          <Text style={styles.quickTxt}>Timeplan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('seating')}>
          <View style={[styles.quickIcon, { backgroundColor: '#e0e7ff' }]}>
            <Ionicons name="grid-outline" size={20} color={c.brand} />
          </View>
          <Text style={styles.quickTxt}>Sitteplan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('lessonPlans')}>
          <View style={[styles.quickIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="clipboard-outline" size={20} color="#b45309" />
          </View>
          <Text style={styles.quickTxt}>Plan</Text>
        </TouchableOpacity>
        {isStaff && (
          <TouchableOpacity style={styles.quick} onPress={() => goTab('maps')}>
            <View style={[styles.quickIcon, { backgroundColor: c.sensitiveSoft }]}>
              <Ionicons name="folder-outline" size={20} color={c.sensitive} />
            </View>
            <Text style={styles.quickTxt}>Mapper</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listHeadTxt}>I dag</Text>
        <TouchableOpacity onPress={() => goTab('timetable')}>
          <Text style={styles.listHeadLink}>Timeplan</Text>
        </TouchableOpacity>
      </View>

      {todaySlots.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen timer i dag</Text>
          <Text style={styles.emptySub}>
            Sett opp en ukentlig timeplan som gjentar seg frem til semesterslutt.
          </Text>
          {isAdmin && (
            <TouchableOpacity style={styles.emptyBtn} onPress={() => goTab('timetable')}>
              <Text style={styles.emptyBtnTxt}>Sett opp timeplan</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : todaySlots.map((slot) => (
        <View key={slot.occurrenceId} style={styles.slotCard}>
          <View style={[styles.slotDot, { backgroundColor: slot.subject?.color || c.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.slotTitle}>
              {slot.title || slot.subject?.name || (slot.kind === 'lunch' ? 'Lunsj' : 'Økt')}
            </Text>
            <Text style={styles.slotMeta}>
              {slot.startTime}–{slot.endTime}
              {slot.location ? ` · ${slot.location}` : ''}
            </Text>
          </View>
        </View>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.line,
  },
  welcomeKicker: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.1,
    color: c.tint, textTransform: 'uppercase',
  },
  welcomeTitle: { marginTop: 4, color: c.ink, fontWeight: '900', fontSize: 24 },
  welcomeSub: { marginTop: 6, color: c.muted, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: c.line, alignItems: 'center',
  },
  statNum: { color: c.ink, fontWeight: '900', fontSize: 22 },
  statLbl: { color: c.muted, fontWeight: '700', fontSize: 11, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quick: {
    flex: 1, alignItems: 'center', backgroundColor: c.surface,
    borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.line,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  quickTxt: { marginTop: 6, color: c.ink, fontWeight: '800', fontSize: 11 },
  listHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  listHeadTxt: { color: c.ink, fontWeight: '800', fontSize: 16 },
  listHeadLink: { color: c.brand, fontWeight: '800', fontSize: 13 },
  empty: {
    alignItems: 'center', padding: 24, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { marginTop: 8, color: c.ink, fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: c.muted, textAlign: 'center', fontWeight: '600', lineHeight: 20 },
  emptyBtn: {
    marginTop: 14, backgroundColor: c.brand, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '800' },
  slotCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  slotDot: { width: 10, height: 40, borderRadius: 6 },
  slotTitle: { color: c.ink, fontWeight: '800', fontSize: 15 },
  slotMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
});
