// src/screens/FamilyDashboardScreen.jsx
import React, {
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
  TextInput,
  RefreshControl,
  Animated,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { db, auth, storage } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Ionicons } from '@expo/vector-icons';
import TopNavBar from '../components/TopNavBar';
import { colors } from '../src/theme';
import { toDateSafe, getISOWeek, getISOWeekBounds } from '../src/utils/dates';
import {
  revokeMemberFamilyAccess,
  restoreMemberFamilyAccess,
  softDeleteParentFromFamily,
} from '../src/utils/groups';
import Svg, { Circle } from 'react-native-svg';

const fullWeekdayNO = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];

/* ---------- Donut (safe) ---------- */
function Donut({ size = 112, stroke = 12, value = 0, total = 100, unit = 'kr' }) {
  const safeTotal = Math.max(1, total);
  const pct = Math.max(0, Math.min(100, Math.round((value / safeTotal) * 100)));

  if (!Svg || !Circle) {
    return (
      <View
        style={[styles.donutFallback, { width: size, height: size, borderRadius: size / 2 }]}
        testID="donut-fallback"
      >
        <Text style={styles.donutValue}>{unit === 'kr' ? `${value} kr` : `${value} p`}</Text>
        <Text style={styles.donutSub}>({pct}%)</Text>
      </View>
    );
  }

  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const gap = circumference - dash;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={cx} cy={cy} r={radius} stroke="#e6eefb" strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="#0b74d1"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          fill="none"
        />
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{unit === 'kr' ? `${value} kr` : `${value} p`}</Text>
        <Text style={styles.donutSub}>av {safeTotal} {unit}</Text>
      </View>
    </View>
  );
}

/* ------------------ stats (safe) ------------------ */
const computeStatsForChildrenNoIndex = async (familyIdParam, childList, start, end) => {
  const byChild = {};
  let totalTasks = 0;
  let totalPoints = 0;
  let totalMoney = 0;

  await Promise.all((childList || []).map(async (c) => {
    const childId = c.id || c.childId;
    if (!childId) return;

    let tasks = 0; let points = 0; let money = 0;

    const baseTasks = collection(db, 'families', familyIdParam, 'children', childId, 'tasks');
    try {
      const tSnap = await getDocs(baseTasks);
      tSnap.forEach((docu) => {
        const data = docu.data();
        const when = toDateSafe(data.doneAt);
        if (!when) return;
        if (when >= start && when <= end) {
          tasks += 1;
          points += Number(data.points || 0);
          money += Math.max(0, Math.round(Number(data.moneyValue || 0)));
        }
      });
    } catch {}

    if (tasks === 0 && points === 0 && money === 0) {
      const baseTodos = collection(db, 'families', familyIdParam, 'children', childId, 'todos');
      try {
        const tdSnap = await getDocs(baseTodos);
        tdSnap.forEach((docu) => {
          const data = docu.data();
          const when = toDateSafe(data.doneAt);
          if (!when) return;
          if (when >= start && when <= end) {
            tasks += 1;
            points += Number(data.points || 0);
            money += Math.max(0, Math.round(Number(data.moneyValue || 0)));
          }
        });
      } catch {}
    }

    byChild[childId] = {
      tasks, points, money,
      name: c.name,
      photoURL: c.photoURL || c.photoUrl,
      active: c.active !== false,
      rewardMode: c.rewardMode || 'money',
      weeklyBudget: Number(c.weeklyBudget || 0),
    };
    totalTasks += tasks; totalPoints += points; totalMoney += money;
  }));

  return { byChild, totalTasks, totalPoints, totalMoney };
};

