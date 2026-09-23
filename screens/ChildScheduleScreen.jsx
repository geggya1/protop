/**
 * Ukeplan for barnet — dags- og ukesvisning.
 * Timeplan lagres på barnet. Foresatte og admin kan redigere og importere
 * (også i mobil / «se som barn»). Innlogget barn har kun visning.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, ActivityIndicator, Modal, Pressable, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';
import { desktopOverlay, desktopSheet } from '../src/desktop';
import { Screen } from '../components/ui';
import { useChildAppGuard } from '../src/hooks/useChildAppGuard';
import { useShellTitleRight } from '../src/hooks/useShellTitleRight';
import ModuleIntroHost from '../components/ModuleIntroHost';
import SchoolPageLayout from '../components/SchoolPageLayout';
import ShellAddButton from '../components/ShellAddButton';
import DayTimeline from '../components/weekPlan/DayTimeline';
import WeekPlanGrid from '../components/weekPlan/WeekPlanGrid';
import {
  WEEKPLAN_DAYS,
  emptyWeekTimetable,
  timetableHasLessons,
  upsertTimetableSlot,
  defaultSlotEndTime,
} from '../src/utils/weekPlanGrid';
import { parseTimeToMinutes } from '../src/utils/timeGrid';
import { childFromRouteParams, aiImportNavParams, paramBool } from '../src/utils/childNav';
import {
  periodSummaryText,
  findPlanForWeek,
  resolvePeriodBounds,
  upsertSchedulePlan,
  oneWeekSchedulePeriod,
  scheduleScreenStateFromDoc,
} from '../src/utils/schedulePeriod';
import { sameDay, dateKey, startOfWeekMonday } from '../src/utils/dates';
import {
  canAdultEditSchedule,
  defaultPlanDayKey,
  schoolMonday,
  dateForPlanDay,
  schoolWeekDays,
  formatWeekRange,
  formatDayHeading,
  weekNumberLabel,
  buildDayTimeline,
  schoolDayEnd,
  remindersForDay,
} from '../src/utils/weekPlanView';

export default function ChildScheduleScreen() {
  useChildAppGuard('week-plan');
  const navigation = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { isDesktop } = useLayout();
  const {
    isParent, isChild, isActingAsChild, isAdmin, kids,
  } = useApp();
  const familyId = route.params?.familyId;
  // Stabilize identity: childFromRouteParams returns a new object every call
  const routeChildId = String(
    route.params?.childId || route.params?.id || route.params?.child?.id || route.params?.child?.childId || '',
  ).trim();
  const routeChildName = String(
    route.params?.childName || route.params?.child?.name || '',
  ).trim();
  const routeChild = useMemo(
    () => (routeChildId
      ? childFromRouteParams({ childId: routeChildId, childName: routeChildName })
      : null),
    [routeChildId, routeChildName],
  );
  const child = useMemo(() => {
    if (!routeChild) return null;
    return (kids || []).find((k) => (k.id || k.childId) === routeChild.id) || routeChild;
  }, [routeChild, kids]);
  const adult = canAdultEditSchedule({ isParent, isChild, isActingAsChild, isAdmin });
  const canEdit = adult;
  const childId = child?.id || child?.childId;

  const [timetable, setTimetable] = useState(emptyWeekTimetable);
  const [period, setPeriod] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editDay, setEditDay] = useState('mon');
  const [formTime, setFormTime] = useState('08:00');
  const [formEnd, setFormEnd] = useState('08:45');
  const [formSubject, setFormSubject] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [viewMode, setViewMode] = useState('day');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => defaultPlanDayKey(new Date()));

  // Firestore doc() returns a new object every call — memoize for a stable listener
  const docRef = useMemo(
    () => (familyId && childId
      ? doc(db, 'families', familyId, 'children', childId, 'meta', 'schedule')
      : null),
    [familyId, childId],
  );

  const emptyTimetable = useMemo(() => emptyWeekTimetable(), []);

  // Live listener (same path as hjem-widget) — cached snapshot clears loading
  // immediately. One-shot getDoc previously could hang / race with effect cleanup
  // and leave the day card spinning forever while the widget still worked.
  useEffect(() => {
    if (!docRef) {
      setPlans([]);
      setPeriod(null);
      setTimetable(emptyTimetable);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (!active) return;
        const next = scheduleScreenStateFromDoc(
          snap.exists() ? snap.data() : null,
          emptyTimetable,
        );
        setPlans(next.plans);
        setPeriod(next.period);
        setTimetable(next.timetable);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsub();
    };
  }, [docRef, emptyTimetable]);

  const monday = useMemo(() => schoolMonday(new Date(), weekOffset), [weekOffset]);
  const weekDays = useMemo(() => schoolWeekDays(monday), [monday]);
  const selectedDate = useMemo(() => dateForPlanDay(monday, selectedDay), [monday, selectedDay]);
  const activePlan = useMemo(
    () => findPlanForWeek(plans, monday),
    [plans, monday],
  );
  const weekTimetable = activePlan?.timetable || emptyTimetable;
  const weekPeriod = activePlan?.period || null;
  const hasLessons = timetableHasLessons(weekTimetable);
  const weekOutsidePeriod = plans.length > 0 && !activePlan;
  const styles = useMemo(() => makeStyles(colors, isDesktop), [colors, isDesktop]);
  const now = new Date();
  const viewingToday = sameDay(selectedDate, now);
  const timeline = useMemo(
    () => buildDayTimeline(weekTimetable, selectedDay, { now, viewingToday }),
    [weekTimetable, selectedDay, viewingToday],
  );
  const reminders = useMemo(
    () => remindersForDay(weekTimetable, selectedDay),
    [weekTimetable, selectedDay],
  );
  const dayEnd = useMemo(
    () => schoolDayEnd(weekTimetable, selectedDay),
    [weekTimetable, selectedDay],
  );

  useEffect(() => {
    const seed = route.params?.seedPeriod;
    if (seed && typeof seed === 'object') {
      setPeriod(resolvePeriodBounds(seed, monday));
    }
  }, [route.params?.seedPeriod, monday]);

  const save = useCallback(async (nextTimetable, nextPeriod = weekPeriod) => {
    if (!docRef || !canEdit) return;
    setSaving(true);
    try {
      const bounds = resolvePeriodBounds(
        nextPeriod || weekPeriod || period || oneWeekSchedulePeriod(monday),
        monday,
      );
      const nextPlans = upsertSchedulePlan(plans, {
        id: activePlan?.id,
        timetable: nextTimetable,
        period: bounds,
        source: activePlan?.source || 'manual',
      });
      await setDoc(docRef, {
        mode: 'manual',
        timetable: nextTimetable,
        period: bounds,
        plans: nextPlans,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setPlans(nextPlans);
      setTimetable(nextTimetable);
      setPeriod(bounds);
    } catch {
      Alert.alert('Feil', 'Klarte ikke lagre timeplanen.');
    } finally {
      setSaving(false);
    }
  }, [docRef, canEdit, weekPeriod, period, monday, plans, activePlan]);

  const openAiImport = useCallback((autoStart = null) => {
    if (!canEdit || !familyId || !child) return;
    navigation.navigate('AiImportReview', aiImportNavParams({
      familyId,
      child,
      autoStart: autoStart || undefined,
      returnToSchedule: true,
      weekStart: dateKey(startOfWeekMonday(monday)),
    }));
  }, [canEdit, familyId, child, navigation, monday]);

  const startImport = useCallback(() => {
    openAiImport(Platform.OS === 'web' ? 'gallery' : 'camera');
  }, [openAiImport]);

  const openAdd = useCallback((dayKey = selectedDay, event = null) => {
    if (!canEdit) return;
    const key = dayKey || selectedDay;
    setEditDay(key);
    if (event?.slot) {
      setFormTime(event.startTime || event.slot.time || '08:00');
      setFormEnd(event.endTime || event.slot.endTime || defaultSlotEndTime(event.startTime));
      setFormSubject(event.title || event.slot.subject || '');
      setEditIndex(event.slotIndex);
    } else {
      setFormTime('08:00');
      setFormEnd('08:45');
      setFormSubject('');
      setEditIndex(null);
    }
    setShowAdd(true);
  }, [canEdit, selectedDay]);

  const openAddBlank = useCallback(() => openAdd(), [openAdd]);

  useEffect(() => {
    if (!paramBool(route.params?.openAdd, false) || !canEdit) return undefined;
    const t = setTimeout(() => setShowAdd(true), 350);
    return () => clearTimeout(t);
  }, [route.params?.openAdd, canEdit]);

  const mobileHeaderActions = useMemo(() => {
    if (!canEdit) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          onPress={startImport}
          accessibilityRole="button"
          accessibilityLabel="Importer timeplan"
          style={{
            width: isDesktop ? 32 : 36, height: isDesktop ? 32 : 36,
            borderRadius: isDesktop ? 6 : 10,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line,
          }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={colors.brand} />
        </TouchableOpacity>
        <ShellAddButton
          label="Ny time"
          onPress={openAddBlank}
          accessibilityLabel="Legg til time"
        />
      </View>
    );
  }, [isDesktop, canEdit, startImport, openAddBlank, colors.line, colors.brand]);

  useShellTitleRight(mobileHeaderActions);

  const commitSlot = async () => {
    const time = formTime.trim();
    if (!time || !formSubject.trim()) return;
    let next = weekTimetable;
    if (editIndex != null) {
      const slots = [...(weekTimetable[editDay] || [])];
      slots[editIndex] = {
        ...slots[editIndex],
        time,
        endTime: formEnd.trim() || defaultSlotEndTime(time),
        subject: formSubject.trim(),
      };
      next = { ...weekTimetable, [editDay]: slots };
    } else {
      next = upsertTimetableSlot(weekTimetable, editDay, {
        time,
        endTime: formEnd.trim() || defaultSlotEndTime(time),
        subject: formSubject.trim(),
      });
    }
    setShowAdd(false);
    await save(next);
  };

  const removeSlot = async () => {
    if (editIndex == null) return;
    const slots = [...(weekTimetable[editDay] || [])];
    slots.splice(editIndex, 1);
    const next = { ...weekTimetable, [editDay]: slots };
    setShowAdd(false);
    await save(next);
  };

  const shiftDay = (dir) => {
    const idx = WEEKPLAN_DAYS.findIndex((d) => d.key === selectedDay);
    const next = idx + dir;
    if (next < 0) {
      setWeekOffset((v) => v - 1);
      setSelectedDay('fri');
      return;
    }
    if (next > 4) {
      setWeekOffset((v) => v + 1);
      setSelectedDay('mon');
      return;
    }
    setSelectedDay(WEEKPLAN_DAYS[next].key);
  };

  const goToday = () => {
    setWeekOffset(0);
    setSelectedDay(defaultPlanDayKey(new Date()));
    setViewMode('day');
  };

  const weekLabel = [
    weekNumberLabel(monday),
    weekPeriod ? periodSummaryText(weekPeriod) : (period ? periodSummaryText(period) : null),
  ].filter(Boolean).join(' · ');

  const scheduleCard = (
    <View style={styles.calCard}>
      <View style={styles.calHead}>
        <Text style={styles.calTitle}>
          {viewMode === 'day' ? formatDayHeading(selectedDate) : 'Uken'}
        </Text>
        {saving ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginVertical: 28 }} color={colors.brand} />
      ) : !hasLessons ? (
        <View style={styles.empty}>
          <Ionicons name="today-outline" size={32} color={colors.muted} />
          <Text style={styles.emptyTitle}>
            {weekOutsidePeriod ? 'Ingen plan denne uken' : 'Ingen ukeplan ennå'}
          </Text>
          <Text style={styles.emptyHint}>
            {canEdit
              ? (weekOutsidePeriod
                ? 'Forrige plan gjelder ikke her. Importer eller legg til timer øverst til høyre.'
                : 'Importer timeplanen eller legg til en time — knappene sitter øverst til høyre.')
              : 'Foresatte kan legge inn timeplanen.'}
          </Text>
        </View>
      ) : viewMode === 'day' ? (
        <DayTimeline
          items={timeline}
          colors={colors}
          canEdit={canEdit}
          onPressSlot={(item) => openAdd(selectedDay, item)}
        />
      ) : (
        <WeekPlanGrid
          timetable={weekTimetable}
          colors={colors}
          canEdit={canEdit}
          weekDays={weekDays}
          onPressSlot={(dayKey, event) => openAdd(dayKey, event)}
        />
      )}
    </View>
  );

  const sidebar = (
    <View style={styles.sideCol}>
      {reminders.length > 0 ? (
        <View style={styles.rememberCard}>
          <Text style={styles.rememberTitle}>Husk i dag</Text>
          {reminders.map((item) => (
            <View key={item.id} style={styles.rememberRow}>
              <View style={styles.checkBox}>
                <Ionicons name="square-outline" size={18} color="#15803d" />
              </View>
              <Text style={styles.rememberTxt}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {dayEnd ? (
        <View style={styles.endCard}>
          <Text style={styles.endLabel}>Skoledagen slutter</Text>
          <Text style={styles.endTime}>{dayEnd}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <SchoolPageLayout
        activeId="week-plan"
        child={child}
        familyId={familyId}
        canEdit={canEdit}
        weekLabel={weekLabel}
        aiEnabled={child?.aiEnabled !== false}
      >
        <View style={styles.toolbar}>
          <View style={styles.navCluster}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => (viewMode === 'day' ? shiftDay(-1) : setWeekOffset((v) => v - 1))}
              accessibilityLabel="Forrige"
            >
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.rangeWrap}>
              <Ionicons name="calendar-outline" size={14} color={colors.muted} />
              <Text style={styles.rangeTxt}>{formatWeekRange(monday)}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => (viewMode === 'day' ? shiftDay(1) : setWeekOffset((v) => v + 1))}
              accessibilityLabel="Neste"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <View style={styles.seg}>
            <TouchableOpacity
              style={[styles.segBtn, viewMode === 'day' && styles.segBtnOn]}
              onPress={goToday}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'day' }}
            >
              <Text style={[styles.segTxt, viewMode === 'day' && styles.segTxtOn]}>I dag</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, viewMode === 'week' && styles.segBtnOn]}
              onPress={() => setViewMode('week')}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'week' }}
            >
              <Text style={[styles.segTxt, viewMode === 'week' && styles.segTxtOn]}>Hele uken</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isDesktop && viewMode === 'day' && hasLessons ? (
          <View style={styles.split}>
            <View style={styles.mainCol}>{scheduleCard}</View>
            {sidebar}
          </View>
        ) : (
          <>
            {scheduleCard}
            {viewMode === 'day' && hasLessons ? sidebar : null}
          </>
        )}

        {canEdit ? null : (
          <Text style={styles.footerHint}>Kun visning — foresatte kan redigere timeplanen.</Text>
        )}
      </SchoolPageLayout>

      <Modal visible={showAdd} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={() => setShowAdd(false)}>
        <Pressable
          style={[styles.modalOverlay, isDesktop && desktopOverlay]}
          onPress={() => setShowAdd(false)}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onStartShouldSetResponder={() => true}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={styles.modalTitle}>{editIndex != null ? 'Rediger time' : 'Legg til time'}</Text>
            <Text style={styles.modalLabel}>Dag</Text>
            <View style={styles.dayPick}>
              {WEEKPLAN_DAYS.map((d) => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.dayChip, editDay === d.key && styles.dayChipOn]}
                  onPress={() => setEditDay(d.key)}
                >
                  <Text style={[styles.dayChipTxt, editDay === d.key && styles.dayChipTxtOn]}>{d.short}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Fra</Text>
                <TextInput
                  style={styles.modalInput}
                  value={formTime}
                  onChangeText={(v) => {
                    setFormTime(v);
                    if (parseTimeToMinutes(v) != null && !formEnd) {
                      setFormEnd(defaultSlotEndTime(v) || '');
                    }
                  }}
                  placeholder="08:00"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Til</Text>
                <TextInput
                  style={styles.modalInput}
                  value={formEnd}
                  onChangeText={setFormEnd}
                  placeholder="08:45"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
            </View>
            <Text style={styles.modalLabel}>Fag / aktivitet</Text>
            <TextInput
              style={styles.modalInput}
              value={formSubject}
              onChangeText={setFormSubject}
              placeholder="Matematikk"
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={commitSlot}>
              <Text style={styles.primaryTxt}>{editIndex != null ? 'Lagre' : 'Legg til'}</Text>
            </TouchableOpacity>
            {editIndex != null && (
              <TouchableOpacity style={styles.removeBtn} onPress={removeSlot}>
                <Text style={styles.removeTxt}>Slett time</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <ModuleIntroHost scope="family" moduleId="week-plan" />
    </Screen>
  );
}

function makeStyles(colors, isDesktop) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'center' : 'stretch',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    navCluster: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line,
    },
    rangeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
    rangeTxt: { fontWeight: '500', fontSize: 14, color: colors.ink },
    seg: {
      flexDirection: 'row',
      backgroundColor: '#eef2f7',
      borderRadius: 12,
      padding: 3,
      alignSelf: isDesktop ? 'center' : 'stretch',
      width: isDesktop ? 280 : undefined,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
    },
    segBtnOn: { backgroundColor: colors.brandSoft },
    segTxt: { fontWeight: '400', fontSize: 13, color: colors.muted },
    segTxtOn: { color: colors.brand, fontWeight: '500' },
    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: colors.brand, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 14, marginTop: 8,
    },
    primaryTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
    split: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    mainCol: { flex: 1, minWidth: 0 },
    sideCol: { width: isDesktop ? 240 : undefined, gap: 12, marginTop: isDesktop ? 0 : 12 },
    calCard: {
      backgroundColor: '#fff', borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
    },
    calHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 8, paddingHorizontal: 4,
    },
    calTitle: { fontWeight: '500', fontSize: 16, color: colors.ink },
    empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 8 },
    emptyTitle: { fontWeight: '500', fontSize: 16, color: colors.ink },
    emptyHint: {
      fontSize: 13, color: colors.muted, textAlign: 'center', fontWeight: '400', lineHeight: 18,
    },
    rememberCard: {
      backgroundColor: '#ecfdf3', borderRadius: 16, padding: 14, gap: 10,
    },
    rememberTitle: { fontWeight: '500', fontSize: 14, color: '#14532d' },
    rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkBox: { width: 22, alignItems: 'center' },
    rememberTxt: { fontWeight: '400', fontSize: 14, color: '#166534' },
    endCard: {
      backgroundColor: '#fff', borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: colors.line,
    },
    endLabel: { fontWeight: '400', fontSize: 13, color: colors.muted, marginBottom: 4 },
    endTime: { fontWeight: '500', fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
    footerHint: {
      marginTop: 16, fontSize: 12, color: colors.muted, fontWeight: '400',
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18,
      padding: 18, gap: 6, paddingBottom: 32,
    },
    modalSheetDesk: {
      alignSelf: 'center', marginBottom: 0, maxWidth: 420, width: '100%',
      borderRadius: 12, padding: 18, maxHeight: '85%',
    },
    modalTitle: { fontSize: 17, fontWeight: '500', color: colors.ink, marginBottom: 4 },
    modalLabel: { fontWeight: '500', color: colors.ink, fontSize: 13, marginTop: 8 },
    modalInput: {
      borderWidth: 1, borderColor: colors.line, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: colors.bg,
    },
    timeRow: { flexDirection: 'row', gap: 10 },
    dayPick: { flexDirection: 'row', gap: 6, marginTop: 4 },
    dayChip: {
      flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
      backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
    },
    dayChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
    dayChipTxt: { fontWeight: '500', fontSize: 12, color: colors.muted },
    dayChipTxtOn: { color: colors.brand },
    removeBtn: { alignSelf: 'center', padding: 10 },
    removeTxt: { color: colors.danger, fontWeight: '500' },
    cancelBtn: { alignSelf: 'center', padding: 10 },
    cancelTxt: { color: colors.muted, fontWeight: '400' },
  });
}
