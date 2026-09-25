// src/screens/AddTodoScreen.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Image, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Modal, Pressable, Alert
} from 'react-native';
import { db, storage, ensureAppCheckReady, auth } from '../firebase';
import {
  collection, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, setDoc,
  getDoc, arrayUnion
} from 'firebase/firestore';
import { ref as sref, getDownloadURL, uploadBytes } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ConfirmDialog, { InfoDialog } from '../components/ConfirmDialog';
import WebSafeIcon from '../components/WebSafeIcon';
import CompactBackLink from '../components/CompactBackLink';
import EdgeSwipeBack from '../components/EdgeSwipeBack';
import DateField from '../components/DateField';
import { Screen, Title } from '../components/ui';
import { colors } from '../src/theme';
import HelpTarget from '../components/HelpTarget';
import { useHelpScene } from '../src/hooks/useHelpScene';
import { TASK_TEMPLATES } from '../src/data/taskTemplates';
import { dateKey, prevDayKey, makeSeriesKey, WEEKDAYS_SHORT, parseDateKey, getISOWeek, startOfWeekMonday, mondayKeyOf } from '../src/utils/dates';
import { notifyUsers } from '../src/utils/notifications';
import {
  REPEAT_PRESETS, CUSTOM_FREQS, initRepeatFromTodo, buildTodoRecurrenceFields,
  repeatSummaryLabel, choreRepeatDescriptionText, isWeeklyRepeatPreset,
  normalizeRecurrenceStartKey,
} from '../src/utils/todoRecurrence';
import {
  choreDraftForWeekScore, weekKeysForDateKey, weekPossibleInMode, possibleInKeys,
  budgetAnchorDateKey,
} from '../src/utils/todoBudget';
import {
  normalizeRewardMode,
  rewardModeTitle,
  rewardUnitLabel,
  showsBudget,
} from '../src/utils/rewardModes';
import { getDocs as getDocsOnce } from 'firebase/firestore';

const IKON_MAPPE = 'icons/catalog';
const STOP_PRESETS = [
  { id: 'never', label: 'Aldri' },
  { id: 'date', label: 'På en dato' },
];
const INTERVAL_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);
const DATE_FIELD_STYLE = { backgroundColor: colors.card, borderRadius: 10, borderColor: '#e5e7eb' };

