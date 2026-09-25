// screens/v2/ParentTaskScreen.jsx
// Full task detail for parent tasks: title, description, deadline,
// attachments, participants, comments, and activity log.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Platform, Image, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  collection, query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { db, storage, auth } from '../../firebase';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useApp } from '../../src/context/AppContext';
import { colors, radius, useLayout } from '../../src/theme';
import { Screen, Title, BigButton } from '../../components/ui';
import DesktopFormShell from '../../components/DesktopFormShell';
import RecurrenceEditor, { emptyRecurrenceValue } from '../../components/RecurrenceEditor';
import { dateKey, parseDateKey } from '../../src/utils/dates';
import { notifyUsers } from '../../src/utils/notifications';
import { FAMILY_ASSIGNEE } from '../../src/utils/parentTaskVisibility';
import { isChildParentTaskReadOnly } from '../../src/utils/childTaskAccess';
import {
  initRepeatFromTodo,
  buildTodoRecurrenceFields,
  normalizeRecurrenceStartKey,
  repeatSummaryLabel,
} from '../../src/utils/todoRecurrence';

function recurrenceStateFromTask(task) {
  if (!task) {
    return { ...emptyRecurrenceValue(dateKey(new Date())), preset: 'never' };
  }
  return {
    ...initRepeatFromTodo(task),
    dateKey: task.startKey || dateKey(new Date()),
  };
}

