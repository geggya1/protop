import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, useWindowDimensions } from 'react-native';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useI18n } from '../../src/i18n';
import { colors, radius, BREAKPOINTS } from '../../src/theme';
import { claimUsername, isValidUsername, suggestUsername, usernameTaken } from '../../src/utils/usernames';
import { hasContactAccount, uniqueUsername } from '../../src/utils/account';
import { sendPasswordResetV2 } from '../../src/utils/sendPasswordReset';
import { persistUserConsents } from '../../src/utils/consents';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { calculateAge, isValidBirthday, toIsoDate } from '../../src/utils/age';
import Wizard, { ChoiceGrid } from '../../components/Wizard';
import AvatarPicker, { AvatarBubble } from '../../components/AvatarPicker';
import LocationPicker from '../../components/LocationPicker';
import BirthdayPicker from '../../components/BirthdayPicker';
import PhoneInput from '../../components/PhoneInput';
import WebImageCropperModal from '../../components/WebImageCropperModal';
import { normalizePhone, defaultDialCode, splitPhone } from '../../src/utils/phone';

export default function ProfileSetupScreen({ onDone, consents, initial }) {
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.tablet;
  const user = auth.currentUser;
  const contactLogin = hasContactAccount(user, { email: initial?.email, phone: initial?.phone });
  const [name, setName] = useState(initial?.displayName || user?.displayName || '');
  const [username, setUsername] = useState(initial?.username || suggestUsername(name || user?.email || 'user'));
  const [taken, setTaken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [birthday, setBirthday] = useState(toIsoDate(initial?.birthday) || '');
  const [gender, setGender] = useState(initial?.gender || '');
  const [location, setLocation] = useState(initial?.location || null);
  const [phone, setPhone] = useState(normalizePhone(user?.phoneNumber || initial?.phone || '', defaultDialCode(lang)));
  const [avatarId, setAvatarId] = useState(initial?.avatarId || 'fox');
  const [photoURL, setPhotoURL] = useState(initial?.photoURL || user?.photoURL || '');
  const [saving, setSaving] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);

  useEffect(() => {
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
          usernameTaken(u, user?.uid),
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
  }, [username, user?.uid]);

  const age = birthday && isValidBirthday(birthday) ? calculateAge(birthday) : null;
  const usernameOk = !username.trim() || (isValidUsername(username) && !taken);
  const birthdayOk = !birthday || isValidBirthday(birthday);
  const valid = name.trim() && usernameOk && birthdayOk && (photoURL || avatarId);

  const sendReset = async () => {
    const email = (user?.email || initial?.email || '').trim();
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

  const save = async () => {
    if (!valid || !user) return;
    setSaving(true);
    try {
      const uname = await uniqueUsername(username.trim() || name.trim() || user.email || 'user', user.uid);
      await claimUsername(uname, user.uid, 'adult');
      await updateProfile(user, { displayName: name.trim(), photoURL: photoURL || undefined }).catch(() => {});
      const normalizedPhone = normalizePhone(phone, defaultDialCode(lang));
      const profile = {
        uid: user.uid,
        role: 'adult',
        displayName: name.trim(),
        username: uname,
        usernameLower: uname,
        email: (user.email || '').toLowerCase(),
        phone: normalizedPhone,
        phoneCountryCode: normalizedPhone ? splitPhone(normalizedPhone, defaultDialCode(lang)).dialCode : '',
        birthday,
        age,
        gender: gender || 'unspecified',
        location: location || null,
        photoURL: photoURL || '',
        avatarId,
        language: lang,
        profileComplete: true,
        consents: consents || initial?.consents || null,
        updatedAt: serverTimestamp(),
        createdAt: initial?.createdAt || serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
      await setDoc(doc(db, 'parents', user.uid), {
        uid: user.uid,
        name: name.trim(),
        username: uname,
        usernameLower: uname,
        email: profile.email,
        phone: profile.phone,
        photoURL,
        avatarId,
        gender: profile.gender,
        birthday,
        age,
        location: location || null,
        active: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (consents) await persistUserConsents(user.uid, consents);
      onDone(profile);
    } catch {
      setTaken(true);
    } finally {
      setSaving(false);
    }
  };

  const photo = async (camera) => {
    setPhotoBusy(true);
    try {
      const picked = await pickImage({ camera });
      if (!picked?.uri || !user) return;
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      setPhotoURL(picked.uri);
      const url = await uploadImage(`users/${user.uid}/avatar-${Date.now()}.jpg`, picked);
      setPhotoURL(url);
    } catch (e) {
      alertPhotoError(e, t);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Wizard
      title={t('profile.title')}
      subtitle={t('profile.subtitle')}
      onNext={save}
      nextDisabled={!valid || saving || photoBusy}
      nextLabel={t('common.continue')}
    >
      <Text style={[styles.lbl, wide && styles.lblWide]}>{t('profile.name')}</Text>
      <TextInput value={name} onChangeText={setName} style={[styles.input, wide && styles.inputWide]} />

      <Text style={[styles.lbl, wide && styles.lblWide]}>
        {t('profile.username')} ({t('common.optional')})
      </Text>
      <Text style={[styles.hint, wide && styles.hintWide]}>
        {t('profile.usernameHintContactOnce')}
      </Text>
      <TextInput
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
        style={[styles.input, wide && styles.inputWide, taken && { borderColor: colors.danger }]}
      />
      {username.trim() ? (
        checking ? null : (
          <Text style={{ fontWeight: '700', fontSize: wide ? 13 : 14, color: taken ? colors.danger : colors.brand }}>
            {taken ? t('profile.usernameTaken') : isValidUsername(username) ? t('profile.usernameFree') : t('common.required')}
          </Text>
        )
      ) : null}

      {contactLogin ? (
        <TouchableOpacity style={[styles.chip, wide && styles.chipWide]} onPress={sendReset} disabled={resetBusy}>
          <Text style={[styles.chipTxt, wide && styles.chipTxtWide]}>
            {resetBusy ? t('common.loading') : t('auth.resetSend')}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.lbl, wide && styles.lblWide]}>
        {t('profile.birthday')} ({t('common.optional')})
      </Text>
      <BirthdayPicker value={birthday} onChange={setBirthday} defaultAge={30} allowClear />

      <Text style={[styles.lbl, wide && styles.lblWide]}>
        {t('profile.gender')} ({t('common.optional')})
      </Text>
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

      <Text style={[styles.lbl, wide && styles.lblWide]}>
        {t('profile.location')} ({t('common.optional')})
      </Text>
      <Text style={[styles.hint, wide && styles.hintWide]}>{t('profile.locationHint')}</Text>
      <LocationPicker value={location} onChange={setLocation} />

      <Text style={[styles.lbl, wide && styles.lblWide]}>
        {t('auth.phone')} ({t('common.optional')})
      </Text>
      <Text style={[styles.hint, wide && styles.hintWide]}>{t('profile.phoneHint')}</Text>
      <PhoneInput value={phone} onChange={setPhone} />

      <Text style={[styles.lbl, wide && styles.lblWide]}>{t('profile.photo')}</Text>
      <View style={{ alignItems: 'center' }}>
        <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={wide ? 72 : 88} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TouchableOpacity style={[styles.chip, wide && styles.chipWide]} onPress={() => photo(true)} disabled={photoBusy}>
          <Text style={[styles.chipTxt, wide && styles.chipTxtWide]}>
            {photoBusy ? t('common.loading') : t('profile.takePhoto')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.chip, wide && styles.chipWide]} onPress={() => photo(false)} disabled={photoBusy}>
          <Text style={[styles.chipTxt, wide && styles.chipTxtWide]}>{t('profile.upload')}</Text>
        </TouchableOpacity>
        {photoURL ? (
          <TouchableOpacity
            style={[styles.chip, wide && styles.chipWide, { backgroundColor: '#e2e8f0' }]}
            onPress={() => setPhotoURL('')}
            disabled={photoBusy}
          >
            <Text style={[styles.chipTxt, wide && styles.chipTxtWide, { color: colors.ink }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.hint, wide && styles.hintWide]}>{t('profile.pickCartoon')}</Text>
      <AvatarPicker value={avatarId} onChange={(id) => { setAvatarId(id); setPhotoURL(''); }} />

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title="Crop"
        onCancel={() => { setCropVisible(false); setSelectedImageUri(null); }}
        onConfirm={async (blob) => {
          setPhotoBusy(true);
          try {
            const url = await uploadImage(`users/${user.uid}/avatar-${Date.now()}.jpg`, { blob });
            setPhotoURL(url);
          } catch (e) {
            alertPhotoError(e, t);
          } finally {
            setPhotoBusy(false);
            setCropVisible(false);
            setSelectedImageUri(null);
          }
        }}
      />
    </Wizard>
  );
}

const styles = StyleSheet.create({
  lbl: { fontWeight: '800', color: colors.ink, fontSize: 16, marginTop: 8 },
  lblWide: { fontSize: 13, marginTop: 4, letterSpacing: 0.2 },
  hint: { color: colors.muted, fontWeight: '600' },
  hintWide: { fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 18, fontWeight: '600',
  },
  inputWide: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    borderRadius: 10,
  },
  chip: { backgroundColor: colors.brandSoft, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 999 },
  chipWide: { paddingVertical: 8, paddingHorizontal: 12 },
  chipTxt: { fontWeight: '800', color: colors.ink },
  chipTxtWide: { fontSize: 13 },
});
