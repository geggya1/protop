import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import { claimUsername, isValidUsername, suggestUsername, usernameTaken } from '../../src/utils/usernames';
import { hasContactAccount, uniqueUsername } from '../../src/utils/account';
import { sendPasswordResetV2 } from '../../src/utils/sendPasswordReset';
import { setMemberPassword } from '../../src/utils/setMemberPassword';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { calculateAge, isValidBirthday, toIsoDate } from '../../src/utils/age';
import { normalizePhone, defaultDialCode, splitPhone } from '../../src/utils/phone';
import { Screen, ScrollBody, BigButton } from '../../components/ui';
import { mergeNotificationPrefs } from '../../src/utils/notificationPrefs';
import { disablePushSubscription, ensurePushSubscription } from '../../src/utils/push';
import CompactBackLink from '../../components/CompactBackLink';
import AvatarPicker, { AvatarBubble } from '../../components/AvatarPicker';
import LocationPicker from '../../components/LocationPicker';
import BirthdayPicker from '../../components/BirthdayPicker';
import PhoneInput from '../../components/PhoneInput';
import WebImageCropperModal from '../../components/WebImageCropperModal';
import { ChoiceGrid } from '../../components/Wizard';
import {
  authenticateBiometric,
  getBiometricLabel,
  isBiometricHardwareAvailable,
  loadBiometricSettings,
  markBiometricUnlocked,
  saveBiometricSettings,
} from '../../src/utils/biometricLock';
import {
  loadKitchenDisplaySettings,
  saveKitchenDisplaySettings,
  isValidKitchenPin,
} from '../../src/utils/kitchenDisplay';
import {
  defaultGreetingEnabled,
  loadGreetingPrefs,
  saveGreetingPrefs,
} from '../../src/utils/greetingPrefs';
import KitchenPinModal from '../../components/KitchenPinModal';

function SectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

/**
 * Full profilredigering for innlogget bruker:
 * navn, brukernavn, bilde/avatar, fødselsdag, kjønn, adresse, telefon,
 * passord, språk — synces til users + parents + familie-medlem.
 */
