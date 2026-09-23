// screens/ChildSettingsScreen.jsx
// Complete child profile & settings — single source of truth for child profile config.
// Gjøremål/belønning styres i ChoreSettingsScreen (gjøremål-appen).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator, Alert, Share,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { colors, useLayout } from '../src/theme';
import { Screen, Loader } from '../components/ui';
import CompactBackLink from '../components/CompactBackLink';
import AvatarPicker, { AvatarBubble } from '../components/AvatarPicker';
import WebImageCropperModal from '../components/WebImageCropperModal';
import ConfirmDialog, { InfoDialog } from '../components/ConfirmDialog';
import BrandToggle from '../components/BrandToggle';
import ChildAppAccessCard from '../components/ChildAppAccessCard';
import BirthdayPicker from '../components/BirthdayPicker';
import ChangeChildPasswordModal from '../components/ChangeChildPasswordModal';
import { pickImage, uploadImage, alertPhotoError } from '../src/utils/media';
import { setMemberPassword } from '../src/utils/setMemberPassword';
import { claimUsername, isValidUsername } from '../src/utils/usernames';
import { CHILD_THEMES, DEFAULT_CHILD_THEME_ID, getChildTheme } from '../src/childThemes';
import {
  loadChildDashboardThemeId,
} from '../src/utils/childDashboardTheme';
import { calculateAge, toIsoDate } from '../src/utils/age';
import { friendAddByUsernameUrl } from '../src/utils/friendsLogic';

import { NOTIF_DEFAULT, mergeNotificationPrefs } from '../src/utils/notificationPrefs';
import { ensurePushSubscription } from '../src/utils/push';
import { clearLiveLocation } from '../src/utils/familyLocation';
import { mergeAllowedApps, persistChildAllowedApps } from '../src/utils/childApps';
import { aiImportNavParams } from '../src/utils/childNav';
import { canEnableHighChildFriendliness } from '../src/utils/childUi';
import ChildThemeBackdrop from '../components/ChildThemeBackdrop';
import { custodySummaryLabel, resolveCustodyLabels } from '../src/utils/custodySchedule';

const CHANNEL_LABELS = { email: 'E-post', push: 'Push', sms: 'SMS' };

const PANE_TITLES = {
  profile: 'Rediger profil',
  share: 'Del innlogging / QR-kode',
  login: 'Brukernavn og passord',
  account: 'Konto',
  appearance: 'Utseende',
  apps: 'Apper og tilganger',
  custody: 'Delt bosted',
  location: 'Posisjonsdeling',
  ai: 'AI-assistent',
  notifications: 'Varslinger',
};

function makeFormSnapshot(form, { childSelfOnly = false } = {}) {
  if (childSelfOnly) {
    return {
      photoURL: form.photoURL || null,
      avatarId: form.photoURL ? null : (form.avatarId || 'fox'),
      themeId: form.themeId || DEFAULT_CHILD_THEME_ID,
    };
  }
  return {
    name: (form.name || '').trim(),
    photoURL: form.photoURL || null,
    avatarId: form.photoURL ? null : (form.avatarId || 'fox'),
    birthday: (form.birthday || '').trim(),
    username: (form.username || '').trim(),
    email: (form.email || '').trim(),
    phone: (form.phone || '').trim(),
    aiEnabled: !!form.aiEnabled,
    locationSharingEnabled: !!form.locationSharingEnabled,
    locationSharingChildCanControl: !!form.locationSharingChildCanControl,
    themeId: form.themeId || DEFAULT_CHILD_THEME_ID,
    highChildFriendliness: !!form.highChildFriendliness,
    calendarSelfEdit: !!form.calendarSelfEdit,
    travelSelfEdit: !!form.travelSelfEdit,
    homeworkSelfEdit: form.homeworkSelfEdit !== false,
    leksehjelpAllowFasit: form.leksehjelpAllowFasit !== false,
    notificationPrefs: JSON.stringify(form.notificationPrefs || NOTIF_DEFAULT),
  };
}

function NavRow({ icon, label, hint, detail, onPress }) {
  const { isDesktop } = useLayout();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.navRow, isDesktop && styles.navRowCompact]}
      accessibilityRole="button"
    >
      <View style={[styles.iconCircle, isDesktop && styles.iconCircleCompact]}>
        <Ionicons name={icon} size={isDesktop ? 16 : 18} color={colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.navRowLabel, isDesktop && styles.navRowLabelDesk]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, isDesktop && styles.rowHintDesk]} numberOfLines={2}>{hint}</Text> : null}
      </View>
      {detail ? (
        <Text style={[styles.navRowDetail, isDesktop && styles.rowHintDesk]} numberOfLines={1}>{detail}</Text>
      ) : null}
      {isDesktop ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </TouchableOpacity>
  );
}

function SectionLabel({ title }) {
  const { isDesktop } = useLayout();
  return <Text style={[styles.hubSection, isDesktop && styles.hubSectionDesk]}>{title}</Text>;
}

function Row({ label, children, hint, style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <View style={styles.rowRight}>{children}</View>
    </View>
  );
}

