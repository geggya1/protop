import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import uuid from 'react-native-uuid';
import { Screen, Title, Mute } from '../components/ui';
import CompactBackLink from '../components/CompactBackLink';
import ConfirmDialog, { InfoDialog } from '../components/ConfirmDialog';
import { auth, db } from '../firebase';
import { colors, radius } from '../src/theme';
import { readFamilyMembers } from '../src/utils/familyMembers';
import {
  ACTIVITY_TYPES,
  WEEKDAYS,
  getActivityType,
  getPresetFilters,
  defaultPresetFilter,
  presetsForActivity,
  emptyExercise,
  emptyExerciseForActivity,
  exerciseFromPreset,
  formatExerciseSummary,
  formatExerciseMeta,
  FOCUS_SUGGESTIONS,
  buildSessionFromTemplate,
  activityUsesPhases,
} from '../src/utils/activityPresets';

function MemberRow({ name, enabled, onToggle, locked }) {
  return (
    <View style={styles.memberRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Switch value={enabled} onValueChange={onToggle} disabled={locked} />
    </View>
  );
}

function toNumOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function ActivityDetailScreen({ route, navigation }) {
  const { familyId, activityId } = route?.params || {};
  const uid = auth.currentUser?.uid || null;

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState(null);
  const [dayPrograms, setDayPrograms] = useState({});
  const [members, setMembers] = useState([]);

  const [selectedDay, setSelectedDay] = useState('mon');

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('styrketrening');
  const [editNotes, setEditNotes] = useState('');
  const [editDefaultRest, setEditDefaultRest] = useState('60');
  const [editWeightUnit, setEditWeightUnit] = useState('kg');

  // Participants
  const [manageOpen, setManageOpen] = useState(false);
  const [participantDraft, setParticipantDraft] = useState([]);
  const [manageBusy, setManageBusy] = useState(false);

  // Day focus
  const [focusDraft, setFocusDraft] = useState('');
  const [focusBusy, setFocusBusy] = useState(false);

  // Exercise editor
  const [exModalOpen, setExModalOpen] = useState(false);
  const [editingExId, setEditingExId] = useState(null);
  const [exForm, setExForm] = useState(emptyExercise());
  const [presetFilter, setPresetFilter] = useState('chest');
  const [exBusy, setExBusy] = useState(false);

  // Confirm deactivate/delete
  const [confirm, setConfirm] = useState({ open: false, kind: null });
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '' });

  const showSaved = useCallback((message = 'Endringene er lagret.') => {
    setInfoDialog({ visible: true, title: 'Lagret ✓', message });
  }, []);

  const participantUids = Array.isArray(activity?.participantUids) ? activity.participantUids : [];
  const isParticipant = !!(uid && participantUids.includes(uid));
  const canManage = !!(uid && activity && (activity.createdByUid === uid || isParticipant));
  const isOwner = !!(uid && activity?.createdByUid === uid);
  const isActive = activity?.active !== false;

  const typeMeta = getActivityType(activity?.type || editType);
  const currentProgram = dayPrograms[selectedDay] || null;
  const exercises = Array.isArray(currentProgram?.exercises)
    ? [...currentProgram.exercises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!familyId) return;
      const ms = await readFamilyMembers(db, familyId);
      if (mounted) setMembers(ms);
    })();
    return () => {
      mounted = false;
    };
  }, [familyId]);

  useEffect(() => {
    if (!familyId || !activityId) return;
    const unsubAct = onSnapshot(doc(db, 'families', familyId, 'activities', activityId), (snap) => {
      if (!snap.exists()) {
        setActivity(null);
        setLoading(false);
        return;
      }
      const d = { id: snap.id, ...(snap.data() || {}) };
      setActivity(d);
      setLoading(false);
    });

    const unsubDays = onSnapshot(
      collection(db, 'families', familyId, 'activities', activityId, 'dayPrograms'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() || {}) };
        });
        setDayPrograms(map);
      },
    );

    return () => {
      unsubAct?.();
      unsubDays?.();
    };
  }, [familyId, activityId]);

  useEffect(() => {
    setFocusDraft(currentProgram?.focus || '');
  }, [selectedDay, currentProgram?.focus]);

  const openSettings = useCallback(() => {
    if (!activity) return;
    setEditTitle(activity.title || '');
    setEditType(activity.type || 'styrketrening');
    setEditNotes(activity.preferences?.notes || '');
    setEditDefaultRest(String(activity.preferences?.defaultRestSec ?? 60));
    setEditWeightUnit(activity.preferences?.weightUnit || 'kg');
    setSettingsOpen(true);
  }, [activity]);

  const saveSettings = useCallback(async () => {
    if (!canManage || !familyId || !activityId) return;
    const type = getActivityType(editType);
    const title = (editTitle || '').trim() || type.label;
    try {
      setSettingsBusy(true);
      await updateDoc(doc(db, 'families', familyId, 'activities', activityId), {
        title,
        type: editType,
        icon: type.icon,
        color: type.color,
        preferences: {
          ...(activity?.preferences || {}),
          notes: (editNotes || '').trim(),
          defaultRestSec: toNumOrNull(editDefaultRest) ?? 60,
          weightUnit: editWeightUnit === 'lbs' ? 'lbs' : 'kg',
        },
        updatedAt: serverTimestamp(),
      });
      setSettingsOpen(false);
      showSaved('Innstillingene er lagret.');
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke lagre innstillinger.');
    } finally {
      setSettingsBusy(false);
    }
  }, [
    canManage,
    familyId,
    activityId,
    editTitle,
    editType,
    editNotes,
    editDefaultRest,
    editWeightUnit,
    activity?.preferences,
    showSaved,
  ]);

  const openManageParticipants = useCallback(() => {
    if (!isOwner) {
      Alert.alert('Kun eier', 'Bare den som opprettet aktiviteten kan endre deltakerne.');
      return;
    }
    setParticipantDraft([...participantUids]);
    setManageOpen(true);
  }, [isOwner, participantUids]);

  const saveParticipants = useCallback(async () => {
    if (!isOwner) return;
    try {
      setManageBusy(true);
      const final = Array.from(new Set(participantDraft || []));
      if (uid && !final.includes(uid)) final.push(uid);
      await updateDoc(doc(db, 'families', familyId, 'activities', activityId), {
        participantUids: final,
        updatedAt: serverTimestamp(),
      });
      setManageOpen(false);
      showSaved('Deltakerlisten er oppdatert.');
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke oppdatere deltakere.');
    } finally {
      setManageBusy(false);
    }
  }, [isOwner, participantDraft, uid, familyId, activityId, showSaved]);

  const toggleDraftMember = useCallback(
    (mUid, value) => {
      setParticipantDraft((prev) => {
        const set = new Set(prev || []);
        if (value) set.add(mUid);
        else set.delete(mUid);
        if (uid) set.add(uid);
        return Array.from(set);
      });
    },
    [uid],
  );

  const saveFocus = useCallback(async () => {
    if (!canManage || !isActive) return;
    try {
      setFocusBusy(true);
      const ref = doc(db, 'families', familyId, 'activities', activityId, 'dayPrograms', selectedDay);
      const existing = dayPrograms[selectedDay];
      await setDoc(
        ref,
        {
          weekday: selectedDay,
          focus: (focusDraft || '').trim(),
          exercises: Array.isArray(existing?.exercises) ? existing.exercises : [],
          updatedAt: serverTimestamp(),
          ...(existing ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
      );
      showSaved('Dagens fokus er lagret.');
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke lagre dagens fokus.');
    } finally {
      setFocusBusy(false);
    }
  }, [canManage, isActive, familyId, activityId, selectedDay, focusDraft, dayPrograms, showSaved]);

  const persistExercises = useCallback(
    async (nextExercises) => {
      const ref = doc(db, 'families', familyId, 'activities', activityId, 'dayPrograms', selectedDay);
      const existing = dayPrograms[selectedDay];
      await setDoc(
        ref,
        {
          weekday: selectedDay,
          focus: existing?.focus || (focusDraft || '').trim() || '',
          exercises: nextExercises,
          updatedAt: serverTimestamp(),
          ...(existing ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
      );
    },
    [familyId, activityId, selectedDay, dayPrograms, focusDraft],
  );

  const activityTypeId = activity?.type || editType || 'annet';
  const presetFilters = useMemo(() => getPresetFilters(activityTypeId), [activityTypeId]);
  const usePhases = activityUsesPhases(activityTypeId);

  const openAddExercise = useCallback(() => {
    if (!canManage || !isActive) return;
    const filter = defaultPresetFilter(activityTypeId);
    const defaults = emptyExerciseForActivity(activityTypeId, {
      restSec: activity?.preferences?.defaultRestSec ?? (usePhases ? 30 : 60),
      order: exercises.length,
      phase: usePhases ? filter : null,
      muscleGroup: usePhases ? 'full' : filter,
    });
    setEditingExId(null);
    setExForm(defaults);
    setPresetFilter(filter);
    setExModalOpen(true);
  }, [canManage, isActive, activity?.preferences?.defaultRestSec, exercises.length, activityTypeId, usePhases]);

  const openEditExercise = useCallback(
    (ex) => {
      if (!canManage || !isActive) return;
      setEditingExId(ex.id);
      setExForm({ ...emptyExercise(), ...ex });
      setPresetFilter(usePhases ? (ex.phase || defaultPresetFilter(activityTypeId)) : (ex.muscleGroup || 'full'));
      setExModalOpen(true);
    },
    [canManage, isActive, usePhases, activityTypeId],
  );

  const applySessionTemplate = useCallback(async () => {
    if (!canManage || !isActive) return;
    if (exercises.length > 0) {
      Alert.alert(
        'Erstatt dagens øvelser?',
        'Forslaget erstatter øvelsene som allerede ligger på denne dagen.',
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Erstatt',
            style: 'destructive',
            onPress: async () => {
              try {
                const built = buildSessionFromTemplate(activityTypeId).map((ex, idx) => ({
                  ...ex,
                  id: String(uuid.v4()),
                  order: idx,
                }));
                await persistExercises(built);
                const suggestions = FOCUS_SUGGESTIONS[activityTypeId];
                if (suggestions?.[0] && !(focusDraft || '').trim()) {
                  setFocusDraft(suggestions[0]);
                }
                showSaved('Foreslått økt er lagt inn for dagen.');
              } catch (e) {
                console.error(e);
                Alert.alert('Feil', 'Kunne ikke legge inn forslaget.');
              }
            },
          },
        ],
      );
      return;
    }
    try {
      const built = buildSessionFromTemplate(activityTypeId).map((ex, idx) => ({
        ...ex,
        id: String(uuid.v4()),
        order: idx,
      }));
      await persistExercises(built);
      const suggestions = FOCUS_SUGGESTIONS[activityTypeId];
      if (suggestions?.[0] && !(focusDraft || '').trim()) {
        setFocusDraft(suggestions[0]);
      }
      showSaved('Foreslått økt er lagt inn for dagen.');
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke legge inn forslaget.');
    }
  }, [canManage, isActive, exercises.length, activityTypeId, persistExercises, focusDraft, showSaved]);

  const applyPreset = useCallback((preset) => {
    setExForm((prev) => ({
      ...exerciseFromPreset(preset, prev.order ?? 0),
      id: prev.id,
    }));
  }, []);

  const saveExercise = useCallback(async () => {
    if (!canManage) return;
    const name = (exForm.name || '').trim();
    if (!name) {
      Alert.alert('Manglende navn', 'Gi øvelsen et navn.');
      return;
    }
    try {
      setExBusy(true);
      const payload = {
        id: editingExId || String(uuid.v4()),
        name,
        muscleGroup: exForm.muscleGroup || 'full',
        phase: exForm.phase || null,
        sets: toNumOrNull(exForm.sets),
        reps: toNumOrNull(exForm.reps),
        durationSec: toNumOrNull(exForm.durationSec),
        restSec: toNumOrNull(exForm.restSec),
        weightKg: toNumOrNull(exForm.weightKg),
        intervalWorkSec: toNumOrNull(exForm.intervalWorkSec),
        intervalRestSec: toNumOrNull(exForm.intervalRestSec),
        notes: (exForm.notes || '').trim(),
        order: typeof exForm.order === 'number' ? exForm.order : exercises.length,
      };

      let next;
      if (editingExId) {
        next = exercises.map((e) => (e.id === editingExId ? payload : e));
      } else {
        next = [...exercises, payload];
      }
      await persistExercises(next);
      setExModalOpen(false);
      showSaved(editingExId ? 'Øvelsen er oppdatert.' : 'Øvelsen er lagt til.');
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke lagre øvelsen.');
    } finally {
      setExBusy(false);
    }
  }, [canManage, exForm, editingExId, exercises, persistExercises, showSaved]);

  const deleteExercise = useCallback(
    async (ex) => {
      if (!canManage || !isActive) return;
      try {
        const ok = await new Promise((resolve) => {
          Alert.alert('Slett øvelse?', `Slette «${ex.name}»?`, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Slett', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!ok) return;
        const next = exercises.filter((e) => e.id !== ex.id).map((e, i) => ({ ...e, order: i }));
        await persistExercises(next);
      } catch (e) {
        console.error(e);
        Alert.alert('Feil', 'Kunne ikke slette øvelsen.');
      }
    },
    [canManage, isActive, exercises, persistExercises],
  );

  const setActiveFlag = useCallback(
    async (active) => {
      if (!isOwner) return;
      try {
        await updateDoc(doc(db, 'families', familyId, 'activities', activityId), {
          active,
          updatedAt: serverTimestamp(),
        });
        setConfirm({ open: false, kind: null });
      } catch (e) {
        console.error(e);
        Alert.alert('Feil', 'Kunne ikke oppdatere status.');
      }
    },
    [isOwner, familyId, activityId],
  );

  const softDelete = useCallback(async () => {
    if (!isOwner) return;
    try {
      await updateDoc(doc(db, 'families', familyId, 'activities', activityId), {
        deleted: true,
        active: false,
        updatedAt: serverTimestamp(),
      });
      setConfirm({ open: false, kind: null });
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert('Feil', 'Kunne ikke slette aktiviteten.');
    }
  }, [isOwner, familyId, activityId, navigation]);

  const dayHasContent = useCallback(
    (dayId) => {
      const p = dayPrograms[dayId];
      if (!p) return false;
      return !!(p.focus || (Array.isArray(p.exercises) && p.exercises.length > 0));
    },
    [dayPrograms],
  );

  const confirmConfig = useMemo(() => {
    if (confirm.kind === 'deactivate') {
      return {
        title: 'Deaktiver aktivitet?',
        message: 'Programmet skjules midlertidig, men kan aktiveres igjen.',
        confirmText: 'Deaktiver',
        danger: false,
        action: () => setActiveFlag(false),
      };
    }
    if (confirm.kind === 'activate') {
      return {
        title: 'Aktiver aktivitet?',
        message: 'Aktiviteten blir synlig og redigerbar igjen.',
        confirmText: 'Aktiver',
        danger: false,
        action: () => setActiveFlag(true),
      };
    }
    if (confirm.kind === 'delete') {
      return {
        title: 'Slett aktivitet?',
        message: 'Aktiviteten og dagsprogrammene fjernes fra listen.',
        confirmText: 'Slett',
        danger: true,
        action: softDelete,
      };
    }
    return {};
  }, [confirm.kind, setActiveFlag, softDelete]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (!activity || activity.deleted === true) {
    return (
      <Screen>
        <View style={styles.pad}>
          <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
          <Title size={24}>Aktivitet</Title>
          <Mute style={{ marginTop: 8 }}>Fant ikke aktiviteten.</Mute>
        </View>
      </Screen>
    );
  }

  const dayLabel = WEEKDAYS.find((d) => d.id === selectedDay)?.label || selectedDay;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title size={26}>{activity.title || typeMeta.label}</Title>
            <Mute style={{ marginTop: 4 }}>
              {typeMeta.label}
              {!isActive ? ' · Deaktivert' : ''}
              {` · ${participantUids.length} ${participantUids.length === 1 ? 'deltaker' : 'deltakere'}`}
            </Mute>
          </View>
          <TouchableOpacity
            style={styles.iconRound}
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel="Innstillinger"
          >
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {!!(activity.preferences?.notes) && (
          <Mute style={{ marginBottom: 4 }}>{activity.preferences.notes}</Mute>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.chipBtn} onPress={openManageParticipants}>
            <Ionicons name="people-outline" size={16} color={isOwner ? colors.brand : colors.muted} />
            <Text style={[styles.chipTxt, !isOwner && { color: colors.muted }]}>Deltakere</Text>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity
              style={[styles.chipBtn, !isActive && { backgroundColor: colors.successSoft }]}
              onPress={() => setConfirm({ open: true, kind: isActive ? 'deactivate' : 'activate' })}
            >
              <Ionicons name={isActive ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={colors.ink} />
              <Text style={[styles.chipTxt, { color: colors.ink }]}>{isActive ? 'Deaktiver' : 'Aktiver'}</Text>
            </TouchableOpacity>
          )}
          {isOwner && (
            <TouchableOpacity
              style={[styles.chipBtn, styles.chipDanger]}
              onPress={() => setConfirm({ open: true, kind: 'delete' })}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.chipTxt, { color: colors.danger }]}>Slett</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.programBlock}>
          <Text style={styles.blockTitle}>Ukeprogram</Text>
          <Text style={styles.blockHelp}>
            Velg dag og bygg økten i rekkefølge
            {usePhases ? ' (oppvarming → teknikk → hoveddel → nedtrapping).' : ' med fokus og øvelser.'}
            {' '}Forslagene er tilpasset {typeMeta.label.toLowerCase()}.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
            {WEEKDAYS.map((d) => {
              const on = selectedDay === d.id;
              const has = dayHasContent(d.id);
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.dayPill, on && styles.dayPillOn, has && !on && styles.dayPillHas]}
                  onPress={() => setSelectedDay(d.id)}
                >
                  <Text style={[styles.dayPillTxt, on && styles.dayPillTxtOn]}>{d.short}</Text>
                  {has ? <View style={[styles.dayDot, on && { backgroundColor: colors.card }]} /> : <View style={styles.dayDotSpacer} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.dayPanel}>
            <Text style={styles.dayPanelTitle}>{dayLabel}</Text>

            <Text style={styles.fieldLabel}>Dagens fokus</Text>
            <View style={styles.focusRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                placeholder={(FOCUS_SUGGESTIONS[activityTypeId] || ['F.eks. teknikk'])[0]}
                value={focusDraft}
                onChangeText={setFocusDraft}
                editable={canManage && isActive}
              />
              {canManage && isActive && (
                <TouchableOpacity style={styles.saveFocusBtn} onPress={saveFocus} disabled={focusBusy}>
                  <Text style={styles.saveFocusTxt}>{focusBusy ? '…' : 'Lagre'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {canManage && isActive && (FOCUS_SUGGESTIONS[activityTypeId] || []).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                {(FOCUS_SUGGESTIONS[activityTypeId] || []).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.suggestChip}
                    onPress={() => setFocusDraft(s)}
                  >
                    <Text style={styles.suggestChipTxt}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.exHeader}>
              <Text style={styles.fieldLabel}>Øvelser / drills</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {canManage && isActive && (
                  <TouchableOpacity style={styles.suggestBtn} onPress={applySessionTemplate}>
                    <Ionicons name="sparkles-outline" size={14} color={colors.brand} />
                    <Text style={styles.suggestBtnTxt}>Foreslå økt</Text>
                  </TouchableOpacity>
                )}
                {canManage && isActive && (
                  <TouchableOpacity style={styles.addExBtn} onPress={openAddExercise}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.addExTxt}>Legg til</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {exercises.length === 0 ? (
              <View style={styles.emptyDay}>
                <Text style={styles.emptyDayTxt}>
                  Ingen øvelser denne dagen ennå. Trykk «Foreslå økt» for et ferdig utkast tilpasset {typeMeta.label.toLowerCase()}, eller legg til manuelt.
                </Text>
              </View>
            ) : (
              exercises.map((ex, idx) => (
                <View key={ex.id || idx} style={styles.exRow}>
                  <View style={styles.exIndex}>
                    <Text style={styles.exIndexTxt}>{idx + 1}</Text>
                  </View>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => openEditExercise(ex)} disabled={!canManage}>
                    <Text style={styles.exName}>{ex.name}</Text>
                    <Text style={styles.exMeta}>
                      {formatExerciseMeta(ex)}
                      {formatExerciseSummary(ex) ? ` · ${formatExerciseSummary(ex)}` : ''}
                    </Text>
                    {!!ex.notes && (
                      <Text style={styles.exNotes} numberOfLines={2}>{ex.notes}</Text>
                    )}
                  </TouchableOpacity>
                  {canManage && isActive && (
                    <TouchableOpacity onPress={() => deleteExercise(ex)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Settings modal */}
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView style={{ maxHeight: Platform.OS === 'web' ? '80vh' : 520 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Innstillinger</Text>

              <Text style={styles.modalSectionTitle}>Navn</Text>
              <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} editable={canManage} />

              <Text style={styles.modalSectionTitle}>Type</Text>
              <View style={styles.typeGrid}>
                {ACTIVITY_TYPES.map((t) => {
                  const on = editType === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeChip, on && { backgroundColor: t.color, borderColor: t.color }]}
                      onPress={() => canManage && setEditType(t.id)}
                      disabled={!canManage}
                    >
                      <Ionicons name={t.icon} size={14} color={on ? '#fff' : t.color} />
                      <Text style={[styles.typeChipTxt, on && { color: '#fff' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalSectionTitle}>Standard pause (sek)</Text>
              <TextInput
                style={styles.input}
                value={editDefaultRest}
                onChangeText={setEditDefaultRest}
                keyboardType="numeric"
                editable={canManage}
              />

              <Text style={styles.modalSectionTitle}>Vektenhet</Text>
              <View style={styles.segRow}>
                {['kg', 'lbs'].map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.segBtn, editWeightUnit === u && styles.segBtnOn]}
                    onPress={() => canManage && setEditWeightUnit(u)}
                  >
                    <Text style={[styles.segTxt, editWeightUnit === u && styles.segTxtOn]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalSectionTitle}>Notater / preferanser</Text>
              <TextInput
                style={[styles.input, { minHeight: 72 }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                placeholder="F.eks. hjemmegym, 45 min økter"
                editable={canManage}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setSettingsOpen(false)}>
                <Text style={[styles.btnTxt, { color: '#0f172a' }]}>Lukk</Text>
              </TouchableOpacity>
              {canManage && (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveSettings} disabled={settingsBusy}>
                  <Text style={[styles.btnTxt, { color: '#fff' }]}>{settingsBusy ? 'Lagrer…' : 'Lagre'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Participants */}
      <Modal visible={manageOpen} transparent animationType="fade" onRequestClose={() => setManageOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deltakere</Text>
            <Text style={styles.modalHelp}>Velg hvem som kan se og endre denne aktiviteten.</Text>
            <View style={{ marginTop: 12, gap: 10 }}>
              {members.map((m) => (
                <MemberRow
                  key={m.uid}
                  name={m.name}
                  enabled={participantDraft.includes(m.uid)}
                  locked={m.uid === uid}
                  onToggle={(v) => toggleDraftMember(m.uid, v)}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setManageOpen(false)}>
                <Text style={[styles.btnTxt, { color: '#0f172a' }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveParticipants} disabled={manageBusy}>
                <Text style={[styles.btnTxt, { color: '#fff' }]}>{manageBusy ? 'Lagrer…' : 'Lagre'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Exercise editor */}
      <Modal visible={exModalOpen} transparent animationType="fade" onRequestClose={() => setExModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 560 }]}>
            <ScrollView style={{ maxHeight: Platform.OS === 'web' ? '85vh' : 560 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editingExId ? 'Rediger øvelse' : 'Ny øvelse'}</Text>
              <Text style={styles.modalHelp}>
                Forslagene er filtrert for {typeMeta.label.toLowerCase()}
                {usePhases ? ' og øktfase.' : '.'} Velg fra listen, eller skriv eget navn.
              </Text>

              <Text style={styles.modalSectionTitle}>
                {usePhases ? 'Øktfase / standardliste' : 'Fra standardliste'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                {presetFilters.map((g) => {
                  const on = presetFilter === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.miniChip, on && styles.miniChipOn]}
                      onPress={() => setPresetFilter(g.id)}
                    >
                      <Text style={[styles.miniChipTxt, on && { color: '#fff' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.presetWrap}>
                {presetsForActivity(activityTypeId, presetFilter).length === 0 ? (
                  <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>
                    Ingen forslag i denne kategorien. Skriv eget navn under.
                  </Text>
                ) : (
                  presetsForActivity(activityTypeId, presetFilter).map((p) => (
                    <TouchableOpacity key={p.name} style={styles.presetBtn} onPress={() => applyPreset(p)}>
                      <Text style={styles.presetBtnTxt}>{p.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <Text style={styles.modalSectionTitle}>Navn</Text>
              <TextInput
                style={styles.input}
                value={exForm.name}
                onChangeText={(t) => setExForm((f) => ({ ...f, name: t }))}
                placeholder="Øvelses- eller drillnavn"
              />

              {usePhases ? (
                <>
                  <Text style={styles.modalSectionTitle}>Fase i økten</Text>
                  <View style={styles.typeGrid}>
                    {presetFilters.map((g) => {
                      const on = exForm.phase === g.id;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          style={[styles.typeChip, on && styles.miniChipOn]}
                          onPress={() => setExForm((f) => ({ ...f, phase: g.id }))}
                        >
                          <Text style={[styles.typeChipTxt, on && { color: '#fff' }]}>{g.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalSectionTitle}>Muskelgruppe</Text>
                  <View style={styles.typeGrid}>
                    {presetFilters.map((g) => {
                      const on = exForm.muscleGroup === g.id;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          style={[styles.typeChip, on && styles.miniChipOn]}
                          onPress={() => setExForm((f) => ({ ...f, muscleGroup: g.id }))}
                        >
                          <Text style={[styles.typeChipTxt, on && { color: '#fff' }]}>{g.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={styles.numGrid}>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Sett</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.sets == null ? '' : String(exForm.sets)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, sets: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Repetisjoner</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.reps == null ? '' : String(exForm.reps)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, reps: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Varighet (sek)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.durationSec == null ? '' : String(exForm.durationSec)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, durationSec: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Pause (sek)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.restSec == null ? '' : String(exForm.restSec)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, restSec: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Vekt ({activity?.preferences?.weightUnit || 'kg'})</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.weightKg == null ? '' : String(exForm.weightKg)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, weightKg: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Intervall arbeid (sek)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.intervalWorkSec == null ? '' : String(exForm.intervalWorkSec)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, intervalWorkSec: t }))}
                  />
                </View>
                <View style={styles.numCell}>
                  <Text style={styles.fieldLabel}>Intervall pause (sek)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={exForm.intervalRestSec == null ? '' : String(exForm.intervalRestSec)}
                    onChangeText={(t) => setExForm((f) => ({ ...f, intervalRestSec: t }))}
                  />
                </View>
              </View>

              <Text style={styles.modalSectionTitle}>Notater</Text>
              <TextInput
                style={[styles.input, { minHeight: 56 }]}
                value={exForm.notes || ''}
                onChangeText={(t) => setExForm((f) => ({ ...f, notes: t }))}
                multiline
                placeholder="Teknikktips, tempo, RPE …"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setExModalOpen(false)} disabled={exBusy}>
                <Text style={[styles.btnTxt, { color: '#0f172a' }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveExercise} disabled={exBusy}>
                <Text style={[styles.btnTxt, { color: '#fff' }]}>{exBusy ? 'Lagrer…' : 'Lagre'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirm.open}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        danger={confirmConfig.danger}
        onCancel={() => setConfirm({ open: false, kind: null })}
        onConfirm={() => {
          const action = confirmConfig.action;
          setConfirm({ open: false, kind: null });
          action?.();
        }}
      />
      <InfoDialog
        visible={infoDialog.visible}
        title={infoDialog.title}
        message={infoDialog.message}
        onClose={() => setInfoDialog({ visible: false, title: '', message: '' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  iconRound: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  chipTxt: { color: colors.brand, fontWeight: '800', fontSize: 12 },

  programBlock: { marginTop: 18 },
  blockTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  blockHelp: { marginTop: 4, color: colors.muted, fontWeight: '600', fontSize: 13, lineHeight: 18 },

  dayStrip: { gap: 8, paddingVertical: 14 },
  dayPill: {
    minWidth: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
  },
  dayPillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayPillHas: { borderColor: '#93c5fd', backgroundColor: colors.brandSoft },
  dayPillTxt: { fontWeight: '800', color: colors.ink, fontSize: 13 },
  dayPillTxtOn: { color: '#fff' },
  dayDot: { marginTop: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  dayDotSpacer: { marginTop: 6, width: 6, height: 6 },

  dayPanel: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  dayPanelTitle: { fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 8 },
  fieldLabel: { fontWeight: '700', color: colors.ink, fontSize: 12, marginTop: 4 },
  focusRow: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' },
  saveFocusBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveFocusTxt: { color: '#fff', fontWeight: '800' },

  suggestChip: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  suggestChipTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  suggestBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 12 },

  exHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addExTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  emptyDay: { paddingVertical: 20, alignItems: 'center', paddingHorizontal: 8 },
  emptyDayTxt: { color: colors.muted, fontWeight: '600', textAlign: 'center', lineHeight: 18 },

  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  exIndex: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exIndexTxt: { fontWeight: '800', color: colors.brand, fontSize: 12 },
  exName: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  exMeta: { marginTop: 2, color: colors.muted, fontWeight: '600', fontSize: 12 },
  exNotes: { marginTop: 2, color: colors.muted, fontSize: 12 },
  iconBtn: { padding: 6 },

  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.card,
    fontWeight: '700',
    color: colors.ink,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    ...(Platform.OS === 'web' ? { boxShadow: '0 16px 40px rgba(15,23,42,0.18)' } : {}),
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  modalHelp: { marginTop: 6, color: colors.muted, fontWeight: '600', fontSize: 12, lineHeight: 16 },
  modalSectionTitle: { marginTop: 14, fontWeight: '800', color: colors.ink },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 14, justifyContent: 'flex-end' },
  btn: {
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  btnGhost: { backgroundColor: colors.line },
  btnPrimary: { backgroundColor: colors.brand },
  btnTxt: { fontWeight: '800' },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipTxt: { fontWeight: '800', color: colors.ink, fontSize: 13 },

  segRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  segBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card,
  },
  segBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segTxt: { fontWeight: '800', color: colors.ink },
  segTxtOn: { color: '#fff' },

  memberRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 },
  memberName: { fontWeight: '800', color: colors.ink },

  miniChip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  miniChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  miniChipTxt: { fontWeight: '800', color: colors.ink, fontSize: 12 },

  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  presetBtnTxt: { fontWeight: '800', color: colors.ink, fontSize: 12 },

  numGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  numCell: { width: '47%' },
});
