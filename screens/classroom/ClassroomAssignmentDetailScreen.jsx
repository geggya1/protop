import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import { useApp } from '../../src/context/AppContext';
import { formatThreadTime } from '../../src/utils/aiChats';
import {
  classworkTypeMeta, listenSubmissions, turnInClasswork,
  unsubmitClasswork, gradeSubmission, submissionStatusFor, SUBMISSION_STATUS,
  isClassroomAdmin, staffRoleOf, deleteClassworkItem, markClassworkDone,
  updateClassworkItem, reuseClassworkItem,
  listenSubmissionComments, addSubmissionComment, resolvePrimaryStudent,
} from '../../src/utils/classroom';

export default function ClassroomAssignmentDetailScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { uid, familyId, activeProfile, viewingChildId, activeChildId } = useApp();
  const classroomId = route.params?.classroomId || familyId;
  const classworkId = route.params?.classworkId;
  const classroom = route.params?.classroom;
  const [item, setItem] = useState(route.params?.item || null);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [subs, setSubs] = useState([]);
  const [answer, setAnswer] = useState('');
  const [link, setLink] = useState('');
  const [pickedOption, setPickedOption] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [commentStudentId, setCommentStudentId] = useState(null);
  const [privateComments, setPrivateComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    if (!classroomId || !classworkId) return undefined;
    const unsubs = [
      onSnapshot(doc(db, 'families', classroomId, 'classwork', classworkId), (snap) => {
        if (snap.exists()) setItem({ id: snap.id, ...snap.data() });
      }),
      listenSubmissions(classroomId, classworkId, setSubs),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.deleted !== true && s.active !== false));
      }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId, classworkId]);

  const isStaff = !!staffRoleOf(classroom, uid, staff);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const myStudent = useMemo(
    () => resolvePrimaryStudent(students, staff, uid, viewingChildId || activeChildId),
    [students, staff, uid, viewingChildId, activeChildId],
  );
  const meta = classworkTypeMeta(item?.type);
  const mySub = useMemo(
    () => subs.find((s) => s.studentId === myStudent?.id || s.id === myStudent?.id),
    [subs, myStudent?.id],
  );
  const myStatus = submissionStatusFor(item, mySub);
  const threadStudentId = isStaff ? commentStudentId : myStudent?.id;

  useEffect(() => {
    if (mySub?.textAnswer) setAnswer(mySub.textAnswer);
    if (mySub?.links?.[0]?.url) setLink(mySub.links[0].url);
    if (mySub?.selectedOption) setPickedOption(mySub.selectedOption);
  }, [mySub?.id]);

  useEffect(() => {
    if (!classroomId || !classworkId || !threadStudentId) {
      setPrivateComments([]);
      return undefined;
    }
    return listenSubmissionComments(classroomId, classworkId, threadStudentId, setPrivateComments);
  }, [classroomId, classworkId, threadStudentId]);

  const turnIn = async () => {
    if (!myStudent || busy) return;
    setBusy(true);
    try {
      await turnInClasswork(classroomId, classworkId, myStudent, {
        textAnswer: answer,
        links: link.trim() ? [{ url: link.trim() }] : [],
        selectedOption: pickedOption,
      });
      Alert.alert('Innlevert', 'Oppgaven er levert til læreren.');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke levere.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!myStudent || busy) return;
    setBusy(true);
    try {
      await unsubmitClasswork(classroomId, classworkId, myStudent.id);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke angre.');
    } finally {
      setBusy(false);
    }
  };

  const markDone = async () => {
    if (!myStudent || busy) return;
    setBusy(true);
    try {
      await markClassworkDone(classroomId, classworkId, myStudent);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke markere.');
    } finally {
      setBusy(false);
    }
  };

  const publishDraft = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateClassworkItem(classroomId, classworkId, { status: 'published' });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke publisere.');
    } finally {
      setBusy(false);
    }
  };

  const reuse = async () => {
    if (busy || !item) return;
    setBusy(true);
    try {
      await reuseClassworkItem(classroomId, item, {
        createdBy: uid,
        createdByName: activeProfile?.name || '',
      });
      Alert.alert('Kopiert', 'Et utkast er opprettet under Klassearbeid. Åpne det for å redigere og publisere.');
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke kopiere.');
    } finally {
      setBusy(false);
    }
  };

  const sendPrivate = async () => {
    if (!threadStudentId || busy) return;
    setBusy(true);
    try {
      await addSubmissionComment(classroomId, classworkId, threadStudentId, {
        body: commentDraft,
        authorUid: uid,
        authorName: activeProfile?.name || '',
        authorRole: isStaff ? 'staff' : 'student',
      });
      setCommentDraft('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke sende.');
    } finally {
      setBusy(false);
    }
  };

  const saveGrade = async (studentId) => {
    const d = gradeDrafts[studentId] || {};
    const st = students.find((s) => s.id === studentId);
    setBusy(true);
    try {
      await gradeSubmission(classroomId, classworkId, studentId, {
        grade: d.grade,
        feedback: d.feedback,
        returnWork: true,
        gradedBy: uid,
        student: st || { id: studentId },
      });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke vurdere.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert('Slett?', 'Elementet skjules for klassen.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClassworkItem(classroomId, classworkId);
            nav.goBack();
          } catch (e) {
            Alert.alert('Feil', e?.message || 'Klarte ikke slette.');
          }
        },
      },
    ]);
  };

  if (!item) {
    return (
      <View style={styles.center}><ActivityIndicator color={c.brand} /></View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{meta.label}</Text>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </View>
        {isStaff ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => nav.navigate('ClassroomClassworkEditor', {
              classroomId, classroom, item, type: item.type,
            })}
          >
            <Ionicons name="create-outline" size={20} color={c.ink} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.meta}>
          {[
            item.status === 'draft' ? 'Utkast' : null,
            item.dueDate ? `Frist ${item.dueDate}` : null,
            item.maxPoints != null ? `${item.maxPoints} poeng` : null,
            (item.assignedStudentIds || []).length
              ? `${item.assignedStudentIds.length} elever`
              : 'Hele klassen',
          ].filter(Boolean).join(' · ')}
        </Text>
        {!!item.instructions && <Text style={styles.instructions}>{item.instructions}</Text>}
        {(item.links || []).map((l) => (
          <TouchableOpacity key={l.url} style={styles.link} onPress={() => Linking.openURL(l.url).catch(() => {})}>
            <Ionicons name="link-outline" size={16} color={c.brand} />
            <Text style={styles.linkTxt} numberOfLines={1}>{l.title || l.url}</Text>
          </TouchableOpacity>
        ))}

        {isStaff && item.status === 'draft' ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={publishDraft} disabled={busy}>
            <Text style={styles.primaryTxt}>Publiser utkast</Text>
          </TouchableOpacity>
        ) : null}
        {isStaff ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={reuse} disabled={busy}>
            <Text style={styles.secondaryTxt}>Gjenbruk / kopier</Text>
          </TouchableOpacity>
        ) : null}

        {!isStaff && item.type === 'material' && myStudent ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Materiell</Text>
            <Text style={styles.feedback}>
              {mySub?.markedDone || myStatus === 'turned_in'
                ? 'Du har markert dette som ferdig.'
                : 'Les materiell og marker som ferdig når du er klar.'}
            </Text>
            {!(mySub?.markedDone || myStatus === 'turned_in' || myStatus === 'returned') ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={markDone} disabled={busy}>
                <Text style={styles.primaryTxt}>Marker som ferdig</Text>
              </TouchableOpacity>
            ) : myStatus === 'returned' ? (
              <Text style={styles.feedback}>Returnert — kontakt læreren hvis du må levere på nytt.</Text>
            ) : (
              <TouchableOpacity style={styles.secondaryBtn} onPress={undo} disabled={busy}>
                <Text style={styles.secondaryTxt}>Angre</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {!isStaff && meta.needsSubmit && myStudent ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Din innlevering</Text>
            <Text style={styles.status}>
              Status: {SUBMISSION_STATUS[myStatus]?.label || myStatus}
              {mySub?.grade != null ? ` · Karakter ${mySub.grade}` : ''}
            </Text>
            {mySub?.feedback ? <Text style={styles.feedback}>Tilbakemelding: {mySub.feedback}</Text> : null}

            {(item.options || []).length > 0 ? (
              (item.options || []).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.option, pickedOption === opt && styles.optionOn]}
                  onPress={() => setPickedOption(opt)}
                  disabled={myStatus === 'turned_in' || myStatus === 'returned'}
                >
                  <Text style={styles.optionTxt}>{opt}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <TextInput
                style={[styles.input, styles.area]}
                value={answer}
                onChangeText={setAnswer}
                placeholder="Skriv svaret ditt…"
                placeholderTextColor={c.muted}
                multiline
                editable={myStatus !== 'turned_in' && myStatus !== 'returned'}
              />
            )}
            <TextInput
              style={styles.input}
              value={link}
              onChangeText={setLink}
              placeholder="Lenke til arbeid (valgfritt)"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              editable={myStatus !== 'turned_in' && myStatus !== 'returned'}
            />
            {myStatus === 'turned_in' ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={undo} disabled={busy}>
                <Text style={styles.secondaryTxt}>Angre innlevering</Text>
              </TouchableOpacity>
            ) : myStatus === 'returned' ? (
              <Text style={styles.feedback}>Returnert — kontakt læreren hvis du må levere på nytt.</Text>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, busy && { opacity: 0.45 }]}
                onPress={turnIn}
                disabled={busy}
              >
                <Text style={styles.primaryTxt}>{busy ? 'Leverer…' : 'Lever inn'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {!isStaff && !myStudent && meta.needsSubmit ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Elevkonto kreves</Text>
            <Text style={styles.feedback}>
              Du er ikke registrert som elev i denne klassen, så du kan ikke levere her.
            </Text>
          </View>
        ) : null}

        {isStaff && meta.needsSubmit ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Elevarbeid ({subs.length}/{students.length})</Text>
            {students.map((st) => {
              const sub = subs.find((s) => s.id === st.id || s.studentId === st.id);
              const stStatus = submissionStatusFor(item, sub);
              const draft = gradeDrafts[st.id] || {
                grade: sub?.grade != null ? String(sub.grade) : '',
                feedback: sub?.feedback || '',
              };
              return (
                <View key={st.id} style={styles.subRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName}>{st.name || 'Elev'}</Text>
                    <Text style={styles.subMeta}>
                      {SUBMISSION_STATUS[stStatus]?.label || stStatus}
                      {sub?.textAnswer ? ` · ${sub.textAnswer.slice(0, 80)}` : ''}
                      {sub?.selectedOption ? ` · ${sub.selectedOption}` : ''}
                    </Text>
                    <View style={styles.gradeRow}>
                      <TextInput
                        style={[styles.input, { flex: 0, width: 70 }]}
                        value={draft.grade}
                        onChangeText={(t) => setGradeDrafts((p) => ({
                          ...p, [st.id]: { ...draft, grade: t },
                        }))}
                        placeholder="Poeng"
                        placeholderTextColor={c.muted}
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={draft.feedback}
                        onChangeText={(t) => setGradeDrafts((p) => ({
                          ...p, [st.id]: { ...draft, feedback: t },
                        }))}
                        placeholder="Tilbakemelding"
                        placeholderTextColor={c.muted}
                      />
                    </View>
                    <TouchableOpacity style={styles.miniBtn} onPress={() => saveGrade(st.id)}>
                      <Text style={styles.miniTxt}>Returner / lagre</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.miniBtn}
                      onPress={() => setCommentStudentId((cur) => (cur === st.id ? null : st.id))}
                    >
                      <Text style={styles.miniTxt}>
                        {commentStudentId === st.id ? 'Skjul privat tråd' : 'Privat kommentar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {students.length === 0 ? (
              <Text style={styles.feedback}>Ingen elever i klassen ennå.</Text>
            ) : null}
          </View>
        ) : null}

        {threadStudentId && (meta.needsSubmit || item.type === 'material') ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>
              Privat kommentar {isStaff ? `(elev)` : '(kun du og lærer)'}
            </Text>
            {privateComments.map((cm) => (
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
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder="Skriv privat…"
                placeholderTextColor={c.muted}
              />
              <TouchableOpacity
                style={[styles.commentSend, (!commentDraft.trim() || busy) && { opacity: 0.45 }]}
                onPress={sendPrivate}
                disabled={!commentDraft.trim() || busy}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {isAdmin ? (
          <TouchableOpacity style={styles.danger} onPress={remove}>
            <Text style={styles.dangerTxt}>Slett {meta.label.toLowerCase()}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line,
  },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { color: c.tint, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  title: { color: c.ink, fontWeight: '900', fontSize: 17 },
  body: { padding: 16, paddingBottom: 40 },
  meta: { color: c.muted, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  instructions: { color: c.ink, fontWeight: '600', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
    backgroundColor: c.brandSoft, borderRadius: 10, padding: 10,
  },
  linkTxt: { flex: 1, color: c.brand, fontWeight: '700', fontSize: 13 },
  box: {
    marginTop: 8, backgroundColor: c.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: c.line,
  },
  boxTitle: { color: c.ink, fontWeight: '900', fontSize: 16, marginBottom: 8 },
  status: { color: c.muted, fontWeight: '700', marginBottom: 8 },
  feedback: { color: c.ink, fontWeight: '600', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: c.line,
    paddingHorizontal: 12, paddingVertical: 10, color: c.ink, fontWeight: '600', marginBottom: 8,
  },
  area: { minHeight: 90, textAlignVertical: 'top' },
  option: {
    borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, marginBottom: 6, backgroundColor: '#fff',
  },
  optionOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  optionTxt: { color: c.ink, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  primaryTxt: { color: '#fff', fontWeight: '900' },
  secondaryBtn: {
    borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4,
    borderWidth: 1, borderColor: c.line, backgroundColor: '#fff',
  },
  secondaryTxt: { color: c.brand, fontWeight: '800' },
  subRow: {
    borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, marginTop: 12,
  },
  subName: { color: c.ink, fontWeight: '800', fontSize: 15 },
  subMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2, marginBottom: 8 },
  gradeRow: { flexDirection: 'row', gap: 8 },
  miniBtn: {
    alignSelf: 'flex-start', backgroundColor: c.brandSoft, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 4,
  },
  miniTxt: { color: c.brand, fontWeight: '800', fontSize: 12 },
  comment: {
    backgroundColor: c.surface2, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  commentAuthor: { color: c.muted, fontWeight: '700', fontSize: 11, marginBottom: 4 },
  commentBody: { color: c.ink, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  commentSend: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: c.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  danger: { marginTop: 20, alignItems: 'center', padding: 12 },
  dangerTxt: { color: c.danger, fontWeight: '800' },
});