export default function EditProfileScreen() {
  const nav = useNavigation();
  const { t, lang, setLang, langs } = useI18n();
  const { userProfile, meParent, familyId, user, isChild } = useApp();
  const authUser = auth.currentUser || user;
  const uid = authUser?.uid;
  const initial = userProfile || {};
  const contactOk = hasContactAccount(authUser, initial);

  const [name, setName] = useState(
    initial.displayName || meParent?.name || authUser?.displayName || '',
  );
  const [username, setUsername] = useState(
    (initial.username || meParent?.username || '').trim()
      || suggestUsername(name || authUser?.email || 'user'),
  );
  const lockedUsername = String(
    (userProfile?.username || meParent?.username || initial.username || '').trim(),
  ).replace(/^@+/, '').toLowerCase();
  const usernameIsLocked = isValidUsername(lockedUsername);
  const [taken, setTaken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [birthday, setBirthday] = useState(
    toIsoDate(initial.birthday || meParent?.birthday) || '',
  );
  const [gender, setGender] = useState(initial.gender || meParent?.gender || '');
  const [location, setLocation] = useState(initial.location || meParent?.location || null);
  const [phone, setPhone] = useState(
    normalizePhone(
      authUser?.phoneNumber || initial.phone || meParent?.phone || '',
      defaultDialCode(lang),
    ),
  );
  const [avatarId, setAvatarId] = useState(initial.avatarId || meParent?.avatarId || 'fox');
  const [photoURL, setPhotoURL] = useState(
    initial.photoURL || meParent?.photoURL || meParent?.photoUrl || authUser?.photoURL || '',
  );
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [notificationPrefs, setNotificationPrefs] = useState(
    mergeNotificationPrefs(initial.notificationPrefs),
  );
  const [notifBusy, setNotifBusy] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [kitchenMode, setKitchenMode] = useState(false);
  const [kitchenPinEnabled, setKitchenPinEnabled] = useState(false);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [kitchenPinModal, setKitchenPinModal] = useState(null);
  const [greetingEnabled, setGreetingEnabled] = useState(() => defaultGreetingEnabled(isChild));
  const [greetingBusy, setGreetingBusy] = useState(false);

  // Profil kan lande etter mount (bytte familie / sen user-doc) — fyll tomme felter én gang.
  useEffect(() => {
    if (hydrated) return;
    if (!userProfile && !meParent && !authUser) return;

    const src = userProfile || {};
    const parent = meParent || {};
    const nextName = (src.displayName || parent.name || authUser?.displayName || '').trim();
    const nextBirthday = toIsoDate(src.birthday || parent.birthday) || '';
    const nextUsername = (src.username || parent.username || '').trim();
    const nextPhoto = src.photoURL || parent.photoURL || parent.photoUrl || authUser?.photoURL || '';
    const nextAvatar = src.avatarId || parent.avatarId || '';
    const nextGender = src.gender || parent.gender || '';
    const nextLocation = src.location || parent.location || null;
    const nextPhone = normalizePhone(
      authUser?.phoneNumber || src.phone || parent.phone || '',
      defaultDialCode(lang),
    );

    if (nextName) setName((prev) => prev || nextName);
    if (nextBirthday) setBirthday((prev) => prev || nextBirthday);
    if (nextUsername) setUsername((prev) => (prev && isValidUsername(prev) ? prev : nextUsername));
    if (nextPhoto) setPhotoURL((prev) => prev || nextPhoto);
    if (nextAvatar) setAvatarId((prev) => prev || nextAvatar);
    if (nextGender) setGender((prev) => prev || nextGender);
    if (nextLocation) setLocation((prev) => prev || nextLocation);
    if (nextPhone) setPhone((prev) => prev || nextPhone);
    if (src.notificationPrefs) {
      setNotificationPrefs((prev) => mergeNotificationPrefs(src.notificationPrefs || prev));
    }
    setHydrated(true);
  }, [userProfile, meParent, authUser, hydrated, lang]);

  useEffect(() => {
    if (usernameIsLocked) {
      setTaken(false);
      setChecking(false);
      return undefined;
    }
    let alive = true;
    const u = username.trim().toLowerCase();
    if (!isValidUsername(u)) {
      setTaken(false);
      setChecking(false);
      return undefined;
    }
    setChecking(true);
    const tmr = setTimeout(async () => {
      try {
        const busy = await Promise.race([
          usernameTaken(u, uid),
          new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
        ]);
        if (alive) setTaken(!!busy);
      } catch {
        if (alive) setTaken(false);
      } finally {
        if (alive) setChecking(false);
      }
    }, 400);
    return () => { alive = false; clearTimeout(tmr); };
  }, [username, uid, usernameIsLocked]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [available, label, settings, kitchen, greeting] = await Promise.all([
        isBiometricHardwareAvailable(),
        getBiometricLabel(),
        uid ? loadBiometricSettings(uid) : { enabled: false },
        uid ? loadKitchenDisplaySettings(uid) : { enabled: false },
        uid ? loadGreetingPrefs(uid, { isChild }) : { enabled: defaultGreetingEnabled(isChild) },
      ]);
      if (!alive) return;
      setBiometricAvailable(available);
      setBiometricLabel(label);
      setBiometricEnabled(!!settings.enabled);
      setKitchenMode(!!kitchen.enabled);
      setKitchenPinEnabled(!!kitchen.pinEnabled);
      setGreetingEnabled(!!greeting.enabled);
    })();
    return () => { alive = false; };
  }, [uid, isChild]);

  const toggleKitchenMode = async (next) => {
    if (!uid || kitchenBusy) return;
    setKitchenBusy(true);
    setKitchenMode(next);
    await saveKitchenDisplaySettings(uid, { enabled: next });
    setKitchenBusy(false);
  };

  const toggleGreeting = async (next) => {
    if (!uid || greetingBusy) return;
    setGreetingBusy(true);
    setGreetingEnabled(next);
    await saveGreetingPrefs(uid, next, { isChild });
    setGreetingBusy(false);
  };

  const toggleKitchenPin = (next) => {
    if (!uid) return;
    if (next) {
      setKitchenPinModal('set');
      return;
    }
    setKitchenPinEnabled(false);
    saveKitchenDisplaySettings(uid, { pinEnabled: false, pin: '' });
  };

  const toggleBiometric = async (next) => {
    if (!uid || biometricBusy) return;
    if (next && !biometricAvailable) {
      Alert.alert(t('common.error'), t('security.biometricUnavailable'));
      return;
    }
    if (next) {
      setBiometricBusy(true);
      const prompt = t('security.unlockPrompt').replace('{{method}}', biometricLabel);
      const result = await authenticateBiometric(prompt);
      setBiometricBusy(false);
      if (!result.success) return;
      markBiometricUnlocked();
    }
    setBiometricEnabled(next);
    await saveBiometricSettings(uid, next);
    if (next) {
      await setDoc(doc(db, 'users', uid), {
        securityPrefs: { biometricLock: true, updatedAt: serverTimestamp() },
      }, { merge: true });
    } else {
      await setDoc(doc(db, 'users', uid), {
        securityPrefs: { biometricLock: false, updatedAt: serverTimestamp() },
      }, { merge: true });
    }
  };

  const age = calculateAge(birthday);
  const usernameOk = usernameIsLocked
    ? true
    : contactOk
      ? (!username.trim() || (isValidUsername(username) && !taken && !checking))
      : (isValidUsername(username) && !taken && !checking);
  // Fødselsdato er anbefalt, men skal ikke blokkere lagring av bilde/navn når den mangler.
  const birthdayOk = !birthday.trim() || isValidBirthday(birthday);
  const canSave = !!name.trim() && usernameOk && birthdayOk && !saving && !photoBusy;

  const saveBlockReason = !name.trim()
    ? t('profile.name')
    : !usernameOk
      ? (checking ? t('common.loading') : taken ? t('profile.usernameTaken') : t('profile.username'))
      : !birthdayOk
        ? t('profile.birthday')
        : photoBusy
          ? t('common.loading')
          : null;

  const persistPhotoEverywhere = async (url, nextAvatarId) => {
    if (!uid) return;
    const photoPayload = {
      photoURL: url || '',
      avatarId: url ? (nextAvatarId || null) : (nextAvatarId || avatarId || 'fox'),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', uid), photoPayload, { merge: true });
    await setDoc(doc(db, 'parents', uid), photoPayload, { merge: true }).catch(() => {});
    if (familyId && meParent?.id) {
      await setDoc(
        doc(db, 'families', familyId, 'parents', meParent.id),
        photoPayload,
        { merge: true },
      ).catch(() => {});
    }
    if (authUser) {
      await updateProfile(authUser, { photoURL: url || undefined }).catch(() => {});
    }
  };

  const sendReset = async () => {
    const email = (authUser?.email || initial.email || '').trim();
    if (!email) {
      Alert.alert(t('common.error'), t('auth.identifier'));
      return;
    }
    setResetBusy(true);
    try {
      await sendPasswordResetV2(email);
      Alert.alert(t('auth.resetSentTitle'), t('auth.resetSentBody'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setResetBusy(false);
    }
  };

  const saveLocalPassword = async () => {
    if (password.length < 6) return Alert.alert(t('common.error'), t('member.passwordSet'));
    if (password !== password2) return Alert.alert(t('common.error'), t('auth.passwordMismatch'));
    setPwdBusy(true);
    try {
      await setMemberPassword({ uid, password, familyId });
      setPassword('');
      setPassword2('');
      Alert.alert(t('common.ok'), t('auth.passwordChanged'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setPwdBusy(false);
    }
  };

  const persistNotificationPrefs = async (prefs) => {
    if (!uid) return;
    setNotifBusy(true);
    try {
      await setDoc(doc(db, 'users', uid), { notificationPrefs: prefs }, { merge: true });
    } catch { /* ignore */ }
    finally {
      setNotifBusy(false);
    }
  };

  const updateEventChannel = (eventType, channel, value) => {
    const next = {
      ...notificationPrefs,
      events: {
        ...notificationPrefs.events,
        [eventType]: {
          ...(notificationPrefs.events?.[eventType] || {}),
          [channel]: value,
        },
      },
    };
    setNotificationPrefs(next);
    persistNotificationPrefs(next);
    if (channel === 'push') {
      if (value) ensurePushSubscription(uid).catch(() => {});
      else if (!next.events?.messageReceived?.push && !next.events?.taskReceived?.push) {
        disablePushSubscription(uid).catch(() => {});
      }
    }
  };

  const save = async () => {
    if (!canSave || !uid || !authUser) return;
    setSaving(true);
    try {
      let uname = usernameIsLocked
        ? lockedUsername
        : (username.trim().toLowerCase() || '');
      if (!usernameIsLocked) {
        if (!uname && !contactOk) {
          uname = await uniqueUsername(
            name.trim() || authUser.email || 'user',
            uid,
          );
          await claimUsername(uname, uid, 'adult');
        } else if (uname) {
          uname = await uniqueUsername(uname, uid);
          await claimUsername(uname, uid, 'adult');
        }
      }
      await updateProfile(authUser, {
        displayName: name.trim(),
        photoURL: photoURL || undefined,
      }).catch(() => {});

      const normalizedPhone = normalizePhone(phone, defaultDialCode(lang));
      const profile = {
        uid,
        role: 'adult',
        displayName: name.trim(),
        email: (authUser.email || initial.email || '').toLowerCase(),
        phone: normalizedPhone,
        phoneCountryCode: normalizedPhone
          ? splitPhone(normalizedPhone, defaultDialCode(lang)).dialCode
          : '',
        gender: gender || 'unspecified',
        location: location || null,
        photoURL: photoURL || '',
        avatarId,
        language: lang,
        profileComplete: true,
        notificationPrefs,
        updatedAt: serverTimestamp(),
      };
      if (uname) {
        profile.username = uname;
        profile.usernameLower = uname;
      }
      if (isValidBirthday(birthday)) {
        profile.birthday = birthday;
        profile.age = age;
      }

      await setDoc(doc(db, 'users', uid), profile, { merge: true });

      const parentPayload = {
        uid,
        name: name.trim(),
        email: profile.email,
        phone: profile.phone,
        photoURL: photoURL || '',
        avatarId,
        gender: profile.gender,
        location: location || null,
        active: true,
        updatedAt: serverTimestamp(),
      };
      if (uname) {
        parentPayload.username = uname;
        parentPayload.usernameLower = uname;
      }
      if (isValidBirthday(birthday)) {
        parentPayload.birthday = birthday;
        parentPayload.age = age;
      }
      await setDoc(doc(db, 'parents', uid), parentPayload, { merge: true });

      if (familyId && meParent?.id) {
        await setDoc(
          doc(db, 'families', familyId, 'parents', meParent.id),
          parentPayload,
          { merge: true },
        );
      }

      Alert.alert(t('common.ok'), t('profile.saved'));
      nav.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
      setTaken(true);
    } finally {
      setSaving(false);
    }
  };

  const photo = async (camera) => {
    setPhotoBusy(true);
    try {
      const picked = await pickImage({ camera });
      if (!picked?.uri || !uid) return;
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      setPhotoURL(picked.uri);
      const url = await uploadImage(`users/${uid}/avatar-${Date.now()}.jpg`, picked);
      setPhotoURL(url);
      await persistPhotoEverywhere(url, null);
    } catch (e) {
      alertPhotoError(e, t);
    } finally {
      setPhotoBusy(false);
    }
  };

  const emailDisplay = (authUser?.email || initial.email || '').trim();

  return (
    <Screen>
      <ScrollBody pad={16}>
        <CompactBackLink onPress={() => nav.goBack()} label={t('common.back')} />
        <Text style={styles.screenTitle}>{t('profile.editTitle')}</Text>
        {emailDisplay ? <Text style={styles.emailLine}>{emailDisplay}</Text> : null}

        <SectionHeader title={t('profile.photo')} />
        <View style={styles.card}>
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={88} />
          </View>
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.chip} onPress={() => photo(true)} disabled={photoBusy}>
              <Ionicons name="camera-outline" size={16} color={colors.brand} />
              <Text style={styles.chipTxt}>
                {photoBusy ? t('common.loading') : t('profile.takePhoto')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => photo(false)} disabled={photoBusy}>
              <Ionicons name="image-outline" size={16} color={colors.brand} />
              <Text style={styles.chipTxt}>{t('profile.upload')}</Text>
            </TouchableOpacity>
            {photoURL ? (
              <TouchableOpacity
                style={[styles.chip, styles.chipMuted]}
                onPress={async () => {
                  setPhotoURL('');
                  setPhotoBusy(true);
                  try {
                    await persistPhotoEverywhere('', avatarId || 'fox');
                  } catch (e) {
                    alertPhotoError(e, t);
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
                disabled={photoBusy}
              >
                <Text style={[styles.chipTxt, { color: colors.ink }]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.hint}>{t('profile.pickCartoon')}</Text>
          <AvatarPicker
            value={avatarId}
            onChange={async (id) => {
              setAvatarId(id);
              setPhotoURL('');
              setPhotoBusy(true);
              try {
                await persistPhotoEverywhere('', id);
              } catch (e) {
                alertPhotoError(e, t);
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
        </View>

        <SectionHeader title={t('profile.title')} />
        <View style={styles.card}>
          <Text style={styles.lbl}>{t('profile.name')}</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />

          <Text style={styles.lbl}>
            {t('profile.username')}{contactOk && !usernameIsLocked ? ` (${t('common.optional')})` : ''}
          </Text>
          {usernameIsLocked ? (
            <>
              <View style={styles.lockedUsernameRow}>
                <Text style={styles.lockedUsername}>@{lockedUsername}</Text>
                <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
              </View>
              <Text style={styles.hint}>{t('profile.usernameLocked')}</Text>
            </>
          ) : (
            <>
              <TextInput
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
                style={[styles.input, taken && { borderColor: colors.danger }]}
              />
              <Text style={styles.hint}>
                {contactOk ? t('profile.usernameHintContactOnce') : t('profile.usernameHintOnce')}
              </Text>
              {username.trim() ? (
                checking ? null : (
                  <Text style={{ fontWeight: '400', fontSize: 13, color: taken ? colors.danger : colors.brand, marginBottom: 4 }}>
                    {taken ? t('profile.usernameTaken') : isValidUsername(username) ? t('profile.usernameFree') : t('common.required')}
                  </Text>
                )
              ) : null}
            </>
          )}

          <Text style={styles.lbl}>{t('profile.birthday')}</Text>
          <BirthdayPicker value={birthday} onChange={setBirthday} defaultAge={30} />
          {!birthday.trim() ? (
            <Text style={styles.hint}>Valgfritt — fyll inn når du vil.</Text>
          ) : null}

          <Text style={styles.lbl}>{t('profile.gender')} ({t('common.optional')})</Text>
          <ChoiceGrid
            value={gender}
            onChange={setGender}
            options={[
              { id: 'woman', label: t('profile.woman') },
              { id: 'man', label: t('profile.man') },
              { id: 'other', label: t('profile.other') },
              { id: 'unspecified', label: t('profile.unspecified') },
            ]}
          />

          <Text style={styles.lbl}>{t('profile.location')}</Text>
          <Text style={styles.hint}>{t('profile.locationHint')}</Text>
          <LocationPicker value={location} onChange={setLocation} />

          <Text style={styles.lbl}>{t('auth.phone')} ({t('common.optional')})</Text>
          <Text style={styles.hint}>{t('profile.phoneHint')}</Text>
          <PhoneInput value={phone} onChange={setPhone} />
        </View>

        <SectionHeader title={t('auth.password')} />
        <View style={styles.card}>
          {contactOk ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={sendReset} disabled={resetBusy}>
              <Text style={styles.primaryBtnTxt}>
                {resetBusy ? t('common.loading') : t('auth.resetSend')}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.lbl}>{t('auth.newPassword')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
              <Text style={styles.lbl}>{t('auth.repeatPassword')}</Text>
              <TextInput
                value={password2}
                onChangeText={setPassword2}
                secureTextEntry
                style={styles.input}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, pwdBusy && { opacity: 0.7 }]}
                onPress={saveLocalPassword}
                disabled={pwdBusy}
              >
                <Text style={styles.primaryBtnTxt}>
                  {pwdBusy ? t('common.loading') : t('member.passwordSet')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {Platform.OS !== 'web' && (
          <>
            <SectionHeader title={t('security.title')} />
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.switchLbl}>{t('security.biometricTitle')}</Text>
                  <Text style={styles.hint}>
                    {biometricAvailable
                      ? t('security.biometricHint').replace('{{method}}', biometricLabel)
                      : t('security.biometricUnavailable')}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={toggleBiometric}
                  disabled={biometricBusy || !biometricAvailable}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={biometricEnabled ? '#0b74d1' : '#f9fafb'}
                />
              </View>
            </View>
          </>
        )}

        <SectionHeader title="Denne enheten" />
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLbl}>{t('greeting.prefsTitle')}</Text>
              <Text style={styles.hint}>{t('greeting.prefsHint')}</Text>
            </View>
            <Switch
              value={greetingEnabled}
              onValueChange={toggleGreeting}
              disabled={greetingBusy || !uid}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={greetingEnabled ? '#0b74d1' : '#f9fafb'}
            />
          </View>
          <View style={[styles.switchRow, { marginTop: 8 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLbl}>Kjøkkenvisning</Text>
              <Text style={styles.hint}>
                Felles skjerm med middag, handleliste og ukeplan — uten menyer og biometri-lås.
              </Text>
            </View>
            <Switch
              value={kitchenMode}
              onValueChange={toggleKitchenMode}
              disabled={kitchenBusy || !uid}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={kitchenMode ? '#0b74d1' : '#f9fafb'}
            />
          </View>
          <View style={[styles.switchRow, { marginTop: 8 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLbl}>PIN for å avslutte</Text>
              <Text style={styles.hint}>4 siffer kreves før noen kan slå av kjøkkenvisning.</Text>
            </View>
            <Switch
              value={kitchenPinEnabled}
              onValueChange={toggleKitchenPin}
              disabled={!uid}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={kitchenPinEnabled ? '#0b74d1' : '#f9fafb'}
            />
          </View>
        </View>

        <KitchenPinModal
          visible={kitchenPinModal === 'set'}
          mode="set"
          onCancel={() => setKitchenPinModal(null)}
          onSubmit={async (pin) => {
            if (!isValidKitchenPin(pin)) return false;
            await saveKitchenDisplaySettings(uid, { pin, pinEnabled: true });
            setKitchenPinEnabled(true);
            setKitchenPinModal(null);
            return true;
          }}
        />

        <SectionHeader title={t('more.language')} />
        <View style={styles.card}>
          <View style={styles.langGrid}>
            {langs.map((l) => {
              const active = lang === l.id;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.langChip, active && styles.langChipActive]}
                  onPress={() => setLang(l.id)}
                >
                  <Text style={styles.langFlag}>{l.flag}</Text>
                  <Text style={[styles.langName, active && styles.langNameActive]} numberOfLines={1}>
                    {l.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <SectionHeader title={t('tabs.notifications')} />
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLbl}>Aktiver</Text>
            <Switch
              value={notificationPrefs.enabled}
              onValueChange={(v) => {
                const next = { ...notificationPrefs, enabled: v };
                setNotificationPrefs(next);
                persistNotificationPrefs(next);
              }}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={notificationPrefs.enabled ? '#0b74d1' : '#f9fafb'}
              disabled={notifBusy}
            />
          </View>
          <Text style={[styles.lbl, { marginTop: 8 }]}>Oppgave mottatt</Text>
          {['email', 'push', 'sms'].map((ch) => (
            <View key={`task-${ch}`} style={styles.switchRow}>
              <Text style={styles.switchLbl}>
                {ch === 'email' ? 'E-post' : ch === 'push' ? 'Push' : 'SMS'}
              </Text>
              <Switch
                value={!!notificationPrefs.events?.taskReceived?.[ch]}
                onValueChange={(v) => updateEventChannel('taskReceived', ch, v)}
                disabled={notifBusy}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={notificationPrefs.events?.taskReceived?.[ch] ? '#0b74d1' : '#f9fafb'}
              />
            </View>
          ))}
          <Text style={[styles.lbl, { marginTop: 8 }]}>Melding mottatt</Text>
          {['email', 'push', 'sms'].map((ch) => (
            <View key={`msg-${ch}`} style={styles.switchRow}>
              <Text style={styles.switchLbl}>
                {ch === 'email' ? 'E-post' : ch === 'push' ? 'Push' : 'SMS'}
              </Text>
              <Switch
                value={!!notificationPrefs.events?.messageReceived?.[ch]}
                onValueChange={(v) => updateEventChannel('messageReceived', ch, v)}
                disabled={notifBusy}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={notificationPrefs.events?.messageReceived?.[ch] ? '#0b74d1' : '#f9fafb'}
              />
            </View>
          ))}
          <Text style={styles.hint}>
            Push-varsler vises på enheten når du får en ny melding, også når appen er i bakgrunnen.
            Nettleseren spør om tillatelse første gang. SMS støttes ikke ennå.
          </Text>
        </View>

        <BigButton
          label={saving ? t('common.loading') : t('common.save')}
          onPress={save}
          disabled={!canSave}
        />
        {!canSave && saveBlockReason && !saving ? (
          <Text style={styles.saveHint}>Kan ikke lagre ennå: {saveBlockReason}</Text>
        ) : null}
        <View style={{ height: 40 }} />
      </ScrollBody>

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title="Crop"
        onCancel={() => { setCropVisible(false); setSelectedImageUri(null); }}
        onConfirm={async (blob) => {
          setPhotoBusy(true);
          try {
            const url = await uploadImage(`users/${uid}/avatar-${Date.now()}.jpg`, { blob });
            setPhotoURL(url);
            await persistPhotoEverywhere(url, null);
          } catch (e) {
            alertPhotoError(e, t);
          } finally {
            setPhotoBusy(false);
            setCropVisible(false);
            setSelectedImageUri(null);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 20, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  emailLine: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 12 },

  sectionTitle: {
    fontSize: 13, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 4,
  },

  lbl: { fontWeight: '400', color: colors.ink, fontSize: 14, marginTop: 10, marginBottom: 6 },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 8, lineHeight: 18 },
  lockedUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.sunken,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line || colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  lockedUsername: { flex: 1, fontSize: 16, fontWeight: '400', color: colors.ink },
  input: {
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 12, fontSize: 16, fontWeight: '400', marginBottom: 4,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brandSoft, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999,
  },
  chipMuted: { backgroundColor: '#e2e8f0' },
  chipTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  saveHint: {
    marginTop: 8, textAlign: 'center', color: colors.muted, fontWeight: '400', fontSize: 13,
  },

  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },

  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    width: '31%', minWidth: 96, flexGrow: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10,
  },
  langChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  langFlag: { fontSize: 16 },
  langName: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.ink },
  langNameActive: { color: '#fff' },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  switchLbl: { fontWeight: '400', fontSize: 14, color: colors.ink },
});