export default function AddTodoScreen({ route, navigation }) {
  const {
    familyId, child, todo: todoFromRoute, editTodoId, currentDateKey,
    defaultCategory, defaultType, defaultStartKey, defaultDueKey,
  } = route.params || {};
  const childId = child?.id || child?.childId;
  useHelpScene('inner', { onRetreat: () => navigation.goBack() });

  // Kun foresatte/admin kan opprette og redigere gjøremål — ikke barnet selv.
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditTodos, setCanEditTodos] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid || !familyId) {
          if (active) { setIsAdmin(false); setCanEditTodos(false); }
          return;
        }

        let admin = false;
        let parent = false;

        const famSnap = await getDoc(doc(db, 'families', familyId));
        const famAdmins = famSnap.exists() ? (famSnap.data()?.adminUids || []) : [];
        if (Array.isArray(famAdmins) && famAdmins.includes(uid)) admin = true;

        const top = await getDoc(doc(db, 'parents', uid));
        if (top.exists() && top.data()?.familyId === familyId) {
          parent = true;
          if (top.data()?.admin === true) admin = true;
        }

        const sub = await getDoc(doc(db, 'families', familyId, 'parents', uid));
        if (sub.exists()) {
          parent = true;
          if (sub.data()?.admin === true) admin = true;
        }

        if (active) {
          setIsAdmin(!!admin);
          setCanEditTodos(!!admin || !!parent);
        }
      } catch {
        if (active) { setIsAdmin(false); setCanEditTodos(false); }
      }
    })();
    return () => { active = false; };
  }, [familyId, childId, child?.uid, child?.authUid, child?.userId]);

  // Hent todo ved id hvis kun id er sendt
  const [todo, setTodo] = useState(todoFromRoute || null);
  const [todoId, setTodoId] = useState(editTodoId || todoFromRoute?.id || null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (todoFromRoute || !editTodoId || !familyId || !childId) return;
        const ref = doc(db, 'families', familyId, 'children', childId, 'todos', editTodoId);
        const snap = await getDoc(ref);
        if (active && snap.exists()) {
          setTodo({ id: snap.id, ...snap.data() });
          setTodoId(snap.id);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [editTodoId, familyId, childId, todoFromRoute]);

  // seriesKey
  const [seriesKey, setSeriesKey] = useState(null);
  useEffect(() => {
    if (todo?.seriesKey) setSeriesKey(todo.seriesKey);
    else if (!seriesKey) setSeriesKey(makeSeriesKey(childId));
  }, [todo, childId, seriesKey]);

  // Modus/budsjett (live)
  const [rewardMode, setRewardMode] = useState(child?.rewardMode || null);
  const [weeklyBudget, setWeeklyBudget] = useState(Number(child?.weeklyBudget || 0));
  const [modeLocked, setModeLocked] = useState(false);
  const [rewardWeekStart, setRewardWeekStart] = useState(child?.rewardWeekStart ?? 6);

  // Øvrige gjøremål (uten det som redigeres) — ukekostnad beregnes mot ISO-uke
  const [siblingTodos, setSiblingTodos] = useState([]);

  // Skjema
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(defaultCategory || 'gjøremål');
  const [points, setPoints] = useState('5');
  const [moneyValue, setMoneyValue] = useState('10');
  const [type, setType] = useState(defaultType || 'daily');
  const [days, setDays] = useState({ sun:false, mon:true, tue:true, wed:true, thu:true, fri:true, sat:false });

  const initRepeat = useMemo(
    () => initRepeatFromTodo(
      todoFromRoute || (defaultType ? { type: defaultType } : { type: defaultType || 'daily' }),
    ),
    // only seed once from route defaults / existing todo snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [preset, setPreset] = useState(initRepeat.preset);
  const [customType, setCustomType] = useState(initRepeat.customType);
  const [customInterval, setCustomInterval] = useState(initRepeat.customInterval);
  const [recurrenceByDays, setRecurrenceByDays] = useState(initRepeat.recurrenceByDays);
  const [recurrenceUntilKey, setRecurrenceUntilKey] = useState(initRepeat.recurrenceUntilKey);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showStopPicker, setShowStopPicker] = useState(false);
  const [showCustomFreqPicker, setShowCustomFreqPicker] = useState(false);

  const [assignedParent, setAssignedParent] = useState(null);
  const [parentsList, setParentsList] = useState([]);

  useEffect(() => {
    if (!familyId) return;
    (async () => {
      try {
        const snap = await getDocsOnce(collection(db, 'families', familyId, 'parents'));
        setParentsList(snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.active !== false && p.deleted !== true)
        );
      } catch {}
    })();
  }, [familyId]);

  // Dato (for once) — start + frist for lekser/periode
  const [dueDate, setDueDate] = useState(
    defaultDueKey ? new Date(`${defaultDueKey}T12:00:00`) : null,
  );
  const [startDate, setStartDate] = useState(() => {
    const k = defaultStartKey || currentDateKey;
    return k ? new Date(`${String(k).slice(0, 10)}T12:00:00`) : null;
  });

  // Ikon
  const [iconUrl, setIconUrl] = useState(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  // Feilbanner
  const [inlineError, setInlineError] = useState('');

  // Mal-ikoner
  const [loadingIcons, setLoadingIcons] = useState(true);
  const [templateIcons, setTemplateIcons] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Popup: sletting fullført
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Dialog-stater
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoCfg, setInfoCfg] = useState({ title: '', message: '' });
  const infoAfterRef = useRef(null);
  const openInfo = (title, message, after) => { setInfoCfg({ title, message }); setInfoOpen(true); infoAfterRef.current = after || null; };
  const closeInfo = () => { setInfoOpen(false); const f = infoAfterRef.current; infoAfterRef.current = null; if (f) f(); };

  const [askOpen, setAskOpen] = useState(false);
  const [askCfg, setAskCfg] = useState({ title: '', message: '', buttons: [] });
  const openAsk = (cfg) => { setAskCfg(cfg); setAskOpen(true); };
  const closeAsk = () => setAskOpen(false);

  // LIVE: barn
  useEffect(() => {
    if (!familyId || !childId) return;
    const unsub = onSnapshot(doc(db, 'families', familyId, 'children', childId), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() || {};
      if (typeof d.weeklyBudget !== 'undefined') setWeeklyBudget(Number(d.weeklyBudget || 0));
      if (!modeLocked && d.rewardMode) setRewardMode(d.rewardMode);
      if (typeof d.rewardWeekStart === 'number') setRewardWeekStart(d.rewardWeekStart);
    });
    return () => unsub();
  }, [familyId, childId, modeLocked]);

  // Lås modus + hent øvrige gjøremål for ISO-ukebudsjett
  useEffect(() => {
    if (!familyId || !childId) return;
    const unsub = onSnapshot(collection(db, 'families', familyId, 'children', childId, 'todos'), (snap) => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(t => t.active !== false && t.deleted !== true);
      if (all.length > 0) setModeLocked(true);
      const excludeId = todo?.id || todoId || null;
      setSiblingTodos(excludeId ? all.filter((t) => t.id !== excludeId) : all);
    });
    return () => unsub();
  }, [familyId, childId, todo, todoId]);

  // Prefill
  useEffect(() => {
    if (!todo) return;
    setTitle(todo.title || '');
    setDescription(todo.description || '');
    setCategory(todo.category || defaultCategory || 'gjøremål');
    setType(todo.type || 'daily');
    setPoints(String(todo.points ?? todo.value ?? 0));
    setMoneyValue(String(todo.moneyValue ?? todo.value ?? 0));
    const repeat = initRepeatFromTodo(todo);
    setPreset(repeat.preset);
    setCustomType(repeat.customType);
    setCustomInterval(repeat.customInterval);
    setRecurrenceByDays(repeat.recurrenceByDays);
    setRecurrenceUntilKey(repeat.recurrenceUntilKey || '');
    if (todo.type === 'weekly' || repeat.preset === 'weekly' || repeat.preset === 'biweekly') {
      const fromIdx = { 0:'sun', 1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri', 6:'sat' };
      const next = { sun:false, mon:false, tue:false, wed:false, thu:false, fri:false, sat:false };
      const src = Array.isArray(repeat.recurrenceByDays) && repeat.recurrenceByDays.length
        ? repeat.recurrenceByDays
        : (Array.isArray(todo.daysOfWeek) ? todo.daysOfWeek : []);
      src.forEach((i)=>{ next[fromIdx[i]] = true; });
      setDays(next);
    }
    if (todo.startKey) {
      const weekly = todo.recurring === true
        ? String(todo.recurrenceType || '').toLowerCase() === 'weekly'
        : String(todo.type || '').toLowerCase() === 'weekly' || !!todo.everyOtherWeek;
      const key = weekly ? (mondayKeyOf(todo.startKey) || todo.startKey) : todo.startKey;
      const d = new Date(`${String(key).slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) setStartDate(d);
    }
    if (todo.type === 'once' || repeat.preset === 'never') {
      if (todo.dueDate) {
        const raw = todo.dueDate;
        const d = typeof raw === 'string'
          ? new Date(`${raw.slice(0, 10)}T12:00:00`)
          : new Date(raw.seconds ? raw.seconds * 1000 : raw);
        if (!Number.isNaN(d.getTime())) setDueDate(d);
      }
    }
    setIconUrl(todo.iconUrl || null);
    setSelectedFile(todo.iconFile || null);
    setAssignedParent(todo.assignedParent || null);
  }, [todo, defaultCategory]);

  useEffect(() => {
    if (preset === 'never') setType('once');
    else if (preset === 'daily' || (preset === 'custom' && customType === 'daily')) setType('daily');
    else setType('weekly');
  }, [preset, customType]);

  const baseDay = useMemo(() => {
    const anchor = todo?.startKey || dateKey(new Date());
    const [y, m, d] = String(anchor).split('-').map(Number);
    if (!y || !m || !d) return 1;
    return new Date(y, m - 1, d).getDay();
  }, [todo?.startKey]);

  // When switching into a weekly preset, anchor UI to that week's Monday once.
  // Do NOT re-snap on every pick — that made Startdato look broken on mobile.
  useEffect(() => {
    if (!isWeeklyRepeatPreset(preset, customType)) return;
    setStartDate((prev) => {
      const base = prev || new Date();
      const mon = startOfWeekMonday(base);
      if (dateKey(mon) === dateKey(base)) return prev || mon;
      return mon;
    });
  }, [preset, customType]);

  const repeatLabel = useMemo(() => repeatSummaryLabel({
    preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey,
  }), [preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey]);

  const repeatHint = useMemo(() => choreRepeatDescriptionText({
    preset, customType, customInterval, recurrenceByDays,
  }), [preset, customType, customInterval, recurrenceByDays]);

  const stopLabel = recurrenceUntilKey ? 'På en dato' : 'Aldri';
  const customFreqLabel = CUSTOM_FREQS.find((f) => f.id === customType)?.label || 'Ukentlig';
  const customUnit = CUSTOM_FREQS.find((f) => f.id === customType)?.unit || 'uke';

  const toggleRecurrenceDay = (day) => {
    setRecurrenceByDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  };

  const ensureRecurrenceStartDate = useCallback(() => {
    setStartDate((prev) => prev || new Date());
  }, []);

  const selectPreset = (id) => {
    if (id === 'custom') {
      ensureRecurrenceStartDate();
      setShowRepeatPicker(false);
      setShowCustomPicker(true);
      return;
    }
    setPreset(id);
    if (id !== 'never') {
      ensureRecurrenceStartDate();
      if (id === 'weekly' || id === 'biweekly') {
        setStartDate((prev) => startOfWeekMonday(prev || new Date()));
      }
    }
    if (id === 'daily') setCustomType('daily');
    if (id === 'weekly' || id === 'biweekly') setCustomType('weekly');
    if (id === 'monthly') setCustomType('monthly');
    if (id === 'yearly') setCustomType('yearly');
    if (id === 'biweekly') setCustomInterval(2);
    if (id === 'weekly' || id === 'daily') setCustomInterval(1);
    setShowRepeatPicker(false);
  };

  // Keep the picked day in the UI. Weekly patterns still normalize to Monday on save.
  const applyRecurrenceStartDate = useCallback((selected) => {
    setStartDate(selected || new Date());
  }, []);

  const recurrenceStartKey = startDate ? dateKey(startDate) : dateKey(new Date());
  const weeklyPatternMondayLabel = useMemo(() => {
    if (!isWeeklyRepeatPreset(preset, customType) || !startDate) return '';
    const mon = startOfWeekMonday(startDate);
    if (dateKey(mon) === dateKey(startDate)) return '';
    return mon.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
  }, [preset, customType, startDate]);

  const renderRecurrenceStartField = (styleExtra) => (
    <DateField
      value={startDate || new Date()}
      onChange={applyRecurrenceStartDate}
      prefix="Fra: "
      placeholder="Velg startdato"
      style={[DATE_FIELD_STYLE, styleExtra]}
      textStyle={{ fontWeight: '400', color: '#0b1f33' }}
    />
  );
  /** MAL-IKONER — on web skip Storage (CORS blocks it), use emoji fallback instead */
  useEffect(() => {
    let mounted = true;
    async function loadIcons() {
      try {
        if (Platform.OS !== 'web') {
          const pairs = await Promise.all(
            TASK_TEMPLATES.map(async (m) => {
              const ref = sref(storage, `${IKON_MAPPE}/${m.file}`);
              try {
                const url = await getDownloadURL(ref);
                return [m.file, url];
              } catch {
                return [m.file, null];
              }
            }),
          );
          if (mounted) setTemplateIcons(Object.fromEntries(pairs));
        }
      } finally { if (mounted) setLoadingIcons(false); }
    }
    loadIcons();
    return () => { mounted = false; };
  }, []);

  const currentValue = rewardMode === 'money'
    ? Math.max(0, Math.round(Number(moneyValue || 0)))
    : rewardMode === 'none'
      ? 0
      : Number(points || 0);

  const fallbackStartKey = currentDateKey || dateKey(new Date());
  const activityStartKey = useMemo(() => {
    if (startDate) return dateKey(startDate);
    if (preset === 'never' && dueDate) return dateKey(dueDate);
    return fallbackStartKey;
  }, [startDate, dueDate, preset, fallbackStartKey]);

  const budgetWeekKeys = useMemo(
    () => weekKeysForDateKey(budgetAnchorDateKey({
      startKey: activityStartKey,
      selectedDateKey: currentDateKey,
    })),
    [activityStartKey, currentDateKey],
  );
  const budgetIso = useMemo(
    () => getISOWeek(parseDateKey(activityStartKey)),
    [activityStartKey],
  );

  const plannedUsed = useMemo(
    () => weekPossibleInMode(siblingTodos, budgetWeekKeys, rewardMode || child?.rewardMode || 'points'),
    [siblingTodos, budgetWeekKeys, rewardMode, child?.rewardMode],
  );

  const draftForBudget = useMemo(() => {
    const recurrenceFields = buildTodoRecurrenceFields({
      preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey, baseDay,
    });
    const today = fallbackStartKey;
    const effectiveType = recurrenceFields.type;
    const dueKey = effectiveType === 'once' && dueDate ? dateKey(dueDate) : null;
    const rawStart = effectiveType === 'once'
      ? (startDate ? dateKey(startDate) : (todo?.startKey || dueKey || today))
      : (startDate ? dateKey(startDate) : (todo?.startKey || today));
    const startKeyVal = effectiveType === 'once'
      ? rawStart
      : (normalizeRecurrenceStartKey(rawStart, recurrenceFields) || rawStart);
    const endKeyVal = effectiveType === 'once'
      ? (dueKey || todo?.endKey || null)
      : (recurrenceFields.endKey || null);
    return choreDraftForWeekScore({
      rewardMode: rewardMode || 'points',
      unitValue: currentValue,
      recurrenceFields,
      startKey: startKeyVal,
      endKey: endKeyVal,
      dueKey,
    });
  }, [
    preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey, baseDay,
    dueDate, startDate, todo, rewardMode, currentValue, fallbackStartKey,
  ]);

  const currentWeekCost = useMemo(
    () => possibleInKeys([draftForBudget], budgetWeekKeys),
    [draftForBudget, budgetWeekKeys],
  );

  const remainingAfter = Number(weeklyBudget || 0) - Number(plannedUsed || 0) - Number(currentWeekCost || 0);
  const availableBefore = Number(weeklyBudget || 0) - Number(plannedUsed || 0);

  const overBudget = useMemo(() =>
    rewardMode === 'money' && Number(weeklyBudget || 0) > 0 &&
    (Number(plannedUsed || 0) + Number(currentWeekCost || 0)) > Number(weeklyBudget || 0),
  [rewardMode, weeklyBudget, plannedUsed, currentWeekCost]);

  const applyTemplate = (tpl) => {
    setSelectedTemplate(tpl.file);
    setTitle(tpl.title);
    setType(tpl.type || 'daily');
    setPoints(String(tpl.points ?? 5));
    setMoneyValue('10');
    const repeat = initRepeatFromTodo({
      type: tpl.type || 'daily',
      daysOfWeek: tpl.daysOfWeek,
      everyOtherWeek: false,
    });
    setPreset(repeat.preset);
    setCustomType(repeat.customType);
    setCustomInterval(repeat.customInterval);
    if (tpl.type === 'weekly' && Array.isArray(tpl.daysOfWeek)) {
      setRecurrenceByDays(tpl.daysOfWeek);
      const fromIdx = { 0:'sun', 1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri', 6:'sat' };
      const next = { sun:false, mon:false, tue:false, wed:false, thu:false, fri:false, sat:false };
      tpl.daysOfWeek.forEach((i)=>{ next[fromIdx[i]] = true; });
      setDays(next);
    } else {
      setRecurrenceByDays(repeat.recurrenceByDays);
      setDays({ sun:false, mon:true, tue:true, wed:true, thu:true, fri:true, sat:false });
    }
    setRecurrenceUntilKey('');
    const u = templateIcons[tpl.file];
    setSelectedFile(tpl.file);
    if (u) { setIconPreviewUrl(u); setIconUrl(null); }
    else { setIconPreviewUrl(null); }
  };

  const pickCustomIcon = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        openInfo('Tilgang nektet', 'Vi trenger tilgang til bilder for å velge ikon.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1,1], quality: 0.9
      });
      if (res.canceled) return;
      const asset = res.assets[0];

      if (Platform.OS === 'web') { try { await ensureAppCheckReady(); } catch {} }

      const blob = await (await fetch(asset.uri)).blob();
      const path = `families/${familyId}/children/${childId}/todo-icons/icon_${Date.now()}.jpg`;
      const r = sref(storage, path);
      await uploadBytes(r, blob);

      try { setIconPreviewUrl(asset.uri); } catch {}

      const url = await getDownloadURL(r);
      setIconUrl(url);
      setSelectedFile(null);
    } catch (e) {
      console.error(e);
      openInfo('Feil', 'Klarte ikke laste opp ikon.');
    }
  };

  // === LAGRE ===
  const save = async () => {
    try {
      setInlineError('');
      if (!canEditTodos) { openInfo('Ingen tilgang', 'Du har ikke tilgang til å lagre gjøremål.'); return; }
      if (!familyId || !childId) { setInlineError('Mangler familyId/barn.'); openInfo('Feil', 'Mangler familyId/barn.'); return; }
      const effectiveMode = normalizeRewardMode(rewardMode || 'points');
      if (!rewardMode) setRewardMode(effectiveMode);
      // Poeng-modus: tillat lagring også uten satt ukebudsjett (vanlig for barn som lager egne)
      const budgetOk = Number.isFinite(weeklyBudget) && weeklyBudget > 0;
      if (effectiveMode === 'money' && !budgetOk) {
        setInlineError('Ukebudsjett må være > 0 for pengemodus.');
        openInfo('Feil', 'Ukebudsjett må være større enn 0.');
        return;
      }

      const thisCost = Number(currentWeekCost || 0);
      const willBe = Number(plannedUsed || 0) + thisCost;
      const weekLabel = budgetIso?.week ? `Uke ${budgetIso.week}` : 'Denne uka';

      if (effectiveMode === 'money' && Number(weeklyBudget || 0) > 0 && willBe > Number(weeklyBudget || 0)) {
        const diff = willBe - Number(weeklyBudget || 0);
        const msg = `${weekLabel}: planlagt ${plannedUsed} kr av ${weeklyBudget} kr. Dette gjøremålet legger til ${thisCost} kr og overskrider med ${diff} kr.`;
        setInlineError(msg);
        openInfo('Budsjett overskrides', msg);
        return;
      }

      const finalTitle = (title || '').trim() || (category === 'lekser' ? 'Lekse' : 'Gjøremål');
      const today = fallbackStartKey;
      const recurrenceFields = buildTodoRecurrenceFields({
        preset,
        customType,
        customInterval,
        recurrenceByDays,
        recurrenceUntilKey,
        baseDay,
      });
      const effectiveType = recurrenceFields.type;
      const dueKey = effectiveType === 'once' && dueDate ? dateKey(dueDate) : null;
      // Recurring weekly: startKey = mandag i valgt ISO-uke (Man/Tor/Søn i samme uke).
      const rawStart = effectiveType === 'once'
        ? (startDate ? dateKey(startDate) : (todo?.startKey || dueKey || today))
        : (startDate ? dateKey(startDate) : (todo?.startKey || today));
      const startKeyVal = effectiveType === 'once'
        ? rawStart
        : (normalizeRecurrenceStartKey(rawStart, recurrenceFields) || rawStart);
      const endKeyVal = effectiveType === 'once'
        ? (dueKey || todo?.endKey || null)
        : (recurrenceFields.endKey || null);

      await setDoc(doc(db, 'families', familyId, 'children', childId), {
        rewardMode: effectiveMode,
        weeklyBudget: budgetOk ? weeklyBudget : (weeklyBudget || 0),
        rewardWeekStart: 1,
        updatedAt: new Date(),
      }, { merge: true });

      const payload = {
        title: finalTitle,
        description: (description || '').trim().slice(0, 2000),
        rewardType: effectiveMode,
        points: effectiveMode === 'points' ? Number(points) || 0 : 0,
        moneyValue: effectiveMode === 'money' ? Math.max(0, Math.round(Number(moneyValue || 0))) : 0,
        value: effectiveMode === 'money'
          ? Math.max(0, Math.round(Number(moneyValue || 0)))
          : (effectiveMode === 'points' ? (Number(points) || 0) : 0),
        category: category === 'lekser' ? 'lekser' : (category || 'gjøremål'),
        type: effectiveType,
        daysOfWeek: recurrenceFields.daysOfWeek,
        dueDate: dueKey || null,
        everyOtherWeek: !!recurrenceFields.everyOtherWeek,
        recurring: !!recurrenceFields.recurring,
        recurrenceType: recurrenceFields.recurrenceType,
        recurrenceInterval: recurrenceFields.recurrenceInterval,
        recurrenceByDays: recurrenceFields.recurrenceByDays,
        recurrenceUntilKey: recurrenceFields.recurrenceUntilKey,
        assignedParent: assignedParent || null,
        iconUrl: iconUrl || null,
        iconFile: selectedFile || null,
        completedDates: todo?.completedDates || [],
        skipDates: todo?.skipDates || [],
        active: todo?.active ?? true,
        deleted: todo?.deleted ?? false,
        order: Number(todo?.order ?? 0),
        seriesKey: seriesKey || makeSeriesKey(childId),

        startKey: startKeyVal,
        endKey: endKeyVal,

        updatedAt: serverTimestamp(),
        ...(todo ? {} : { createdAt: serverTimestamp() }),
      };

      if (todo && todoId) {
        await updateDoc(doc(db, 'families', familyId, 'children', childId, 'todos', todoId), payload);
      } else {
        await addDoc(collection(db, 'families', familyId, 'children', childId, 'todos'), payload);

        // Notifications (task received) — in-app inbox + optional email from backend.
        try {
          const senderUid = auth.currentUser?.uid || null;
          const childUid = child?.uid || childId;
          const recipients = new Set();
          if (childUid) recipients.add(childUid);
          parentsList.forEach((p) => {
            const u = p.uid || p.id;
            if (u) recipients.add(u);
          });
          if (senderUid) recipients.delete(senderUid);

          await notifyUsers(Array.from(recipients), {
            eventType: 'choreReceived',
            title: 'Nytt gjøremål',
            body: finalTitle,
            familyId,
            createdBy: senderUid,
          });
        } catch {}
      }

      openInfo('Lagret', todo ? 'Gjøremål oppdatert!' : 'Gjøremål opprettet!', () => navigation.goBack());
    } catch (e) {
      console.error(e);
      setInlineError('Noe gikk galt under lagring.');
      openInfo('Feil', 'Klarte ikke lagre gjøremålet.');
    }
  };

  // === SLETT – logikk ===
  const todayKey = dateKey(new Date());

  const countHistory = useCallback((t, fromKey = null) => {
    const arr = Array.isArray(t?.completedDates) ? t.completedDates : [];
    const filtered = fromKey ? arr.filter((k) => k >= fromKey) : arr;
    const total = filtered.length;
    const value = (t?.rewardType === 'money')
      ? Math.max(0, Math.round(Number(t?.moneyValue || 0)))
      : Math.max(0, Math.round(Number(t?.points || 0)));
    return { count: total, loss: total * value, unit: (t?.rewardType === 'money') ? 'kr' : 'poeng' };
  }, []);

  // Bare denne forekomsten
  const deleteOnlyThisOccurrence = async () => {
    try {
      if (!isAdmin) { openInfo('Ingen tilgang', 'Kun administrator kan slette.'); return; }
      if (!todoId || !currentDateKey) { openInfo('Feil', 'Mangler oppgave-ID eller dato.'); return; }
      const done = Array.isArray(todo?.completedDates) && todo.completedDates.includes(currentDateKey);
      if (done) { openInfo('Kan ikke slette', 'Denne forekomsten er allerede registrert som utført.'); return; }
      const ref = doc(db, 'families', familyId, 'children', childId, 'todos', todoId);
      await updateDoc(ref, { skipDates: arrayUnion(currentDateKey), updatedAt: serverTimestamp() });

      setConfirmText('Denne datoen er fjernet fra serien.');
      setConfirmVisible(true);
    } catch (e) { console.error(e); openInfo('Feil', 'Klarte ikke fjerne forekomsten.'); }
  };

  // Stopp serien fra valgt dato (eller fra i dag hvis ingen valgt)
  const stopSeriesFromSelected = async () => {
    try {
      if (!isAdmin) { openInfo('Ingen tilgang', 'Kun administrator kan slette.'); return; }
      if (!todoId) { openInfo('Feil', 'Mangler oppgave-ID.'); return; }

      const cutKey = currentDateKey || todayKey;
      const ref = doc(db, 'families', familyId, 'children', childId, 'todos', todoId);
      // Stopp fra og med valgt dag => endKey = dagen før
      await updateDoc(ref, { endKey: prevDayKey(cutKey), updatedAt: serverTimestamp() });

      setConfirmText('Serien er stoppet fra og med valgt dag.');
      setConfirmVisible(true);
    } catch (e) { console.error(e); openInfo('Feil', 'Klarte ikke stoppe serien.'); }
  };

  // Slett alt (inkludert historikk)
  const deleteSeriesAll = async () => {
    try {
      if (!isAdmin) { openInfo('Ingen tilgang', 'Kun administrator kan slette.'); return; }
      if (!todoId) { openInfo('Feil', 'Mangler oppgave-ID.'); return; }
      const ref = doc(db, 'families', familyId, 'children', childId, 'todos', todoId);
      await updateDoc(ref, { deleted: true, updatedAt: serverTimestamp() });

      setConfirmText('Hele oppgaven/serien ble slettet.');
      setConfirmVisible(true);
    } catch (e) { console.error(e); openInfo('Feil', 'Klarte ikke slette oppgaven.'); }
  };

  const onDeletePress = () => {
    if (!todo || !todoId) return;
    if (!canEditTodos) { openInfo('Ingen tilgang', 'Du har ikke tilgang til å slette.'); return; }

    const fromKey = currentDateKey || todayKey;
    const s = countHistory(todo, fromKey);
    const hasHistory = s.count > 0;
    const base = `\n\n${hasHistory
      ? `Registrerte fra og med valgt dag: ${s.count}\nMulig tap: ${s.loss} ${s.unit}`
      : 'Ingen registrerte poeng/kr fra og med valgt dag.'}`;

    if ((todo.type === 'daily' || todo.type === 'weekly')) {
      openAsk({
        title: 'Slett gjøremål?',
        message: `${todo.title || 'Gjøremål'}${base}\n\nVelg hva du vil gjøre:`,
        buttons: [
          { text: 'Avbryt', style: 'cancel' },
          ...(currentDateKey ? [{ text: 'Slett kun denne', onPress: deleteOnlyThisOccurrence }] : []),
          { text: 'Slett fremtidige', onPress: stopSeriesFromSelected },
          { text: hasHistory ? 'Slett alt (inkl. historikk)' : 'Slett hele oppgaven', style: 'destructive', onPress: deleteSeriesAll },
        ],
      });
    } else {
      // Engangsoppgave
      const sOnce = countHistory(todo);
      openAsk({
        title: category === 'lekser' ? 'Slett lekse?' : 'Slett gjøremål?',
        message: `${todo.title || 'Gjøremål'}\n\n${sOnce.count ? `OBS: registrert historikk: ${sOnce.count} (${sOnce.loss} ${sOnce.unit}).` : 'Ingen registrert historikk.'}\n\nEr du sikker?`,
        buttons: [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Slett', style: 'destructive', onPress: deleteSeriesAll },
        ],
      });
    }
  };

  const closeConfirmAndGoBack = () => { setConfirmVisible(false); navigation.goBack(); };

  const isLekserForm = category === 'lekser';
  const formTitle = todo
    ? (isLekserForm ? 'Rediger lekse' : 'Rediger gjøremål')
    : (isLekserForm ? 'Ny lekse' : 'Opprett gjøremål');

  return (
    <Screen>
      <EdgeSwipeBack onBack={() => navigation.goBack()}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}>
        <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled"
          {...(Platform.OS === 'web' ? { style: { ...styles.wrap, touchAction: 'manipulation' } } : {})}
        >
          <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
          <Title size={26}>{formTitle}</Title>
          <Text style={styles.help}>Barn: {child?.name || childId}</Text>

          {/* Budsjett-oppsummering (innstillinger settes på barnets profil) */}
          {rewardMode ? (
            <View style={styles.budgetCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionSmall}>
                  {rewardModeTitle(rewardMode)}
                </Text>
                {showsBudget(rewardMode) ? (
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    Budsjett: {weeklyBudget || 0} {rewardUnitLabel(rewardMode) === 'stjerner' ? '⭐' : 'kr'} / uke
                    {budgetIso?.week ? ` · uke ${budgetIso.week}` : ''}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Uten poeng/penger</Text>
                )}
              </View>
              {showsBudget(rewardMode) ? (
                <View style={[styles.budgetRow, { marginTop: 4 }]}>
                  <View style={styles.budgetPill}>
                    <MaterialCommunityIcons name="timetable" size={16} color="#0b74d1" />
                    <Text style={styles.pillTxt}>
                      Planlagt: {rewardMode === 'money' ? `${plannedUsed} kr` : `${plannedUsed} ⭐`}
                    </Text>
                  </View>
                  <View style={styles.budgetPill}>
                    <MaterialCommunityIcons name="wallet" size={16} color="#0b74d1" />
                    <Text style={styles.pillTxt}>
                      Til disposisjon: {rewardMode === 'money'
                        ? `${Math.max(0, availableBefore)} kr`
                        : `${Math.max(0, availableBefore)} ⭐`}
                    </Text>
                  </View>
                  <View style={styles.budgetPill}>
                    <MaterialCommunityIcons name="plus-minus-variant" size={16} color="#0b74d1" />
                    <Text style={styles.pillTxt}>
                      Denne: +{rewardMode === 'money' ? `${currentWeekCost} kr` : `${currentWeekCost} ⭐`}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ marginTop: 6, color: '#64748b', fontSize: 13, lineHeight: 18 }}>
                  Dette er bare en sjekkliste. Ingen belønningstall på oppgaven.
                </Text>
              )}
              {overBudget && (
                <View style={[styles.overBudgetBanner, { marginTop: 6 }]}>
                  <MaterialCommunityIcons name="alert-octagon-outline" size={16} color="#991b1b" />
                  <Text style={styles.overBudgetText}>
                    Overskrider ukebudsjettet{budgetIso?.week ? ` for uke ${budgetIso.week}` : ''} med {Math.abs(remainingAfter)} {rewardMode === 'money' ? 'kr' : 'stjerner'}.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.budgetCard}>
              <Text style={{ color: '#b45309', fontWeight: '400' }}>
                ⚠️ Belønningsmodus er ikke satt for dette barnet. Gå til gjøremålsinnstillinger for å velge ingen, penger eller stjerner.
              </Text>
            </View>
          )}

          {/* Maler */}
          <Text style={styles.section}>Velg fra maler</Text>
          {loadingIcons ? (
            <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View>
          ) : Platform.OS === 'web' ? (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
              {TASK_TEMPLATES.map((item, idx) => {
                const sel = selectedTemplate === item.file;
                return (
                  <div
                    key={item.file + idx}
                    onClick={() => applyTemplate(item)}
                    style={{
                      minWidth: 118, width: 118, padding: 8, borderRadius: 12,
                      backgroundColor: sel ? '#dbeafe' : '#fff',
                      border: sel ? '2px solid #0b74d1' : '1px solid #e5e7eb',
                      cursor: 'pointer', flexShrink: 0, textAlign: 'center',
                      boxShadow: sel ? '0 2px 8px rgba(11,116,209,0.18)' : '0 1px 4px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ fontSize: 36, lineHeight: '56px', textAlign: 'center' }}>{item.icon || '✅'}</div>
                    <div style={{
                      fontSize: 12, fontWeight: '400', color: '#0b1f33', marginTop: 4,
                      lineHeight: '16px', minHeight: 32,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', wordBreak: 'break-word',
                    }}>
                      {item.title}
                    </div>
                    {sel && <div style={{ fontSize: 10, fontWeight: '400', color: '#0b74d1', marginTop: 2 }}>✓ Valgt</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}
            >
              {TASK_TEMPLATES.map((item, idx) => {
                const url = templateIcons[item.file];
                const sel = selectedTemplate === item.file;
                return (
                  <TouchableOpacity
                    key={item.file + idx}
                    style={[styles.tile, sel && { borderColor: '#0b74d1', borderWidth: 2, backgroundColor: '#dbeafe' }]}
                    onPress={() => applyTemplate(item)}
                    accessibilityRole="button"
                  >
                    {url ? (
                      <Image source={{ uri: url }} style={styles.tileImg} />
                    ) : (
                      <View style={[styles.tileImg, { alignItems:'center', justifyContent:'center', backgroundColor:'#eef2ff' }]}>
                        <Text style={{ fontSize: 36 }}>{item.icon || '✅'}</Text>
                      </View>
                    )}
                    <Text style={[styles.tileTxt, sel && { color: '#0b74d1' }]} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Egendefinert */}
          <Text style={styles.section}>Egendefinert</Text>

          <HelpTarget id="content">
          <Text style={styles.label}>Tittel</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={isLekserForm ? 'F.eks. Matematikk: Husk gradskive' : 'F.eks. Pusse tenner'}
          />
          </HelpTarget>

          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }]}
            value={description}
            onChangeText={setDescription}
            placeholder={isLekserForm ? 'Hva skal gjøres? Sider, oppgaver…' : 'Valgfri beskrivelse'}
            multiline
          />

          {rewardMode === 'money' ? (
            <>
              <Text style={styles.label}>Beløp per gang (kr)</Text>
              <TextInput style={styles.input} value={String(moneyValue)} onChangeText={setMoneyValue} keyboardType="number-pad" placeholder="10" />
            </>
          ) : rewardMode === 'none' ? (
            <Text style={{ color: '#64748b', marginBottom: 8, lineHeight: 20 }}>
              Ingen stjerner eller kroner på dette gjøremålet — det er bare en sjekkliste.
            </Text>
          ) : (
            <>
              <Text style={styles.label}>Stjerner per gang</Text>
              <TextInput style={styles.input} value={String(points)} onChangeText={setPoints} keyboardType="number-pad" placeholder="5" />
            </>
          )}

          <Text style={styles.label}>Regelmessighet</Text>
          <TouchableOpacity style={styles.formRow} onPress={() => setShowRepeatPicker(true)}>
            <Text style={styles.formRowLabel}>Gjenta</Text>
            <View style={styles.formRowRight}>
              <Text style={styles.formRowValue}>{repeatLabel}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </TouchableOpacity>

          {preset !== 'never' && (
            <>
              <Text style={styles.subLabel}>Startdato</Text>
              {renderRecurrenceStartField(null)}
              <Text style={{ color: '#6b7280', marginTop: 6, marginBottom: 4 }}>
                {weeklyPatternMondayLabel
                  ? `Valgt dato beholdes i skjemaet; mønsteret teller fra mandag ${weeklyPatternMondayLabel}.`
                  : 'Fra mandag i valgt uke telles mønsteret (f.eks. annenhver uke man–søn).'}
              </Text>

              <TouchableOpacity style={styles.formRow} onPress={() => setShowStopPicker(true)}>
                <Text style={styles.formRowLabel}>Stopp gjenta</Text>
                <View style={styles.formRowRight}>
                  <Text style={styles.formRowValue}>{stopLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>

              {recurrenceUntilKey ? (
                <DateField
                  value={recurrenceUntilKey}
                  onChange={(d) => setRecurrenceUntilKey(d ? dateKey(d) : '')}
                  prefix="Slutt: "
                  placeholder="Velg sluttdato"
                  icon="stop-circle-outline"
                  min={recurrenceStartKey}
                  style={[DATE_FIELD_STYLE, { marginTop: 8 }]}
                  textStyle={{ fontWeight: '400', color: '#0b1f33' }}
                />
              ) : null}

              {isWeeklyRepeatPreset(preset, customType) ? (
                <>
                  <Text style={styles.subLabel}>Ukedager</Text>
                  <View style={styles.weekChipRow}>
                    {WEEKDAYS_SHORT.map((label, idx) => {
                      const day = (idx + 1) % 7;
                      const on = recurrenceByDays.includes(day);
                      return (
                        <TouchableOpacity
                          key={label}
                          style={[styles.weekChip, on && styles.weekChipOn]}
                          onPress={() => toggleRecurrenceDay(day)}
                        >
                          <Text style={[styles.weekChipTxt, on && styles.weekChipTxtOn]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {repeatHint ? <Text style={styles.repeatHint}>{repeatHint}</Text> : null}
            </>
          )}

          {type === 'once' && (
            <>
              <Text style={styles.subLabel}>{isLekserForm ? 'Fra dato (arbeidsperiode)' : 'Startdato (valgfritt)'}</Text>
              <DateField
                value={startDate}
                onChange={setStartDate}
                placeholder="Velg startdato"
                style={DATE_FIELD_STYLE}
                textStyle={{ fontWeight: '400', color: '#0b1f33' }}
                iconColor="#0b74d1"
              />

              <Text style={[styles.subLabel, { marginTop: 10 }]}>{isLekserForm ? 'Frist (til dato)' : 'Dato'}</Text>
              <DateField
                value={dueDate}
                onChange={setDueDate}
                placeholder="Velg dato"
                style={DATE_FIELD_STYLE}
                textStyle={{ fontWeight: '400', color: '#0b1f33' }}
                iconColor="#0b74d1"
              />
              <Text style={{ color:'#6b7280', marginTop:6 }}>
                {isLekserForm
                  ? 'Leksen vises alle dager fra–til. Kryss av én gang = ferdig for hele perioden.'
                  : 'Engangs-oppgaver teller ikke mot ukebudsjett før datoen inntreffer.'}
              </Text>
            </>
          )}

          {parentsList.length > 1 && (
            <>
              <Text style={styles.label}>Gjelder kun for forelder (valgfritt)</Text>
              <View style={styles.chips}>
                <TouchableOpacity
                  style={[styles.chip, !assignedParent && styles.chipActive]}
                  onPress={() => setAssignedParent(null)}
                >
                  <Text style={[styles.chipText, !assignedParent && styles.chipTextActive]}>Alle</Text>
                </TouchableOpacity>
                {parentsList.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, assignedParent === p.uid && styles.chipActive]}
                    onPress={() => setAssignedParent(assignedParent === p.uid ? null : p.uid)}
                  >
                    <Text style={[styles.chipText, assignedParent === p.uid && styles.chipTextActive]}>
                      {(p.name || p.displayName || '').split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Ikon</Text>
          <View style={styles.iconRow}>
            {(iconPreviewUrl || iconUrl) ? (
              // On web we prefer `WebSafeIcon` for Storage URLs to avoid CORS-blocked <img> loads.
              (Platform.OS === 'web'
                && typeof (iconPreviewUrl || iconUrl) === 'string'
                && (
                  (iconPreviewUrl || iconUrl).startsWith(`${IKON_MAPPE}/`)
                  || (iconPreviewUrl || iconUrl).includes('firebasestorage.googleapis.com')
                )
              ) ? (
                <WebSafeIcon pathOrUrl={iconPreviewUrl || iconUrl} style={styles.iconPreview} />
              ) : (
                <Image source={{ uri: iconPreviewUrl || iconUrl }} style={styles.iconPreview} />
              )
            ) : (
              <View style={[styles.iconPreview, { alignItems:'center', justifyContent:'center' }]}>
                <Ionicons name="image-outline" size={24} color="#94a3b8" />
              </View>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={pickCustomIcon} accessibilityRole="button">
              <Text style={styles.secondaryTxt}>Velg eget ikon…</Text>
            </TouchableOpacity>
          </View>

          {!!inlineError && (
            <View style={styles.inlineError}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#991b1b" />
              <Text style={styles.inlineErrorText}>{inlineError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, (!canEditTodos || overBudget) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!canEditTodos || overBudget}
            accessibilityRole="button"
          >
            <Text style={styles.saveTxt}>{todo ? 'Lagre endringer' : (isLekserForm ? 'Lagre lekse' : 'Lagre gjøremål')}</Text>
          </TouchableOpacity>

          {todoId && (
            <TouchableOpacity
              style={[styles.deleteBtn, !canEditTodos && { opacity: 0.5 }]}
              onPress={onDeletePress}
              disabled={!canEditTodos}
              accessibilityRole="button"
            >
              <Text style={styles.deleteTxt}>Slett</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Ferdig-popup */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={closeConfirmAndGoBack}>
        <Pressable style={styles.overlay} onPress={closeConfirmAndGoBack}>
          <Pressable style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="checkmark-circle" size={36} color="#10b981" />
            </View>
            <Text style={styles.dialogTitle}>Slettet</Text>
            <Text style={styles.dialogMsg}>{confirmText || 'Endringen er lagret.'}</Text>
            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.actionBtn} onPress={closeConfirmAndGoBack}>
                <Text style={styles.actionBtnTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dialoger */}
      <ConfirmDialog visible={askOpen} title={askCfg.title} message={askCfg.message} buttons={askCfg.buttons} onClose={closeAsk} />
      <InfoDialog visible={infoOpen} title={infoCfg.title} message={infoCfg.message} onClose={closeInfo} />

      <Modal visible={showRepeatPicker} transparent animationType="fade" onRequestClose={() => setShowRepeatPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowRepeatPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Gjenta</Text>
            {REPEAT_PRESETS.map((row, idx) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.sheetRow, idx === REPEAT_PRESETS.length - 1 && styles.sheetRowLast]}
                onPress={() => selectPreset(row.id)}
              >
                <Text style={styles.sheetRowTxt}>{row.label}</Text>
                {preset === row.id && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowRepeatPicker(false)}>
              <Text style={styles.sheetCancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCustomPicker} animationType="slide" onRequestClose={() => setShowCustomPicker(false)}>
        <View style={styles.customModalWrap}>
          <View style={styles.customScreen}>
            <View style={styles.customHeader}>
              <TouchableOpacity onPress={() => setShowCustomPicker(false)} style={styles.customBack}>
                <Ionicons name="chevron-back" size={22} color={colors.brand} />
              </TouchableOpacity>
              <Text style={styles.customTitle}>Tilpasset</Text>
              <TouchableOpacity
                onPress={() => {
                  ensureRecurrenceStartDate();
                  setPreset('custom');
                  setShowCustomPicker(false);
                }}
                style={styles.customDone}
              >
                <Text style={styles.customDoneTxt}>Ferdig</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.customCard}>
              <TouchableOpacity style={styles.customRow} onPress={() => setShowCustomFreqPicker(true)}>
                <Text style={styles.customRowLabel}>Hyppighet</Text>
                <View style={styles.formRowRight}>
                  <Text style={styles.formRowValue}>{customFreqLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>
              <View style={styles.customDivider} />
              <Text style={styles.customRowLabel}>Hver</Text>
              <View style={styles.intervalPickerRow}>
                <ScrollView style={styles.intervalScroll} contentContainerStyle={styles.intervalPickerCol} keyboardShouldPersistTaps="handled">
                  {INTERVAL_OPTIONS.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.intervalPill, customInterval === n && styles.intervalPillOn]}
                      onPress={() => setCustomInterval(n)}
                    >
                      <Text style={[styles.intervalPillTxt, customInterval === n && styles.intervalPillTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.intervalUnit}>{customUnit}</Text>
              </View>
            </View>

            <View style={[styles.customCard, { marginTop: 12 }]}>
              <Text style={styles.customRowLabel}>Startdato</Text>
              <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4, marginBottom: 10 }}>
                {weeklyPatternMondayLabel
                  ? `Valgt dato beholdes i skjemaet; mønsteret teller fra mandag ${weeklyPatternMondayLabel}.`
                  : 'Fra mandag i valgt uke (ukedager i samme uke følger med)'}
              </Text>
              {renderRecurrenceStartField(null)}
            </View>

            {customType === 'weekly' && (
              <>
                <Text style={styles.subLabel}>Ukedager</Text>
                <View style={styles.weekChipRow}>
                  {WEEKDAYS_SHORT.map((label, idx) => {
                    const day = (idx + 1) % 7;
                    const on = recurrenceByDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.weekChip, on && styles.weekChipOn]}
                        onPress={() => toggleRecurrenceDay(day)}
                      >
                        <Text style={[styles.weekChipTxt, on && styles.weekChipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {repeatHint ? <Text style={styles.repeatHint}>{repeatHint}</Text> : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomFreqPicker} transparent animationType="fade" onRequestClose={() => setShowCustomFreqPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCustomFreqPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Hyppighet</Text>
            {CUSTOM_FREQS.map((row, idx) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.sheetRow, idx === CUSTOM_FREQS.length - 1 && styles.sheetRowLast]}
                onPress={() => {
                  setCustomType(row.id);
                  setShowCustomFreqPicker(false);
                }}
              >
                <Text style={styles.sheetRowTxt}>{row.label}</Text>
                {customType === row.id && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showStopPicker} transparent animationType="fade" onRequestClose={() => setShowStopPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowStopPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Stopp gjenta</Text>
            {STOP_PRESETS.map((row, idx) => {
              const selected = row.id === 'date' ? !!recurrenceUntilKey : !recurrenceUntilKey;
              return (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.sheetRow, idx === STOP_PRESETS.length - 1 && styles.sheetRowLast]}
                  onPress={() => {
                    if (row.id === 'never') setRecurrenceUntilKey('');
                    else {
                      ensureRecurrenceStartDate();
                      setRecurrenceUntilKey(recurrenceUntilKey || recurrenceStartKey);
                    }
                    setShowStopPicker(false);
                  }}
                >
                  <Text style={styles.sheetRowTxt}>{row.label}</Text>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
      </EdgeSwipeBack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f9fc', padding: 14 },
  h1: { fontSize: 22, fontWeight: '400', color: '#0b1f33' },
  help: { color: '#64748b', marginTop: 4, marginBottom: 10 },

  budgetCard: { backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  lockTxt: { marginTop: 6, fontSize: 12, color: '#6b7280' },
  budgetRow: { marginTop: 8, gap: 6 },
  budgetPill: { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#eef6ff', paddingVertical:6, paddingHorizontal:8, borderRadius:8 },
  pillTxt: { color:'#0b1f33', fontWeight: '400', fontSize:12 },

  overBudgetBanner: {
    marginTop: 8, flexDirection:'row', gap:8, alignItems:'center',
    backgroundColor:'#fee2e2', borderColor:'#fecaca', borderWidth:1,
    paddingHorizontal:10, paddingVertical:8, borderRadius:8
  },
  overBudgetText: { color:'#991b1b', fontWeight: '400', flexShrink:1 },

  section: { marginTop: 12, marginBottom: 8, fontWeight: '400', color: '#0b1f33', fontSize: 16 },
  sectionSmall: { fontWeight: '400', color:'#0b1f33', fontSize:14 },

  tile: {
    width: 120, padding: 8, borderRadius: 12, backgroundColor: colors.card,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 10px rgba(2,6,23,0.06)' } : { elevation: 1 })
  },
  tileImg: { width: '100%', height: 80, borderRadius: 10, backgroundColor: '#eef2ff' },
  tileTxt: { marginTop: 6, fontSize: 12, fontWeight: '400', color: '#0b1f33', lineHeight: 16, minHeight: 32, textAlign: 'center' },

  label: { marginTop: 10, marginBottom: 6, fontWeight: '400', color: '#0b1f33' },
  subLabel: { marginTop: 8, marginBottom: 6, fontWeight: '400', color: '#334155' },
  input: { backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },

  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#e7f2fb' },
  chipActive: { backgroundColor: '#0b74d1' },
  chipText: { color: '#0b74d1', fontWeight: '400' },
  chipTextActive: { color: '#fff' },

  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, padding: 10, borderRadius: 10, marginBottom: 6 },
  dayLabel: { fontWeight: '400', color: '#0b1f33' },

  formRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
  },
  formRowLabel: { fontWeight: '400', color: '#0b1f33', fontSize: 15 },
  formRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  formRowValue: { fontWeight: '400', color: '#64748b', fontSize: 14, textAlign: 'right' },
  repeatHint: { marginTop: 4, marginBottom: 8, color: '#64748b', fontSize: 13, fontWeight: '400' },

  weekChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  weekChip: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: '#e5e7eb',
  },
  weekChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  weekChipTxt: { fontWeight: '400', color: '#0b1f33', fontSize: 13 },
  weekChipTxtOn: { color: '#fff' },

  sheet: {
    backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 420,
  },
  sheetTitle: {
    fontWeight: '400', fontSize: 16, color: '#0b1f33', textAlign: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowTxt: { fontWeight: '400', fontSize: 16, color: '#0b1f33' },
  sheetCancel: { paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  sheetCancelTxt: { fontWeight: '400', color: colors.brand, fontSize: 16 },

  customModalWrap: { flex: 1, backgroundColor: '#f3f4f6' },
  customScreen: { flex: 1, padding: 16 },
  customHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  customBack: { padding: 4, width: 60 },
  customTitle: { fontWeight: '400', fontSize: 18, color: '#0b1f33' },
  customDone: { width: 60, alignItems: 'flex-end' },
  customDoneTxt: { color: colors.brand, fontWeight: '400', fontSize: 16 },
  customCard: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 14, marginBottom: 12,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customRowLabel: { fontWeight: '400', color: '#0b1f33', fontSize: 15 },
  customDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 },
  intervalPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  intervalScroll: { flex: 1, maxHeight: 140 },
  intervalPickerCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalPill: {
    minWidth: 36, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#f3f4f6', alignItems: 'center',
  },
  intervalPillOn: { backgroundColor: colors.brand },
  intervalPillTxt: { fontWeight: '400', color: '#0b1f33', fontSize: 15 },
  intervalPillTxtOn: { color: '#fff' },
  intervalUnit: { fontWeight: '400', color: '#64748b', fontSize: 16, minWidth: 48 },

  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  iconPreview: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#e2e8f0' },

  secondaryBtn: {
    alignSelf: 'flex-start', backgroundColor: '#e7f2fb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  secondaryTxt: { color: '#0b74d1', fontWeight: '400' },

  inlineError: { marginTop: 12, backgroundColor:'#fee2e2', borderColor:'#fecaca', borderWidth:1, padding:10, borderRadius:10, flexDirection:'row', alignItems:'center', gap:8 },
  inlineErrorText: { color:'#991b1b', fontWeight: '400', flexShrink:1 },

  saveBtn: {
    alignSelf: 'flex-start', marginTop: 14, backgroundColor: '#0b74d1', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },

  deleteBtn: {
    alignSelf: 'flex-start', marginTop: 12, backgroundColor: '#fee2e2', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  deleteTxt: { color: '#b91c1c', fontWeight: '400' },

  // Dialoger
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: {
    backgroundColor: colors.card, width: '100%', maxWidth: 420, borderRadius: 16,
    padding: 18, borderWidth: 1, borderColor: '#e2e8f0'
  },
  dialogTitle: { fontSize: 18, fontWeight: '400', color: '#0f172a' },
  dialogMsg: { color: '#0f172a', marginTop: 8, fontWeight: '400' },

  actionBar: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#0b74d1', minWidth: 120, alignItems: 'center', justifyContent: 'center'
  },
  actionBtnDestructive: { backgroundColor: '#dc2626' },
  actionBtnCancel: { backgroundColor: '#e5e7eb' },
  actionBtnTxt: { color: '#fff', fontWeight: '400' },

  confirmIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center'
  },
});