export default function ParentTaskScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { isDesktop } = useLayout();
  const { familyId, members, uid, isChild } = useApp();
  const existing = route.params?.task || null;
  const isNew = !existing;
  const taskId = existing?.id || null;
  // Barn: kan opprette/tildele (ny), men kun lesetilgang på eksisterende
  // egne og tildelte (ferdig + kommentar OK).
  const readOnly = route.params?.readOnly === true
    || isChildParentTaskReadOnly({ isChild, isNew });

  // Fields
  const [title, setTitle] = useState(existing?.title || route.params?.title || '');
  const [description, setDescription] = useState(
    existing?.description || route.params?.description || '',
  );
  const [deadline, setDeadline] = useState(existing?.deadline || route.params?.deadline || '');
  const [deadlineTime, setDeadlineTime] = useState(existing?.deadlineTime || '');
  const [participants, setParticipants] = useState(existing?.participants || []);
  const [assignedTo, setAssignedTo] = useState(
    existing?.assignedTo === FAMILY_ASSIGNEE
      ? FAMILY_ASSIGNEE
      : (existing?.assignedTo || null),
  );
  const [attachments, setAttachments] = useState(existing?.attachments || []);
  const [done, setDone] = useState(existing?.done || false);
  const [completedDates, setCompletedDates] = useState(
    Array.isArray(existing?.completedDates) ? existing.completedDates : [],
  );
  const [recurrence, setRecurrence] = useState(() => recurrenceStateFromTask(existing));
  const isRecurring = recurrence?.preset && recurrence.preset !== 'never';
  const todayKey = dateKey(new Date());
  const occurrenceDone = isRecurring
    ? completedDates.includes(todayKey)
    : done;

  // Comments & log
  const [comments, setComments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [newComment, setNewComment] = useState('');

  // UI
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const taskDocRef = taskId ? doc(db, 'families', familyId, 'parentTodos', taskId) : null;

  // Listen to comments
  useEffect(() => {
    if (!familyId || !taskId) return undefined;
    const ref = query(
      collection(db, 'families', familyId, 'parentTodos', taskId, 'comments'),
      orderBy('createdAt', 'asc'),
    );
    return onSnapshot(ref, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setComments([]));
  }, [familyId, taskId]);

  // Listen to activity log
  useEffect(() => {
    if (!familyId || !taskId) return undefined;
    const ref = query(
      collection(db, 'families', familyId, 'parentTodos', taskId, 'log'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(ref, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setLogs([]));
  }, [familyId, taskId]);

  // Reload task data when screen is opened (for existing tasks)
  useEffect(() => {
    if (!taskDocRef) return;
    getDoc(taskDocRef).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.title) setTitle(d.title);
      if (d.description) setDescription(d.description);
      if (d.deadline) setDeadline(d.deadline);
      if (d.deadlineTime) setDeadlineTime(d.deadlineTime);
      if (Array.isArray(d.participants)) setParticipants(d.participants);
      if (d.assignedTo === FAMILY_ASSIGNEE) setAssignedTo(FAMILY_ASSIGNEE);
      else if (d.assignedTo) setAssignedTo(d.assignedTo);
      else setAssignedTo(null);
      if (Array.isArray(d.attachments)) setAttachments(d.attachments);
      if (typeof d.done === 'boolean') setDone(d.done);
      if (Array.isArray(d.completedDates)) setCompletedDates(d.completedDates);
      setRecurrence(recurrenceStateFromTask({ id: taskId, ...d }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, taskId]);

  const myName = useMemo(() => {
    const m = members.find((x) => x.uid === uid);
    return m?.name || 'Ukjent';
  }, [members, uid]);

  const addLogEntry = useCallback(async (text) => {
    if (!familyId || !taskId) return;
    try {
      await addDoc(collection(db, 'families', familyId, 'parentTodos', taskId, 'log'), {
        text,
        uid,
        name: myName,
        createdAt: serverTimestamp(),
      });
    } catch {}
  }, [familyId, taskId, uid, myName]);

  const save = useCallback(async () => {
    if (readOnly || !title.trim() || !familyId) return;
    setSaving(true);
    try {
      const baseDay = recurrence?.dateKey
        ? (parseDateKey(recurrence.dateKey)?.getDay() ?? 1)
        : 1;
      const recurrenceFields = buildTodoRecurrenceFields({
        preset: recurrence?.preset || 'never',
        customType: recurrence?.customType || 'weekly',
        customInterval: recurrence?.customInterval || 1,
        recurrenceByDays: recurrence?.recurrenceByDays || [],
        recurrenceUntilKey: recurrence?.recurrenceUntilKey || '',
        baseDay,
      });
      // Behold type: 'task' — recurrence-helperen skriver chore-type (once/weekly/daily).
      const {
        type: _choreType,
        daysOfWeek,
        everyOtherWeek,
        ...recurrenceRest
      } = recurrenceFields;
      const recurring = recurrenceRest.recurring === true;
      const payload = {
        title: title.trim(),
        description: description.trim(),
        deadline: recurring ? null : (deadline.trim() || null),
        deadlineTime: recurring
          ? null
          : (deadline.trim() && deadlineTime.trim() ? deadlineTime.trim() : null),
        participants,
        assignedTo: assignedTo || null,
        attachments,
        done: recurring ? false : done,
        active: true,
        deleted: false,
        type: 'task',
        completedDates,
        updatedAt: serverTimestamp(),
        daysOfWeek: daysOfWeek || [],
        everyOtherWeek: everyOtherWeek === true,
        ...recurrenceRest,
      };

      if (recurring) {
        const startRaw = recurrence?.dateKey || dateKey(new Date());
        payload.startKey = normalizeRecurrenceStartKey(startRaw, recurrenceRest);
      } else if (isNew) {
        payload.startKey = dateKey(new Date());
      } else if (existing?.startKey) {
        payload.startKey = existing.startKey;
      }

      if (isNew) {
        payload.createdBy = uid;
        payload.createdAt = serverTimestamp();
        payload.order = 0;
        const ref = await addDoc(collection(db, 'families', familyId, 'parentTodos'), payload);
        await addDoc(collection(db, 'families', familyId, 'parentTodos', ref.id, 'log'), {
          text: 'Oppgaven ble opprettet',
          uid, name: myName,
          createdAt: serverTimestamp(),
        });
        let recipients;
        if (assignedTo === FAMILY_ASSIGNEE) {
          recipients = (members || [])
            .map((m) => m.uid || m.id)
            .filter((id) => id && id !== uid);
        } else {
          recipients = [...(participants || []), assignedTo].filter(Boolean);
        }
        notifyUsers(recipients, {
          eventType: 'taskReceived',
          title: 'Ny oppgave',
          body: title.trim(),
          familyId,
          createdBy: uid,
        }).catch(() => {});
        nav.goBack();
      } else {
        await updateDoc(taskDocRef, payload);
        await addLogEntry('Oppgaven ble oppdatert');
        nav.goBack();
      }
    } catch {
      Alert.alert('Feil', 'Klarte ikke lagre oppgaven.');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, deadline, deadlineTime, participants, assignedTo, attachments, done, completedDates, recurrence, isNew, familyId, taskId, uid, myName, members, readOnly, existing?.startKey]);

  const toggleDone = useCallback(async () => {
    if (!taskDocRef) return;
    const k = dateKey(new Date());
    const cd = Array.isArray(completedDates) ? completedDates : [];
    const currentlyDone = isRecurring ? cd.includes(k) : done;
    const nextDone = !currentlyDone;
    try {
      const next = nextDone
        ? (cd.includes(k) ? cd : [...cd, k])
        : cd.filter((x) => x !== k);
      setCompletedDates(next);
      if (isRecurring) {
        // Per hendelse — ikke lukk hele serien.
        await updateDoc(taskDocRef, {
          done: false,
          completedDates: next,
        });
        await addLogEntry(nextDone
          ? `Kvittert ut for ${k} ✅`
          : `Gjenåpnet hendelse ${k}`);
      } else {
        setDone(nextDone);
        await updateDoc(taskDocRef, {
          done: nextDone,
          completedDates: next,
        });
        await addLogEntry(nextDone ? 'Markert som ferdig ✅' : 'Gjenåpnet');
      }
    } catch {}
  }, [done, taskDocRef, completedDates, addLogEntry, isRecurring]);

  const toggleParticipant = useCallback((memberUid) => {
    if (readOnly) return;
    setParticipants((prev) =>
      prev.includes(memberUid) ? prev.filter((x) => x !== memberUid) : [...prev, memberUid]
    );
  }, [readOnly]);

  const pickAttachment = useCallback(async () => {
    if (readOnly) return;
    const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout etter ${ms}ms`)), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); },
      );
    });

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Tilgang nektet'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) throw new Error('Kunne ikke hente valgt bilde');

      setUploading(true);

      const blob = await withTimeout(
        fetch(asset.uri).then((r) => {
          if (!r.ok) throw new Error(`Kunne ikke lese bilde: HTTP ${r.status}`);
          return r.blob();
        }),
        30000,
      );

      const path = `families/${familyId}/task-attachments/${taskId || 'new'}-${Date.now()}.jpg`;
      const r = sref(storage, path);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      setAttachments((prev) => [...prev, { url, name: `Vedlegg ${prev.length + 1}`, addedBy: myName }]);
      if (taskId) await addLogEntry(`La til vedlegg`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke laste opp vedlegg.');
    } finally {
      setUploading(false);
    }
  }, [familyId, taskId, myName, addLogEntry, readOnly]);

  const removeAttachment = useCallback((idx) => {
    if (readOnly) return;
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, [readOnly]);

  const postComment = useCallback(async () => {
    if (!newComment.trim() || !familyId || !taskId) return;
    try {
      await addDoc(collection(db, 'families', familyId, 'parentTodos', taskId, 'comments'), {
        text: newComment.trim(),
        uid,
        name: myName,
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch {
      Alert.alert('Feil', 'Klarte ikke legge til kommentar.');
    }
  }, [newComment, familyId, taskId, uid, myName]);

  const deleteTask = useCallback(() => {
    if (readOnly) return;
    Alert.alert('Slett oppgave', `Slette «${title}»?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett', style: 'destructive',
        onPress: async () => {
          try {
            if (taskDocRef) await updateDoc(taskDocRef, { deleted: true });
            nav.goBack();
          } catch {}
        },
      },
    ]);
  }, [title, taskDocRef, nav, readOnly]);

  const formatTs = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('no-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const assigneeLabel = useMemo(() => {
    if (!assignedTo) return 'Meg';
    if (assignedTo === FAMILY_ASSIGNEE) return 'Meg';
    const m = members.find((x) => x.id === assignedTo || x.uid === assignedTo);
    return m?.name?.split(' ')[0] || m?.name || 'Ukjent';
  }, [assignedTo, members]);

  const formTitle = isNew ? 'Ny oppgave' : 'Oppgave';

  const formBody = (
    <>
        {!isDesktop ? (
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Title size={20}>{formTitle}</Title>
            <View style={{ flex: 1 }} />
            {!isNew && (
              <TouchableOpacity
                style={[styles.doneBadge, occurrenceDone && styles.doneBadgeOn]}
                onPress={toggleDone}
              >
                {occurrenceDone && <Ionicons name="checkmark" size={16} color="#fff" />}
                <Text style={[styles.doneBadgeTxt, occurrenceDone && { color: '#fff' }]}>
                  {occurrenceDone ? 'Ferdig' : 'Åpen'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (!isNew ? (
          <View style={styles.topRowDesk}>
            <TouchableOpacity
              style={[styles.doneBadge, occurrenceDone && styles.doneBadgeOn]}
              onPress={toggleDone}
            >
              {occurrenceDone && <Ionicons name="checkmark" size={16} color="#fff" />}
              <Text style={[styles.doneBadgeTxt, occurrenceDone && { color: '#fff' }]}>
                {occurrenceDone ? 'Ferdig' : 'Åpen'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null)}

        <Text style={[styles.intro, isDesktop && styles.introDesk]}>
          {readOnly
            ? 'Du kan lese oppgaven, markere ferdig og kommentere. Detaljer kan ikke endres.'
            : isChild
              ? 'Opprett oppgave og tildel andre. Du ser egne oppgaver og det som er tildelt deg — uten å kunne endre dem etterpå.'
              : isRecurring
                ? 'Regelmessige oppgaver — kvitteres ut for hver hendelse. Inngår ikke i belønningsprogrammet.'
                : 'Oppgaver med frist — for deg selv eller tildelt andre. Inngår ikke i belønningsprogrammet.'}
        </Text>

        {/* Title */}
        <Text style={styles.label}>Tittel</Text>
        <TextInput
          style={[styles.input, readOnly && styles.inputReadonly]}
          value={title}
          onChangeText={setTitle}
          placeholder="F.eks. Betale strøm, bestille time…"
          editable={!readOnly}
        />

        {/* Description */}
        <Text style={styles.label}>Beskrivelse</Text>
        <TextInput
          style={[styles.input, styles.textArea, readOnly && styles.inputReadonly]}
          value={description}
          onChangeText={setDescription}
          placeholder={readOnly ? 'Ingen beskrivelse' : 'Beskriv oppgaven...'}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!readOnly}
        />

        {/* Deadline — engangsoppgaver. Regelmessige bruker start/stopp under. */}
        {!isRecurring && (
          <>
            <Text style={styles.label}>Frist</Text>
            {!readOnly && <Text style={styles.hint}>Når skal oppgaven være ferdig?</Text>}
            {readOnly ? (
              <Text style={styles.readonlyValue}>
                {deadline
                  ? `${deadline}${deadlineTime ? ` kl. ${deadlineTime}` : ''}`
                  : 'Ingen frist'}
              </Text>
            ) : (
              <>
                <View style={styles.deadlineRow}>
                  {Platform.OS === 'web' ? (
                    <View style={[styles.pickerBtn, { flex: 1 }]}>
                      <Ionicons name="calendar-outline" size={18} color={colors.brand} />
                      <Text style={[styles.pickerBtnTxt, !deadline && styles.pickerPlaceholder]}>
                        {deadline || 'Velg dato'}
                      </Text>
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        style={styles.webPickerOverlay}
                        aria-label="Velg fristdato"
                      />
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.input, styles.pickerField, { flex: 1, marginBottom: 0 }]}
                      value={deadline}
                      onChangeText={setDeadline}
                      placeholder="ÅÅÅÅ-MM-DD"
                      keyboardType="numeric"
                    />
                  )}
                  {Platform.OS === 'web' ? (
                    <View style={[styles.pickerBtn, styles.timePickerBtn, !deadline && styles.pickerDisabled]}>
                      <Ionicons name="time-outline" size={18} color={deadline ? colors.brand : colors.muted} />
                      <Text style={[styles.pickerBtnTxt, !deadlineTime && styles.pickerPlaceholder]}>
                        {deadlineTime || 'Klokke'}
                      </Text>
                      <input
                        type="time"
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                        disabled={!deadline}
                        style={styles.webPickerOverlay}
                        aria-label="Velg klokkeslett"
                      />
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.input, styles.timeInput, styles.pickerField, !deadline && { opacity: 0.5 }]}
                      value={deadlineTime}
                      onChangeText={setDeadlineTime}
                      placeholder="tt:mm"
                      editable={!!deadline}
                    />
                  )}
                </View>
                {(deadline || deadlineTime) && (
                  <TouchableOpacity onPress={() => { setDeadline(''); setDeadlineTime(''); }}>
                    <Text style={[styles.hint, { color: colors.brand, marginBottom: 8 }]}>Fjern frist</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {deadline && (() => {
              const d = parseDateKey(deadline);
              const diff = Math.ceil((d - new Date()) / 86400000);
              if (diff < 0) return <Text style={[styles.hint, { color: '#b91c1c' }]}>Fristen er utløpt ({Math.abs(diff)} dager siden)</Text>;
              if (diff === 0) return <Text style={[styles.hint, { color: '#f59e0b' }]}>Fristen er i dag{deadlineTime ? ` kl. ${deadlineTime}` : ''}</Text>;
              if (diff <= 3) return <Text style={[styles.hint, { color: '#f59e0b' }]}>{diff} dager igjen</Text>;
              return <Text style={styles.hint}>{diff} dager igjen</Text>;
            })()}
          </>
        )}

        {/* Regelmessighet — samme start/stopp-picker som bosted/gjøremål (foreldre) */}
        {(!isChild || isRecurring) && (
          <>
            <Text style={styles.label}>Regelmessighet</Text>
            {readOnly || isChild ? (
              <Text style={styles.readonlyValue}>
                {repeatSummaryLabel(recurrence) || 'Aldri'}
              </Text>
            ) : (
              <>
                <Text style={styles.hint}>
                  Gjenta oppgaven med start- og stoppdato. Hver hendelse kan kvitteres ut for seg.
                </Text>
                <RecurrenceEditor
                  value={recurrence}
                  onChange={setRecurrence}
                  subjectLabel="Oppgaven"
                />
              </>
            )}
          </>
        )}

        {/* Assignee */}
        <Text style={styles.label}>Ansvarlig</Text>
        {readOnly ? (
          <Text style={styles.readonlyValue}>{assigneeLabel}</Text>
        ) : (
          <>
            <Text style={styles.hint}>
              Oppgaven gjelder deg.
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !assignedTo && styles.chipOn]}
                onPress={() => setAssignedTo(null)}
              >
                <Text style={[styles.chipTxt, !assignedTo && styles.chipTxtOn]}>Meg</Text>
              </TouchableOpacity>
              {members.filter((m) => {
                const mid = m.uid || m.id;
                return mid && mid !== uid;
              }).map((m) => {
                const mid = m.uid || m.id;
                const on = assignedTo === m.id || assignedTo === m.uid;
                return (
                  <TouchableOpacity
                    key={m.id || mid}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setAssignedTo(mid)}
                  >
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{m.name?.split(' ')[0] || m.name}</Text>
                    {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Participants */}
        <Text style={styles.label}>Deltakere</Text>
        {readOnly ? (
          <Text style={styles.readonlyValue}>
            {participants.length === 0
              ? 'Ingen deltakere'
              : participants
                .map((pid) => {
                  const m = members.find((x) => x.uid === pid || x.id === pid);
                  return m?.name || 'Ukjent';
                })
                .join(', ')}
          </Text>
        ) : (
          <>
            <Text style={styles.hint}>Inviter familiemedlemmer til å samarbeide på oppgaven.</Text>
            <View style={styles.chipRow}>
              {members.filter((m) => m.role !== 'child').map((m) => {
                const on = participants.includes(m.uid);
                return (
                  <TouchableOpacity
                    key={m.uid}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggleParticipant(m.uid)}
                  >
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{m.name}</Text>
                    {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Attachments */}
        <Text style={[styles.label, { marginTop: 16 }]}>Vedlegg</Text>
        {attachments.map((att, idx) => (
          <View key={`att-${idx}`} style={styles.attRow}>
            <Image source={{ uri: att.url }} style={styles.attThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.attName}>{att.name || `Vedlegg ${idx + 1}`}</Text>
              {att.addedBy && <Text style={styles.attBy}>{att.addedBy}</Text>}
            </View>
            {!readOnly && (
              <TouchableOpacity onPress={() => removeAttachment(idx)} style={{ padding: 8 }}>
                <Ionicons name="trash-outline" size={16} color="#b91c1c" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {readOnly && attachments.length === 0 && (
          <Text style={styles.emptyTxt}>Ingen vedlegg.</Text>
        )}
        {!readOnly && (
          uploading ? (
            <View style={styles.uploadingRow}><ActivityIndicator color={colors.brand} /><Text style={styles.uploadingTxt}>Laster opp...</Text></View>
          ) : (
            <TouchableOpacity style={styles.addAttBtn} onPress={pickAttachment}>
              <Ionicons name="attach" size={18} color={colors.brand} />
              <Text style={styles.addAttTxt}>Legg til vedlegg</Text>
            </TouchableOpacity>
          )
        )}

        {/* Save — mobile; desktop uses shell footer */}
        {!isDesktop && !readOnly && (
          <BigButton label={isNew ? 'Opprett oppgave' : 'Lagre endringer'} onPress={save} disabled={!title.trim() || saving} />
        )}

        {/* ---- Only for existing tasks ---- */}
        {!isNew && (
          <>
            {/* Comments */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💬 Kommentarer</Text>
              {comments.length === 0 && <Text style={styles.emptyTxt}>Ingen kommentarer ennå.</Text>}
              {comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={{ fontSize: 14 }}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentName}>{c.name || 'Ukjent'}</Text>
                      <Text style={styles.commentTime}>{formatTs(c.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Skriv en kommentar..."
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.commentSendBtn, !newComment.trim() && { opacity: 0.4 }]}
                  onPress={postComment}
                  disabled={!newComment.trim()}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Activity log */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 Oppgavelogg</Text>
              {logs.length === 0 && <Text style={styles.emptyTxt}>Ingen endringer ennå.</Text>}
              {logs.map((l) => (
                <View key={l.id} style={styles.logRow}>
                  <View style={styles.logDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logText}>
                      <Text style={{ fontWeight: '400' }}>{l.name || 'Ukjent'}</Text> — {l.text}
                    </Text>
                    <Text style={styles.logTime}>{formatTs(l.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Delete */}
            {!readOnly && (
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteTask}>
                <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                <Text style={styles.deleteTxt}>Slett oppgave</Text>
              </TouchableOpacity>
            )}
          </>
        )}


        {isDesktop ? null : <View style={{ height: 40 }} />}
    </>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopFormShell
          title={formTitle}
          onClose={() => nav.goBack()}
          width={560}
          footer={!readOnly ? (
            <BigButton
              label={isNew ? 'Opprett oppgave' : 'Lagre endringer'}
              onPress={save}
              disabled={!title.trim() || saving}
            />
          ) : null}
        >
          {formBody}
        </DesktopFormShell>
      </View>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {formBody}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  desktopRoot: { flex: 1, backgroundColor: 'transparent' },
  body: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  topRowDesk: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  backBtn: {
    alignSelf: 'flex-start', padding: 6, borderRadius: 10, backgroundColor: colors.sunken },
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
  },
  doneBadgeOn: { backgroundColor: '#10b981', borderColor: '#10b981' },
  doneBadgeTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },

  label: { fontWeight: '500', color: colors.ink, fontSize: 13, marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  intro: {
    fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18,
    marginBottom: 4, marginTop: 4,
  },
  introDesk: { fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    fontSize: 15, fontWeight: '400', backgroundColor: colors.card, color: colors.ink, marginBottom: 4,
  },
  inputReadonly: { backgroundColor: colors.sunken, color: colors.ink },
  readonlyValue: {
    fontSize: 14, fontWeight: '500', color: colors.ink,
    backgroundColor: colors.sunken, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.line, marginBottom: 4,
  },
  pickerField: { backgroundColor: colors.card },
  pickerBtn: {
    alignSelf: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.card,
    cursor: 'pointer',
  },
  timePickerBtn: { width: 120, flexShrink: 0 },
  pickerDisabled: { opacity: 0.45, borderColor: colors.line },
  pickerBtnTxt: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
  pickerPlaceholder: { color: colors.muted, fontWeight: '400' },
  webPickerOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
  },
  deadlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },
  timeInput: { width: 88, marginBottom: 0, textAlign: 'center' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  chipTxtOn: { color: '#fff' },

  attRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  attThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e2e8f0' },
  attName: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  attBy: { color: '#94a3b8', fontSize: 11, fontWeight: '400' },
  addAttBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#eef6ff', borderRadius: 10, paddingVertical: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#93c5fd', borderStyle: 'dashed',
  },
  addAttTxt: { color: colors.brand, fontWeight: '400' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  uploadingTxt: { color: colors.brand, fontWeight: '500' },

  section: { marginTop: 24, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  sectionTitle: { fontWeight: '400', fontSize: 15, color: colors.ink, marginBottom: 10 },
  emptyTxt: { color: '#94a3b8', fontWeight: '400', fontSize: 13 },

  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  commentTime: { color: '#94a3b8', fontSize: 11, fontWeight: '400' },
  commentText: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 2 },

  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  commentInput: {
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    padding: 10, fontSize: 14, backgroundColor: colors.card, color: colors.ink, maxHeight: 80,
  },
  commentSendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  logRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  logDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  logText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  logTime: { color: '#94a3b8', fontSize: 11, fontWeight: '400', marginTop: 2 },

  deleteBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
  },
  deleteTxt: { color: '#b91c1c', fontWeight: '400', fontSize: 14 },
});