/* ------------------ små modal-komponenter ------------------ */
function ConfirmModal({ visible, title, message, confirmText, confirmDanger, onCancel, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.menuBackdrop} onPress={onCancel} />
      <View style={styles.confirmCard}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.confirmMsg}>{message}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <TouchableOpacity onPress={onCancel} style={[styles.smallBtn, { backgroundColor: '#e5e7eb' }]}>
            <Text style={[styles.smallBtnTxt, { color: '#0f172a' }]}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={[styles.smallBtn, confirmDanger ? { backgroundColor: '#b00020' } : null]}
          >
            <Text style={styles.smallBtnTxt}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ParentActionModal({ visible, parent, onClose, onChoose }) {
  if (!parent) return null;
  const inactive = parent.active === false;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} />
      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>{parent.name || parent.email || 'Foresatt'}</Text>
        <TouchableOpacity style={styles.menuItem} onPress={() => onChoose(inactive ? 'p-activate' : 'p-deactivate')}>
          <Ionicons name={inactive ? 'play-circle-outline' : 'pause-circle-outline'} size={18} color="#0b1f33" />
          <Text style={styles.menuItemTxt}>{inactive ? 'Aktiver' : 'Deaktiver'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => onChoose('p-delete')}>
          <Ionicons name="trash-outline" size={18} color="#b00020" />
          <Text style={[styles.menuItemTxt, { color: '#b00020' }]}>Slett</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* ------------------ component ------------------ */