export default function ChildSettingsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { familyId, child } = route.params || {};
  const childId = child?.id || child?.childId;
  const focusRestrictions = route.params?.focus === 'restrictions';
  const focusLogin = route.params?.focus === 'login';

  const { isParent, isChild, isAdmin: ctxAdmin, parents } = useApp();
  const { isDesktop } = useLayout();
  // Foresatt som redigerer barnets innstillinger (full tilgang).
  const canRestrict = isParent && !isChild;
  // Innlogget barn — kun profilbilde/figur og utseende.
  const isChildSelfView = !!isChild;

  // Profile
  const [name, setName] = useState(child?.name || '');
  const [photoURL, setPhotoURL] = useState(child?.photoURL || child?.photoUrl || null);
  const [avatarId, setAvatarId] = useState(child?.avatarId || 'fox');
  const [birthday, setBirthday] = useState(
    () => toIsoDate(child?.birthday || child?.birthdate) || '',
  );
  const [username, setUsername] = useState('');
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  // Password (admin only) — view saved copy; change via modal
  const [savedPassword, setSavedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // AI access / apper barnet kan bruke
  const [aiEnabled, setAiEnabled] = useState(true);
  const [allowedApps, setAllowedApps] = useState(() => mergeAllowedApps(
    child?.allowedApps,
    { aiEnabled: typeof child?.aiEnabled === 'boolean' ? child.aiEnabled : true },
  ));
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false);
  const [locationSharingChildCanControl, setLocationSharingChildCanControl] = useState(false);
  const [themeId, setThemeId] = useState(DEFAULT_CHILD_THEME_ID);
  const [dashboardThemeId, setDashboardThemeId] = useState(null);
  const [highChildFriendliness, setHighChildFriendliness] = useState(
    child?.highChildFriendliness === true,
  );
  const [calendarSelfEdit, setCalendarSelfEdit] = useState(child?.calendarSelfEdit === true);
  const [travelSelfEdit, setTravelSelfEdit] = useState(child?.travelSelfEdit === true);
  const [homeworkSelfEdit, setHomeworkSelfEdit] = useState(child?.homeworkSelfEdit !== false);
  const [leksehjelpAllowFasit, setLeksehjelpAllowFasit] = useState(
    child?.leksehjelpAllowFasit !== false,
  );
  const [custodyDoc, setCustodyDoc] = useState(child?.custody || null);

  // Notifications (per-user)
  const notifUid = auth.currentUser?.uid || null;
  const [notificationPrefs, setNotificationPrefs] = useState(NOTIF_DEFAULT);

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [isAdmin, setIsAdmin] = useState(!!ctxAdmin);
  const [baseline, setBaseline] = useState(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '', onClose: null });
  const [pane, setPane] = useState(() => (
    focusRestrictions ? 'apps' : focusLogin ? 'login' : null
  ));
  const [copiedShare, setCopiedShare] = useState(false);

  const childDocRef = doc(db, 'families', familyId, 'children', childId);

  const age = useMemo(() => calculateAge(birthday), [birthday]);

  const isUnder18 = age == null || age < 18;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isUnder18) {
        if (alive) setDashboardThemeId(null);
        return;
      }
      const id = await loadChildDashboardThemeId(childId, {
        age,
        remoteId: child?.dashboardThemeId || null,
      });
      if (alive) setDashboardThemeId(id);
    })();
    return () => { alive = false; };
  }, [childId, age, isUnder18, child?.dashboardThemeId]);

  const currentForm = useMemo(() => ({
    name, photoURL, avatarId, birthday, username, email, phone,
    aiEnabled, locationSharingEnabled, locationSharingChildCanControl, themeId,
    highChildFriendliness, calendarSelfEdit, travelSelfEdit, homeworkSelfEdit, leksehjelpAllowFasit, notificationPrefs,
  }), [
    name, photoURL, avatarId, birthday, username, email, phone,
    aiEnabled, locationSharingEnabled, locationSharingChildCanControl, themeId,
    highChildFriendliness, calendarSelfEdit, travelSelfEdit, homeworkSelfEdit, leksehjelpAllowFasit, notificationPrefs,
  ]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    const snapOpts = { childSelfOnly: isChildSelfView };
    return JSON.stringify(makeFormSnapshot(currentForm, snapOpts)) !== JSON.stringify(baseline);
  }, [baseline, currentForm, isChildSelfView]);

  const canSave = isDirty && (isChildSelfView || !!name.trim()) && !saving;

  // Load child doc
  useEffect(() => {
    let active = true;
    getDoc(childDocRef).then((snap) => {
      if (!active) return;
      const d = snap.exists() ? snap.data() : {};
      const loadedAiEnabled = typeof d.aiEnabled === 'boolean' ? d.aiEnabled : true;
      const loaded = {
        name: d.name || child?.name || '',
        photoURL: d.photoURL || child?.photoURL || child?.photoUrl || null,
        avatarId: d.avatarId || child?.avatarId || 'fox',
        birthday: toIsoDate(d.birthday || d.birthdate || child?.birthday || child?.birthdate) || '',
        username: d.username || '',
        email: d.email || '',
        phone: d.phone || '',
        password: d.password || '',
        aiEnabled: loadedAiEnabled,
        allowedApps: mergeAllowedApps(d.allowedApps, { aiEnabled: loadedAiEnabled }),
        locationSharingEnabled: typeof d.locationSharingEnabled === 'boolean' ? d.locationSharingEnabled : false,
        locationSharingChildCanControl: d.locationSharingChildCanControl === true,
        themeId: d.themeId || DEFAULT_CHILD_THEME_ID,
        highChildFriendliness: d.highChildFriendliness === true,
        calendarSelfEdit: d.calendarSelfEdit === true,
        travelSelfEdit: d.travelSelfEdit === true,
        homeworkSelfEdit: d.homeworkSelfEdit !== false,
        leksehjelpAllowFasit: d.leksehjelpAllowFasit !== false,
        custody: d.custody || null,
      };
      setName(loaded.name);
      setPhotoURL(loaded.photoURL);
      setAvatarId(loaded.avatarId);
      setBirthday(loaded.birthday);
      const loadedUsername = String(loaded.username || '').replace(/^@+/, '').trim();
      setUsername(loadedUsername);
      setUsernameLocked(loadedUsername.length >= 3);
      setEmail(loaded.email);
      setPhone(loaded.phone);
      // Barnepassord lagres som lesbar kopi for foresatte (satt via setMemberPassword).
      setSavedPassword(String(loaded.password || ''));
      setShowPassword(false);
      setAiEnabled(loaded.aiEnabled);
      setAllowedApps(loaded.allowedApps);
      setLocationSharingEnabled(loaded.locationSharingEnabled);
      setLocationSharingChildCanControl(loaded.locationSharingChildCanControl);
      setThemeId(loaded.themeId);
      setHighChildFriendliness(loaded.highChildFriendliness);
      setCalendarSelfEdit(loaded.calendarSelfEdit);
      setTravelSelfEdit(loaded.travelSelfEdit);
      setHomeworkSelfEdit(loaded.homeworkSelfEdit);
      setLeksehjelpAllowFasit(loaded.leksehjelpAllowFasit);
      setCustodyDoc(loaded.custody);
      setBaseline(makeFormSnapshot(
        { ...loaded, notificationPrefs },
        { childSelfOnly: isChildSelfView },
      ));
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, childId, isChildSelfView]);

  // Load notification prefs from users/{uid} (foresatte styrer dette for barn)
  useEffect(() => {
    let active = true;
    if (!notifUid || isChildSelfView) return () => { active = false; };
    (async () => {
      try {
        const s = await getDoc(doc(db, 'users', notifUid));
        if (!active) return;
        const p = s.exists() ? (s.data()?.notificationPrefs || null) : null;
        if (!p) return;
        const merged = mergeNotificationPrefs(p);
        setNotificationPrefs(merged);
        setBaseline((prev) => {
          if (!prev || isChildSelfView) return prev;
          return { ...prev, notificationPrefs: JSON.stringify(merged) };
        });
      } catch {}
    })();
    return () => { active = false; };
  }, [notifUid, isChildSelfView]);

  const showInfo = useCallback((title, message, onClose) => {
    if (Platform.OS === 'web') {
      setInfoDialog({ visible: true, title, message, onClose: onClose || null });
      return;
    }
    Alert.alert(title, message, [{ text: 'OK', onPress: onClose }]);
  }, []);

  // Check admin (combine live detection with app-context admin knowledge)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !familyId) return;
    (async () => {
      try {
        let admin = false;
        const topP = await getDoc(doc(db, 'parents', uid));
        if (topP.exists() && topP.data()?.admin === true) admin = true;
        const famP = await getDoc(doc(db, 'families', familyId, 'parents', uid));
        if (famP.exists() && famP.data()?.admin === true) admin = true;
        const famDoc = await getDoc(doc(db, 'families', familyId));
        const admins = famDoc.exists() ? (famDoc.data()?.adminUids || []) : [];
        if (Array.isArray(admins) && admins.includes(uid)) admin = true;
        setIsAdmin(admin || !!ctxAdmin);
      } catch { setIsAdmin(!!ctxAdmin); }
    })();
  }, [familyId, ctxAdmin]);

  const pickPhoto = useCallback(async (fromCamera) => {
    if (!familyId || !childId) return;
    setPhotoBusy(true);
    try {
      const picked = await pickImage({ camera: fromCamera });
      if (!picked?.uri) return;
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      const url = await uploadImage(
        `families/${familyId}/avatars/child-${childId}-${Date.now()}.jpg`,
        picked,
      );
      setPhotoURL(url);
      setAvatarId(null);
    } catch (e) {
      console.warn('[ChildSettings] photo upload failed', e);
      alertPhotoError(e);
    } finally {
      setPhotoBusy(false);
    }
  }, [familyId, childId]);

  const confirmCroppedPhoto = useCallback(async (blob) => {
    if (!familyId || !childId) return;
    setPhotoBusy(true);
    try {
      const url = await uploadImage(
        `families/${familyId}/avatars/child-${childId}-${Date.now()}.jpg`,
        { blob },
      );
      setPhotoURL(url);
      setAvatarId(null);
      setCropVisible(false);
      setSelectedImageUri(null);
    } catch (e) {
      console.warn('[ChildSettings] cropped upload failed', e);
      alertPhotoError(e);
    } finally {
      setPhotoBusy(false);
    }
  }, [familyId, childId]);

  // Apper barnet kan bruke — lagres med en gang, uavhengig av hoved-lagre-knappen.
  const setAppAllowed = useCallback((appId, value) => {
    if (!canRestrict || !familyId || !childId) return;
    setAllowedApps((prev) => {
      const next = { ...prev, [appId]: value };
      persistChildAllowedApps(familyId, childId, next).catch(() => {});
      return next;
    });
    if (appId === 'ai') {
      setAiEnabled(value);
      setBaseline((prev) => (prev ? { ...prev, aiEnabled: value } : prev));
    }
  }, [canRestrict, familyId, childId]);

  const performSave = useCallback(async () => {
    if (!familyId || !childId) {
      showInfo('Feil', 'Mangler barn eller familie — gå tilbake og prøv igjen.');
      return;
    }
    if (!isChildSelfView && !name.trim()) {
      showInfo('Mangler navn', 'Skriv inn barnets navn.');
      return;
    }
    setSaving(true);
    try {
      // Barn kan kun lagre profilbilde/figur og fargetema.
      if (isChildSelfView) {
        const childPayload = {
          photoURL: photoURL || null,
          avatarId: photoURL ? null : (avatarId || 'fox'),
          themeId: themeId || DEFAULT_CHILD_THEME_ID,
          ...(isUnder18 && dashboardThemeId
            ? { dashboardThemeId }
            : {}),
          updatedAt: serverTimestamp(),
        };
        await Promise.all([
          setDoc(childDocRef, childPayload, { merge: true }),
          setDoc(doc(db, 'children', childId), childPayload, { merge: true }).catch(() => {}),
        ]);
        setBaseline(makeFormSnapshot(currentForm, { childSelfOnly: true }));
        setConfirmSaveOpen(false);
        showInfo('Lagret', 'Innstillingene er lagret.', () => navigation.goBack());
        return;
      }

      const payload = {
        name: name.trim(),
        photoURL: photoURL || null,
        avatarId: photoURL ? null : (avatarId || 'fox'),
        birthdate: birthday.trim() || null,
        birthday: birthday.trim() || null,
        aiEnabled: canRestrict ? (allowedApps.ai !== false) : aiEnabled,
        locationSharingEnabled,
        locationSharingChildCanControl: locationSharingEnabled
          ? locationSharingChildCanControl
          : false,
        themeId: themeId || DEFAULT_CHILD_THEME_ID,
        ...(isUnder18 && dashboardThemeId
          ? { dashboardThemeId }
          : {}),
        highChildFriendliness: canEnableHighChildFriendliness({ birthday })
          ? !!highChildFriendliness
          : false,
        calendarSelfEdit: canRestrict ? !!calendarSelfEdit : false,
        travelSelfEdit: canRestrict ? !!travelSelfEdit : false,
        homeworkSelfEdit: canRestrict ? homeworkSelfEdit !== false : true,
        leksehjelpAllowFasit: canRestrict ? !!leksehjelpAllowFasit : true,
        updatedAt: serverTimestamp(),
      };
      if (canRestrict) {
        payload.allowedApps = allowedApps;
      }
      if (isAdmin) {
        // Brukernavn låses etter første valg — bare sett hvis det mangler.
        if (!usernameLocked && username.trim()) {
          const uname = username.trim().replace(/^@+/, '').toLowerCase();
          if (!isValidUsername(uname)) {
            throw new Error('Ugyldig brukernavn. Bruk 3–24 tegn: a–z, 0–9, punkt, understrek eller bindestrek.');
          }
          const childUid = child?.uid || childId;
          await claimUsername(uname, childUid, 'child');
          payload.username = uname;
          payload.usernameLower = uname;
          await setDoc(doc(db, 'users', childUid), {
            username: uname,
            usernameLower: uname,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
          setUsername(uname);
          setUsernameLocked(true);
        }
        if (email.trim()) payload.email = email.trim();
        if (phone.trim()) payload.phone = phone.trim();
        // Passord skrives kun via setMemberPassword (Admin SDK) — ikke her.
      }
      await Promise.all([
        setDoc(childDocRef, payload, { merge: true }),
        setDoc(doc(db, 'children', childId), payload, { merge: true }).catch(() => {}),
      ]);

      if (!locationSharingEnabled) {
        const childUid = child?.uid || null;
        if (childUid && familyId) {
          clearLiveLocation(familyId, childUid).catch(() => {});
        }
      }

      if (notifUid) {
        await setDoc(doc(db, 'users', notifUid), { notificationPrefs }, { merge: true });
      }

      setBaseline(makeFormSnapshot(currentForm));
      setConfirmSaveOpen(false);
      showInfo('Lagret', 'Innstillingene er lagret.', () => navigation.goBack());
    } catch (e) {
      console.warn('[ChildSettings] save failed', e);
      showInfo('Feil', 'Klarte ikke lagre. Prøv igjen.');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, photoURL, avatarId, birthday, username, usernameLocked, email, phone, aiEnabled, allowedApps, canRestrict, isChildSelfView, locationSharingEnabled, locationSharingChildCanControl, themeId, dashboardThemeId, isUnder18, highChildFriendliness, calendarSelfEdit, travelSelfEdit, homeworkSelfEdit, leksehjelpAllowFasit, isAdmin, familyId, childId, child, notificationPrefs, currentForm, showInfo, navigation, notifUid]);

  const saveChildPassword = useCallback(async (nextPassword) => {
    setPasswordBusy(true);
    try {
      await setMemberPassword({
        uid: child?.uid || childId,
        password: nextPassword,
        familyId,
      });
      setSavedPassword(nextPassword);
      setShowPassword(false);
      setChangePasswordOpen(false);
      showInfo('Passord lagret', 'Det nye passordet er aktivt. Trykk øyet for å vise det.');
    } catch (e) {
      console.warn('[ChildSettings] password save failed', e);
      showInfo('Feil', e?.message || 'Klarte ikke lagre passordet.');
    } finally {
      setPasswordBusy(false);
    }
  }, [child?.uid, childId, familyId, showInfo]);

  const requestSave = useCallback(() => {
    if (!canSave) return;
    if (Platform.OS === 'web') {
      setConfirmSaveOpen(true);
      return;
    }
    Alert.alert(
      'Lagre endringer?',
      `Vil du lagre endringene for ${name.trim() || 'barnet'}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Lagre', onPress: performSave },
      ],
    );
  }, [canSave, name, performSave]);

  const updateEventChannel = useCallback((eventType, channel, value) => {
    setNotificationPrefs((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [eventType]: { ...(prev.events?.[eventType] || {}), [channel]: value },
      },
    }));
    if (eventType === 'messageReceived' && channel === 'push' && value && notifUid) {
      ensurePushSubscription(notifUid).catch(() => {});
    }
  }, [notifUid]);

  const loginHandle = String(username || '').replace(/^@+/, '').trim();
  const shareUrl = loginHandle ? friendAddByUsernameUrl(loginHandle) : '';

  const copyShare = useCallback(async () => {
    if (!loginHandle) return;
    const text = `@${loginHandle}${shareUrl ? `\n${shareUrl}` : ''}`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2000);
        return;
      }
      await Share.share({ message: text });
    } catch {
      Alert.alert('Brukernavn', `@${loginHandle}`);
    }
  }, [loginHandle, shareUrl]);

  const saveBar = (
    <TouchableOpacity
      style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
      onPress={requestSave}
      disabled={!canSave}
    >
      {saving
        ? <ActivityIndicator color="#fff" />
        : (
          <Text style={[styles.saveBtnTxt, !canSave && styles.saveBtnTxtDisabled]}>
            {isDirty ? 'Lagre endringer' : 'Ingen endringer'}
          </Text>
        )}
    </TouchableOpacity>
  );

  const profileEditor = (
    <View style={styles.group}>
      <View style={[styles.heroSection, isChildSelfView && styles.heroSectionLast]}>
        <View style={styles.heroAvatarWrap}>
          {photoBusy ? (
            <View style={styles.photoPlaceholder}><ActivityIndicator color={colors.brand} /></View>
          ) : (
            <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={104} />
          )}
          {age !== null && (
            <View style={styles.ageBadge}>
              <Text style={styles.ageBadgeTxt}>{age} år</Text>
            </View>
          )}
        </View>
        <Text style={styles.heroName}>{name || 'Barn'}</Text>

        <View style={styles.photoActions}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.photoChip} onPress={() => pickPhoto(true)} disabled={photoBusy}>
              <Ionicons name="camera-outline" size={16} color={colors.brand} />
              <Text style={styles.photoChipTxt}>Ta bilde</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.photoChip} onPress={() => pickPhoto(false)} disabled={photoBusy}>
            <Ionicons name="image-outline" size={16} color={colors.brand} />
            <Text style={styles.photoChipTxt}>Velg bilde</Text>
          </TouchableOpacity>
          {photoURL && (
            <TouchableOpacity
              style={[styles.photoChip, styles.photoChipDanger]}
              onPress={() => setPhotoURL(null)}
              disabled={photoBusy}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.photoChipTxt, { color: colors.danger }]}>Fjern bilde</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.avatarToggle}
          onPress={() => setAvatarPickerOpen((o) => !o)}
          accessibilityRole="button"
        >
          <Text style={styles.avatarToggleTxt}>Velg figur</Text>
          <Ionicons
            name={avatarPickerOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.brand}
          />
        </TouchableOpacity>
        {avatarPickerOpen && (
          <View style={styles.avatarPickerWrap}>
            <AvatarPicker
              value={avatarId || 'fox'}
              onChange={(id) => { setAvatarId(id); setPhotoURL(null); }}
            />
          </View>
        )}
      </View>

      {!isChildSelfView && (
        <>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Navn</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Barnets navn"
              autoCapitalize="words"
            />
          </View>

          <View style={[styles.fieldWrap, styles.fieldWrapLast]}>
            <Text style={styles.fieldLabel}>Fødselsdato</Text>
            <BirthdayPicker
              value={birthday}
              onChange={setBirthday}
              defaultAge={8}
              showAge
              allowClear
            />
          </View>
        </>
      )}
    </View>
  );

  const loginEditor = (isChildSelfView || isAdmin || canRestrict) ? (
    <View style={styles.loginCard}>
      <View style={styles.loginCardHeader}>
        <Ionicons name="key-outline" size={20} color={colors.brand} />
        <Text style={styles.loginCardTitle}>
          {isChildSelfView ? 'Min innlogging' : 'Innlogging på ny enhet'}
        </Text>
      </View>
      <Text style={styles.loginCardHint}>
        {isChildSelfView
          ? 'Bruk dette brukernavnet når du logger inn på en ny telefon eller PC. Spør foresatte hvis du trenger nytt passord.'
          : 'Vis barnet brukernavn og passord når det skal logge inn på en ny enhet.'}
      </Text>
      <Text style={styles.loginLabel}>Brukernavn</Text>
      {usernameLocked || isChildSelfView ? (
        <View style={styles.lockedUsernameRow}>
          <Text style={styles.lockedUsername}>
            {username ? `@${username.replace(/^@+/, '')}` : 'Ikke satt ennå'}
          </Text>
          {username ? <Ionicons name="lock-closed-outline" size={16} color={colors.muted} /> : null}
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="velg-brukernavn"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      {!isChildSelfView && usernameLocked ? (
        <Text style={styles.hint}>Brukernavn er valgt og kan ikke endres.</Text>
      ) : null}
      {!isChildSelfView && !usernameLocked ? (
        <Text style={styles.hint}>Velg én gang — brukernavnet låses etter lagring.</Text>
      ) : null}

      {isAdmin && !isChildSelfView ? (
        <>
          <Text style={[styles.loginLabel, { marginTop: 12 }]}>Passord</Text>
          {savedPassword ? (
            <>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={savedPassword}
                  editable={false}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Skjul passord' : 'Vis passord'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Trykk øyet for å se passordet sammen med barnet.
              </Text>
              <TouchableOpacity
                style={styles.changePasswordBtn}
                onPress={() => setChangePasswordOpen(true)}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={18} color={colors.brand} />
                <Text style={styles.changePasswordBtnTxt}>Endre passord</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.lockedUsernameRow}>
                <Text style={[styles.lockedUsername, { color: colors.muted }]}>
                  {usernameLocked ? 'Satt — kan ikke vises ennå' : 'Ikke satt'}
                </Text>
                <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
              </View>
              <Text style={styles.hint}>
                {usernameLocked
                  ? 'Passordet finnes i innloggingen, men er ikke lagret her for visning. Sett det på nytt én gang — deretter kan du se det med øyet.'
                  : 'Sett et passord barnet kan logge inn med.'}
              </Text>
              <TouchableOpacity
                style={styles.changePasswordBtn}
                onPress={() => setChangePasswordOpen(true)}
                accessibilityRole="button"
              >
                <Ionicons name="key-outline" size={18} color={colors.brand} />
                <Text style={styles.changePasswordBtnTxt}>
                  {usernameLocked ? 'Sett nytt passord' : 'Sett passord'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      ) : null}
    </View>
  ) : null;

  const appearanceEditor = (
    <View style={styles.group}>
      {isUnder18 ? (
        <TouchableOpacity
          style={[styles.row, styles.rowLast]}
          onPress={() => navigation.navigate('ChildDashboardThemeSettings', { child })}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Tilpass hjem</Text>
            <Text style={styles.rowHint}>
              Velg bilde og bunnmeny. Widgets tilpasser du direkte på hjem.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.themeGrid}>
            {CHILD_THEMES.map((theme) => {
              const selected = themeId === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.themeCard,
                    selected && { borderColor: theme.brand, borderWidth: 2 },
                  ]}
                  onPress={() => setThemeId(theme.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: theme.bg }]}>
                    <View style={[styles.themeAccent, { backgroundColor: theme.brand }]} />
                    {theme.emoji ? (
                      <Text style={styles.themeEmoji}>{theme.emoji}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.themeLabel, selected && { color: theme.brand, fontWeight: '900' }]}>
                    {theme.label}
                  </Text>
                  {theme.pattern ? (
                    <Text style={styles.themePatternHint}>mønster</Text>
                  ) : null}
                  {selected && (
                    <Ionicons name="checkmark-circle" size={16} color={theme.brand} style={{ marginTop: 2 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {getChildTheme(themeId)?.pattern ? (
            <View style={[styles.themePreview, { backgroundColor: getChildTheme(themeId).bg }]}>
              <ChildThemeBackdrop themeId={themeId} />
              <Text style={styles.themePreviewTxt}>
                Forhåndsvisning · {getChildTheme(themeId).label}
              </Text>
            </View>
          ) : null}
        </>
      )}

      {!isChildSelfView && canEnableHighChildFriendliness({ birthday }) && (
        <Row
          label="Barnevennlighet høy"
          hint="For små barn (under 7): større ikoner, mindre tekst, og uten hamburgermeny. Passer når barnet ikke leser ennå."
        >
          <BrandToggle
            value={highChildFriendliness}
            onValueChange={setHighChildFriendliness}
          />
        </Row>
      )}
    </View>
  );

  const renderHub = () => (
    <>
      <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
      {isDesktop ? null : (
        <Text style={styles.screenTitle}>
          {isChildSelfView ? 'Mine innstillinger' : 'Barnets profil'}
        </Text>
      )}
      <Text style={styles.screenSub}>{name || 'Barn'}</Text>

      {isChildSelfView && (
        <View style={styles.guardianNotice}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.brand} />
          <Text style={styles.guardianNoticeTxt}>
            Du kan endre profilbilde, figur og utseende her. Navn, fødselsdato,
            posisjonsdeling og varslinger styres av foresatte.
          </Text>
        </View>
      )}

      <View style={styles.group}>
        <TouchableOpacity
          style={[styles.profileCard, isDesktop && styles.profileCardDesk]}
          onPress={() => setPane('profile')}
          accessibilityRole="button"
        >
          <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={isDesktop ? 40 : 56} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, isDesktop && styles.profileNameDesk]}>{name || 'Barn'}</Text>
            <Text style={styles.profileSub}>
              {age != null ? `${age} år` : (isChildSelfView ? 'Endre profilbilde og figur' : 'Bilde, navn og fødselsdato')}
            </Text>
          </View>
          {isDesktop ? null : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
        </TouchableOpacity>
        <NavRow
          icon="person-circle"
          label="Rediger profil"
          hint={isChildSelfView ? 'Profilbilde og figur' : 'Bilde, navn og fødselsdato'}
          onPress={() => setPane('profile')}
        />
      </View>

      <SectionLabel title="Deling" />
      <View style={styles.group}>
        <NavRow
          icon="qr-code-outline"
          label="Del innlogging / QR-kode"
          hint="Vis brukernavn og QR for ny enhet eller venner"
          detail={loginHandle ? `@${loginHandle}` : 'Ikke satt'}
          onPress={() => setPane('share')}
        />
      </View>

      {(isChildSelfView || isAdmin || canRestrict) ? (
        <>
          <SectionLabel title="Konto" />
          <View style={styles.group}>
            <NavRow
              icon="key-outline"
              label="Brukernavn og passord"
              hint={
                isChildSelfView
                  ? 'Se brukernavnet ditt'
                  : savedPassword
                    ? 'Se innlogging eller endre passord'
                    : 'Sett brukernavn og passord'
              }
              detail={loginHandle ? `@${loginHandle}` : 'Ikke satt'}
              onPress={() => setPane('login')}
            />
            {isAdmin && !isChildSelfView ? (
              <NavRow
                icon="mail-outline"
                label="Konto"
                hint="E-post og telefon"
                onPress={() => setPane('account')}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <SectionLabel title="Hjem og utseende" />
      <View style={styles.group}>
        <NavRow
          icon="color-palette-outline"
          label="Utseende"
          hint={isUnder18
            ? 'Bilde, bunnmeny — deretter widgets direkte på hjem'
            : 'Fargetema og barnevennlige bakgrunner'}
          onPress={() => setPane('appearance')}
        />
      </View>

      {!isChildSelfView ? (
        <>
          <SectionLabel title="Tilganger" />
          <View style={styles.group}>
            {canRestrict ? (
              <NavRow
                icon="apps"
                label="Apper og tilganger"
                hint="Hvilke moduler barnet kan bruke"
                onPress={() => setPane('apps')}
              />
            ) : null}
            {canRestrict ? (
              <NavRow
                icon="home-outline"
                label="Delt bosted"
                hint="Hvor barnet bor hos hver forelder"
                onPress={() => setPane('custody')}
              />
            ) : null}
            <NavRow
              icon="navigate-outline"
              label="Posisjonsdeling"
              hint="Om familien kan se barnets posisjon"
              onPress={() => setPane('location')}
            />
            <NavRow
              icon="sparkles-outline"
              label="AI-assistent"
              hint="Info, ukeplan- og lekseplan-import"
              onPress={() => setPane('ai')}
            />
            <NavRow
              icon="notifications-outline"
              label="Varslinger"
              hint="Hva barnet skal få beskjed om"
              onPress={() => setPane('notifications')}
            />
          </View>
        </>
      ) : null}

      {saveBar}
    </>
  );

  const renderPane = () => {
    const title = PANE_TITLES[pane] || 'Innstillinger';
    let body = null;
    if (pane === 'profile') body = profileEditor;
    else if (pane === 'share') {
      body = (
        <View style={styles.shareCard}>
          <Text style={styles.loginCardHint}>
            Del brukernavnet så barnet kan logge inn på en ny enhet. QR-koden brukes også for å legge til venner.
          </Text>
          <View style={styles.lockedUsernameRow}>
            <Text style={styles.lockedUsername}>
              {loginHandle ? `@${loginHandle}` : 'Ikke satt ennå'}
            </Text>
            {loginHandle ? <Ionicons name="person-outline" size={16} color={colors.muted} /> : null}
          </View>
          {!loginHandle ? (
            <Text style={styles.hint}>
              {isAdmin && !isChildSelfView
                ? 'Sett brukernavn under Brukernavn og passord først.'
                : 'Foresatte må sette brukernavn før innlogging kan deles.'}
            </Text>
          ) : (
            <>
              <View style={styles.qrBox}>
                <QRCode value={shareUrl} size={168} />
              </View>
              <TouchableOpacity style={styles.shareBtn} onPress={copyShare} accessibilityRole="button">
                <Ionicons name="copy-outline" size={18} color={colors.brand} />
                <Text style={styles.shareBtnTxt}>{copiedShare ? 'Kopiert' : 'Kopier brukernavn / lenke'}</Text>
              </TouchableOpacity>
              {(isChildSelfView || isAdmin || canRestrict) ? (
                <TouchableOpacity style={styles.shareBtn} onPress={() => setPane('login')} accessibilityRole="button">
                  <Ionicons name="key-outline" size={18} color={colors.brand} />
                  <Text style={styles.shareBtnTxt}>Brukernavn og passord</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      );
    } else if (pane === 'login') body = loginEditor;
    else if (pane === 'account') {
      body = isAdmin && !isChildSelfView ? (
        <View style={styles.group}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>E-post</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="barn@eksempel.no"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.fieldWrap, styles.fieldWrapLast]}>
            <Text style={styles.fieldLabel}>Telefon</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+47 000 00 000"
              keyboardType="phone-pad"
            />
          </View>
        </View>
      ) : null;
    } else if (pane === 'appearance') body = appearanceEditor;
    else if (pane === 'apps' && canRestrict) {
      body = (
        <>
          <ChildAppAccessCard
            allowedApps={allowedApps}
            onToggle={setAppAllowed}
            title=""
            subtitle=""
          />
          {allowedApps?.plan !== false ? (
            <Row
              label="Redigere egen kalender"
              hint="Når dette er på kan barnet legge til og endre kalenderoppføringer de ser. Uten dette kan de bare lese dem."
              style={(allowedApps?.scratchMap !== false || allowedApps?.reiseplanlegger !== false || allowedApps?.lekser !== false || allowedApps?.leksehjelp !== false) ? null : styles.rowLast}
            >
              <BrandToggle
                value={calendarSelfEdit}
                onValueChange={setCalendarSelfEdit}
              />
            </Row>
          ) : null}
          {(allowedApps?.scratchMap !== false || allowedApps?.reiseplanlegger !== false) ? (
            <Row
              label="Redigere reiser"
              hint="Av som standard: barnet kan se Våre reiser og Reiseplanlegger, men ikke legge til eller endre. Slå på for å la barnet redigere."
              style={(allowedApps?.lekser !== false || allowedApps?.leksehjelp !== false) ? null : styles.rowLast}
            >
              <BrandToggle
                value={travelSelfEdit}
                onValueChange={setTravelSelfEdit}
              />
            </Row>
          ) : null}
          {allowedApps?.lekser !== false ? (
            <Row
              label="Barnet kan legge inn egne lekser"
              hint="Når Lekser er på, kan barnet opprette og redigere lekser knyttet til fag. Skru av hvis bare foresatte skal legge inn lekser."
              style={allowedApps?.leksehjelp !== false ? null : styles.rowLast}
            >
              <BrandToggle
                value={homeworkSelfEdit !== false}
                onValueChange={setHomeworkSelfEdit}
              />
            </Row>
          ) : null}
          {allowedApps?.leksehjelp !== false ? (
            <Row
              label="Tillat fasit i leksehjelp"
              hint="Av: barnet får hint og blyanttavle, men aldri entydig fasit. På: fasit med utregning kan åpnes etter at barnet har prøvd selv (minst to forsøk eller hint)."
              style={styles.rowLast}
            >
              <BrandToggle
                value={leksehjelpAllowFasit}
                onValueChange={setLeksehjelpAllowFasit}
              />
            </Row>
          ) : null}
        </>
      );
    } else if (pane === 'custody' && canRestrict) {
      body = (
        <TouchableOpacity
          style={styles.custodyLink}
          onPress={() => navigation.navigate('CustodySettings', {
            familyId,
            childId,
            childName: name.trim() || child?.name || 'Barn',
          })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.custodyLinkTitle}>Kalender og bostedsplan</Text>
            <Text style={styles.custodyLinkSub}>
              {custodySummaryLabel(custodyDoc, resolveCustodyLabels(custodyDoc, { parents: parents || [] }))}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      );
    } else if (pane === 'location') {
      body = (
        <View style={styles.group}>
          <Row
            label="Del barnets posisjon"
            hint="Sist kjent sted vises for familien også når barnet ikke har appen åpen. Barnet må ha gitt posisjonstilgang minst én gang."
            style={!locationSharingEnabled ? styles.rowLast : null}
          >
            <BrandToggle
              value={locationSharingEnabled}
              onValueChange={(v) => {
                setLocationSharingEnabled(v);
                if (!v) setLocationSharingChildCanControl(false);
              }}
            />
          </Row>
          {locationSharingEnabled ? (
            <Row
              label="La barnet styre selv"
              hint="Hvis av, kan bare foresatte endre delingen. Hvis på, kan barnet slå av/på under egne innstillinger."
              style={styles.rowLast}
            >
              <BrandToggle
                value={locationSharingChildCanControl}
                onValueChange={setLocationSharingChildCanControl}
              />
            </Row>
          ) : null}
        </View>
      );
    } else if (pane === 'ai') {
      body = (
        <View style={styles.group}>
          <View style={styles.aiFooter}>
            <View style={styles.aiDisclaimer}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warn} />
              <Text style={styles.aiDisclaimerTxt}>
                AI-assistenten kan gjøre feil. Svarene er veiledende og ikke en erstatning for voksne. Ingen personlig data sendes. Tillatelse styres under Apper og tilganger.
              </Text>
            </View>
            {(canRestrict || isAdmin) && (
              <>
                <TouchableOpacity
                  style={styles.importPlanBtn}
                  onPress={() => navigation.navigate('AiImportReview', aiImportNavParams({
                    familyId,
                    child: { id: childId, childId, name },
                  }))}
                >
                  <Ionicons name="camera-outline" size={18} color={colors.brand} />
                  <Text style={styles.importPlanBtnTxt}>Importer ukeplan (AI)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.importPlanBtn}
                  onPress={() => navigation.navigate('AiImportReview', aiImportNavParams({
                    familyId,
                    child: { id: childId, childId, name },
                    focusMode: 'homework',
                    returnToHomework: true,
                  }))}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
                  <Text style={styles.importPlanBtnTxt}>Importer lekseplan (AI)</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      );
    } else if (pane === 'notifications') {
      body = (
        <View style={styles.group}>
          <Row label="Aktiver varslinger" hint="Slår av/på alle event-varsler for barnet.">
            <BrandToggle
              value={notificationPrefs.enabled}
              onValueChange={(v) => setNotificationPrefs((prev) => ({ ...prev, enabled: v }))}
            />
          </Row>
          <View style={styles.notifBlock}>
            <View style={styles.notifGroup}>
              <Text style={styles.fieldLabel}>Når barnet får oppgave</Text>
              {['email', 'push', 'sms'].map((ch) => (
                <View key={`task-${ch}`} style={styles.channelRow}>
                  <Text style={styles.channelLabel}>{CHANNEL_LABELS[ch]}</Text>
                  <BrandToggle
                    value={!!notificationPrefs.events?.taskReceived?.[ch]}
                    onValueChange={(v) => updateEventChannel('taskReceived', ch, v)}
                  />
                </View>
              ))}
            </View>
            <View style={styles.notifGroup}>
              <Text style={styles.fieldLabel}>Når barnet mottar melding</Text>
              {['email', 'push', 'sms'].map((ch) => (
                <View key={`msg-${ch}`} style={styles.channelRow}>
                  <Text style={styles.channelLabel}>{CHANNEL_LABELS[ch]}</Text>
                  <BrandToggle
                    value={!!notificationPrefs.events?.messageReceived?.[ch]}
                    onValueChange={(v) => updateEventChannel('messageReceived', ch, v)}
                  />
                </View>
              ))}
            </View>
            <View style={styles.aiDisclaimer}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warn} />
              <Text style={styles.aiDisclaimerTxt}>
                Foreløpig støttes e-post- og push-varsler. SMS kommer senere.
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <>
        <CompactBackLink onPress={() => setPane(null)} label="Innstillinger" />
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSub}>{name || 'Barn'}</Text>
        {body}
        {saveBar}
      </>
    );
  };

  if (loading) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesktop]}
        showsVerticalScrollIndicator={false}
      >
        {pane ? renderPane() : renderHub()}
        <View style={{ height: 40 }} />
      </ScrollView>

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title="Beskjær profilbilde"
        onCancel={() => { setCropVisible(false); setSelectedImageUri(null); }}
        onConfirm={confirmCroppedPhoto}
      />

      <ConfirmDialog
        visible={confirmSaveOpen}
        title="Lagre endringer?"
        message={`Vil du lagre endringene for ${name.trim() || 'barnet'}?`}
        confirmText="Lagre"
        cancelText="Avbryt"
        onCancel={() => setConfirmSaveOpen(false)}
        onConfirm={performSave}
        onClose={() => setConfirmSaveOpen(false)}
      />

      <InfoDialog
        visible={infoDialog.visible}
        title={infoDialog.title}
        message={infoDialog.message}
        onClose={() => {
          const cb = infoDialog.onClose;
          setInfoDialog({ visible: false, title: '', message: '', onClose: null });
          cb?.();
        }}
      />

      <ChangeChildPasswordModal
        visible={changePasswordOpen}
        mode={savedPassword ? 'change' : 'set'}
        childName={name.trim() || child?.name || ''}
        busy={passwordBusy}
        onCancel={() => { if (!passwordBusy) setChangePasswordOpen(false); }}
        onSubmit={saveChildPassword}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  bodyDesktop: { paddingHorizontal: 12, paddingTop: 8, maxWidth: 680 },

  screenTitle: { fontSize: 28, fontWeight: '900', color: colors.ink, marginBottom: 4 },
  screenSub: { fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: 8 },

  hubSection: {
    fontSize: 13, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },
  hubSectionDesk: { fontSize: 11, fontWeight: '600', letterSpacing: 0.42, marginTop: 14, marginBottom: 6 },

  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  navRowCompact: { paddingVertical: 10, paddingHorizontal: 12 },
  navRowLabel: { fontWeight: '700', fontSize: 15, color: colors.ink },
  navRowLabelDesk: { fontSize: 13, fontWeight: '500' },
  navRowDetail: { fontSize: 13, fontWeight: '600', color: colors.muted, maxWidth: '40%' },
  iconCircle: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircleCompact: { width: 28, height: 28, borderRadius: 6 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.card, padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  profileCardDesk: { padding: 10, gap: 10 },
  profileName: { fontSize: 18, fontWeight: '900', color: colors.ink },
  profileNameDesk: { fontSize: 14, fontWeight: '600' },
  profileSub: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: '600' },

  guardianNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfdbfe',
  },
  guardianNoticeTxt: {
    flex: 1,
    color: colors.ink,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },

  loginCard: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  shareCard: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  qrBox: { alignItems: 'center', marginVertical: 16 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 12, marginTop: 8,
  },
  shareBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  loginCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  loginCardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  loginCardHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  loginLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  lockedUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.sunken,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lockedUsername: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },

  group: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  custodyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  custodyLinkTitle: { fontWeight: '800', fontSize: 14, color: colors.ink },
  custodyLinkSub: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: 2 },

  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  rowHintDesk: { fontSize: 11, fontWeight: '400' },
  rowRight: { marginLeft: 12 },

  heroSection: {
    padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    alignItems: 'center',
  },
  heroSectionLast: { borderBottomWidth: 0 },
  heroAvatarWrap: { marginBottom: 10 },
  photoPlaceholder: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  ageBadge: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: '#fff',
  },
  ageBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },
  heroName: { fontWeight: '900', fontSize: 17, color: colors.ink, marginBottom: 14 },

  photoActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  photoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9,
  },
  photoChipDanger: { backgroundColor: '#fee2e2' },
  photoChipTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },

  avatarToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  avatarToggleTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  avatarPickerWrap: { marginTop: 10, width: '100%', alignItems: 'center' },

  fieldWrap: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  fieldWrapLast: { borderBottomWidth: 0 },
  fieldLabel: { fontWeight: '700', color: colors.ink, marginBottom: 8, fontSize: 14 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    fontSize: 16, backgroundColor: colors.sunken, color: colors.ink,
  },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 17 },

  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 8 },
  changePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    paddingVertical: 12,
  },
  changePasswordBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  aiFooter: { padding: 14, gap: 10 },
  aiDisclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fffbeb', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  aiDisclaimerTxt: { flex: 1, color: '#92400e', fontSize: 12, fontWeight: '600', lineHeight: 18 },

  importPlanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 12,
  },
  importPlanBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  notifBlock: {
    padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: 14,
  },
  notifGroup: { gap: 2 },
  channelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  channelLabel: { fontWeight: '700', color: colors.ink, fontSize: 14 },

  saveBtn: { marginTop: 20, backgroundColor: colors.brand, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#cbd5e1' },
  saveBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  saveBtnTxtDisabled: { color: colors.muted },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  themeCard: {
    width: '30%', flexGrow: 1, minWidth: 90, maxWidth: 120,
    alignItems: 'center', padding: 10, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken,
  },
  themeSwatch: {
    width: '100%', height: 44, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.line, marginBottom: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  themeAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '38%' },
  themeEmoji: { fontSize: 18, zIndex: 1 },
  themeLabel: { fontSize: 12, fontWeight: '700', color: colors.muted },
  themePatternHint: { fontSize: 10, fontWeight: '600', color: colors.muted, opacity: 0.8, marginTop: 1 },
  themePreview: {
    marginHorizontal: 14, marginBottom: 14, height: 88, borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10,
  },
  themePreviewTxt: {
    zIndex: 2, fontSize: 12, fontWeight: '800', color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.72)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
});
