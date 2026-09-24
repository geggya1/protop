import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Platform, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import ConfirmDialog, { InfoDialog } from '../components/ConfirmDialog';
import AiImportChildPicker from '../components/AiImportChildPicker';
import { Screen } from '../components/ui';
import SchoolPageLayout from '../components/SchoolPageLayout';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import { colors } from '../src/theme';
import {
  pickPlanFile,
  uploadTempPlanImage,
  analyzePlanImage,
  applyPlanImport,
  discardPlanImport,
  deleteTempPlanImage,
  fetchPendingPlanDrafts,
  loadPlanDraft,
  formatPlanDraftWhen,
  KIND_LABELS,
  emptyManualSuggestion,
  sanitizeImportUserMessage,
  PLAN_FILE_ACCEPT_HINT,
} from '../src/utils/aiImport';
import { partitionImportSuggestions, groupScheduleSlotsByDay } from '../src/utils/schedulePrepTasks';
import { childFromRouteParams, childScheduleNavParams, lekserNavParams, paramBool } from '../src/utils/childNav';
import { applyHomeworkFocusToSuggestions } from '../src/utils/homeworkImport';
import { HOMEWORK_SUBJECTS, groupHomeworkBySubject, inferSubjectId } from '../src/utils/homework';
import { formatSlotRange } from '../src/utils/weekPlanGrid';
import {
  PERIOD_PRESETS,
  defaultSchedulePeriod,
  oneWeekSchedulePeriod,
  normalizeClientPeriod,
  resolvePeriodBounds,
  periodSummaryText,
  DEFAULT_SCHEDULE_PERIOD_WEEKS,
} from '../src/utils/schedulePeriod';
import { parseDateKey } from '../src/utils/dates';

/** Unngå hvit skjerm hvis bundler mangler named export. */
const formatPeriodSummary = typeof periodSummaryText === 'function'
  ? periodSummaryText
  : (period) => {
    if (!period) return `Ett semester (~${DEFAULT_SCHEDULE_PERIOD_WEEKS} uker)`;
    if (period.endDate) {
      const base = period.label || 'Periode';
      return `${base} · til ${period.endDate}`;
    }
    if (period.weeks) {
      const base = period.label || (period.kind === 'semester' ? 'Ett semester' : 'Periode');
      return `${base} · ${period.weeks} uker`;
    }
    return period.label || 'Periode';
  };

const DOC_TYPE_LABELS = {
  weekly_info: 'Ukeinformasjon',
  homework: 'Lekse / arbeidsark',
  schedule: 'Timeplan',
  mixed: 'Blandet dokument',
};

const DAY_LABELS = {
  mon: 'Man', tue: 'Tir', wed: 'Ons', thu: 'Tor', fri: 'Fre', sat: 'Lør', sun: 'Søn',
};

const HUSK_RE = /husk|svømmetøy|gymtøy|gymsko|levering|postmappe|går på tur|klær etter vær/i;

function isHuskSuggestion(item) {
  if (!item) return false;
  if (item.prepTask || item.prepWhen) return true;
  if (String(item.category || '').toLowerCase() === 'gjøremål' && HUSK_RE.test(`${item.title || ''} ${item.description || ''}`)) {
    return true;
  }
  return HUSK_RE.test(String(item.title || ''));
}

/** Lekseforslag i review — også når AI returnerte kind "todo". */
function isLekseSuggestion(item, { homeworkFocus = false, docType = null } = {}) {
  if (!item || item.kind === 'schedule_slot' || item.kind === 'event' || item.kind === 'note') return false;
  if (isHuskSuggestion(item)) return false;
  if (homeworkFocus) return true;
  if (item.kind === 'homework') return true;
  if (String(item.category || '').toLowerCase() === 'lekser') return true;
  if ((docType === 'homework' || docType === 'weekly_info') && (item.kind === 'todo' || item.kind === 'homework')) {
    return true;
  }
  return false;
}

function kindLabelForSuggestion(item, { homeworkFocus, docType, prep } = {}) {
  if (prep) {
    return item.prepWhen === 'evening' ? 'Kvelden før' : 'Om morgenen';
  }
  if (isLekseSuggestion(item, { homeworkFocus, docType })) return 'Lekse';
  return KIND_LABELS[item.kind] || item.kind;
}

/** Normaliser lekse-lignende forslag til kind homework i review (riktig etikett + lagring). */
function normalizeReviewSuggestions(list, { homeworkFocus = false, docType = null } = {}) {
  return (list || []).map((s) => {
    if (!isLekseSuggestion(s, { homeworkFocus, docType })) return s;
    return {
      ...s,
      kind: 'homework',
      category: 'lekser',
      type: 'once',
      time: null,
      endTime: null,
      subject: s.subject || inferSubjectId(s.title) || 'annet',
    };
  });
}