export default function FamilyDashboardScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route?.params || {};
  const familyId = params.familyId || params.id || null;
  const familyName = params.familyName || '';
  const ownerUid = params.ownerUid || '';
  const uid = auth.currentUser?.uid || null;

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Bottom-sheet (legg til medlem)
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0=closed, 1=open

  // Tannhjul/innstillinger
  const [menuOpen, setMenuOpen] = useState(false);

  const [familyActive, setFamilyActive] = useState(true);
  const [familyDeleted, setFamilyDeleted] = useState(false);
  const [familyDoc, setFamilyDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imgVersion, setImgVersion] = useState(Date.now());

  // rename
  const [renameOpen, setRenameOpen] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');

  // confirmations
  const [confirm, setConfirm] = useState({ open: false, kind: null });

  // per-parent admin confirm
  const [pConfirm, setPConfirm] = useState({ open: false, kind: null, parent: null });
  const [pAction, setPAction] = useState({ open: false, parent: null }); // valg-meny

  // week/day + stats
  const now = new Date();
  const [{ week, year }, setWeekInfo] = useState(getISOWeek(now));
  const [{ start: weekStart, end: weekEnd }, setWeekBounds] = useState(getISOWeekBounds(now));
  const [childStats, setChildStats] = useState({});
  const [totals, setTotals] = useState({ tasks: 0, points: 0, money: 0 });

  // animate sheet
  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: addSheetOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [addSheetOpen, sheetAnim]);

  const fetchAll = useCallback(async () => {
    if (!familyId) {
      navigation.replace('FamilyOverview');
      return;
    }
    setLoading(true);
    try {
      const familyRef = doc(db, 'families', familyId);
      const familySnap = await getDoc(familyRef);
      const familyData = familySnap.data();
      if (!familyData) throw new Error('Familie-data ikke funnet');

      setFamilyDoc({ id: familySnap.id, ...familyData });
      setFamilyActive(familyData?.active !== false);
      setFamilyDeleted(familyData?.deleted === true);

      // Foresatte
      const subParentsRef = collection(db, 'families', familyId, 'parents');
      const subParentsSnap = await getDocs(subParentsRef);
      let parentListRaw = subParentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (parentListRaw.length === 0) {
        const parentQuery = query(collection(db, 'parents'), where('familyId', '==', familyId));
        const parentSnap = await getDocs(parentQuery);
        parentListRaw = parentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      const byKey = new Map();
      for (const p of parentListRaw) {
        const key = String(p.uid || (p.email || '').toLowerCase() || p.id);
        if (!byKey.has(key)) {
          byKey.set(key, { ...p });
        } else {
          const prev = byKey.get(key);
          byKey.set(key, {
            ...prev,
            deleted: prev.deleted === true || p.deleted === true ? true : undefined,
            active: (prev.active !== false && p.active !== false),
            admin: prev.admin === true || p.admin === true,
            name: prev.name || p.name,
            email: prev.email || p.email,
            photoURL: prev.photoURL || p.photoURL || prev.photoUrl || p.photoUrl,
          });
        }
      }
      const parentList = Array.from(byKey.values());

      if (ownerUid && !parentList.some((p) => (p.uid || p.id) === ownerUid)) {
        const ownerDocSnap = await getDoc(doc(db, 'parents', ownerUid));
        if (ownerDocSnap.exists()) parentList.unshift({ id: ownerDocSnap.id, ...ownerDocSnap.data() });
      }

      // Barn
      const subChildrenRef = collection(db, 'families', familyId, 'children');
      const subChildrenSnap = await getDocs(subChildrenRef);
      let childList = subChildrenSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (childList.length === 0) {
        const childQuery = query(collection(db, 'children'), where('familyId', '==', familyId));
        const childSnap = await getDocs(childQuery);
        childList = childSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      // Sorter barn med aktive først, deretter navn
      childList = (childList || [])
        .filter((c) => c?.deleted === true ? false : true)
        .sort((a, b) => {
          const aAct = a.active === false ? 1 : 0;
          const bAct = b.active === false ? 1 : 0;
          if (aAct !== bAct) return aAct - bAct;
          return (a.name || '').localeCompare(b.name || '');
        });

      setParents(parentList || []);
      setChildren(childList || []);
      setImgVersion(Date.now());

      const bounds = getISOWeekBounds(new Date());
      setWeekBounds(bounds);
      setWeekInfo(getISOWeek(new Date()));

      const stats = await computeStatsForChildrenNoIndex(familyId, childList, bounds.start, bounds.end);
      setChildStats(stats.byChild);
      setTotals({ tasks: stats.totalTasks, points: stats.totalPoints, money: stats.totalMoney });
    } catch (err) {
      console.error('Feil ved henting av familiemedlemmer:', err);
    } finally {
      setLoading(false);
    }
  }, [familyId, ownerUid, navigation]);

  useFocusEffect(useCallback(() => { fetchAll(); return () => {}; }, [fetchAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  const isAdmin = useMemo(() => {
    const ownerIds = [familyDoc?.ownerUid, familyDoc?.ownerId, ownerUid].filter(Boolean);
    const adminUids = Array.isArray(familyDoc?.adminUids) ? familyDoc.adminUids : [];
    const allowEveryoneIfNoAdmins = adminUids.length === 0 && ownerIds.length === 0;
    return allowEveryoneIfNoAdmins || (uid && (ownerIds.includes(uid) || adminUids.includes(uid)));
  }, [familyDoc, ownerUid, uid]);

  /* -------- family actions ---------- */
  const toggleFamilyActive = async (newStatus) => {
    try {
      await updateDoc(doc(db, 'families', familyId), { active: newStatus });
      setFamilyActive(newStatus);
    } catch (err) {
      console.error('Feil ved endring av status:', err);
    }
  };

  const hardOrSoftDelete = async () => {
    try {
      let didHardDelete = false;
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const cascade = httpsCallable(functions, 'deleteFamilyCascade');
        await cascade({ familyId });
        didHardDelete = true;
      } catch {
        didHardDelete = false;
      }

      if (didHardDelete) {
        navigation.replace('FamilyOverview');
        return;
      }

      await updateDoc(doc(db, 'families', familyId), { deleted: true, active: false });
      setFamilyDeleted(true);
      setFamilyActive(false);
      navigation.replace('FamilyOverview');
    } catch (e) {
      console.error('Sletting feilet', e);
    }
  };

  const handleRenameFamily = async () => {
    if (!isAdmin) return;
    const trimmed = (newFamilyName || '').trim();
    if (!trimmed) { setRenameOpen(false); return; }
    try {
      await updateDoc(doc(db, 'families', familyId), { name: trimmed, updatedAt: new Date() });
      setFamilyDoc((prev) => ({ ...prev, name: trimmed }));
      setRenameOpen(false);
    } catch (e) {
      console.error('Klarte ikke å endre navn.');
    }
  };

  const pickAndUploadFamilyImage = useCallback(async () => {
    try {
      const ownerIds = [familyDoc?.ownerUid, familyDoc?.ownerId, ownerUid].filter(Boolean);
      const adminUids = Array.isArray(familyDoc?.adminUids) ? familyDoc.adminUids : [];
      const canEdit =
        (adminUids.length === 0 && ownerIds.length === 0) ||
        ownerIds.includes(uid) ||
        adminUids.includes(uid);
      if (!canEdit) return;

      let ImagePicker;
      try { ImagePicker = await import('expo-image-picker'); } catch { return; }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      if (result.canceled) return;

      setUploading(true);
      const asset = result.assets[0];
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();

      const path = `families/${familyId}/banner_${Date.now()}.jpg`;
      const sref = storageRef(storage, path);
      await uploadBytes(sref, blob);
      const url = await getDownloadURL(sref);

      await updateDoc(doc(db, 'families', familyId), {
        photoURL: url,
        heroImageUrl: url,
        updatedAt: new Date(),
      });
      setFamilyDoc((prev) => ({ ...prev, photoURL: url, heroImageUrl: url, updatedAt: new Date() }));
      setImgVersion(Date.now());
    } catch (e) {
      console.error('Bildeopplasting feilet', e);
    } finally {
      setUploading(false);
    }
  }, [familyId, uid, familyDoc, ownerUid]);

  /* -------- parent admin actions ---------- */
  const parentKeysFor = (p) => {
    return Array.from(new Set([p?.uid, (p?.email || '').toLowerCase(), p?.id].filter(Boolean).map(String)));
  };
  const parentDocRefsFor = (p) => parentKeysFor(p).map((k) => doc(db, 'families', familyId, 'parents', k));

  const adminSetParentActive = async (p, activeVal) => {
    try {
      const now = new Date();
      const refs = parentDocRefsFor(p);
      const targetUid = p?.uid || null;
      const batch = writeBatch(db);
      refs.forEach((r) => batch.set(r, {
        active: !!activeVal,
        placeholder: activeVal ? false : (p?.placeholder ?? false),
        deleted: activeVal ? false : (p?.deleted ?? false),
        updatedAt: now,
        ...(activeVal
          ? { reactivatedAt: now, deactivatedBy: null, leftAt: null }
          : { deactivatedAt: now, deactivatedBy: uid }
        ),
      }, { merge: true }));
      await batch.commit();
      if (targetUid) {
        if (activeVal) {
          await restoreMemberFamilyAccess({ familyId, uid: targetUid, asAdmin: !!p?.admin });
        } else {
          await revokeMemberFamilyAccess({ familyId, uid: targetUid });
        }
      }
      await fetchAll();
    } catch (e) {
      console.error('Klarte ikke å oppdatere brukeren.');
    }
  };

  const adminDeleteParent = async (p) => {
    try {
      await softDeleteParentFromFamily({
        familyId,
        parentRefs: parentDocRefsFor(p),
        uid: p?.uid || null,
      });
      await fetchAll();
    } catch (e) {
      console.error('Klarte ikke å slette brukeren.');
    }
  };

  /* ---------- renderers ---------- */
  const renderChild = useCallback(
    ({ item }) => {
      const stat = childStats[item.id] || {
        tasks: 0, points: 0, money: 0, weeklyBudget: 0, rewardMode: item.rewardMode || 'money',
      };
      const isInactive = item.active === false;
      const rawPhoto = item.photoURL || item.photoUrl || '';
      const stamp =
        (item?.updatedAt && (item.updatedAt.seconds || item.updatedAt._seconds)) || Date.now();
      const photo = rawPhoto ? `${rawPhoto}${rawPhoto.includes('?') ? '&' : '?'}cb=${stamp}` : '';

      const showMoney = (item.rewardMode || stat.rewardMode) === 'money';
      const target = showMoney
        ? Number(item.weeklyBudget || stat.weeklyBudget || 0)
        : Number(stat.points || 0) || 0;
      const earned = showMoney ? Number(stat.money || 0) : Number(stat.points || 0);

      return (
        <TouchableOpacity
          onPress={() => navigation.navigate('ChildDashboard', { familyId, child: item, allowEdit: true })}
          activeOpacity={0.85}
          style={{ flex: 1 }}
        >
          <View style={[styles.childCard, isInactive && { opacity: 0.5 }]}>
            <View style={styles.childHeader}>
              <Image
                source={photo ? { uri: photo } : require('../assets/avatar-child.png')}
                style={styles.childAvatarSm}
              />
              <Text style={styles.childName} numberOfLines={1}>
                {item.name || 'Uten navn'}
              </Text>
              <TouchableOpacity
                style={styles.dotBtn}
                onPress={() => navigation.navigate('ChildProfile', { child: item, familyId })}
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.donutWrap}>
              <Donut
                size={118}
                stroke={12}
                value={Math.max(0, earned)}
                total={Math.max(1, target || 1)}
                unit={showMoney ? 'kr' : 'p'}
              />
            </View>

            {isInactive && <Text style={styles.tagMuted}>Deaktivert</Text>}
          </View>
        </TouchableOpacity>
      );
    },
    [childStats, familyId, navigation]
  );

  /* ---------- UI ---------- */
  if (loading) {
    const dn = fullWeekdayNO[new Date().getDay()];
    const wk = getISOWeek(new Date());
    return (
      <View style={{ flex: 1, backgroundColor: '#f6f9fc' }}>
        <TopNavBar
          title={familyName || familyDoc?.name || 'Familiedashboard'}
          subtitle={`${dn}  •  Uke ${wk.week} ${wk.year}`}
          showBack
          onBack={() => navigation.replace('FamilyOverview')}
          showInfo
          onInfoPress={() => setMenuOpen(true)}
          familyId={familyId}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0b74d1" />
        </View>
      </View>
    );
  }

  const backdropOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });
  const translateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });

  const bannerUriRaw = familyDoc?.photoURL || familyDoc?.heroImageUrl || '';
  const bannerUri = bannerUriRaw
    ? `${bannerUriRaw}${bannerUriRaw.includes('?') ? '&' : '?'}cb=${imgVersion}`
    : '';
  const dayName = fullWeekdayNO[new Date().getDay()];
  const { week: wk, year: yr } = getISOWeek(new Date());

  const confirmConfig = (() => {
    if (!confirm.open) return {};
    switch (confirm.kind) {
      case 'deactivate':
        return {
          title: 'Deaktiver familie?',
          message: 'Familien blir grået ut og kan ikke brukes. Du kan aktivere den senere.',
          confirmText: 'Deaktiver',
          danger: false,
          action: () => toggleFamilyActive(false),
        };
      case 'activate':
        return {
          title: 'Aktiver familie?',
          message: 'Familien blir aktiv igjen og kan brukes som normalt.',
          confirmText: 'Aktiver',
          danger: false,
          action: () => toggleFamilyActive(true),
        };
      case 'delete':
        return {
          title: 'Slett familie?',
          message: 'Alle data og personopplysninger slettes permanent. Er du sikker?',
          confirmText: 'Slett',
          danger: true,
          action: () => hardOrSoftDelete(),
        };
      default:
        return {};
    }
  })();

  const pConfirmConfig = (() => {
    if (!pConfirm.open || !pConfirm.parent) return {};
    const p = pConfirm.parent;
    if (pConfirm.kind === 'p-delete') {
      return {
        title: 'Slett foresatt?',
        message: `Dette fjerner ${p.name || p.email || 'bruker'} fra familien.`,
        confirmText: 'Slett',
        danger: true,
        action: () => adminDeleteParent(p),
      };
    }
    if (pConfirm.kind === 'p-deactivate') {
      return {
        title: 'Deaktiver foresatt?',
        message: 'Brukeren mister tilgang til familien. Kan aktiveres igjen senere.',
        confirmText: 'Deaktiver',
        danger: false,
        action: () => adminSetParentActive(p, false),
      };
    }
    if (pConfirm.kind === 'p-activate') {
      return {
        title: 'Aktiver foresatt?',
        message: 'Brukeren får tilgang til familien.',
        confirmText: 'Aktiver',
        danger: false,
        action: () => adminSetParentActive(p, true),
      };
    }
    return {};
  })();

  return (
    <View style={styles.container}>
      <TopNavBar
        title={familyDoc?.name || familyName || 'Familiedashboard'}
        subtitle={`${dayName}  •  Uke ${wk} ${yr}`}
        showBack
        onBack={() => navigation.replace('FamilyOverview')}
        showInfo
        onInfoPress={() => setMenuOpen(true)}
        familyId={familyId}
      />

      <View style={styles.heroWrap}>
        <Image
          source={bannerUri ? { uri: bannerUri } : require('../assets/hero-family.png')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {!familyActive && !familyDeleted && (
          <Text style={styles.inactiveBanner}>⚠️ Denne familien er deaktivert</Text>
        )}
        {familyDeleted && (
          <Text style={styles.inactiveBanner}>🚫 Denne familien er slettet – (vises kun hvis ikke hard-slettet)</Text>
        )}

        {familyId && (
          <TouchableOpacity
            style={styles.moduleChip}
            onPress={() => navigation.navigate('Activities', { familyId })}
            accessibilityRole="button"
          >
            <Ionicons name="fitness-outline" size={18} color="#fff" />
            <Text style={styles.moduleChipTxt}>Aktiviteter</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ===== Foresatte ===== */}
      <FlatList
        data={parents.filter((item) => item.deleted === true ? false : true)}
        key={'parents-grid'}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        keyExtractor={(item) => String(item.uid || item.id || item.email || Math.random())}
        renderItem={({ item }) => {
          const isUnverified = item?.emailVerified === false || item?.placeholder === true;
          const isInactive = item?.active === false && !isUnverified;
          const isDimmed = isUnverified || isInactive;
          const rawPhoto = item.photoURL || item.photoUrl || '';
          const stamp =
            (item?.updatedAt && (item.updatedAt.seconds || item.updatedAt._seconds)) ||
            Date.now();
          const photo = rawPhoto
            ? `${rawPhoto}${rawPhoto.includes('?') ? '&' : '?'}cb=${stamp}`
            : '';

          const onLong = !isAdmin ? undefined : () => setPAction({ open: true, parent: item });

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('ParentProfile', { parent: item, familyId })}
              onLongPress={onLong}
              delayLongPress={250}
              style={{ flex: 1 }}
            >
              <View style={[styles.parentChip, isDimmed && { opacity: 0.55 }]}>
                <Image
                  source={photo ? { uri: photo } : require('../assets/avatar-parent.png')}
                  style={styles.parentAvatar}
                />
                <Text style={styles.parentName} numberOfLines={1}>
                  {item.name || item.displayName || item.email || 'Ukjent'}
                </Text>
                {isAdmin && (
                  <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {item.active === false ? 'Deaktivert' : (isUnverified ? 'Ikke verifisert' : ' ')}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <Text style={styles.section}>Foresatte</Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginBottom: 14 }]}
              onPress={() => setAddSheetOpen(true)}
              disabled={!familyActive}
            >
              <Text style={styles.primaryBtnText}>➕ Legg til medlem</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={{ gap: 12, paddingBottom: 4, backgroundColor: '#f6f9fc' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0b74d1" />}
        showsVerticalScrollIndicator={false}
        style={{ opacity: !familyActive && !familyDeleted ? 0.35 : 1 }}
        pointerEvents={!familyActive && !familyDeleted ? 'none' : 'auto'}
      />

      {/* ===== Barn ===== */}
      <FlatList
        data={children}
        key={'children-grid'}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        keyExtractor={(item) => String(item.id || Math.random())}
        renderItem={renderChild}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <Text style={styles.section}>Barn</Text>
          </View>
        }
        contentContainerStyle={{ gap: 12, paddingBottom: 28, backgroundColor: '#f6f9fc' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0b74d1" />}
        showsVerticalScrollIndicator={false}
        style={{ opacity: !familyActive && !familyDeleted ? 0.35 : 1 }}
        pointerEvents={!familyActive && !familyDeleted ? 'none' : 'auto'}
      />

      {/* ===== Bottom Sheet: Legg til medlem ===== */}
      <Modal
        visible={addSheetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setAddSheetOpen(false)}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddSheetOpen(false)} />
          <Animated.View style={[styles.sheet, { maxHeight: 320, transform: [{ translateY }] }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Hva vil du legge til?</Text>

            <TouchableOpacity
              style={styles.sheetBtn}
              onPress={() => { setAddSheetOpen(false); navigation.navigate('AddChild', { familyId }); }}
            >
              <View style={styles.sheetBtnIcon}><Ionicons name="person-add-outline" size={18} color="#fff" /></View>
              <Text style={styles.sheetBtnTxt}>Legg til barn</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetBtn}
              onPress={() => { setAddSheetOpen(false); navigation.navigate('AddParent', { familyId }); }}
            >
              <View style={styles.sheetBtnIcon}><Ionicons name="people-outline" size={18} color="#fff" /></View>
              <Text style={styles.sheetBtnTxt}>Legg til foresatt</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: '#e5e7eb' }]} onPress={() => setAddSheetOpen(false)}>
              <View style={[styles.sheetBtnIcon, { backgroundColor: '#cbd5e1' }]}><Ionicons name="close" size={18} color="#0f172a" /></View>
              <Text style={[styles.sheetBtnTxt, { color: '#0f172a' }]}>Lukk</Text>
              <Ionicons name="chevron-down" size={18} color="#0f172a" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ===== Tannhjul-meny ===== */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>Familieinnstillinger</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { setMenuOpen(false); navigation.navigate('Activities', { familyId }); }}
          >
            <Ionicons name="fitness-outline" size={18} color="#0b1f33" />
            <Text style={styles.menuItemTxt}>Aktiviteter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); pickAndUploadFamilyImage(); }}>
            <Ionicons name="image-outline" size={18} color="#0b1f33" />
            <Text style={styles.menuItemTxt}>Bytt bakgrunnsbilde</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { setMenuOpen(false); setNewFamilyName(familyDoc?.name || ''); setRenameOpen(true); }}
          >
            <Ionicons name="create-outline" size={18} color="#0b1f33" />
            <Text style={styles.menuItemTxt}>Endre familienavn</Text>
          </TouchableOpacity>

          {isAdmin && !familyDeleted && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); setConfirm({ open: true, kind: familyActive ? 'deactivate' : 'activate' }); }}
            >
              <Ionicons
                name={familyActive ? 'pause-circle-outline' : 'play-circle-outline'}
                size={18}
                color={familyActive ? '#b00020' : '#0b1f33'}
              />
              <Text style={[styles.menuItemTxt, familyActive && { color: '#b00020' }]}>
                {familyActive ? 'Deaktiver familie' : 'Aktiver familie'}
              </Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); setConfirm({ open: true, kind: 'delete' }); }}
            >
              <Ionicons name="trash-outline" size={18} color="#b00020" />
              <Text style={[styles.menuItemTxt, { color: '#b00020' }]}>Slett familie</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* ===== Endre navn ===== */}
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setRenameOpen(false)} />
        <View style={styles.renameCard}>
          <Text style={styles.menuTitle}>Endre familienavn</Text>
          <TextInput value={newFamilyName} onChangeText={setNewFamilyName} placeholder="Familienavn" placeholderTextColor={colors.placeholder} style={styles.input} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={() => setRenameOpen(false)} style={[styles.smallBtn, { backgroundColor: '#e5e7eb' }]}>
              <Text style={[styles.smallBtnTxt, { color: '#0f172a' }]}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRenameFamily} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Bekreftelses-modaler ===== */}
      <ConfirmModal
        visible={confirm.open}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmDanger={confirmConfig.danger}
        onCancel={() => setConfirm({ open: false, kind: null })}
        onConfirm={async () => {
          const act = confirmConfig.action;
          setConfirm({ open: false, kind: null });
          if (typeof act === 'function') await act();
        }}
      />
      <ConfirmModal
        visible={pConfirm.open}
        title={pConfirmConfig.title}
        message={pConfirmConfig.message}
        confirmText={pConfirmConfig.confirmText}
        confirmDanger={pConfirmConfig.danger}
        onCancel={() => setPConfirm({ open: false, kind: null, parent: null })}
        onConfirm={async () => {
          const act = pConfirmConfig.action;
          setPConfirm({ open: false, kind: null, parent: null });
          if (typeof act === 'function') await act();
        }}
      />

      {/* Valg-meny for foresatt (erstatter Alert på web) */}
      <ParentActionModal
        visible={pAction.open}
        parent={pAction.parent}
        onClose={() => setPAction({ open: false, parent: null })}
        onChoose={(kind) => {
          setPAction({ open: false, parent: null });
          setPConfirm({ open: true, kind, parent: pAction.parent });
        }}
      />
    </View>
  );
}

