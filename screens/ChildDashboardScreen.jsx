// src/screens/ChildDashboardScreen.jsx
import React, {
  useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Switch, Platform,
  Animated, Image, Alert, Modal, RefreshControl, Dimensions, Pressable, ScrollView,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import {
  collection, doc, onSnapshot, query, orderBy, updateDoc,
  arrayUnion, arrayRemove, deleteField, getDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { ref as sref, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, ensureAppCheckReady } from '../firebase';
import { aiImportNavParams, childScheduleNavParams } from '../src/utils/childNav';
import TopNavBar from '../components/TopNavBar';
import WebSafeIcon from '../components/WebSafeIcon';
import { TASK_TEMPLATES } from '../src/data/taskTemplates';
import {
  pad,
  dateKey,
  parseDateKey,
  startOfWeekMonday,
  rewardWeekKeys,
  addDays,
  prevDayKey,
  sameDay,
  isToday,
  isFutureDate,
  getIsoWeekYear,
  appliesOnDate,
  monthGrid,
  isSameMonth,
  WEEKDAYS_SHORT,
  MONTHS_NO,
} from '../src/utils/dates';
import { eventOccursOnDate, eventVisibleToUser } from '../src/utils/events';
import {
  childCanCreateCalendarEvent,
  childCalendarEventReadOnly,
} from '../src/utils/childCalendarAccess';
import * as Haptics from 'expo-haptics';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import ChildSideDrawer from '../components/ChildSideDrawer';
import ChildProfileHeader from '../components/ChildProfileHeader';
import WeekSummaryModal from '../components/WeekSummaryModal';
import ChildTodoDetailModal from '../components/ChildTodoDetailModal';
import { todoEmoji } from '../src/utils/todoIcons';
import { valueForTask, notifyParentsAttestPending } from '../src/utils/todos';
import { useBottomChromeInset } from '../src/utils/useBottomChromeInset';
import HelpTarget from '../components/HelpTarget';

const CHILD_TAB_META = {
  dashboard: { kicker: 'HJEM', heading: (name) => `Hei, ${name}!` },
  tasks: { kicker: 'OPPGAVER', heading: (name) => `${name}s gjøremål` },
  calendar: { kicker: 'KALENDER', heading: (name) => `${name}s kalender` },
  program: { kicker: 'UKESPLAN', heading: (name) => `${name}s ukesplan` },
};

const ADD_TODO_ROUTE = 'AddTodo';
const ADD_NOTE_ROUTE = 'AddNote';
const ADD_EVENT_ROUTE = 'EventForm';
const ADD_SCHEDULE_ROUTE = 'ChildSchedule';

/** Which «Legg til»-valg som vises per fane */
const ADD_MENU_TAB_CONFIG = {
  dashboard: {
    title: 'Legg til',
    context: 'Hjem',
    keys: ['todo', 'note'],
  },
  tasks: {
    title: 'Nytt gjøremål',
    context: 'Gjøremål',
    keys: ['todo'],
  },
  calendar: {
    title: 'Ny kalenderoppføring',
    context: 'Kalender',
    keys: ['event'],
  },
  program: {
    title: 'Legg til i program',
    context: 'Program',
    keys: ['note', 'schedule'],
  },
};
const COIN_IMG = require('../assets/gold-coin.png');
const ROW_HEIGHT = 108;
const NATIVE_DRIVER = Platform.OS !== 'web';
const IKON_MAPPE = 'icons/catalog';

// Quick lookup: iconFile -> emoji for CORS-safe fallback on web
const ICON_EMOJI = Object.fromEntries(TASK_TEMPLATES.map((t) => [t.file, t.icon]));

/** ---------- Mynte-dryss ---------- */
function CoinRain({ triggerKey, count = 0, targetLayout, screenPaddingTop = 0 }) {
  const { width: winW } = Dimensions.get('window');
  const coinsRef = useRef([]);

  useEffect(() => {
    if (!count || !targetLayout) return;
    const c = Math.min(12, Math.max(0, Math.round(count)));
    const bagCX = targetLayout.x + targetLayout.width / 2;
    const bagCY = targetLayout.y + targetLayout.height / 2;
    const screenCX = winW / 2;

    coinsRef.current = Array.from({ length: c }, (_, i) => {
      const spread = 60 + Math.random() * 80;
      const angle = (i / c) * Math.PI * 2 + Math.random() * 0.4;
      return {
        p: new Animated.Value(0),
        op: new Animated.Value(0),
        size: 24 + Math.round(Math.random() * 10),
        startX: screenCX + Math.cos(angle) * spread,
        startY: bagCY - 120 - Math.random() * 60,
        delay: i * 60 + Math.round(Math.random() * 40),
        dur: 900 + Math.round(Math.random() * 200),
        rot: new Animated.Value(0),
        scale: 0.8 + Math.random() * 0.4,
        endX: bagCX + (Math.random() - 0.5) * 12,
        endY: bagCY + (Math.random() - 0.5) * 8,
      };
    });

    coinsRef.current.forEach((coin) => {
      coin.p.setValue(0); coin.op.setValue(0); coin.rot.setValue(0);
      Animated.parallel([
        Animated.timing(coin.op, { toValue: 1, duration: 100, delay: coin.delay, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(coin.p, { toValue: 1, duration: coin.dur, delay: coin.delay, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(coin.rot, { toValue: 1, duration: coin.dur, delay: coin.delay, useNativeDriver: NATIVE_DRIVER }),
      ]).start(() => {
        Animated.timing(coin.op, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  if (!count || !targetLayout) return null;

  return (
    <View pointerEvents="none" style={styles.coinLayer}>
      {coinsRef.current.map((coin, idx) => {
        const translateX = coin.p.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [coin.startX, coin.startX + (coin.endX - coin.startX) * 0.15, coin.endX],
        });
        const translateY = coin.p.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [coin.startY, coin.startY - 30, coin.endY],
        });
        const rotate = coin.rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + idx * 30}deg`] });
        return (
          <Animated.Image
            key={`coin-${triggerKey}-${idx}`}
            source={COIN_IMG}
            style={[styles.coinImg, {
              width: coin.size, height: coin.size, opacity: coin.op,
              transform: [{ translateX }, { translateY }, { rotate }, { scale: coin.scale }],
            }]}
            resizeMode="contain"
          />
        );
      })}
    </View>
  );
}
/** ---------- /Mynte-dryss ---------- */

const TaskRow = React.memo(function Row({
  itemId, title, type, rewardType, points, moneyValue, completedDates, attestedDates, k, canEdit,
  pending, iconUrl, iconEmoji, onToggle, onAttest, onUndoAttest, onEdit, onDelete, onOpen, toggleDisabled, isAdmin,
}) {
  const isDone = Array.isArray(completedDates) && completedDates.includes(k);
  const isAttested = !!(attestedDates && attestedDates[k]);
  const [imgOk, setImgOk] = useState(true);
  const displayPts = Math.max(0, Math.round(Number(points || 0)));
  const displayKr = Math.max(0, Math.round(Number(moneyValue || 0)));

  return (
    <View style={[styles.row, isDone && styles.rowDone, isAttested && styles.rowAttested]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}
        onPress={onOpen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Trykk for detaljer`}
      >
        <View style={styles.iconWrap}>
          {Platform.OS === 'web' ? (
            <View style={[styles.iconImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6ff', borderRadius: 12 }]}>
              <Text style={{ fontSize: 32 }}>{iconEmoji || '✅'}</Text>
            </View>
          ) : (
            <Image
              source={iconUrl && imgOk ? { uri: iconUrl } : COIN_IMG}
              onError={() => setImgOk(false)}
              style={styles.iconImg}
              resizeMode="cover"
            />
          )}
        </View>

        <View style={styles.textWrap}>
          <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>{title || 'Gjøremål'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sub}>
              {rewardType === 'money'
                ? `${displayKr} kr · ${(type || 'daily').toUpperCase()}`
                : `${displayPts} · ${(type || 'daily').toUpperCase()}`}
              {!canEdit ? ' · trykk for mer' : ''}
            </Text>
            {isDone && isAttested && (
              <TouchableOpacity
                style={styles.attestBadge}
                onPress={() => { if (isAdmin && onUndoAttest) onUndoAttest(); }}
                disabled={!isAdmin || !onUndoAttest}
              >
                <Text style={styles.attestBadgeTxt}>🛡️ Attestert</Text>
              </TouchableOpacity>
            )}
            {isDone && !isAttested && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeTxt}>⏳ Venter</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {canEdit && (
        <>
          <TouchableOpacity onPress={onEdit} style={{ padding: 6, marginRight: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="create-outline" size={20} color="#0b74d1" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={{ padding: 6, marginRight: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={20} color="#b91c1c" />
          </TouchableOpacity>
        </>
      )}

      {isDone && !isAttested && isAdmin && onAttest && (
        <TouchableOpacity onPress={onAttest} style={styles.attestBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="shield-checkmark" size={20} color="#d97706" />
        </TouchableOpacity>
      )}

      <View style={styles.rightWrap}>
        <Text style={[styles.pointsBadge, isDone && styles.pointsBadgeDone, isAttested && styles.pointsBadgeAttested]}>
          {rewardType === 'money' ? `${displayKr}` : `${displayPts}`}
        </Text>
        <Switch
          value={isDone}
          onValueChange={onToggle}
          trackColor={{ false: '#d1d5db', true: '#34d399' }}
          thumbColor={Platform.OS === 'android' ? (isDone ? '#10b981' : '#f9fafb') : undefined}
          disabled={pending || toggleDisabled}
        />
      </View>
    </View>
  );
}, (p, n) =>
  p.itemId === n.itemId && p.title === n.title && p.type === n.type
  && p.rewardType === n.rewardType && p.points === n.points && p.moneyValue === n.moneyValue
  && p.k === n.k && p.canEdit === n.canEdit && p.pending === n.pending
  && p.iconUrl === n.iconUrl && p.iconEmoji === n.iconEmoji
  && p.completedDates === n.completedDates && p.toggleDisabled === n.toggleDisabled
  && p.attestedDates === n.attestedDates && p.isAdmin === n.isAdmin
  && p.onOpen === n.onOpen
);

export default function ChildDashboardScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useI18n();
  const { isChild, meChild, familyId: ctxFamilyId, family, requestShellTab, kids, switchToChildProfile, members } = useApp();
  const { fabBottom, contentPaddingBottom, shellBottom } = useBottomChromeInset();
  const {
    child: childParam,
    familyId: familyIdParam,
    allowEdit,
    selfView: selfViewParam,
    mainTab: mainTabParam,
  } = route.params || {};
  const child = childParam || meChild;
  const childId = child?.id || child?.childId || child?.uid;
  const familyId = familyIdParam || ctxFamilyId || child?.familyId;
  const selfView = selfViewParam ?? isChild;
  const parentViewing = !isChild && !selfView;
  const calendarSelfEdit = child?.calendarSelfEdit === true;
  const childViewer = selfView || isChild;
  const childCanEditCalendar = childCanCreateCalendarEvent({ isChild: childViewer, calendarSelfEdit });

  const activeKids = useMemo(
    () => kids.filter((k) => k.active !== false),
    [kids],
  );

  const childFirstName = useMemo(
    () => child?.name?.split(' ')[0] || 'Barn',
    [child?.name],
  );

  const [mainTab, setMainTab] = useState(mainTabParam || 'dashboard'); // 'dashboard' | 'tasks' | 'calendar' | 'program'
  const [viewMode, setViewMode] = useState('day');
  const [calViewMode, setCalViewMode] = useState('week');
  const [anchorDate, _setAnchorDate] = useState(new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (mainTabParam) setMainTab(mainTabParam);
  }, [mainTabParam]);

  useEffect(() => {
    if (childId && (parentViewing || selfView)) switchToChildProfile(childId);
  }, [childId, parentViewing, selfView, switchToChildProfile]);

  const drawerItems = useMemo(() => [
    { id: 'dashboard', icon: 'home', label: t('tabs.home') },
    { id: 'program', icon: 'today', label: t('tabs.weekPlan') },
    { id: 'tasks', icon: 'checkbox', label: t('tabs.tasks') },
    { id: 'calendar', icon: 'calendar', label: t('tabs.plan') },
    { id: 'chat', icon: 'chatbubbles', label: t('tabs.chat') },
    { id: 'notes', icon: 'document-text', label: t('tabs.notes') },
    { id: 'books', icon: 'library', label: t('tabs.books') },
    { id: 'wishes', icon: 'gift', label: t('tabs.wishes') },
    { id: 'more', icon: 'menu', label: t('tabs.more') },
  ], [t]);

  const drawerActiveId = useMemo(() => {
    if (mainTab === 'tasks') return 'tasks';
    if (mainTab === 'calendar') return 'calendar';
    if (mainTab === 'program') return 'program';
    return 'dashboard';
  }, [mainTab]);

  const onDrawerSelect = useCallback((id) => {
    setDrawerOpen(false);
    if (id === 'dashboard') { setMainTab('dashboard'); return; }
    if (id === 'tasks') { setMainTab('tasks'); return; }
    if (id === 'calendar') { setMainTab('calendar'); return; }
    if (id === 'program') { setMainTab('program'); return; }
    if (childId) switchToChildProfile(childId);
    navigation.replace('Home');
    if (id === 'notes') requestShellTab('notes');
    else if (id === 'chat') requestShellTab('chat');
    else if (id === 'books') requestShellTab('more', 'books');
    else if (id === 'wishes') requestShellTab('more', 'wishes');
    else requestShellTab('more');
  }, [navigation, requestShellTab, childId, switchToChildProfile]);

  // === TOP NAV ===
  const dn = useMemo(() => anchorDate.toLocaleDateString('no-NO', { weekday: 'long' }), [anchorDate]);
  const wk = useMemo(() => getIsoWeekYear(anchorDate), [anchorDate]);

  // Must be declared before useLayoutEffect references `isAdmin`
  const [isAdmin, setIsAdmin] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      header: () => (
        <TopNavBar
          title={CHILD_TAB_META[mainTab]?.kicker || 'Barn'}
          subtitle={`Uke ${wk.week}`}
          showBack={parentViewing}
          onBack={() => navigation.goBack()}
          showMenu
          onMenuPress={() => setDrawerOpen(true)}
          rightIcon={isAdmin ? 'settings-outline' : null}
          onRightIcon={isAdmin ? () => navigation.navigate('ChildSettings', { familyId, child }) : null}
          familyId={familyId}
        />
      ),
    });
  }, [navigation, child?.name, dn, wk.week, wk.year, isAdmin, familyId, child, parentViewing, mainTab]);

  const [allTasks, setAllTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canEdit, setCanEdit] = useState(!!allowEdit);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);

  // Notater
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteDoc, setNoteDoc] = useState({ text: '', timeBlocks: [] });

  // Penge-sekk
  const bagScale = useRef(new Animated.Value(1)).current;
  const bagRef = useRef(null);
  const [bagScreenLayout, setBagScreenLayout] = useState(null);
  const lastBagLayoutRef = useRef(null);

  // Ukeoppsummering
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [attestPanelVisible, setAttestPanelVisible] = useState(false);
  const [selectedAttestDays, setSelectedAttestDays] = useState(() => []);

  // Slette-modal (dashboard)
  const [delModalOpen, setDelModalOpen] = useState(false);
  const [delTask, setDelTask] = useState(null);
  const [delSummary, setDelSummary] = useState({ countAfterAnchor: 0, totalLoss: 0, unit: '' });
  const [detailTask, setDetailTask] = useState(null);

  const bumpBag = useCallback(() => {
    Animated.sequence([
      Animated.timing(bagScale, { toValue: 1.12, duration: 100, useNativeDriver: NATIVE_DRIVER }),
      Animated.spring(bagScale, { toValue: 1, useNativeDriver: NATIVE_DRIVER, speed: 12, bounciness: 6 }),
    ]).start();
  }, [bagScale]);

  /** ---------- Ikon-oppløsning ---------- */
  const [iconUrlMap, setIconUrlMap] = useState({});
  const iconKeyRef = useRef(new Map());
  const inFlightRef = useRef(new Set());

  const putResolved = useCallback((taskId, url) => {
    setIconUrlMap((prev) => (prev[taskId] === url ? prev : { ...prev, [taskId]: url }));
  }, []);

  const resolveIconFor = useCallback(async (task) => {
    const iconUrl = task.iconUrl || null;
    const iconFile = task.iconFile || null;
    const iconKey = `${iconUrl || ''}|${iconFile || ''}`;
    const token = `${task.id}|${iconKey}`;

    if (iconKeyRef.current.get(task.id) === iconKey && iconUrlMap[task.id]) return;
    if (inFlightRef.current.has(token)) return;

    iconKeyRef.current.set(task.id, iconKey);
    inFlightRef.current.add(token);

    try {
      if (Platform.OS === 'web') {
        try { await ensureAppCheckReady(); } catch {}
      }

      let finalUrl = null;

      if (iconUrl && /^https?:\/\//i.test(iconUrl)) {
        finalUrl = iconUrl;
      } else if (iconUrl && /^gs:\/\//i.test(iconUrl)) {
        const clean = iconUrl.replace(/^gs:\/\/[^/]+\//i, '');
        finalUrl = await getDownloadURL(sref(storage, clean));
      } else if (iconFile) {
        finalUrl = await getDownloadURL(sref(storage, `${IKON_MAPPE}/${iconFile}`));
      }

      if (iconKeyRef.current.get(task.id) === iconKey && finalUrl) {
        putResolved(task.id, finalUrl);
      }
    } catch {
      // fallback til placeholder
    } finally {
      inFlightRef.current.delete(token);
    }
  }, [putResolved, storage, iconUrlMap]);
  /** ---------- /Ikon-oppløsning ---------- */

  // Coins
  const [coinBurstKey, setCoinBurstKey] = useState(0);
  const [coinBurstCount, setCoinBurstCount] = useState(0);
  const triggerCoins = useCallback((count) => {
    const c = Math.min(10, Math.max(0, Math.round(count || 0)));
    if (!c || !bagScreenLayout) return;
    setCoinBurstCount(c);
    setCoinBurstKey((k) => k + 1);
    bumpBag();
  }, [bumpBag, bagScreenLayout]);

  // Live-lytting
  useEffect(() => {
    if (!familyId || !childId) return undefined;
    const ref = collection(db, 'families', familyId, 'children', childId, 'todos');
    const qy = query(ref, orderBy('order', 'asc'));

    const unsub = onSnapshot(qy, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || data.name || '',
          type: (data.type || 'daily'),
          rewardType: data.rewardType || ((Number(data.moneyValue || 0) > 0) ? 'money' : 'points'),
          points: data.points || 0,
          moneyValue: data.moneyValue || 0,
          completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
          active: data.active !== false,
          deleted: data.deleted === true,
          seriesKey: data.seriesKey,
          iconUrl: data.iconUrl || null,
          iconFile: data.iconFile || null,
          daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek : undefined,
          skipDates: Array.isArray(data.skipDates) ? data.skipDates : undefined,
          dueDate: data.dueDate || undefined,
          startKey: data.startKey || null,
          endKey: data.endKey || null,
          attestedDates: data.attestedDates || {},
        };
      }).filter((t) => !t.deleted && t.active);

      setAllTasks(items);
      setLoading(false);

      items.forEach(resolveIconFor);
    }, () => setLoading(false));

    return () => unsub();
  }, [familyId, childId, resolveIconFor]);

  // Familiekalender — kun hendelser, ikke gjøremål
  useEffect(() => {
    if (!familyId) return undefined;
    const unsub = onSnapshot(
      collection(db, 'families', familyId, 'events'),
      (snap) => setCalendarEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setCalendarEvents([]),
    );
    return () => unsub();
  }, [familyId]);

  // Admin/tilgang
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid || !familyId) { if (active) { setCanEdit(false); setIsAdmin(false); } return; }
        if (allowEdit) setCanEdit(true);

        let admin = false;
        const topParent = await getDoc(doc(db, 'parents', uid));
        if (topParent.exists() && topParent.data()?.admin === true) admin = true;
        const famParent = await getDoc(doc(db, 'families', familyId, 'parents', uid));
        if (famParent.exists() && famParent.data()?.admin === true) admin = true;
        const famDoc = await getDoc(doc(db, 'families', familyId));
        const admins = famDoc.exists() ? (famDoc.data()?.adminUids || []) : [];
        if (Array.isArray(admins) && admins.includes(uid)) admin = true;

        if (active) setIsAdmin(admin);
        const isTop = topParent.exists() && topParent.data()?.familyId === familyId;
        const isSub = famParent.exists();
        if (active && (isTop || isSub)) setCanEdit(true);
      } catch {
        if (active) { setCanEdit(false); setIsAdmin(false); }
      }
    })();
    return () => { active = false; };
  }, [familyId, allowEdit]);

  // Reset til dashboard kun ved bytte til nytt barn utenfra (ikke via profil-bryter)
  useEffect(() => {
    if (route.params?.preserveTabOnChildSwitch) {
      navigation.setParams({ preserveTabOnChildSwitch: undefined });
      return;
    }
    setMainTab(mainTabParam || 'dashboard');
    setViewMode('day');
    _setAnchorDate(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  // Notat
  const loadDailyNote = useCallback(async () => {
    if (!familyId || !childId) return;
    setNoteLoading(true);
    try {
      const k = dateKey(anchorDate);
      const ref = doc(db, 'families', familyId, 'children', childId, 'dailyNotes', k);
      const s = await getDoc(ref);
      if (s.exists()) {
        const d = s.data() || {};
        setNoteDoc({ text: d.text || '', timeBlocks: Array.isArray(d.timeBlocks) ? d.timeBlocks : [] });
      } else {
        setNoteDoc({ text: '', timeBlocks: [] });
      }
    } finally { setNoteLoading(false); }
  }, [familyId, childId, anchorDate]);
  useEffect(() => { loadDailyNote(); }, [loadDailyNote]);
  useFocusEffect(useCallback(() => { loadDailyNote(); }, [loadDailyNote]));

  // Reward week + mode from child doc
  const [rewardMode, setRewardMode] = useState(child?.rewardMode || 'points');
  const [weeklyBudget, setWeeklyBudget] = useState(Number(child?.weeklyBudget || 0));
  const [budgetPeriod, setBudgetPeriod] = useState('week');
  useEffect(() => {
    if (!familyId || !childId) return;
    getDoc(doc(db, 'families', familyId, 'children', childId)).then((s) => {
      if (s.exists()) {
        const d = s.data();
        if (d.rewardMode) setRewardMode(d.rewardMode);
        if (typeof d.budget !== 'undefined') setWeeklyBudget(Number(d.budget || 0));
        else if (typeof d.weeklyBudget !== 'undefined') setWeeklyBudget(Number(d.weeklyBudget || 0));
        if (d.budgetPeriod) setBudgetPeriod(d.budgetPeriod);
      }
    }).catch(() => {});
  }, [familyId, childId]);

  // Datoer/keys — ISO-uke (mandag–søndag)
  const weekDates = useMemo(() => {
    const s = startOfWeekMonday(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchorDate]);
  const weekKeys = useMemo(() => weekDates.map(dateKey), [weekDates]);

  // Verdi for task — only count tasks matching the child's reward mode
  const valueForTask = useCallback((t) => {
    const tMode = t.rewardType || 'points';
    if (tMode !== rewardMode) return 0;
    return rewardMode === 'money' ? Number(t.moneyValue || 0) : Number(t.points || 0);
  }, [rewardMode]);

  // Summer per dag (opptjent)
  const perDayTotals = useMemo(() => {
    const totals = Object.fromEntries(weekKeys.map((k) => [k, 0]));
    for (const t of allTasks) {
      const v = valueForTask(t);
      const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
      for (const k of completed) {
        if (k in totals) {
          const d = parseDateKey(k);
          if (appliesOnDate(t, d)) totals[k] += v;
        }
      }
    }
    Object.keys(totals).forEach((k) => { totals[k] = Math.max(0, Math.round(totals[k])); });
    return totals;
  }, [allTasks, weekKeys, valueForTask]);

  // Summer per dag (mulig)
  const perDayPossible = useMemo(() => {
    const totals = Object.fromEntries(weekKeys.map((k) => [k, 0]));
    for (const d of weekDates) {
      const k = dateKey(d);
      for (const t of allTasks) {
        if (appliesOnDate(t, d)) totals[k] += valueForTask(t);
      }
    }
    Object.keys(totals).forEach((k) => { totals[k] = Math.max(0, Math.round(totals[k])); });
    return totals;
  }, [allTasks, weekDates, weekKeys, valueForTask]);

  const weekPossibleTotal = useMemo(
    () => weekKeys.reduce((a, k) => a + (perDayPossible[k] || 0), 0),
    [perDayPossible, weekKeys],
  );

  // Sum i sekk
  const earnedSum = useMemo(() => {
    if (viewMode === 'day') return perDayTotals[dateKey(anchorDate)] || 0;
    return weekKeys.reduce((a, k) => a + (perDayTotals[k] || 0), 0);
  }, [perDayTotals, viewMode, anchorDate, weekKeys]);

  // Liste for valgt dag
  const tasksForDay = useMemo(
    () => allTasks.filter((t) => appliesOnDate(t, anchorDate)),
    [allTasks, anchorDate],
  );

  // For label (kr/poeng)
  const tasksForSelectionLabel = useMemo(() => {
    if (viewMode === 'day') return tasksForDay;
    return allTasks.filter((t) => weekDates.some((d) => appliesOnDate(t, d)));
  }, [viewMode, tasksForDay, allTasks, weekDates]);

  const bagLabel = useMemo(() => {
    const unit = rewardMode === 'money' ? 'kr' : 'p';
    return `${earnedSum} ${unit}`;
  }, [earnedSum, rewardMode]);

  const bagUnit = useMemo(() => (
    rewardMode === 'money' ? 'kr' : 'poeng'
  ), [rewardMode]);

  // Tvungen refresh
  const refreshData = useCallback(async () => {
    if (!familyId || !childId) return;
    const ref = collection(db, 'families', familyId, 'children', childId, 'todos');
    const qy = query(ref, orderBy('order', 'asc'));
    const snap = await getDocs(qy);
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || data.name || '',
        type: (data.type || 'daily'),
        rewardType: data.rewardType || ((Number(data.moneyValue || 0) > 0) ? 'money' : 'points'),
        points: data.points || 0,
        moneyValue: data.moneyValue || 0,
        completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
        active: data.active !== false,
        deleted: data.deleted === true,
        seriesKey: data.seriesKey,
        iconUrl: data.iconUrl || null,
        iconFile: data.iconFile || null,
        daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek : undefined,
        skipDates: Array.isArray(data.skipDates) ? data.skipDates : undefined,
        dueDate: data.dueDate || undefined,
        startKey: data.startKey || null,
        endKey: data.endKey || null,
        attestedDates: data.attestedDates || {},
      };
    }).filter((t) => !t.deleted && t.active);
    setAllTasks(items);
    items.forEach(resolveIconFor);
  }, [familyId, childId, resolveIconFor]);

  // Popup «Gratulerer»
  const [congratsVisible, setCongratsVisible] = useState(false);
  const [lastEarned, setLastEarned] = useState(0);
  const closeCongrats = useCallback(() => {
    setCongratsVisible(false);
    setCoinBurstCount(0);
    refreshData();
  }, [refreshData]);

  // Toggle
  const [pendingMap, setPendingMap] = useState(() => new Set());
  const toggleComplete = useCallback(async (task) => {
    if (!familyId || !childId) return;
    if (!appliesOnDate(task, anchorDate)) return;

    const k = dateKey(anchorDate);
    if (isFutureDate(anchorDate) && !isAdmin) {
      Alert.alert(
        'Ikke ennå',
        'Du kan bare fullføre gjøremål for i dag eller tidligere dager.',
      );
      return;
    }

    const isDoneNow = Array.isArray(task.completedDates) && task.completedDates.includes(k);

    if (!isDoneNow) {
      const value = Math.round(valueForTask(task));
      const coinCount = Math.min(10, Math.max(0, value));
      if (coinCount > 0) {
        setLastEarned(value);
        triggerCoins(coinCount);
        setCongratsVisible(true);
      } else if (Haptics && Platform.OS === 'ios') { try { Haptics.selectionAsync(); } catch {} }
      if (Haptics && Platform.OS === 'ios') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    } else {
      if (Haptics && Platform.OS === 'ios') { try { Haptics.selectionAsync(); } catch {} }
    }

    // Optimistisk UI
    setAllTasks((prev) => prev.map((t) => {
      if (t.id !== task.id) return t;
      const cd = Array.isArray(t.completedDates) ? t.completedDates.slice(0) : [];
      const idx = cd.indexOf(k);
      if (isDoneNow && idx > -1) cd.splice(idx, 1);
      if (!isDoneNow && idx === -1) cd.push(k);
      const ad = { ...(t.attestedDates || {}) };
      // If task is unchecked, attestation for that day must be removed
      if (isDoneNow && ad[k]) delete ad[k];
      return { ...t, completedDates: cd, attestedDates: ad };
    }));
    setPendingMap((p) => { const n = new Set(p); n.add(task.id); return n; });

    const ref = doc(db, 'families', familyId, 'children', childId, 'todos', task.id);
    try {
      if (isDoneNow) {
        await updateDoc(ref, {
          completedDates: arrayRemove(k),
          [`attestedDates.${k}`]: deleteField(),
        });
      }
      else await updateDoc(ref, { completedDates: arrayUnion(k) });
      if (!isDoneNow) {
        notifyParentsAttestPending(familyId, childId, task, k, {
          childName: child?.name || null,
        }).catch(() => {});
      }
    } catch {
      // revert
      setAllTasks((prev) => prev.map((t) => {
        if (t.id !== task.id) return t;
        const cd = Array.isArray(t.completedDates) ? t.completedDates.slice(0) : [];
        const idx = cd.indexOf(k);
        if (!isDoneNow && idx > -1) cd.splice(idx, 1);
        if (isDoneNow && idx === -1) cd.push(k);
        const ad = { ...(t.attestedDates || {}) };
        // revert attestation removal if db update failed
        if (isDoneNow && task.attestedDates?.[k]) ad[k] = task.attestedDates[k];
        return { ...t, completedDates: cd, attestedDates: ad };
      }));
      Alert.alert('Nettverksfeil', 'Klarte ikke oppdatere. Prøv igjen.');
    } finally {
      setPendingMap((p) => { const n = new Set(p); n.delete(task.id); return n; });
    }
  }, [familyId, childId, anchorDate, triggerCoins, valueForTask, isAdmin, child?.name]);

  const kForAnchor = useMemo(() => dateKey(anchorDate), [anchorDate]);
  const anchorIsFuture = useMemo(() => isFutureDate(anchorDate), [anchorDate]);

  // Attestering
  const attestTask = useCallback(async (task, k) => {
    if (!familyId || !childId || !isAdmin) return;
    const uid = auth.currentUser?.uid;
    const ref = doc(db, 'families', familyId, 'children', childId, 'todos', task.id);
    try {
      await updateDoc(ref, {
        [`attestedDates.${k}`]: {
          by: uid,
          name: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
          at: serverTimestamp(),
        },
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke attestere.');
    }
  }, [familyId, childId, isAdmin]);

  const undoAttestTask = useCallback(async (task, k) => {
    if (!familyId || !childId || !isAdmin) return;
    const ref = doc(db, 'families', familyId, 'children', childId, 'todos', task.id);
    try {
      await updateDoc(ref, {
        [`attestedDates.${k}`]: deleteField(),
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke angre attestering.');
    }
  }, [familyId, childId, isAdmin]);

  const attestAllForWeek = useCallback(async () => {
    if (!familyId || !childId || !isAdmin) return;
    const uid = auth.currentUser?.uid;
    const adminName = auth.currentUser?.displayName || auth.currentUser?.email || 'Admin';
    const updates = [];
    for (const t of allTasks) {
      const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
      const attested = t.attestedDates || {};
      for (const k of completed) {
        if (weekKeys.includes(k) && !attested[k]) {
          updates.push({ taskId: t.id, k });
        }
      }
    }
    if (updates.length === 0) { Alert.alert('Alt attestert', 'Alle gjøremål denne uken er allerede attestert.'); return; }
    try {
      await Promise.all(updates.map(({ taskId, k }) =>
        updateDoc(doc(db, 'families', familyId, 'children', childId, 'todos', taskId), {
          [`attestedDates.${k}`]: { by: uid, name: adminName, at: serverTimestamp() },
        })
      ));
      Alert.alert('Attestert', `${updates.length} gjøremål er attestert for denne uken.`);
    } catch {
      Alert.alert('Feil', 'Klarte ikke attestere alle.');
    }
  }, [familyId, childId, isAdmin, allTasks, weekKeys]);

  // Attestation stats for week
  const weekAttestStats = useMemo(() => {
    let completed = 0;
    let attested = 0;
    for (const t of allTasks) {
      const cd = Array.isArray(t.completedDates) ? t.completedDates : [];
      const ad = t.attestedDates || {};
      for (const k of cd) {
        if (weekKeys.includes(k)) {
          completed += 1;
          if (ad[k]) attested += 1;
        }
      }
    }
    return { completed, attested, pending: completed - attested };
  }, [allTasks, weekKeys]);

  useEffect(() => {
    if (!attestPanelVisible) return;
    setSelectedAttestDays(weekKeys);
  }, [attestPanelVisible, weekKeys]);

  const toggleSelectedAttestDay = useCallback((k) => {
    setSelectedAttestDays((prev) => (
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    ));
  }, []);

  const bulkAttestForSelectedDays = useCallback(async () => {
    if (!familyId || !childId || !isAdmin || selectedAttestDays.length === 0) return;
    const uid = auth.currentUser?.uid;
    const adminName = auth.currentUser?.displayName || auth.currentUser?.email || 'Admin';
    const updates = [];
    for (const t of allTasks) {
      const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
      const attested = t.attestedDates || {};
      for (const k of selectedAttestDays) {
        if (completed.includes(k) && !attested[k]) updates.push({ taskId: t.id, k });
      }
    }
    if (updates.length === 0) {
      Alert.alert('Ingen treff', 'Ingen fullførte gjøremål å attestere for valgte dager.');
      return;
    }
    try {
      await Promise.all(updates.map(({ taskId, k }) => (
        updateDoc(doc(db, 'families', familyId, 'children', childId, 'todos', taskId), {
          [`attestedDates.${k}`]: { by: uid, name: adminName, at: serverTimestamp() },
        })
      )));
      Alert.alert('Ferdig', `Attesterte ${updates.length} gjøremål.`);
    } catch {
      Alert.alert('Feil', 'Klarte ikke attestere valgte dager.');
    }
  }, [familyId, childId, isAdmin, selectedAttestDays, allTasks]);

  const bulkUndoAttestForSelectedDays = useCallback(async () => {
    if (!familyId || !childId || !isAdmin || selectedAttestDays.length === 0) return;
    const updates = [];
    for (const t of allTasks) {
      const attested = t.attestedDates || {};
      for (const k of selectedAttestDays) {
        if (attested[k]) updates.push({ taskId: t.id, k });
      }
    }
    if (updates.length === 0) {
      Alert.alert('Ingen treff', 'Ingen attesteringer å angre for valgte dager.');
      return;
    }
    try {
      await Promise.all(updates.map(({ taskId, k }) => (
        updateDoc(doc(db, 'families', familyId, 'children', childId, 'todos', taskId), {
          [`attestedDates.${k}`]: deleteField(),
        })
      )));
      Alert.alert('Ferdig', `Angret ${updates.length} attestering(er).`);
    } catch {
      Alert.alert('Feil', 'Klarte ikke angre attesteringer for valgte dager.');
    }
  }, [familyId, childId, isAdmin, selectedAttestDays, allTasks]);

  // VIKTIG: send editTodoId (ikke todoId)
  const onEditTask = useCallback((task, k) => {
    navigation.navigate(ADD_TODO_ROUTE, { familyId, child, todo: task, editTodoId: task.id, currentDateKey: k });
  }, [navigation, familyId, child]);

  // === Dashboard-slettemodal ===
  const openDeleteModal = useCallback((task) => {
    if (!isAdmin) { Alert.alert('Ingen tilgang', 'Kun administrator kan slette.'); return; }
    const k = dateKey(anchorDate);
    const after = (Array.isArray(task.completedDates) ? task.completedDates : []).filter((x) => x >= k);
    const val = task.rewardType === 'money' ? Math.round(Number(task.moneyValue || 0)) : Math.round(Number(task.points || 0));
    setDelTask(task);
    setDelSummary({
      countAfterAnchor: after.length,
      totalLoss: after.length * Math.max(0, val),
      unit: task.rewardType === 'money' ? 'kr' : 'poeng',
    });
    setDelModalOpen(true);
  }, [anchorDate, isAdmin]);

  const stopSeriesFromAnchor = useCallback(async () => {
    if (!delTask) return;
    try {
      const k = dateKey(anchorDate);
      const ref = doc(db, 'families', familyId, 'children', childId, 'todos', delTask.id);
      await updateDoc(ref, { endKey: prevDayKey(k), updatedAt: serverTimestamp() });
      setDelModalOpen(false);
    } catch {
      Alert.alert('Feil', 'Klarte ikke stoppe serien.');
    }
  }, [delTask, anchorDate, familyId, childId]);

  // NY: slett engangsoppgave (uansett fullført/ikke)
  const deleteOnceTask = useCallback(async () => {
    if (!delTask) return;
    try {
      const ref = doc(db, 'families', familyId, 'children', childId, 'todos', delTask.id);
      await updateDoc(ref, { deleted: true, updatedAt: serverTimestamp() });
      setDelModalOpen(false);
    } catch {
      Alert.alert('Feil', 'Klarte ikke slette oppgaven.');
    }
  }, [delTask, familyId, childId]);

  const renderItem = useCallback(({ item }) => {
    const isPending = pendingMap.has(item.id);
    const resolvedIcon = iconUrlMap[item.id] || null;
    const toggleDisabled = !appliesOnDate(item, anchorDate)
      || (anchorIsFuture && !isAdmin);
    const iconEmoji = item.iconFile
      ? (ICON_EMOJI[item.iconFile] || todoEmoji(item))
      : todoEmoji(item);

    return (
      <TaskRow
        itemId={item.id}
        title={item.title}
        type={item.type}
        rewardType={item.rewardType}
        points={item.points}
        moneyValue={item.moneyValue}
        completedDates={item.completedDates}
        attestedDates={item.attestedDates}
        k={kForAnchor}
        canEdit={canEdit}
        isAdmin={isAdmin}
        pending={isPending}
        iconUrl={resolvedIcon}
        iconEmoji={iconEmoji}
        toggleDisabled={toggleDisabled}
        onToggle={() => { if (!isPending && !toggleDisabled) toggleComplete(item); }}
        onAttest={() => attestTask(item, kForAnchor)}
        onUndoAttest={() => undoAttestTask(item, kForAnchor)}
        onEdit={() => onEditTask(item, kForAnchor)}
        onDelete={() => openDeleteModal(item)}
        onOpen={() => setDetailTask(item)}
      />
    );
  }, [pendingMap, kForAnchor, canEdit, isAdmin, toggleComplete, attestTask, undoAttestTask, onEditTask, iconUrlMap, anchorDate, anchorIsFuture, openDeleteModal]);

  const allDoneToday = tasksForDay.length > 0 && tasksForDay.every(
    (t) => Array.isArray(t.completedDates) && t.completedDates.includes(dateKey(anchorDate))
  );

  const Empty = useCallback(() => (
    <View style={styles.emptyWrap}>
      <Text style={{ fontSize: 48, textAlign: 'center' }}>🎯</Text>
      <Text style={styles.emptyTitle}>Ingen oppgaver denne dagen</Text>
      <Text style={styles.emptyText}>Nye oppgaver legges inn av en voksen — snart er det din tur!</Text>
    </View>
  ), []);

  // === UKEOPPSUMMERING-DATA ===
  const weekTaskBreakdown = useMemo(() => {
    const out = [];
    for (const t of allTasks) {
      const v = valueForTask(t);
      const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
      const possibleCount = weekDates.filter((d) => appliesOnDate(t, d)).length;
      let completedCount = 0;
      for (const k of completed) {
        if (weekKeys.includes(k)) {
          const d = parseDateKey(k);
          if (appliesOnDate(t, d)) completedCount += 1;
        }
      }
      const earnedSum = Math.round(completedCount * v);
      const possibleSum = Math.round(possibleCount * v);
      if (possibleCount > 0) {
        out.push({
          id: t.id,
          title: t.title || 'Gjøremål',
          earnedSum, possibleSum,
          completed: completedCount, possibleCount,
          rewardType: t.rewardType || 'points',
        });
      }
    }
    out.sort((a, b) => b.earnedSum - a.earnedSum);
    return out;
  }, [allTasks, weekKeys, weekDates, valueForTask]);

  // Header
  const HeaderBlock = useMemo(() => function Comp() {
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];

    const onBagLayout = () => {
      if (!bagRef.current?.measureInWindow) return;
      try {
        bagRef.current.measureInWindow((x, y, w, h) => {
          const next = { x, y, width: w, height: h };
          const last = lastBagLayoutRef.current;
          if (
            !last ||
            last.x !== next.x || last.y !== next.y ||
            last.width !== next.width || last.height !== next.height
          ) {
            lastBagLayoutRef.current = next;
            setBagScreenLayout(next);
          }
        });
      } catch {}
    };

    return (
      <View style={styles.headerOuter}>
        <View style={styles.header}>
          <View style={styles.leftHeader}>
            <View style={styles.modeSwitch}>
              <TouchableOpacity style={[styles.modeBtn, viewMode === 'day' && styles.modeBtnActive]} onPress={() => setViewMode('day')}>
                <Text style={[styles.modeText, viewMode === 'day' && styles.modeTextActive]}>Dag</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeBtn, viewMode === 'week' && styles.modeBtnActive]} onPress={() => setViewMode('week')}>
                <Text style={[styles.modeText, viewMode === 'week' && styles.modeTextActive]}>Uke</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dateRow}>
              <TouchableOpacity onPress={() => _setAnchorDate((d) => addDays(d, viewMode === 'day' ? -1 : -7))}>
                <Ionicons name="chevron-back" size={22} color="#0b74d1" />
              </TouchableOpacity>

              {viewMode === 'day' ? (
                <Text style={styles.dateText}>
                  {anchorDate.toLocaleDateString('no-NO', { weekday: 'long', day: '2-digit', month: 'short' })}
                </Text>
              ) : (
                <Text style={styles.dateText}>
                  {weekStart.toLocaleDateString('no-NO', { day: '2-digit', month: 'short' })} – {weekEnd.toLocaleDateString('no-NO', { day: '2-digit', month: 'short' })}
                </Text>
              )}

              <TouchableOpacity onPress={() => _setAnchorDate((d) => addDays(d, viewMode === 'day' ? 1 : 7))}>
                <Ionicons name="chevron-forward" size={22} color="#0b74d1" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.todayBtn} onPress={() => _setAnchorDate(new Date())}>
                <Text style={styles.todayText}>I dag</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Pressable onPress={() => setSummaryVisible(true)} style={{ marginLeft: 10, alignItems: 'center' }}>
            <Animated.View
              ref={bagRef}
              style={[styles.pointsBag, { transform: [{ scale: bagScale }] }]}
              onLayout={onBagLayout}
            >
              <MaterialCommunityIcons name="bag-personal" size={22} color="#fff" />
              <Text style={styles.pointsText}>{bagLabel}</Text>
            </Animated.View>
            <Text style={styles.bagOfTotal}>av {viewMode === 'day' ? (perDayPossible[dateKey(anchorDate)] || 0) : weekPossibleTotal}</Text>
          </Pressable>
        </View>

        {viewMode === 'week' && (
          <View style={styles.weekStrip}>
            {weekDates.map((d) => {
              const dk = dateKey(d);
              const val = perDayTotals[dk] || 0;
              const isAnchor = sameDay(d, anchorDate);
              const isTodayDay = isToday(d);
              return (
                <TouchableOpacity
                  key={dk}
                  style={[
                    styles.dayCell,
                    isTodayDay && styles.dayCellToday,
                    isAnchor && styles.dayCellActive,
                    isTodayDay && isAnchor && styles.dayCellTodayAnchor,
                  ]}
                  onPress={() => _setAnchorDate(d)}
                >
                  <Text style={[
                    styles.dayCellDow,
                    isTodayDay && styles.dayCellDowToday,
                    isAnchor && styles.dayCellDowActive,
                  ]}
                  >
                    {d.toLocaleDateString('no-NO', { weekday: 'short' }).replace('.', '')}
                  </Text>
                  <Text style={[
                    styles.dayCellDate,
                    isTodayDay && styles.dayCellDateToday,
                    isAnchor && styles.dayCellDateActive,
                  ]}
                  >
                    {d.getDate()}
                  </Text>
                  {isTodayDay && !isAnchor && (
                    <Text style={styles.dayCellTodayLbl}>I dag</Text>
                  )}
                  <Text style={[
                    styles.dayCellPts,
                    isTodayDay && styles.dayCellPtsToday,
                    isAnchor && styles.dayCellPtsActive,
                  ]}
                  >
                    {val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {anchorIsFuture && !isAdmin && (
          <View style={styles.futureHint}>
            <Ionicons name="information-circle-outline" size={16} color="#92400e" />
            <Text style={styles.futureHintTxt}>
              Fremtidige dager kan vises, men gjøremål kan bare fullføres for i dag eller tidligere.
            </Text>
          </View>
        )}

        <View style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Gjøremål</Text>
          {isAdmin && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#fde68a' }}
              onPress={() => setAttestPanelVisible(true)}
            >
              <Ionicons name="shield-checkmark" size={16} color="#d97706" />
              <Text style={{ fontWeight: '800', color: '#92400e', fontSize: 12 }}>
                Attestering {weekAttestStats.pending > 0 ? `(${weekAttestStats.pending})` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate, isAdmin, viewMode, bagScale, bagLabel, perDayTotals, weekDates, weekAttestStats]);

  // Kalender-fane — familiehendelser (møter, aktiviteter), ikke gjøremål
  const openCalendarEvent = useCallback((ev, occurrenceDateKey) => {
    const readOnly = isAdmin
      ? !!ev.readOnly
      : (childCalendarEventReadOnly({
        isChild: childViewer,
        calendarSelfEdit,
        isParentViewer: isAdmin,
      }) || !!ev.readOnly);
    navigation.navigate(ADD_EVENT_ROUTE, {
      familyId,
      event: { ...ev, occurrenceDateKey, readOnly },
    });
  }, [navigation, familyId, isAdmin, childViewer, calendarSelfEdit]);

  const CalendarTab = useMemo(() => {
    const calWeekDates = weekDates;
    const anchorKey = dateKey(anchorDate);
    const iso = getIsoWeekYear(anchorDate);
    const monthDays = monthGrid(anchorDate);

    const eventsForDay = (d) => calendarEvents
      .filter((e) => eventOccursOnDate(e, d))
      .filter((e) => eventVisibleToUser(e, [child?.uid, childId, child?.childId], {
        asChild: true,
        members,
      }))
      .slice()
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

    const dayEvents = eventsForDay(anchorDate);
    const dayLabel = anchorDate.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'short' });

    const calShift = (dir) => {
      if (calViewMode === 'month') {
        _setAnchorDate((d) => {
          const next = new Date(d.getFullYear(), d.getMonth() + dir, 1);
          const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(d.getDate(), lastDay));
          return next;
        });
      } else if (calViewMode === 'week') {
        _setAnchorDate((d) => addDays(d, dir * 7));
      } else {
        _setAnchorDate((d) => addDays(d, dir));
      }
    };

    const navLabel = (() => {
      if (calViewMode === 'month') {
        return `${MONTHS_NO[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
      }
      if (calViewMode === 'week') {
        const ws = calWeekDates[0];
        const we = calWeekDates[6];
        const monthPart = ws.getMonth() === we.getMonth()
          ? MONTHS_NO[ws.getMonth()].slice(0, 3).toLowerCase()
          : `${MONTHS_NO[ws.getMonth()].slice(0, 3).toLowerCase()}–${MONTHS_NO[we.getMonth()].slice(0, 3).toLowerCase()}`;
        return `Uke ${iso.week} · ${ws.getDate()}.–${we.getDate()}. ${monthPart}`;
      }
      return `${dayLabel} · Uke ${iso.week}`;
    })();

    const canOpenCalendar = isAdmin || childViewer;

    const renderEventList = (events, emptyText) => (
      events.length === 0 ? (
        <View style={styles.calTask}>
          <Text style={{ color: '#6b7280' }}>{emptyText}</Text>
        </View>
      ) : events.map((ev) => (
        <TouchableOpacity
          key={`${ev.id}-${anchorKey}`}
          style={styles.calTask}
          onPress={() => {
            if (canOpenCalendar) openCalendarEvent(ev, anchorKey);
          }}
          disabled={!canOpenCalendar}
        >
          <View style={[styles.calEventDot, { backgroundColor: ev.color || '#0b74d1' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.calTaskTitle}>{ev.title || 'Hendelse'}</Text>
            <Text style={styles.calTaskSub}>
              {ev.startTime && ev.endTime
                ? `${ev.startTime}–${ev.endTime}`
                : ev.startTime || 'Hele dagen'}
              {ev.place ? ` · ${ev.place}` : ''}
              {ev.recurring ? ' · Gjentas' : ''}
            </Text>
          </View>
          {canOpenCalendar && <Ionicons name="chevron-forward" size={18} color="#0b74d1" />}
        </TouchableOpacity>
      ))
    );

    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: contentPaddingBottom }}>
        <Text style={styles.calTitle}>Kalender</Text>
        <Text style={styles.calSub}>Møter og planlagte aktiviteter — gjøremål finner du under Gjøremål-fanen.</Text>

        <View style={styles.calModeSwitch}>
          {[['day', 'Dag'], ['week', 'Uke'], ['month', 'Måned']].map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              style={[styles.calModeBtn, calViewMode === mode && styles.calModeBtnActive]}
              onPress={() => setCalViewMode(mode)}
            >
              <Text style={[styles.calModeText, calViewMode === mode && styles.calModeTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.calNavRow}>
          <TouchableOpacity onPress={() => calShift(-1)} style={styles.calNavBtn}>
            <Ionicons name="chevron-back" size={22} color="#0b74d1" />
          </TouchableOpacity>
          <View style={styles.calNavCenter}>
            <Text style={styles.calWeekBadge}>Uke {iso.week}</Text>
            <Text style={styles.calNavLabel} numberOfLines={2}>{navLabel}</Text>
          </View>
          <TouchableOpacity onPress={() => calShift(1)} style={styles.calNavBtn}>
            <Ionicons name="chevron-forward" size={22} color="#0b74d1" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.calTodayBtn} onPress={() => _setAnchorDate(new Date())}>
          <Text style={styles.calTodayTxt}>I dag</Text>
        </TouchableOpacity>

        {calViewMode === 'week' && (
          <>
            <Text style={[styles.calTitle, { marginTop: 12 }]}>Ukeoversikt</Text>
            <View style={styles.calGrid}>
              {calWeekDates.map((d) => {
                const k = dateKey(d);
                const eventCnt = calendarEvents
                  .filter((e) => eventOccursOnDate(e, d))
                  .filter((e) => eventVisibleToUser(e, [child?.uid, childId, child?.childId], {
                    asChild: true,
                    members,
                  }))
                  .length;
                const isTodayDay = dateKey(new Date()) === k;
                const isAnchor = anchorKey === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.calCell, isTodayDay && styles.calCellToday, isAnchor && styles.calCellAnchor]}
                    onPress={() => _setAnchorDate(d)}
                  >
                    <Text style={[styles.calDow, isTodayDay && styles.calDowToday]}>
                      {d.toLocaleDateString('no-NO', { weekday: 'short' }).replace('.', '').toUpperCase()}
                    </Text>
                    <Text style={[styles.calDate, isTodayDay && styles.calDateToday]}>{d.getDate()}</Text>
                    {eventCnt > 0 ? (
                      <>
                        <Text style={styles.calPts}>{eventCnt}</Text>
                        <View style={styles.calBar}>
                          <View style={[styles.calBarFill, { width: '100%' }]} />
                        </View>
                      </>
                    ) : (
                      <Text style={styles.calEmpty}>–</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {calViewMode === 'month' && (
          <>
            <View style={styles.calMonthHead}>
              {WEEKDAYS_SHORT.map((d) => <Text key={d} style={styles.calMonthHeadTxt}>{d}</Text>)}
            </View>
            <View style={styles.calMonthGrid}>
              {monthDays.map((d) => {
                const k = dateKey(d);
                const eventCnt = calendarEvents
                  .filter((e) => eventOccursOnDate(e, d))
                  .filter((e) => eventVisibleToUser(e, [child?.uid, childId, child?.childId], {
                    asChild: true,
                    members,
                  }))
                  .length;
                const isTodayDay = dateKey(new Date()) === k;
                const isAnchor = anchorKey === k;
                const outside = !isSameMonth(d, anchorDate);
                return (
                  <TouchableOpacity
                    key={k}
                    style={[
                      styles.calMonthCell,
                      isTodayDay && !isAnchor && styles.calMonthCellToday,
                      isAnchor && styles.calMonthCellAnchor,
                      outside && styles.calMonthCellOutside,
                    ]}
                    onPress={() => _setAnchorDate(d)}
                  >
                    <Text style={[
                      styles.calMonthDate,
                      isAnchor && styles.calMonthDateAnchor,
                      isTodayDay && !isAnchor && styles.calMonthDateToday,
                    ]}
                    >
                      {d.getDate()}
                    </Text>
                    {eventCnt > 0 && (
                      <View style={styles.calMonthDots}>
                        {Array.from({ length: Math.min(eventCnt, 3) }).map((_, i) => (
                          <View key={i} style={[styles.calMonthDot, isAnchor && styles.calMonthDotAnchor]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.calTitle, { marginTop: 16 }]}>
          {calViewMode === 'week' ? 'Hendelser denne uken' : `Hendelser · ${dayLabel}`}
        </Text>
        {calViewMode === 'week' ? (
          calWeekDates.every((d) => !eventsForDay(d).length) ? (
            <View style={styles.calTask}>
              <Text style={{ color: '#6b7280' }}>Ingen kalenderhendelser denne uken.</Text>
            </View>
          ) : calWeekDates.map((d) => {
            const evs = eventsForDay(d);
            if (!evs.length) return null;
            const lbl = d.toLocaleDateString('no-NO', { weekday: 'short', day: 'numeric', month: 'short' });
            return (
              <View key={dateKey(d)} style={{ marginBottom: 12 }}>
                <TouchableOpacity onPress={() => _setAnchorDate(d)}>
                  <Text style={[styles.calWeekDayLbl, anchorKey === dateKey(d) && { color: '#0b74d1' }]}>{lbl}</Text>
                </TouchableOpacity>
                {evs.map((ev) => (
                  <TouchableOpacity
                    key={`${ev.id}-${dateKey(d)}`}
                    style={styles.calTask}
                    onPress={() => {
                      _setAnchorDate(d);
                      if (canOpenCalendar) openCalendarEvent(ev, dateKey(d));
                    }}
                  >
                    <View style={[styles.calEventDot, { backgroundColor: ev.color || '#0b74d1' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.calTaskTitle}>{ev.title || 'Hendelse'}</Text>
                      <Text style={styles.calTaskSub}>
                        {ev.startTime && ev.endTime
                          ? `${ev.startTime}–${ev.endTime}`
                          : ev.startTime || 'Hele dagen'}
                        {ev.place ? ` · ${ev.place}` : ''}
                      </Text>
                    </View>
                    {canOpenCalendar && (
                      <Ionicons name="chevron-forward" size={18} color="#0b74d1" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            );
          })
        ) : (
          renderEventList(dayEvents, 'Ingen kalenderhendelser denne dagen.')
        )}
      </ScrollView>
    );
  }, [weekDates, calendarEvents, anchorDate, calViewMode, isAdmin, familyId, openCalendarEvent, contentPaddingBottom, child, childId, members, childViewer, childCanEditCalendar]);

  // Render program tab (notes / homework)
  // Load school schedule preview
  const [scheduleData, setScheduleData] = useState(null);
  useEffect(() => {
    if (!familyId || !childId) return;
    getDoc(doc(db, 'families', familyId, 'children', childId, 'meta', 'schedule'))
      .then((snap) => { if (snap.exists()) setScheduleData(snap.data()); })
      .catch(() => {});
  }, [familyId, childId]);

  const todayDayKey = (() => {
    const d = new Date().getDay(); // 0=sun,1=mon,...
    return ['sun','mon','tue','wed','thu','fri','sat'][d] || 'mon';
  })();
  const todayScheduleSlots = scheduleData?.timetable?.[todayDayKey] || [];

  const ProgramTab = useMemo(() => (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: contentPaddingBottom }}>

      {/* Timeplan-seksjon */}
      <View style={styles.scheduleCardHeader}>
        <Text style={styles.calTitle}>📚 Timeplan</Text>
        <TouchableOpacity
          style={styles.scheduleEditBtn}
          onPress={() => navigation.navigate('ChildSchedule', childScheduleNavParams({ familyId, child, canEdit: canEdit || isAdmin }))}
        >
          <MaterialCommunityIcons name={canEdit ? 'pencil-outline' : 'eye-outline'} size={16} color="#0b74d1" />
          <Text style={styles.scheduleEditTxt}>{canEdit || isAdmin ? 'Rediger' : 'Vis'}</Text>
        </TouchableOpacity>
      </View>

      {scheduleData?.mode === 'photo' && scheduleData?.photoUrl ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('ChildSchedule', childScheduleNavParams({ familyId, child, canEdit: canEdit || isAdmin }))}
          style={styles.schedulePhotoPreviewWrap}
        >
          <Image source={{ uri: scheduleData.photoUrl }} style={styles.schedulePhotoPreview} resizeMode="contain" />
          <Text style={styles.schedulePhotoHint}>Trykk for å se full timeplan</Text>
        </TouchableOpacity>
      ) : todayScheduleSlots.length > 0 ? (
        todayScheduleSlots.slice(0, 6).map((slot, idx) => (
          <View key={`${slot.time}-${idx}`} style={styles.programRow}>
            <View style={styles.programTime}>
              <Text style={styles.programTimeTxt}>
                {slot.endTime ? `${slot.time || '--:--'}–${slot.endTime}` : (slot.time || '--:--')}
              </Text>
            </View>
            <View style={styles.programBody}>
              <Text style={styles.programTitle}>{slot.subject || '–'}</Text>
            </View>
          </View>
        ))
      ) : (
        <TouchableOpacity
          style={[styles.calTask, { justifyContent: 'center', backgroundColor: '#eff6ff', borderStyle: 'dashed', borderWidth: 2, borderColor: '#93c5fd' }]}
          onPress={() => navigation.navigate('ChildSchedule', childScheduleNavParams({ familyId, child, canEdit: canEdit || isAdmin }))}
        >
          <MaterialCommunityIcons name="calendar-plus" size={24} color="#0b74d1" />
          <Text style={{ color: '#0b74d1', fontWeight: '700', marginLeft: 8 }}>
            {isAdmin ? 'Legg inn timeplan…' : 'Ingen timeplan ennå'}
          </Text>
        </TouchableOpacity>
      )}

      {(canEdit || isAdmin) && (
        <>
          <TouchableOpacity
            style={styles.aiImportCard}
            onPress={() => navigation.navigate('AiImportReview', aiImportNavParams({ familyId, child }))}
          >
            <Text style={{ fontSize: 28 }}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiImportTitle}>Importer ukeplan med AI</Text>
              <Text style={styles.aiImportSub}>
                Ta bilde av skoleruta — godkjenn før det lagres på {child?.name || 'barnet'}.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0b74d1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.aiImportCard}
            onPress={() => navigation.navigate('AiImportReview', aiImportNavParams({
              familyId,
              child,
              focusMode: 'homework',
              returnToHomework: true,
            }))}
          >
            <Text style={{ fontSize: 28 }}>📚</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiImportTitle}>Importer lekseplan med AI</Text>
              <Text style={styles.aiImportSub}>
                Ta bilde av ukens lekser — godkjenn før de lagres per fag.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0b74d1" />
          </TouchableOpacity>
        </>
      )}

    </ScrollView>
  ), [anchorDate, isAdmin, canEdit, familyId, childId, scheduleData, todayScheduleSlots, navigation, child, contentPaddingBottom]);

  const DashboardTab = useMemo(() => {
    const todayKey = dateKey(anchorDate);
    const dayTasks = tasksForDay;
    const dayDone = dayTasks.filter((t) => Array.isArray(t.completedDates) && t.completedDates.includes(todayKey)).length;
    const dayRemaining = Math.max(0, dayTasks.length - dayDone);
    const weekEarned = weekKeys.reduce((sum, k) => sum + (perDayTotals[k] || 0), 0);
    const weekPct = weekPossibleTotal ? Math.min(100, Math.round((weekEarned / weekPossibleTotal) * 100)) : 0;
    const pendingAttestToday = dayTasks.filter((t) => {
      const done = Array.isArray(t.completedDates) && t.completedDates.includes(todayKey);
      return done && !t.attestedDates?.[todayKey];
    });
    const hasNote = !!(noteDoc?.text || (noteDoc?.timeBlocks || []).length);
    const unitLabel = rewardMode === 'money' ? 'kr' : 'poeng';
    const dateLabel = anchorDate.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' });

    let headline = 'Ingen gjøremål i dag — kos deg! ☀️';
    if (dayTasks.length > 0 && dayRemaining === 0) headline = 'Alle gjøremål er ferdig! Flott jobbet! 🎉';
    else if (dayRemaining === 1) headline = '1 gjøremål gjenstår i dag';
    else if (dayRemaining > 1) headline = `${dayRemaining} gjøremål gjenstår i dag`;

    return (
      <ScrollView contentContainerStyle={[styles.homeScroll, { paddingBottom: contentPaddingBottom }]}>
        {/* Kompakt topp — én tydelig beskjed */}
        <View style={styles.homeHero}>
          <Text style={styles.homeGreeting}>Hei, {child?.name || 'venn'} 👋</Text>
          <Text style={styles.homeDate}>{dateLabel}</Text>
          <Text style={styles.homeHeadline}>{headline}</Text>
          <View style={styles.homeWeekRow}>
            <Text style={styles.homeWeekLabel}>
              Uke: {weekEarned}/{weekPossibleTotal || 0} {unitLabel} · {weekPct}%
            </Text>
          </View>
          <View style={styles.homeProgressTrack}>
            <View style={[styles.homeProgressFill, { width: `${weekPct}%` }]} />
          </View>
        </View>

        {/* Hovedinnhold — gjøremål først */}
        <View style={styles.homeSection}>
          <View style={styles.homeSectionHead}>
            <Text style={styles.homeSectionTitle}>Dagens gjøremål</Text>
            <Text style={styles.homeSectionMeta}>{dayDone}/{dayTasks.length || 0} ferdig</Text>
          </View>

          {dayTasks.length === 0 ? (
            <View style={styles.homeEmpty}>
              <Text style={styles.homeEmptyIcon}>🎯</Text>
              <Text style={styles.homeEmptyTxt}>Ingen gjøremål planlagt for denne dagen.</Text>
              {canEdit && (
                <TouchableOpacity style={styles.homeEmptyBtn} onPress={() => setShowAddMenu(true)}>
                  <Text style={styles.homeEmptyBtnTxt}>+ Legg til gjøremål</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.homeTaskList}>
              {dayTasks.map((item) => (
                <View key={item.id}>{renderItem({ item })}</View>
              ))}
            </View>
          )}
        </View>

        {/* Notat — kort forhåndsvisning på landing, full visning i egen modal */}
        {hasNote && (
          <TouchableOpacity style={styles.homeNoteCard} onPress={() => setNoteModalVisible(true)} activeOpacity={0.85}>
            <Text style={styles.homeNoteTitle}>📝 Melding i dag</Text>
            {!!noteDoc?.text && <Text style={styles.homeNoteText} numberOfLines={2}>{noteDoc.text}</Text>}
            {!noteDoc?.text && !!noteDoc?.timeBlocks?.length && (
              <Text style={styles.homeNoteText}>{noteDoc.timeBlocks.length} punkt i dagsplanen</Text>
            )}
            <Text style={styles.homeNoteLinkTxt}>Vis notat →</Text>
          </TouchableOpacity>
        )}

        {/* Admin — kompakt nederst, ikke i veien */}
        {isAdmin && weekAttestStats.pending > 0 && (
          <TouchableOpacity style={styles.homeAdminBanner} onPress={() => setAttestPanelVisible(true)}>
            <Text style={styles.homeAdminIcon}>🛡️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.homeAdminTitle}>
                {weekAttestStats.pending} gjøremål venter på attestering
              </Text>
              {pendingAttestToday.length > 0 && (
                <Text style={styles.homeAdminSub}>{pendingAttestToday.length} fullført i dag</Text>
              )}
            </View>
            <Text style={styles.homeAdminAction}>Attester →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }, [
    anchorDate, tasksForDay, weekKeys, perDayTotals, weekPossibleTotal, rewardMode, child?.name,
    noteDoc, isAdmin, weekAttestStats, renderItem, canEdit, navigation, contentPaddingBottom,
  ]);

  const addMenuConfig = ADD_MENU_TAB_CONFIG[mainTab] || ADD_MENU_TAB_CONFIG.dashboard;

  const addMenuItems = useMemo(() => {
    const cfg = ADD_MENU_TAB_CONFIG[mainTab] || ADD_MENU_TAB_CONFIG.dashboard;
    const canAdd = mainTab === 'calendar'
      ? (isAdmin || childCanEditCalendar)
      : (canEdit || isAdmin);
    const k = dateKey(anchorDate);
    const catalog = {
      todo: {
        icon: 'check-square',
        label: 'Gjøremål',
        hint: 'Belønningsoppgave for barnet',
        onPress: () => {
          setShowAddMenu(false);
          navigation.navigate(ADD_TODO_ROUTE, { familyId, child });
        },
      },
      note: {
        icon: 'message-square',
        label: 'Notat / melding',
        hint: 'Dagsplan og beskjed for i dag',
        onPress: () => {
          setShowAddMenu(false);
          navigation.navigate(ADD_NOTE_ROUTE, { familyId, childId, dateKey: k, existing: noteDoc });
        },
      },
      event: {
        icon: 'calendar',
        label: 'Kalenderhendelse',
        hint: 'Aktivitet med dato og gjentakelse',
        onPress: () => {
          setShowAddMenu(false);
          navigation.navigate(ADD_EVENT_ROUTE, { familyId, dateKey: k });
        },
      },
      schedule: {
        icon: 'book-open',
        label: 'Timeplan',
        hint: 'Skoleplan og faste ukentlige aktiviteter',
        onPress: () => {
          setShowAddMenu(false);
          navigation.navigate(ADD_SCHEDULE_ROUTE, { familyId, child, canEdit: canAdd });
        },
      },
      activity: {
        icon: 'activity',
        label: 'Treningsaktivitet',
        hint: 'Styrketrening, løping, idrett m.m.',
        onPress: () => {
          setShowAddMenu(false);
          navigation.navigate('Activities', { familyId });
        },
      },
    };
    const items = cfg.keys.map((key) => ({
      id: key,
      enabled: key === 'activity' ? true : canAdd,
      ...catalog[key],
    }));
    if (!items.some((item) => item.id === 'activity')) {
      items.push({ id: 'activity', enabled: true, ...catalog.activity });
    }
    return items;
  }, [mainTab, canEdit, isAdmin, anchorDate, noteDoc, familyId, child, childId, navigation, childCanEditCalendar]);

  useEffect(() => {
    setShowAddMenu(false);
  }, [mainTab]);

  return (
    <View style={styles.screen}>
      {/* Globalt coin-lag */}
      <CoinRain triggerKey={coinBurstKey} count={coinBurstCount} targetLayout={bagScreenLayout} screenPaddingTop={0} />

      <ChildProfileHeader
        child={child}
        kids={activeKids}
        kicker={CHILD_TAB_META[mainTab]?.kicker}
        heading={CHILD_TAB_META[mainTab]?.heading(childFirstName)}
        sub={`${dn} · Uke ${wk.week}`}
        showSwitcher={false}
        onSelectChild={() => {}}
        showBack={false}
        compact
      />

      <View style={[styles.mainContent, { paddingBottom: shellBottom }]}>
      {mainTab === 'dashboard' && DashboardTab}
      {mainTab === 'tasks' && (
        <FlatList
          data={tasksForDay}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={<HeaderBlock />}
          ListEmptyComponent={!loading ? <Empty /> : null}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: contentPaddingBottom }}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refreshData();
                setRefreshing(false);
              }}
            />
          )}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={6}
          removeClippedSubviews
          updateCellsBatchingPeriod={40}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          style={{ backgroundColor: '#f6f9fc' }}
        />
      )}

      {mainTab === 'calendar' && CalendarTab}
      {mainTab === 'program' && ProgramTab}
      </View>

      <ChildTodoDetailModal
        visible={!!detailTask}
        task={detailTask}
        done={detailTask ? (Array.isArray(detailTask.completedDates) && detailTask.completedDates.includes(kForAnchor)) : false}
        unitLabel={detailTask?.rewardType === 'money' ? 'kr' : 'poeng'}
        onClose={() => setDetailTask(null)}
        onComplete={() => {
          const t = detailTask;
          setDetailTask(null);
          if (t) toggleComplete(t);
        }}
      />

      {((canEdit || isAdmin) || (mainTab === 'calendar' && childCanEditCalendar)) && (
        <HelpTarget id="add" style={[styles.fab, { bottom: fabBottom }]}>
          <TouchableOpacity
            onPress={() => setShowAddMenu(true)}
            accessibilityLabel="Legg til"
            style={styles.fabHit}
          >
            <Ionicons name="add" size={26} color="#fff" />
          </TouchableOpacity>
        </HelpTarget>
      )}

      {/* Plussemeny — tilpasset aktiv fane */}
      <Modal visible={showAddMenu} transparent animationType="fade" onRequestClose={() => setShowAddMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowAddMenu(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{addMenuConfig.title}</Text>
            <Text style={styles.menuContext}>{addMenuConfig.context}</Text>

            {addMenuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, !item.enabled && styles.menuItemDisabled]}
                onPress={() => { if (item.enabled) item.onPress(); }}
                disabled={!item.enabled}
              >
                <View style={[styles.menuItemIcon, !item.enabled && styles.menuItemIconDisabled]}>
                  <Feather name={item.icon} size={18} color={item.enabled ? '#0b74d1' : '#94a3b8'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemTxt, !item.enabled && styles.menuItemTxtDisabled]}>{item.label}</Text>
                  <Text style={styles.menuItemHint}>{item.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={item.enabled ? '#cbd5e1' : '#e2e8f0'} />
              </TouchableOpacity>
            ))}

            {!(canEdit || isAdmin) && (
              <Text style={styles.menuHint}>Kun foreldre med redigeringstilgang kan legge til innhold.</Text>
            )}

            <TouchableOpacity style={styles.menuCancel} onPress={() => setShowAddMenu(false)}>
              <Text style={styles.menuCancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notat — utvidet visning (kun fra landingssiden) */}
      <Modal visible={noteModalVisible} animationType="slide" onRequestClose={() => setNoteModalVisible(false)}>
        <View style={styles.noteModalWrap}>
          <View style={styles.noteModalHeader}>
            <TouchableOpacity onPress={() => setNoteModalVisible(false)} style={styles.noteModalBack}>
              <Ionicons name="chevron-back" size={22} color="#0b74d1" />
            </TouchableOpacity>
            <Text style={styles.noteModalTitle}>Dagens notat</Text>
            {isAdmin ? (
              <TouchableOpacity
                style={styles.noteModalEdit}
                onPress={() => {
                  setNoteModalVisible(false);
                  navigation.navigate(ADD_NOTE_ROUTE, {
                    familyId, childId, dateKey: dateKey(anchorDate), existing: noteDoc,
                  });
                }}
              >
                <Text style={styles.noteModalEditTxt}>Rediger</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.noteModalEdit} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.noteModalBody}>
            <Text style={styles.noteModalDate}>
              {anchorDate.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>

            {noteLoading ? (
              <Text style={styles.noteModalEmpty}>Laster notat…</Text>
            ) : (
              <>
                {Array.isArray(noteDoc.timeBlocks) && noteDoc.timeBlocks.length > 0 ? (
                  <View style={styles.noteModalSection}>
                    <Text style={styles.noteModalSectionTitle}>Dagsplan</Text>
                    {noteDoc.timeBlocks
                      .slice()
                      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
                      .map((b, idx) => (
                        <View key={`${b.time}-${idx}`} style={styles.programRow}>
                          <View style={styles.programTime}>
                            <Text style={styles.programTimeTxt}>{b.time || '--:--'}</Text>
                          </View>
                          <View style={styles.programBody}>
                            <Text style={styles.programTitle}>{b.title || '–'}</Text>
                          </View>
                        </View>
                      ))}
                  </View>
                ) : null}

                {(noteDoc.text || '').trim() ? (
                  <View style={styles.noteModalSection}>
                    <Text style={styles.noteModalSectionTitle}>Melding</Text>
                    <Text style={styles.noteModalText}>{noteDoc.text.trim()}</Text>
                  </View>
                ) : null}

                {!noteDoc.text?.trim() && !(noteDoc.timeBlocks || []).length && (
                  <Text style={styles.noteModalEmpty}>Ingen notat for denne dagen.</Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Dashboard: Slettemodal */}
      <Modal visible={delModalOpen} transparent animationType="fade" onRequestClose={() => setDelModalOpen(false)}>
        <Pressable style={styles.confirmOverlay} onPress={() => setDelModalOpen(false)}>
          <Pressable style={styles.confirmCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.confirmTitle}>Slett gjøremål?</Text>
            <Text style={styles.confirmSub}>{delTask?.title || ''}</Text>

            {/* Tekst for alle typer */}
            {delTask?.type === 'once' ? (
              delSummary.countAfterAnchor > 0 ? (
                <Text style={styles.confirmText}>
                  Dette engangsgjøremålet er registrert som utført. Sletter du det, mister du {delSummary.totalLoss} {delSummary.unit}. Er du sikker?
                </Text>
              ) : (
                <Text style={styles.confirmText}>Slette dette engangsgjøremålet?</Text>
              )
            ) : (
              delSummary.countAfterAnchor > 0 ? (
                <Text style={styles.confirmText}>
                  Registrerte {delSummary.unit} fra og med valgt dag: {delSummary.countAfterAnchor} – mulig tap: {delSummary.totalLoss} {delSummary.unit}.
                </Text>
              ) : (
                <Text style={styles.confirmText}>Ingen registrerte poeng/kr fra og med valgt dag.</Text>
              )
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setDelModalOpen(false)}>
                <Text style={[styles.btnTxt, styles.btnGhostTxt]}>Avbryt</Text>
              </TouchableOpacity>

              {(delTask?.type === 'daily' || delTask?.type === 'weekly') && (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={stopSeriesFromAnchor}>
                  <Text style={[styles.btnTxt, styles.btnPrimaryTxt]}>Stopp fremtidige</Text>
                </TouchableOpacity>
              )}

              {delTask?.type === 'once' && (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={deleteOnceTask}>
                  <Text style={[styles.btnTxt, styles.btnPrimaryTxt]}>Slett</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* «Gratulerer»-popup */}
      <Modal visible={congratsVisible} transparent animationType="fade" onRequestClose={closeCongrats}>
        <Pressable style={styles.congratsOverlay} onPress={closeCongrats}>
          <Pressable style={styles.congratsCard} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={styles.closeBtn} onPress={closeCongrats} accessibilityLabel="Lukk">
              <Ionicons name="close" size={20} color="#334155" />
            </TouchableOpacity>
            <Text style={{ fontSize: 52, textAlign: 'center' }}>{bagUnit === 'kr' ? '💰' : '⭐'}</Text>
            <Text style={styles.congratsTitle}>Bra jobba! 🎉</Text>
            <Text style={styles.congratsText}>
              +{lastEarned} {bagUnit || 'poeng'}
            </Text>
            <View style={styles.congratsBar}>
              <View style={[styles.congratsBarFill, { width: `${weekPossibleTotal ? Math.min(100, Math.round((earnedSum / weekPossibleTotal) * 100)) : 0}%` }]} />
            </View>
            <Text style={styles.congratsProgress}>
              {earnedSum} av {weekPossibleTotal} {bagUnit || 'poeng'} denne uken
            </Text>
            {allDoneToday && (
              <Text style={styles.congratsBonus}>🏆 Alle oppgaver i dag er ferdig!</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ukeoppsummering – trykk på sekken */}
      <WeekSummaryModal
        visible={summaryVisible}
        onClose={() => setSummaryVisible(false)}
        weekNumber={wk.week}
        weekDates={weekDates}
        perDayTotals={perDayTotals}
        perDayPossible={perDayPossible}
        earnedSum={weekKeys.reduce((a, k) => a + (perDayTotals[k] || 0), 0)}
        weekPossibleTotal={weekPossibleTotal}
        weekTaskBreakdown={weekTaskBreakdown}
        bagUnit={bagUnit || 'poeng'}
        anchorDate={anchorDate}
        taskLabel="gjøremål"
      />

      {/* Attesteringspanel (admin) */}
      <Modal visible={attestPanelVisible} transparent animationType="fade" onRequestClose={() => setAttestPanelVisible(false)}>
        <Pressable style={styles.summaryOverlay} onPress={() => setAttestPanelVisible(false)}>
          <Pressable style={styles.summaryCard} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAttestPanelVisible(false)} accessibilityLabel="Lukk">
              <Ionicons name="close" size={20} color="#334155" />
            </TouchableOpacity>
            <Text style={styles.summaryTitle}>Attesteringspanel</Text>
            <Text style={{ textAlign: 'center', color: '#64748b', marginTop: 4 }}>
              Velg en eller flere dager, og attestér/angre i bulk.
            </Text>

            <View style={styles.attestPanelStats}>
              <Text style={styles.attestPanelStatTxt}>Utført: {weekAttestStats.completed}</Text>
              <Text style={styles.attestPanelStatTxt}>Attestert: {weekAttestStats.attested}</Text>
              <Text style={styles.attestPanelStatTxt}>Venter: {weekAttestStats.pending}</Text>
            </View>

            <Text style={styles.sectionTitle}>Velg dager</Text>
            <View style={styles.attestDayWrap}>
              {weekDates.map((d) => {
                const k = dateKey(d);
                const on = selectedAttestDays.includes(k);
                return (
                  <TouchableOpacity
                    key={`ad-${k}`}
                    style={[styles.attestDayChip, on && styles.attestDayChipOn]}
                    onPress={() => toggleSelectedAttestDay(k)}
                  >
                    <Text style={[styles.attestDayChipTxt, on && styles.attestDayChipTxtOn]}>
                      {d.toLocaleDateString('no-NO', { weekday: 'short' }).replace('.', '')} {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.adminQuickRow}>
              <TouchableOpacity style={styles.adminQuickBtn} onPress={() => setSelectedAttestDays(weekKeys)}>
                <Text style={styles.adminQuickTxt}>Velg hele uka</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminQuickBtn, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}
                onPress={() => setSelectedAttestDays([kForAnchor])}
              >
                <Text style={[styles.adminQuickTxt, { color: '#0f172a' }]}>Velg kun i dag</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.adminQuickRow}>
              <TouchableOpacity style={styles.adminQuickBtn} onPress={bulkAttestForSelectedDays}>
                <Text style={styles.adminQuickTxt}>Attester valgte</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminQuickBtn, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}
                onPress={bulkUndoAttestForSelectedDays}
              >
                <Text style={[styles.adminQuickTxt, { color: '#9f1239' }]}>Angre valgte</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ChildSideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={onDrawerSelect}
        items={drawerItems}
        activeId={drawerActiveId}
        childName={child?.name}
        familyName={family?.name}
        childAvatar={child}
        bottomInset={shellBottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e6f3f7' },
  mainContent: { flex: 1, minHeight: 0 },

  headerOuter: { position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  leftHeader: { flex: 1 },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#e7f2fb', borderRadius: 12, padding: 4, alignSelf: 'flex-start' },
  modeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  modeBtnActive: { backgroundColor: '#0b74d1' },
  modeText: { fontWeight: '700', color: '#0b74d1' },
  modeTextActive: { color: '#fff' },
  dateRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { fontSize: 16, fontWeight: '800', color: '#0b3d91' },
  todayBtn: { marginLeft: 'auto', backgroundColor: '#eef6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  todayText: { color: '#0b74d1', fontWeight: '800' },
  pointsBag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b74d1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pointsText: { color: '#fff', fontWeight: '900', marginLeft: 6 },
  bagOfTotal: { color: '#6b7280', fontWeight: '700', fontSize: 11, marginTop: 2 },

  coinLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 9999, elevation: 10, pointerEvents: 'none' },
  coinImg: { position: 'absolute', top: 0 },

  tabBarScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 4,
  },
  tabBtn: { minWidth: 92, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: '#0b74d1' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  tabTxtActive: { color: '#0b74d1' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  profileAvatar: {},
  profileName: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  profileSub: { fontSize: 14, color: '#6b7280', marginTop: 2, fontWeight: '600' },
  profileBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  profileBadge: { backgroundColor: '#eef6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  profileBadgeTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 12 },

  calTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a', marginBottom: 8 },
  calSub: { fontSize: 13, color: '#64748b', fontWeight: '600', marginBottom: 4, lineHeight: 18 },
  calModeSwitch: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 999, padding: 4,
    marginTop: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  calModeBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  calModeBtnActive: { backgroundColor: '#0b74d1' },
  calModeText: { fontWeight: '800', color: '#64748b', fontSize: 13 },
  calModeTextActive: { color: '#fff' },
  calNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  calNavBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  calNavCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  calWeekBadge: {
    fontWeight: '900', color: '#0b74d1', fontSize: 12, backgroundColor: '#eef6ff',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', marginBottom: 4,
  },
  calNavLabel: { fontWeight: '800', color: '#0f172a', fontSize: 14, textAlign: 'center' },
  calTodayBtn: {
    alignSelf: 'center', marginTop: 8, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e5e7eb',
  },
  calTodayTxt: { fontWeight: '800', color: '#0b74d1', fontSize: 13 },
  calGrid: { flexDirection: 'row', gap: 6, flexWrap: 'nowrap', justifyContent: 'space-between' },
  calCell: {
    flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  calCellToday: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  calCellAnchor: { borderColor: '#0b74d1', borderWidth: 2 },
  calDow: { fontSize: 10, fontWeight: '800', color: '#94a3b8' },
  calDowToday: { color: '#0b74d1' },
  calDate: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  calDateToday: { color: '#0b74d1' },
  calPts: { fontSize: 11, fontWeight: '800', color: '#6b7280', marginTop: 4 },
  calBar: { width: '80%', height: 4, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  calBarFill: { height: 4, backgroundColor: '#0b74d1', borderRadius: 4 },
  calEmpty: { fontSize: 14, color: '#d1d5db', marginTop: 4 },

  calMonthHead: { flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  calMonthHeadTxt: { flex: 1, textAlign: 'center', fontWeight: '700', color: '#94a3b8', fontSize: 11 },
  calMonthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calMonthCell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, padding: 2,
  },
  calMonthCellToday: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd' },
  calMonthCellAnchor: { backgroundColor: '#0b74d1' },
  calMonthCellOutside: { opacity: 0.35 },
  calMonthDate: { fontWeight: '800', color: '#0f172a', fontSize: 14 },
  calMonthDateToday: { color: '#0b74d1' },
  calMonthDateAnchor: { color: '#fff' },
  calMonthDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  calMonthDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#0b74d1' },
  calMonthDotAnchor: { backgroundColor: '#fff' },
  calWeekDayLbl: {
    fontWeight: '800', color: '#64748b', fontSize: 13, marginBottom: 6,
    textTransform: 'capitalize',
  },

  calTask: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  calTaskTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },
  calTaskSub: { color: '#6b7280', fontSize: 12, marginTop: 2, fontWeight: '600' },
  calEventDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12, marginTop: 4 },

  programRow: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb',
  },
  programTime: { backgroundColor: '#0b74d1', paddingHorizontal: 10, paddingVertical: 12, minWidth: 64, alignItems: 'center' },
  programTimeTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  programBody: { padding: 12, flex: 1 },
  programTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },

  scheduleCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  scheduleEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef6ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  scheduleEditTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 13 },
  aiImportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#eef6ff', borderRadius: 14, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  aiImportTitle: { fontWeight: '900', color: '#0f172a', fontSize: 15 },
  aiImportSub: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  schedulePhotoPreviewWrap: { alignItems: 'center', gap: 6, marginBottom: 8 },
  schedulePhotoPreview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#f1f5f9' },
  schedulePhotoHint: { color: '#6b7280', fontSize: 12, fontWeight: '600' },

  weekStrip: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  dayCellToday: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  dayCellActive: { backgroundColor: '#e7f2fb', borderColor: '#0b74d1' },
  dayCellTodayAnchor: { backgroundColor: '#dbeafe', borderColor: '#0b74d1', borderWidth: 2 },
  dayCellDow: { fontSize: 12, color: '#6b7280', fontWeight: '800' },
  dayCellDowToday: { color: '#0b74d1' },
  dayCellDowActive: { color: '#0b74d1' },
  dayCellDate: { fontSize: 16, fontWeight: '900', color: '#111827' },
  dayCellDateToday: { color: '#0b74d1' },
  dayCellDateActive: { color: '#0b3d91' },
  dayCellTodayLbl: { fontSize: 9, fontWeight: '900', color: '#0b74d1', marginTop: 1 },
  dayCellPts: { fontSize: 12, fontWeight: '800', color: '#6b7280' },
  dayCellPtsToday: { color: '#0b74d1' },
  dayCellPtsActive: { color: '#0b74d1' },

  futureHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 6, marginBottom: 2,
    backgroundColor: '#fffbeb', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  futureHintTxt: { flex: 1, color: '#92400e', fontSize: 12, fontWeight: '600', lineHeight: 16 },

  noteCard: { marginHorizontal: 12, marginTop: 10, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  noteHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  noteDatePill: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#eef6ff', borderRadius: 8, color: '#0b74d1', fontWeight: '800', fontSize: 12 },
  noteEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#f8fafc' },
  noteEditTxt: { color: '#0b74d1', fontWeight: '800' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  timeTxt: { width: 56, fontVariant: ['tabular-nums'], color: '#0b74d1', fontWeight: '900' },
  timeTitle: { flex: 1, color: '#0f172a', fontWeight: '700' },
  noteBody: { marginTop: 8, color: '#0f172a', lineHeight: 20 },

  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginBottom: 10, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  rowDone: { backgroundColor: '#ecfdf5', borderWidth: StyleSheet.hairlineWidth, borderColor: '#a7f3d0' },
  rowAttested: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  iconWrap: { width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6ff', marginRight: 12, overflow: 'hidden' },
  iconImg: { width: 60, height: 60, borderRadius: 12 },
  textWrap: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  titleDone: { textDecorationLine: 'line-through', color: '#065f46' },
  sub: { marginTop: 2, color: '#6b7280', fontSize: 12, fontWeight: '700' },
  rightWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, flexDirection: 'row' },
  pointsBadge: {
    minWidth: 42, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    fontSize: 12, fontWeight: '900', backgroundColor: '#e7f2fb', color: '#0b74d1',
  },
  pointsBadgeDone: { backgroundColor: '#bbf7d0', color: '#065f46' },
  pointsBadgeAttested: { backgroundColor: '#fef3c7', color: '#92400e' },
  attestBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  attestBadgeTxt: { fontWeight: '800', fontSize: 10, color: '#92400e' },
  pendingBadge: { backgroundColor: '#fff7ed', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pendingBadgeTxt: { fontWeight: '800', fontSize: 10, color: '#c2410c' },
  attestBtn: { padding: 6, marginRight: 4 },

  emptyWrap: { marginTop: 40, alignItems: 'center', paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#0b3d91', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  fab: {
    position: 'absolute', right: 18, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#0b74d1', alignItems: 'center', justifyContent: 'center',
    zIndex: 90,
    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 16px rgba(11,116,209,0.35)' } : { elevation: 3 }),
  },
  fabHit: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  menuCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 4, maxHeight: '85%' },
  menuTitle: { fontWeight: '900', color: '#0f172a', fontSize: 18, marginBottom: 2 },
  menuContext: { color: '#64748b', fontWeight: '700', fontSize: 13, marginBottom: 10 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12,
  },
  menuItemDisabled: { opacity: 0.55 },
  menuItemIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  menuItemIconDisabled: { backgroundColor: '#f1f5f9' },
  menuItemTxt: { fontSize: 16, color: '#0f172a', fontWeight: '800' },
  menuItemTxtDisabled: { color: '#94a3b8' },
  menuItemHint: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  menuHint: { color: '#64748b', marginTop: 8, marginLeft: 2, fontSize: 13, fontWeight: '600' },
  menuCancel: { marginTop: 6, alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 8 },
  menuCancelTxt: { color: '#0b74d1', fontWeight: '800' },

  // Dashboard-slettemodal
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  confirmCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: '#e2e8f0' },
  confirmTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  confirmSub: { marginTop: 4, fontWeight: '800', color: '#0b3d91' },
  confirmText: { marginTop: 10, color: '#0f172a' },
  btnRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexGrow: 1, minWidth: 120, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontWeight: '800' },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostTxt: { color: '#0f172a' },
  btnPrimary: { backgroundColor: '#0b74d1' },
  btnPrimaryTxt: { color: '#fff' },

  // «Gratulerer»-popup
  congratsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  congratsCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, width: '80%', maxWidth: 380, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  closeBtn: { position: 'absolute', right: 10, top: 10, padding: 6, borderRadius: 12, backgroundColor: '#f1f5f9' },
  congratsTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  congratsText: { marginTop: 4, color: '#0b74d1', fontWeight: '900', textAlign: 'center', fontSize: 28 },
  congratsBar: { marginTop: 14, height: 10, width: '100%', backgroundColor: '#e7effe', borderRadius: 999, overflow: 'hidden' },
  congratsBarFill: { height: 10, backgroundColor: '#10b981', borderRadius: 999 },
  congratsProgress: { marginTop: 6, color: '#334155', fontWeight: '700', textAlign: 'center', fontSize: 14 },
  congratsBonus: { marginTop: 10, color: '#d97706', fontWeight: '900', textAlign: 'center', fontSize: 16 },

  // Attesteringspanel / delte modal-stiler
  summaryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { backgroundColor: '#fff', padding: 18, borderRadius: 16, width: '90%', maxWidth: 520, borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  summaryTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 12 },

  landingHero: {
    backgroundColor: '#0b74d1',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  homeScroll: { padding: 12, paddingBottom: 120 },
  homeHero: {
    backgroundColor: '#0b74d1',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  homeGreeting: { color: '#fff', fontWeight: '900', fontSize: 22 },
  homeDate: { color: '#bfdbfe', fontWeight: '700', fontSize: 14, marginTop: 2, textTransform: 'capitalize' },
  homeHeadline: { color: '#fff', fontWeight: '800', fontSize: 17, marginTop: 12, lineHeight: 24 },
  homeWeekRow: { marginTop: 14 },
  homeWeekLabel: { color: '#dbeafe', fontWeight: '700', fontSize: 13 },
  homeProgressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 8, overflow: 'hidden' },
  homeProgressFill: { height: 6, borderRadius: 999, backgroundColor: '#fff' },

  homeSection: { marginBottom: 14 },
  homeSectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  homeSectionTitle: { fontWeight: '900', fontSize: 18, color: '#0f172a' },
  homeSectionMeta: { fontWeight: '800', fontSize: 13, color: '#64748b' },
  homeTaskList: { gap: 0 },
  homeEmpty: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 20, alignItems: 'center',
  },
  homeEmptyIcon: { fontSize: 40, marginBottom: 8 },
  homeEmptyTxt: { color: '#64748b', fontWeight: '700', textAlign: 'center', fontSize: 14 },
  homeEmptyBtn: {
    marginTop: 12, backgroundColor: '#eef6ff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  homeEmptyBtnTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 13 },

  homeNoteCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 14, marginBottom: 14,
  },
  homeNoteTitle: { fontWeight: '900', color: '#0f172a', fontSize: 14, marginBottom: 6 },
  homeNoteText: { color: '#334155', fontWeight: '600', fontSize: 14, lineHeight: 20 },
  homeNoteLinkTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 13, marginTop: 8 },

  noteModalWrap: { flex: 1, backgroundColor: '#f4f7fb' },
  noteModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  noteModalBack: { width: 44, padding: 4 },
  noteModalTitle: { fontWeight: '900', fontSize: 17, color: '#0f172a' },
  noteModalEdit: { width: 64, alignItems: 'flex-end' },
  noteModalEditTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 15 },
  noteModalBody: { padding: 16, paddingBottom: 40 },
  noteModalDate: { color: '#64748b', fontWeight: '700', fontSize: 14, marginBottom: 16, textTransform: 'capitalize' },
  noteModalSection: { marginBottom: 20 },
  noteModalSectionTitle: { fontWeight: '900', fontSize: 15, color: '#0f172a', marginBottom: 10 },
  noteModalText: { color: '#0f172a', fontSize: 16, lineHeight: 24, fontWeight: '600' },
  noteModalEmpty: { color: '#64748b', fontWeight: '700', fontSize: 15, textAlign: 'center', marginTop: 40 },

  homeAdminBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fffbeb', borderRadius: 14, borderWidth: 1, borderColor: '#fde68a',
    padding: 14, marginBottom: 10,
  },
  homeAdminIcon: { fontSize: 22 },
  homeAdminTitle: { fontWeight: '800', color: '#92400e', fontSize: 14 },
  homeAdminSub: { color: '#b45309', fontWeight: '700', fontSize: 12, marginTop: 2 },
  homeAdminAction: { fontWeight: '900', color: '#d97706', fontSize: 13 },

  landingKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#64748b',
    marginBottom: 8,
  },
  quickNavRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickNavBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickNavIcon: { fontSize: 22 },
  quickNavTxt: { marginTop: 4, fontWeight: '800', color: '#0f172a', fontSize: 12 },
  landingTitle: { color: '#fff', fontWeight: '900', fontSize: 20 },
  landingSub: { color: '#dbeafe', fontWeight: '700', marginTop: 2 },
  landingStatsRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  landingStatCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12,
  },
  landingStatLabel: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  landingStatValue: { color: '#0f172a', fontWeight: '900', fontSize: 24, marginTop: 4 },
  landingStatHint: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  landingProgressTrack: { height: 8, borderRadius: 999, backgroundColor: '#dbeafe', marginTop: 8, marginBottom: 10, overflow: 'hidden' },
  landingProgressFill: { height: 8, borderRadius: 999, backgroundColor: '#0b74d1' },
  landingCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  landingCardTitle: { fontWeight: '900', color: '#0f172a', marginBottom: 8, fontSize: 15 },
  landingCardText: { color: '#334155', fontWeight: '600', marginBottom: 4 },
  landingInlineBtn: {
    alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#eef6ff',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  landingInlineBtnTxt: { color: '#0b74d1', fontWeight: '800', fontSize: 12 },
  nextTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  nextTaskIcon: { fontSize: 18 },
  nextTaskTxt: { flex: 1, color: '#0f172a', fontWeight: '700' },

  adminPanelCard: { backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', padding: 12, marginBottom: 10 },
  adminPanelTitle: { fontWeight: '900', color: '#92400e', fontSize: 15 },
  adminPanelSub: { color: '#92400e', marginTop: 6, fontWeight: '700', fontSize: 12 },
  adminPanelBtn: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b', paddingHorizontal: 10, paddingVertical: 6 },
  adminPanelBtnTxt: { color: '#92400e', fontWeight: '900', fontSize: 12 },
  adminQuickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  adminQuickBtn: {
    flex: 1, backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#a5f3fc',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  adminQuickTxt: { fontWeight: '900', color: '#0e7490', fontSize: 12 },

  attestPanelStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 },
  attestPanelStatTxt: { fontWeight: '800', color: '#0f172a', fontSize: 12 },
  attestDayWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  attestDayChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  attestDayChipOn: { backgroundColor: '#0b74d1', borderColor: '#0b74d1' },
  attestDayChipTxt: { color: '#334155', fontWeight: '800', fontSize: 12 },
  attestDayChipTxtOn: { color: '#fff' },
});