function parseDateHint(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateHint(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateHintLabel(value) {
  const dt = parseDateHint(value);
  if (!dt) return 'Velg frist';
  return dt.toLocaleDateString('no-NO', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function AiImportReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const themeColors = useColors();
  const { familyId: ctxFamilyId, kids, isParent } = useApp();
  const familyId = route.params?.familyId || ctxFamilyId;
  const homeworkFocus = route.params?.focusMode === 'homework';
  const autoStart = route.params?.autoStart;
  const returnToSchedule = paramBool(route.params?.returnToSchedule, false);
  const weekStartParam = String(route.params?.weekStart || '').trim();
  const weekStartDate = weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
    ? parseDateKey(weekStartParam)
    : new Date();
  const returnToHomework = paramBool(route.params?.returnToHomework, false);
  const routeChild = childFromRouteParams(route.params);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const [selectedChild, setSelectedChild] = useState(routeChild || null);
  const [childPickerOpen, setChildPickerOpen] = useState(false);

  const childId = selectedChild?.id || selectedChild?.childId;
  const childName = selectedChild?.name || 'Barn';

  const [step, setStep] = useState(() => (
    routeChild || activeKids.length === 1 ? 'pick' : 'chooseChild'
  ));
  const [storagePath, setStoragePath] = useState(null);
  const [uploadPhase, setUploadPhase] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [summary, setSummary] = useState('');
  const [docType, setDocType] = useState('mixed');
  const [weekNumber, setWeekNumber] = useState(null);
  const [parseError, setParseError] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [addToParentCalendar, setAddToParentCalendar] = useState(false);
  const [period, setPeriod] = useState(() => (
    weekStartParam ? oneWeekSchedulePeriod(weekStartDate) : defaultSchedulePeriod()
  ));
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [draftLimitWarning, setDraftLimitWarning] = useState(false);
  const [datePickerForId, setDatePickerForId] = useState(null);

  const refreshPendingDrafts = useCallback(async () => {
    if (!familyId || !childId) {
      setPendingDrafts([]);
      return;
    }
    setPendingLoading(true);
    try {
      const drafts = await fetchPendingPlanDrafts(familyId, childId);
      setPendingDrafts(drafts);
    } catch (e) {
      console.warn('[AiImport] pending drafts', e);
      setPendingDrafts([]);
    } finally {
      setPendingLoading(false);
    }
  }, [familyId, childId]);

  useEffect(() => {
    if (step === 'pick' && childId && familyId) {
      refreshPendingDrafts();
    }
  }, [step, childId, familyId, refreshPendingDrafts]);

  useEffect(() => {
    if (routeChild) {
      const rid = routeChild.id || routeChild.childId;
      const match = activeKids.find((k) => (k.id || k.childId) === rid);
      setSelectedChild(match || routeChild);
    } else if (activeKids.length === 1 && !selectedChild) {
      setSelectedChild(activeKids[0]);
      setStep('pick');
    }
  }, [routeChild, activeKids, selectedChild]);

  const showInfo = (title, message) => setInfo({ visible: true, title, message });

  const openPendingDraft = useCallback(async (pendingDraftId) => {
    if (!familyId || !childId || !pendingDraftId) return;
    setBusy(true);
    try {
      const loaded = await loadPlanDraft(familyId, childId, pendingDraftId);
      setDraftId(loaded.draftId);
      setParseError(!!loaded.parseError);
      setSummary(sanitizeImportUserMessage(
        loaded.summary,
        'AI fant ingen tydelige forslag. Du kan legge til manuelt.',
      ));
      setDocType(loaded.documentType || 'mixed');
      setWeekNumber(loaded.weekNumber ?? null);
      setPeriod(normalizeClientPeriod(loaded.period || defaultSchedulePeriod()));
      const draftHomework = loaded.focusMode === 'homework' || homeworkFocus;
      const list = Array.isArray(loaded.suggestions) ? loaded.suggestions : [];
      const shaped = draftHomework ? applyHomeworkFocusToSuggestions(list) : list;
      setSuggestions(normalizeReviewSuggestions(shaped, {
        homeworkFocus: draftHomework,
        docType: loaded.documentType || 'mixed',
      }));
      setStoragePath(null);
      setStep('review');
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke åpne utkastet.');
      refreshPendingDrafts();
    } finally {
      setBusy(false);
    }
  }, [familyId, childId, refreshPendingDrafts, homeworkFocus]);

  const discardPendingDraft = useCallback(async (pendingDraftId) => {
    if (!familyId || !childId || !pendingDraftId) return;
    setBusy(true);
    try {
      await discardPlanImport({ familyId, childId, draftId: pendingDraftId });
      await refreshPendingDrafts();
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke avvise utkastet.');
    } finally {
      setBusy(false);
    }
  }, [familyId, childId, refreshPendingDrafts]);

  const reset = useCallback(async () => {
    if (storagePath) await deleteTempPlanImage(storagePath);
    setStep('pick');
    setStoragePath(null);
    setDraftId(null);
    setSummary('');
    setParseError(false);
    setDocType('mixed');
    setWeekNumber(null);
    setSuggestions([]);
    setPeriod(defaultSchedulePeriod());
  }, [storagePath]);

  useEffect(() => () => {
    if (storagePath && step !== 'done') {
      deleteTempPlanImage(storagePath).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startImport = useCallback(async (fromCamera) => {
    const uid = auth.currentUser?.uid;
    if (!familyId || !childId || !uid) {
      showInfo('Feil', 'Mangler innlogging eller barn.');
      return;
    }
    setBusy(true);
    let path = null;
    try {
      const picked = await pickPlanFile({ camera: fromCamera, homework: homeworkFocus });
      if (!picked?.blob) return;

      setStep('uploading');
      setUploadPhase('Komprimerer bildet for analyse…');
      await new Promise((r) => setTimeout(r, 50));
      const uploaded = await uploadTempPlanImage(familyId, uid, picked.blob, {
        mimeType: picked.mimeType,
        fileName: picked.name,
        focusMode: homeworkFocus ? 'homework' : '',
      });
      path = uploaded.storagePath;
      setStoragePath(path);

      setStep('analyzing');
      setUploadPhase('Sender til analyse…');
      const result = await analyzePlanImage({
        familyId,
        childId,
        childName,
        storagePath: uploaded.storagePath,
        imageBase64: uploaded.imageBase64,
        mimeType: uploaded.mimeType,
        fileName: uploaded.fileName || picked.name,
        focusMode: homeworkFocus ? 'homework' : '',
      });

      setDraftId(result.draftId);
      const hadParseError = !!result.parseError;
      setParseError(hadParseError);
      setSummary(sanitizeImportUserMessage(
        result.summary,
        hadParseError
          ? 'AI klarte ikke tolke dokumentet akkurat nå. Prøv igjen, eller legg til manuelt.'
          : 'AI fant ingen tydelige forslag. Du kan legge til manuelt.',
      ));
      setDocType(result.documentType || 'mixed');
      setWeekNumber(result.weekNumber ?? null);
      setPeriod(normalizeClientPeriod(result.period || defaultSchedulePeriod()));
      const list = Array.isArray(result.suggestions) ? result.suggestions : [];
      setSuggestions(normalizeReviewSuggestions(
        homeworkFocus ? applyHomeworkFocusToSuggestions(list) : list,
        { homeworkFocus, docType: result.documentType || 'mixed' },
      ));
      setStep('review');
    } catch (e) {
      console.warn('[AiImport]', e);
      if (path) await deleteTempPlanImage(path);
      setStoragePath(null);
      const raw = String(e?.message || e?.code || '');
      const msg = sanitizeImportUserMessage(
        raw,
        /minne|memory|alloc|too large|for stort/i.test(raw)
          ? 'Bildet ble for stort for nettleseren. Prøv et mindre utsnitt (f.eks. kun mandag), eller last opp PDF.'
          : /internal|deadline|timeout|deadline-exceeded/i.test(raw)
            ? (homeworkFocus
              ? 'Analysen tok for lang tid eller feilet på serveren. Prøv igjen om litt, eller last opp et tydeligere bilde av lekseplanen.'
              : 'Analysen tok for lang tid eller feilet på serveren. Prøv igjen om litt, eller last opp et bilde av timeplanen.')
            : (homeworkFocus
              ? 'Klarte ikke analysere lekseplanen. Prøv igjen med bilde, PDF eller Word.'
              : 'Klarte ikke analysere dokumentet. Prøv igjen med bilde, PDF eller Word.'),
      );
      const isQuota = /daglig grense|grense for AI-import/i.test(msg);
      const isDraftLimit = /utkast som venter/i.test(msg);
      if (isDraftLimit) {
        setDraftLimitWarning(true);
        refreshPendingDrafts();
      }
      showInfo(
        isQuota ? 'Dagsgrense nådd' : isDraftLimit ? 'Ventende utkast' : 'Kunne ikke analysere',
        isDraftLimit
          ? `${msg} Se utkastene under — fortsett godkjenning eller avvis dem.`
          : msg,
      );
      setStep('pick');
    } finally {
      setBusy(false);
      setUploadPhase('');
    }
  }, [familyId, childId, childName, refreshPendingDrafts, homeworkFocus]);

  // Start kamera/galleri direkte når man kommer fra Timeplan → Bilde
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (!autoStart || !childId || !familyId) return;
    if (step !== 'pick') return;
    autoStarted.current = true;
    const fromCamera = autoStart === 'camera';
    const t = setTimeout(() => {
      startImport(fromCamera);
    }, 250);
    return () => clearTimeout(t);
  }, [autoStart, childId, familyId, step, startImport]);

  const cancelAnalyzing = useCallback(async () => {
    if (storagePath) await deleteTempPlanImage(storagePath);
    setStoragePath(null);
    setDraftId(null);
    setStep('pick');
    setBusy(false);
    setUploadPhase('');
  }, [storagePath]);

  const addManualItem = useCallback(() => {
    const asHomework = homeworkFocus || docType === 'homework' || docType === 'weekly_info';
    setSuggestions((prev) => [...prev, emptyManualSuggestion({ homework: asHomework })]);
  }, [homeworkFocus, docType]);

  const toggleItem = (id) => {
    setSuggestions((prev) => prev.map((s) => (
      s.id === id ? { ...s, selected: !s.selected } : s
    )));
  };

  const updateTitle = (id, title) => {
    setSuggestions((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, title };
      const lekse = isLekseSuggestion(next, { homeworkFocus, docType });
      if (lekse && (!s.subject || s.subject === 'annet')) {
        const guessed = inferSubjectId(title);
        if (guessed && guessed !== 'annet') next.subject = guessed;
      }
      return next;
    }));
  };

  const updateSubject = (id, subject) => {
    setSuggestions((prev) => prev.map((s) => (
      s.id === id ? { ...s, subject } : s
    )));
  };

  const updateDescription = (id, description) => {
    setSuggestions((prev) => prev.map((s) => (
      s.id === id ? { ...s, description } : s
    )));
  };

  const updateDateHint = (id, dateHint) => {
    setSuggestions((prev) => prev.map((s) => (
      s.id === id ? { ...s, dateHint: dateHint || null } : s
    )));
  };

  const selectedCount = suggestions.filter((s) => s.selected && String(s.title || '').trim()).length;
  const { prep: prepItems, slots: slotItems, rest: restItems } = useMemo(
    () => partitionImportSuggestions(suggestions),
    [suggestions],
  );
  const slotGroups = useMemo(
    () => groupScheduleSlotsByDay(slotItems),
    [slotItems],
  );
  const homeworkGroups = useMemo(() => {
    const useGroups = homeworkFocus || docType === 'homework' || docType === 'weekly_info';
    if (!useGroups) return [];
    const lekseItems = restItems.filter((item) => isLekseSuggestion(item, { homeworkFocus, docType }));
    return groupHomeworkBySubject(lekseItems);
  }, [homeworkFocus, docType, restItems]);
  const otherRestItems = useMemo(() => {
    if (!homeworkGroups.length) return restItems;
    const lekseIds = new Set(homeworkGroups.flatMap((g) => g.items.map((i) => i.id)));
    return restItems.filter((item) => !lekseIds.has(item.id));
  }, [restItems, homeworkGroups]);
  const needsPeriod = useMemo(() => {
    if (homeworkFocus || docType === 'homework') return false;
    return suggestions.some((s) => s.selected && (s.kind === 'schedule_slot' || s.kind === 'event'))
      || ['schedule', 'mixed'].includes(docType);
  }, [suggestions, docType, homeworkFocus]);

  const selectPeriodPreset = useCallback((presetId) => {
    const preset = PERIOD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (presetId === 'week') {
      setPeriod(oneWeekSchedulePeriod(weekStartDate));
      return;
    }
    setPeriod((prev) => normalizeClientPeriod({
      ...prev,
      kind: preset.id === 'special' ? 'special' : preset.id,
      weeks: preset.weeks ?? prev.weeks ?? DEFAULT_SCHEDULE_PERIOD_WEEKS,
      startDate: prev.startDate || null,
      label: preset.id === 'special'
        ? (prev.fromAi && prev.label ? prev.label : 'Spesiell periode')
        : preset.label === 'Semester' ? 'Ett semester' : preset.label,
      fromAi: preset.id === 'special' ? prev.fromAi : false,
      endDate: preset.id === 'special' ? prev.endDate : null,
    }));
  }, [weekStartDate]);

  const doApply = useCallback(async () => {
    if (!draftId || !familyId || !childId) return;
    setBusy(true);
    setConfirmApply(false);
    try {
      const appliedPeriod = resolvePeriodBounds(period, weekStartDate);
      const result = await applyPlanImport({
        familyId,
        childId,
        draftId,
        suggestions,
        addToParentCalendar,
        period: appliedPeriod,
      });
      const parts = [];
      if (result.todosCreated) {
        const asLekser = homeworkFocus || docType === 'homework' || docType === 'weekly_info';
        parts.push(asLekser
          ? `${result.todosCreated} lekse${result.todosCreated === 1 ? '' : 'r'}`
          : `${result.todosCreated} gjøremål`);
      }
      if (result.eventsCreated) parts.push(`${result.eventsCreated} kalenderoppføringer`);
      if (result.scheduleUpdated) parts.push('timeplan oppdatert');
      const periodTxt = formatPeriodSummary(appliedPeriod);
      showInfo(
        'Lagret',
        parts.length
          ? (homeworkFocus || !needsPeriod
            ? `Opprettet: ${parts.join(', ')}.`
            : `Opprettet: ${parts.join(', ')}. Gyldig: ${periodTxt}.`)
          : 'Ingen endringer ble lagret.',
      );
      setStep('done');
      setStoragePath(null);
      setDraftLimitWarning(false);
      refreshPendingDrafts();
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setBusy(false);
    }
  }, [draftId, familyId, childId, suggestions, addToParentCalendar, period, refreshPendingDrafts, homeworkFocus, needsPeriod, weekStartDate, docType]);

  const startManualRegister = useCallback(() => {
    if (!familyId || !selectedChild) return;
    const appliedPeriod = resolvePeriodBounds(period, weekStartDate);
    navigation.navigate('ChildSchedule', {
      ...childScheduleNavParams({ familyId, child: selectedChild, canEdit: true }),
      seedPeriod: appliedPeriod,
      openAdd: true,
    });
  }, [familyId, selectedChild, period, weekStartDate, navigation]);
  const pickChild = useCallback((child) => {
    setSelectedChild(child);
    setChildPickerOpen(false);
    setStep('pick');
  }, []);

  const formatItemMeta = (item) => {
    const parts = [];
    if (item.day && !isLekseSuggestion(item, { homeworkFocus, docType })) {
      parts.push(DAY_LABELS[item.day] || item.day);
    }
    if (item.time) {
      parts.push(item.endTime ? `${item.time}–${item.endTime}` : item.time);
    }
    if (item.recurrenceWeeks) parts.push(`${item.recurrenceWeeks} uker`);
    return parts.join(' · ');
  };

  const doDiscard = useCallback(async () => {
    if (draftId && familyId && childId) {
      try {
        await discardPlanImport({ familyId, childId, draftId });
      } catch {
        if (storagePath) await deleteTempPlanImage(storagePath);
      }
    } else if (storagePath) {
      await deleteTempPlanImage(storagePath);
    }
    navigation.goBack();
  }, [draftId, familyId, childId, storagePath, navigation]);

  const renderSuggestion = (item, { prep = false } = {}) => {
    const lekse = !prep && isLekseSuggestion(item, { homeworkFocus, docType });
    const meta = formatItemMeta(item);
    const showDate = lekse || (!!item.dateHint && !item.time);
    const dateValue = parseDateHint(item.dateHint) || new Date();

    return (
      <View key={item.id} style={[styles.itemCard, !item.selected && styles.itemOff, prep && styles.prepCard]}>
        <View style={styles.itemTop}>
          <Switch
            value={!!item.selected}
            onValueChange={() => toggleItem(item.id)}
            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
            thumbColor={item.selected ? '#2563eb' : '#f9fafb'}
          />
          <View style={[styles.kindPill, prep && styles.prepPill, lekse && styles.leksePill]}>
            <Text style={[styles.kindPillTxt, prep && styles.prepPillTxt, lekse && styles.leksePillTxt]}>
              {kindLabelForSuggestion(item, { homeworkFocus, docType, prep })}
            </Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Tittel</Text>
        <TextInput
          style={styles.itemInput}
          value={item.title}
          onChangeText={(t) => updateTitle(item.id, t)}
          placeholder={lekse ? 'Fag: kort oppgave' : 'Tittel'}
        />

        {lekse ? (
          <>
            <Text style={styles.fieldLabel}>Fag</Text>
            <View style={styles.subjectChipRow}>
              {HOMEWORK_SUBJECTS.map((s) => {
                const on = item.subject === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, on && styles.subjectChipOn]}
                    onPress={() => updateSubject(item.id, s.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.subjectChipTxt, on && styles.subjectChipTxtOn]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.fieldLabel}>Beskrivelse</Text>
        <TextInput
          style={[styles.itemInput, styles.itemDescInput]}
          value={item.description || ''}
          onChangeText={(t) => updateDescription(item.id, t)}
          placeholder="Valgfri detalj"
          multiline
        />

        {showDate ? (
          <>
            <Text style={styles.fieldLabel}>Frist</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.periodDateBtn}>
                <Ionicons name="calendar-outline" size={16} color="#2563eb" />
                <Text style={styles.periodDateTxt}>{formatDateHintLabel(item.dateHint)}</Text>
                <input
                  type="date"
                  value={item.dateHint || ''}
                  onChange={(e) => updateDateHint(item.id, e.target.value || null)}
                  style={styles.webDateOverlay}
                />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.periodDateBtn}
                  onPress={() => setDatePickerForId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Velg frist"
                >
                  <Ionicons name="calendar-outline" size={16} color="#2563eb" />
                  <Text style={styles.periodDateTxt}>{formatDateHintLabel(item.dateHint)}</Text>
                </TouchableOpacity>
                {datePickerForId === item.id ? (
                  <DateTimePicker
                    value={dateValue}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(event, selected) => {
                      if (Platform.OS !== 'ios') setDatePickerForId(null);
                      if (event?.type === 'dismissed') return;
                      if (selected) updateDateHint(item.id, toDateHint(selected));
                    }}
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}

        {!!meta && (
          <Text style={styles.itemMeta}>
            {item.kind === 'schedule_slot' && item.time
              ? `${meta} · ${formatSlotRange(item)}`.replace(/^ · /, '')
              : meta}
          </Text>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <SchoolPageLayout
        activeId={homeworkFocus ? 'lekser' : 'week-plan'}
        child={selectedChild}
        familyId={familyId}
        canEdit={!!isParent}
        weekLabel={null}
        aiEnabled
        title={homeworkFocus ? 'Importer lekseplan' : 'Importer ukeplan'}
        subtitle={homeworkFocus
          ? 'AI leser fag og oppgaver – ingenting lagres før du godkjenner.'
          : 'AI leser fag og tider – ingenting lagres før du godkjenner.'}
        onBack={() => { if (step === 'review') doDiscard(); else navigation.goBack(); }}
      >
        <View style={styles.disclaimer}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#2563eb" />
          <Text style={styles.disclaimerTxt}>
            Kun foresatte. AI foreslår innhold — ingenting lagres før du godkjenner.
            Filen sendes til analyse og slettes etterpå. Maks 20 analyser per familie per dag.
          </Text>
        </View>

        {step === 'chooseChild' && (
          <View style={styles.pickBox}>
            <View style={styles.pickIconWrap}>
              <Ionicons name="person-outline" size={32} color={themeColors.brand} />
            </View>
            <Text style={styles.pickTitle}>Velg barn</Text>
            <Text style={styles.pickSub}>
              {homeworkFocus
                ? 'Lekseplanen knyttes til ett barn om gangen. Du kan importere på nytt for andre barn etterpå.'
                : 'Ukeplanen knyttes til ett barn om gangen. Du kan importere på nytt for andre barn etterpå.'}
            </Text>
            {activeKids.map((kid) => (
              <TouchableOpacity
                key={kid.id || kid.childId}
                style={styles.secondaryBtn}
                onPress={() => pickChild(kid)}
              >
                <Text style={styles.secondaryBtnTxt}>{kid.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 'pick' && (
          <View style={styles.pickBox}>
            {(pendingLoading || pendingDrafts.length > 0 || draftLimitWarning) && (
              <View style={styles.pendingBox}>
                <Text style={styles.pendingTitle}>
                  {pendingDrafts.length >= 3 || draftLimitWarning
                    ? '3 utkast venter — godkjenn eller avvis før ny import'
                    : 'Ventende utkast'}
                </Text>
                <Text style={styles.pendingSub}>
                  {draftLimitWarning && pendingDrafts.length === 0 && !pendingLoading
                    ? 'Oppdater siden (Ctrl+R) hvis listen ikke vises. Serveren rydder eldre utkast automatisk ved ny import.'
                    : 'Tidligere analyser som ikke er godkjent ennå. Du kan fortsette der du slapp.'}
                </Text>
                {pendingLoading && pendingDrafts.length === 0 ? (
                  <ActivityIndicator color="#2563eb" style={{ marginTop: 8 }} />
                ) : (
                  pendingDrafts.map((draft) => (
                    <View key={draft.draftId} style={styles.pendingCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pendingCardTitle} numberOfLines={2}>
                          {draft.summary || `${DOC_TYPE_LABELS[draft.documentType] || 'Ukeplan'} · ${draft.suggestionsCount} forslag`}
                        </Text>
                        <Text style={styles.pendingCardMeta}>
                          {formatPlanDraftWhen(draft.createdAtMs)}
                          {draft.weekNumber ? ` · Uke ${draft.weekNumber}` : ''}
                          {` · ${draft.suggestionsCount} forslag`}
                        </Text>
                      </View>
                      <View style={styles.pendingActions}>
                        <TouchableOpacity
                          style={styles.pendingDiscardBtn}
                          onPress={() => discardPendingDraft(draft.draftId)}
                          disabled={busy}
                        >
                          <Text style={styles.pendingDiscardTxt}>Avvis</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pendingOpenBtn}
                          onPress={() => openPendingDraft(draft.draftId)}
                          disabled={busy}
                        >
                          <Text style={styles.pendingOpenTxt}>Fortsett</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
            <View style={styles.pickIconWrap}>
              <Ionicons name="document-text-outline" size={36} color={themeColors.brand} />
            </View>
            <Text style={styles.pickTitle}>
              {homeworkFocus ? 'Last opp ukens lekser' : 'Hvordan vil du legge inn planen?'}
            </Text>
            <Text style={styles.pickSub}>
              {homeworkFocus
                ? 'AI lager én lekse per fag med frist for uken — ikke et gjøremål. Du sjekker faget før du godkjenner.'
                : 'Velg AI-tolking, manuell registrering, eller ta bilde/last opp fil. Sett varighet — f.eks. 1 uke — så neste uke kan stå tom til du legger inn ny plan.'}
            </Text>

            {!homeworkFocus && (
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>Gyldighetsperiode</Text>
                <Text style={styles.periodHint}>
                  Gjelder for planen du legger inn nå. Du kan bla mellom uker i ukeplanen.
                </Text>
                <View style={styles.periodChipsWrap}>
                  {PERIOD_PRESETS.map((p) => {
                    const on = (p.id === 'week' && period.weeks === 1 && period.label === '1 uke')
                      || (p.id !== 'week' && (period.kind === p.id
                        || (p.id === 'special' && period.kind === 'weeks' && period.weeks !== 1)));
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.periodChipChoice, on && styles.periodChipOn]}
                        onPress={() => selectPeriodPreset(p.id)}
                      >
                        <Text style={[styles.periodChipTxt, on && styles.periodChipTxtOn]}>
                          {p.label}
                        </Text>
                        <Text style={[styles.periodChipSub, on && styles.periodChipSubOn]}>
                          {p.sub}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.periodSummaryLine}>
                  Valgt: {formatPeriodSummary(period)}
                </Text>
              </View>
            )}

            {homeworkFocus ? (
              <>
                {Platform.OS !== 'web' && (
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => startImport(true)} disabled={busy}>
                    <Ionicons name="camera" size={20} color="#fff" />
                    <Text style={styles.primaryBtnTxt}>Ta bilde</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={Platform.OS === 'web' ? styles.primaryBtn : styles.secondaryBtn}
                  onPress={() => startImport(false)}
                  disabled={busy}
                >
                  <Ionicons name="document-attach" size={20} color={Platform.OS === 'web' ? '#fff' : '#2563eb'} />
                  <Text style={Platform.OS === 'web' ? styles.primaryBtnTxt : styles.secondaryBtnTxt}>
                    {Platform.OS === 'web' ? 'Velg fil' : 'Velg fra galleri'}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === 'web' && (
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => startImport(true)} disabled={busy}>
                    <Ionicons name="camera" size={20} color="#2563eb" />
                    <Text style={styles.secondaryBtnTxt}>Kamera (hvis støttet)</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View style={styles.choiceStack}>
                <TouchableOpacity
                  style={styles.choiceCard}
                  onPress={() => startImport(false)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <View style={styles.choiceIcon}>
                    <Ionicons name="sparkles" size={22} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Importer og tolk med AI</Text>
                    <Text style={styles.choiceSub}>
                      {PLAN_FILE_ACCEPT_HINT}. AI foreslår fag og tider — du godkjenner.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.choiceCard}
                  onPress={startManualRegister}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <View style={styles.choiceIcon}>
                    <Ionicons name="create-outline" size={22} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Registrer manuelt</Text>
                    <Text style={styles.choiceSub}>
                      Legg inn timer selv for denne perioden. Neste uke kan stå tom.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.choiceCard}
                  onPress={() => startImport(true)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <View style={styles.choiceIcon}>
                    <Ionicons name="camera-outline" size={22} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Ta bilde / last inn fil</Text>
                    <Text style={styles.choiceSub}>
                      Kamera eller galleri — blir gjeldende plan for valgt varighet etter godkjenning.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {(step === 'uploading' || step === 'analyzing') && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.analyzingTxt}>
              {step === 'uploading' ? 'Forbereder dokument…' : 'AI leser dokumentet…'}
            </Text>
            <Text style={styles.analyzingSub}>
              {uploadPhase || (step === 'uploading'
                ? 'Sender filen direkte til analyse — uten fillagring i nettleseren.'
                : 'Tar vanligvis 5–20 sek.')}
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelAnalyzing}>
              <Text style={styles.cancelBtnTxt}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'review' && (
          <>
            <View style={[styles.summaryCard, parseError && suggestions.length === 0 && styles.summaryCardError]}>
              <Text style={[styles.summaryType, parseError && suggestions.length === 0 && styles.summaryTypeError]}>
                {parseError && suggestions.length === 0
                  ? 'Kunne ikke lese dokumentet'
                  : `${DOC_TYPE_LABELS[docType] || 'Dokument'}${weekNumber ? ` · Uke ${weekNumber}` : ''}`}
              </Text>
              {!!summary && <Text style={styles.summaryTxt}>{summary}</Text>}
              {!parseError && (
                <Text style={styles.summaryMeta}>{selectedCount} av {suggestions.length} valgt</Text>
              )}
            </View>

            {suggestions.length > 0 && needsPeriod && (
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>Gyldighetsperiode</Text>
                <Text style={styles.periodHint}>
                  Vanlige ukeplaner gjelder typisk ett semester. Endre her før du godkjenner —
                  eller bruk AI-forslaget hvis dokumentet beskriver en spesiell periode.
                </Text>
                {period.fromAi && period.kind === 'special' && (
                  <View style={styles.aiPeriodBanner}>
                    <Ionicons name="sparkles" size={14} color="#2563eb" />
                    <Text style={styles.aiPeriodTxt}>
                      AI foreslo: {formatPeriodSummary(period)}
                    </Text>
                  </View>
                )}
                <View style={styles.periodChips}>
                  {PERIOD_PRESETS.map((p) => {
                    const on = (p.id === 'week' && period.weeks === 1 && (period.label === '1 uke' || !period.label))
                      || (p.id !== 'week' && p.id !== 'special' && period.kind === p.id)
                      || (p.id === 'special' && period.kind === 'special' && period.weeks !== 1);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.periodChip, on && styles.periodChipOn]}
                        onPress={() => selectPeriodPreset(p.id)}
                      >
                        <Text style={[styles.periodChipTxt, on && styles.periodChipTxtOn]}>
                          {p.label}
                        </Text>
                        <Text style={[styles.periodChipSub, on && styles.periodChipSubOn]}>
                          {p.sub}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(period.kind === 'special' || period.kind === 'weeks' || period.kind === 'until_date') && (
                  <View style={styles.periodCustom}>
                    <Text style={styles.periodFieldLabel}>Antall uker</Text>
                    <TextInput
                      style={styles.periodInput}
                      value={period.weeks != null ? String(period.weeks) : ''}
                      onChangeText={(txt) => {
                        const n = parseInt(txt.replace(/\D/g, ''), 10);
                        setPeriod((prev) => normalizeClientPeriod({
                          ...prev,
                          kind: 'special',
                          weeks: Number.isFinite(n) ? n : null,
                          label: Number.isFinite(n) ? `${n} uker` : prev.label,
                          fromAi: false,
                        }));
                      }}
                      keyboardType="number-pad"
                      placeholder={String(DEFAULT_SCHEDULE_PERIOD_WEEKS)}
                      maxLength={2}
                    />
                    <Text style={styles.periodFieldLabel}>Eller sluttdato (valgfritt)</Text>
                    {Platform.OS === 'web' ? (
                      <View style={styles.periodDateBtn}>
                        <Ionicons name="calendar-outline" size={16} color="#2563eb" />
                        <Text style={styles.periodDateTxt}>
                          {period.endDate || 'Velg sluttdato'}
                        </Text>
                        <input
                          type="date"
                          value={period.endDate || ''}
                          onChange={(e) => {
                            const endDate = e.target.value || null;
                            setPeriod((prev) => normalizeClientPeriod({
                              ...prev,
                              kind: 'special',
                              endDate,
                              fromAi: false,
                              label: endDate ? `Til ${endDate}` : prev.label,
                            }));
                          }}
                          style={styles.webDateOverlay}
                        />
                      </View>
                    ) : (
                      <TextInput
                        style={styles.periodInput}
                        value={period.endDate || ''}
                        onChangeText={(endDate) => setPeriod((prev) => normalizeClientPeriod({
                          ...prev,
                          kind: 'special',
                          endDate: endDate.trim() || null,
                          fromAi: false,
                        }))}
                        placeholder="ÅÅÅÅ-MM-DD"
                      />
                    )}
                  </View>
                )}

                <Text style={styles.periodSummaryLine}>
                  Gjelder: {formatPeriodSummary(period)}
                </Text>
              </View>
            )}

            {suggestions.length > 0 && isParent && !homeworkFocus && (
              <View style={styles.parentToggle}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.parentToggleTitle}>Legg også på min kalender</Text>
                  <Text style={styles.parentToggleSub}>
                    Hendelser vises på din kalender i tillegg til {childName.split(' ')[0]}s plan.
                  </Text>
                </View>
                <Switch
                  value={addToParentCalendar}
                  onValueChange={setAddToParentCalendar}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={addToParentCalendar ? '#2563eb' : '#f9fafb'}
                />
              </View>
            )}

            {suggestions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTxt}>
                  {parseError
                    ? (homeworkFocus
                      ? 'Ingen forslag denne gangen. Prøv på nytt, eller legg til lekse manuelt.'
                      : 'Ingen forslag denne gangen. Prøv på nytt, eller legg til gjøremål manuelt.')
                    : (homeworkFocus
                      ? 'Ingen automatiske lekseforslag. Legg til manuelt, eller last opp et skarpere bilde/PDF.'
                      : 'Ingen automatiske forslag. Legg til manuelt, eller last opp et skarpere bilde/PDF.')}
                </Text>
                <TouchableOpacity style={styles.retryBtn} onPress={reset} disabled={busy}>
                  <Ionicons name="refresh" size={18} color="#2563eb" />
                  <Text style={styles.retryBtnTxt}>Prøv på nytt med ny fil</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {!homeworkFocus && slotGroups.length > 0 && (
                  <Text style={styles.groupTitle}>Timeplan (ukeplan)</Text>
                )}
                {!homeworkFocus && slotGroups.map((group) => (
                  <View key={group.day} style={styles.dayGroup}>
                    <Text style={styles.dayGroupTitle}>{group.label}</Text>
                    {group.items.map((item) => renderSuggestion(item))}
                  </View>
                ))}

                {!homeworkFocus && prepItems.length > 0 && (
                  <View style={styles.prepBanner}>
                    <Ionicons name="notifications-outline" size={18} color="#2563eb" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prepBannerTitle}>Vil du legge til oppgave?</Text>
                      <Text style={styles.prepBannerSub}>
                        Forslag kvelden før og om morgenen, med frist ferdig utfylt. Slå på de du vil ha.
                      </Text>
                    </View>
                  </View>
                )}
                {!homeworkFocus && prepItems.map((item) => renderSuggestion(item, { prep: true }))}

                {homeworkGroups.length > 0 && (
                  <Text style={styles.groupTitle}>Lekser</Text>
                )}
                {homeworkGroups.map((group) => (
                  <View key={group.id} style={styles.dayGroup}>
                    <Text style={styles.dayGroupTitle}>{group.label}</Text>
                    {group.items.map((item) => renderSuggestion(item))}
                  </View>
                ))}

                {otherRestItems.length > 0 && (slotItems.length + prepItems.length + homeworkGroups.length > 0) && (
                  <Text style={styles.groupTitle}>Andre forslag</Text>
                )}
                {otherRestItems.map((item) => renderSuggestion(item))}
              </>
            )}

            <TouchableOpacity style={styles.addManualBtn} onPress={addManualItem}>
              <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
              <Text style={styles.addManualTxt}>
                {homeworkFocus || docType === 'homework' || docType === 'weekly_info'
                  ? 'Legg til lekse manuelt'
                  : 'Legg til gjøremål manuelt'}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.rejectBtn} onPress={doDiscard} disabled={busy}>
                <Text style={styles.rejectBtnTxt}>Avvis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.applyBtn, (busy || selectedCount === 0) && { opacity: 0.5 }]}
                onPress={() => setConfirmApply(true)}
                disabled={busy || selectedCount === 0}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryBtnTxt}>Godkjenn ({selectedCount})</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SchoolPageLayout>

      <ConfirmDialog
        visible={confirmApply}
        title="Godkjenn og lagre?"
        message={`${selectedCount} forslag registreres på ${childName}.${needsPeriod ? ` Periode: ${formatPeriodSummary(period)}.` : ''}${addToParentCalendar ? ' Hendelser legges også på din kalender.' : ''} Du kan endre eller slette dem senere.`}
        confirmText="Godkjenn"
        cancelText="Avbryt"
        onCancel={() => setConfirmApply(false)}
        onConfirm={doApply}
        onClose={() => setConfirmApply(false)}
      />

      <AiImportChildPicker
        visible={childPickerOpen}
        kids={activeKids}
        onSelect={pickChild}
        onClose={() => setChildPickerOpen(false)}
      />

      <InfoDialog
        visible={info.visible}
        title={info.title}
        message={info.message}
        onClose={() => {
          const wasDone = step === 'done';
          setInfo({ visible: false, title: '', message: '' });
          if (wasDone) {
            if (returnToHomework && familyId && selectedChild) {
              navigation.navigate('Lekser', lekserNavParams({
                familyId,
                child: selectedChild,
                canEdit: true,
              }));
            } else if (returnToSchedule && familyId && selectedChild) {
              navigation.navigate('ChildSchedule', childScheduleNavParams({
                familyId,
                child: selectedChild,
                canEdit: true,
              }));
            } else {
              navigation.goBack();
            }
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#eef4ff', borderRadius: 16, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#dbeafe',
  },
  disclaimerTxt: { flex: 1, color: '#1e3a8a', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  pickBox: {
    alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, padding: 28, gap: 12,
    borderWidth: 1, borderColor: '#e8eef6',
  },
  pendingBox: {
    alignSelf: 'stretch', width: '100%', backgroundColor: '#fffbeb',
    borderRadius: 14, padding: 14, gap: 10, marginBottom: 4,
    borderWidth: 1, borderColor: '#fcd34d',
  },
  pendingTitle: { fontSize: 15, fontWeight: '900', color: '#92400e' },
  pendingSub: { fontSize: 13, color: '#78350f', lineHeight: 18 },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  pendingCardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  pendingCardMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  pendingActions: { flexDirection: 'row', gap: 6 },
  pendingDiscardBtn: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  pendingDiscardTxt: { fontSize: 13, fontWeight: '800', color: '#64748b' },
  pendingOpenBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  pendingOpenTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  pickIconWrap: {
    width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eff6ff', marginBottom: 4,
  },
  pickTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744', textAlign: 'center' },
  pickSub: { color: '#5b6b82', textAlign: 'center', lineHeight: 20, marginBottom: 8, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
    width: '100%',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
    width: '100%', borderWidth: 1, borderColor: '#dbeafe',
  },
  secondaryBtnTxt: { color: '#2563eb', fontWeight: '800', fontSize: 16 },
  centerBox: { alignItems: 'center', padding: 40, gap: 12 },
  analyzingTxt: { fontWeight: '900', color: '#0f172a', fontSize: 16 },
  analyzingSub: { color: '#64748b', textAlign: 'center' },
  cancelBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 },
  cancelBtnTxt: { color: '#64748b', fontWeight: '800' },
  addManualBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginTop: 4,
  },
  addManualTxt: { color: '#2563eb', fontWeight: '800', fontSize: 15 },
  summaryCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  summaryCardError: {
    backgroundColor: '#fff7ed', borderColor: '#fed7aa',
  },
  summaryType: { fontWeight: '900', color: '#2563eb', fontSize: 14 },
  summaryTypeError: { color: '#c2410c' },
  summaryTxt: { color: '#334155', marginTop: 8, lineHeight: 20 },
  summaryMeta: { color: '#94a3b8', fontWeight: '700', marginTop: 8, fontSize: 12 },
  emptyBox: { paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 12 },
  emptyTxt: { color: '#64748b', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eef6ff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  retryBtnTxt: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
  itemCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemOff: { opacity: 0.55 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  kindPill: { backgroundColor: '#eef6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kindPillTxt: { color: '#2563eb', fontWeight: '800', fontSize: 11 },
  leksePill: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  leksePillTxt: { color: '#047857' },
  fieldLabel: {
    fontWeight: '700', fontSize: 11, color: '#64748b', marginTop: 10, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  itemInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10,
    fontSize: 15, fontWeight: '700', color: '#0f172a', backgroundColor: '#f8fafc',
  },
  itemDescInput: {
    fontWeight: '500', fontSize: 14, minHeight: 64, textAlignVertical: 'top',
  },
  itemMeta: { color: '#94a3b8', fontSize: 12, marginTop: 8, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 14,
  },
  rejectBtnTxt: { color: '#b91c1c', fontWeight: '900' },
  applyBtn: { flex: 2 },
  parentToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  parentToggleTitle: { fontWeight: '800', color: colors.ink, fontSize: 14 },
  parentToggleSub: { color: '#64748b', fontSize: 12, marginTop: 2, lineHeight: 17 },

  periodCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e5e7eb', gap: 8,
  },
  periodTitle: { fontWeight: '900', color: '#0f172a', fontSize: 15 },
  periodHint: { color: '#64748b', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  aiPeriodBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef6ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  aiPeriodTxt: { flex: 1, color: '#0b3d91', fontWeight: '700', fontSize: 12 },
  periodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  periodChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  periodChipChoice: {
    width: '47%',
    alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb',
  },
  choiceStack: { width: '100%', gap: 10, marginTop: 8 },
  choiceCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: { fontWeight: '900', fontSize: 15, color: '#0f172a' },
  choiceSub: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 17 },
  periodChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb',
  },
  periodChipOn: { backgroundColor: '#eef6ff', borderColor: '#2563eb' },
  periodChipTxt: { fontWeight: '800', fontSize: 13, color: '#0f172a' },
  periodChipTxtOn: { color: '#2563eb' },
  periodChipSub: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  periodChipSubOn: { color: '#3b82f6' },
  periodCustom: { marginTop: 4, gap: 6 },
  periodFieldLabel: { fontWeight: '700', fontSize: 12, color: '#334155', marginTop: 4 },
  periodInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, fontWeight: '700', backgroundColor: '#f8fafc', color: '#0f172a',
  },
  periodDateBtn: {
    position: 'relative', overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colors.card,
  },
  periodDateTxt: { flex: 1, fontWeight: '700', fontSize: 14, color: '#0f172a' },
  webDateOverlay: {
    position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
    opacity: 0, cursor: 'pointer', border: 'none', backgroundColor: 'transparent',
  },
  periodSummaryLine: { color: '#2563eb', fontWeight: '800', fontSize: 12, marginTop: 4 },
  groupTitle: {
    fontWeight: '800', fontSize: 13, color: '#64748b', marginTop: 8, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  dayGroup: { marginBottom: 4 },
  dayGroupTitle: {
    fontWeight: '900', fontSize: 15, color: '#0f172a', marginTop: 12, marginBottom: 8,
    paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  prepBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#eef6ff', borderRadius: 14, padding: 12, marginBottom: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  prepBannerTitle: { fontWeight: '900', color: '#0b3d91', fontSize: 14 },
  prepBannerSub: { color: '#1e40af', fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 17 },
  prepCard: { borderColor: '#93c5fd', backgroundColor: '#f8fbff' },
  prepPill: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  prepPillTxt: { color: '#c2410c' },
  subjectChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8,
  },
  subjectChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  subjectChipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  subjectChipTxt: { fontWeight: '700', fontSize: 12, color: '#334155' },
  subjectChipTxtOn: { color: '#fff' },
});