/* ------------------ styles ------------------ */
const CARD_BG = 'rgba(255,255,255,0.92)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f9fc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f9fc' },

  heroWrap: { height: 160, backgroundColor: '#eaf2f9' },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.45)' },

  section: { fontSize: 16, fontWeight: '400', color: '#0f172a', marginBottom: 8 },

  parentChip: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }
      : { elevation: 2 }),
    flex: 1,
    margin: 6,
  },
  parentAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e2e8f0' },
  parentName: { marginTop: 6, fontSize: 12, textAlign: 'center', color: '#0f172a', fontWeight: '400' },

  childCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 12,
    flex: 1,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }
      : { elevation: 2 }),
  },
  childHeader: { flexDirection: 'row', alignItems: 'center' },
  childAvatarSm: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e2e8f0' },
  childName: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '400', color: '#0f172a' },
  dotBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 2 },

  donutWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 4 },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutValue: { fontSize: 16, fontWeight: '400', color: '#0f172a' },
  donutSub: { fontSize: 12, fontWeight: '400', color: '#64748b', marginTop: 2 },
  donutFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 6,
    borderColor: '#c7ddff',
  },

  tagMuted: {
    marginTop: 6,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    textAlign: 'center',
  },

  inactiveBanner: {
    backgroundColor: '#ffe6e6',
    padding: 10,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 14,
    color: '#b91c1c',
    marginBottom: 10,
    fontWeight: '400',
  },

  moduleChip: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0b74d1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  moduleChipTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },

  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  menuCard: {
    position: 'absolute',
    right: 12,
    top: 64,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }
      : { elevation: 5 }),
    width: 260,
    zIndex: 10,
  },
  menuTitle: { fontSize: 14, fontWeight: '400', color: '#0f172a', marginBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  menuItemTxt: { fontSize: 14, color: '#0b1f33' },

  confirmCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '30%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }
      : { elevation: 6 }),
  },
  confirmMsg: { color: '#334155', marginTop: 6 },

  renameCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '30%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }
      : { elevation: 5 }),
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.card,
    fontSize: 14,
    color: '#0f172a',
  },
  smallBtn: {
    alignSelf: 'flex-start', backgroundColor: '#0b74d1', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  smallBtnTxt: { color: '#fff', fontWeight: '400' },

  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#0b74d1',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 16px rgba(11,116,209,0.2)' }
      : { elevation: 2 }),
  },
  primaryBtnText: { color: '#fff', fontWeight: '400', fontSize: 16 },

  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 10000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 -12px 28px rgba(0,0,0,0.18)' }
      : { elevation: 8 }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: '400', color: '#0f172a', marginBottom: 8 },
  sheetBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#0b74d1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sheetBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0a66b3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sheetBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15, flex: 1, marginLeft: 10 },
});
