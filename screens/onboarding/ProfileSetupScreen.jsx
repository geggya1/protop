import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions, ScrollView, Image,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { claimUsername } from '../../src/utils/usernames';
import { uniqueUsername } from '../../src/utils/account';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { persistUserConsents } from '../../src/utils/consents';
import WebImageCropperModal from '../../components/WebImageCropperModal';

function Silhouette({ gender, size }) {
  const woman = gender === 'woman';
  const man = gender === 'man';
  const shoulder = man ? 18 : woman ? 30 : 24;
  const neck = man ? 40 : woman ? 38 : 39;
  return (
    <View style={[styles.portrait, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="49" fill="#eef2f6" />
        <Circle cx="50" cy="36" r="14" fill="none" stroke="#64748b" strokeWidth="2.2" />
        <Path
          d={`M${shoulder} 92 C${shoulder} ${neck + 18}, ${neck} ${neck}, 50 ${neck} C${100 - neck} ${neck}, ${100 - shoulder} ${neck + 18}, ${100 - shoulder} 92`}
          fill="none"
          stroke="#64748b"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function Portrait({ photoURL, gender, size }) {
  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#eef2f6' }}
      />
    );
  }
  return <Silhouette gender={gender} size={size} />;
}

export default function ProfileSetupScreen({ onDone, consents, initial }) {
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const user = auth.currentUser;
  const googlePhoto = user?.photoURL || initial?.photoURL || '';
  const [name] = useState(initial?.displayName || user?.displayName || '');
  const [gender] = useState(initial?.gender && initial.gender !== 'unspecified' ? initial.gender : '');
  const [photoURL, setPhotoURL] = useState(googlePhoto);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);

  const displayName = name.trim() || String(user?.email || '').split('@')[0] || '';
  const valid = !!displayName;

  const save = async () => {
    if (!valid || !user || saving) return;
    setSaving(true);
    try {
      const uname = await uniqueUsername(displayName || user.email || 'user', user.uid);
      await claimUsername(uname, user.uid, 'adult');
      await updateProfile(user, { displayName, photoURL: photoURL || undefined }).catch(() => {});
      const profile = {
        uid: user.uid,
        role: 'adult',
        displayName,
        username: uname,
        usernameLower: uname,
        email: (user.email || '').toLowerCase(),
        phone: initial?.phone || '',
        birthday: initial?.birthday || '',
        age: initial?.age ?? null,
        gender: gender || 'unspecified',
        location: initial?.location || null,
        photoURL: photoURL || '',
        avatarId: '',
        language: lang,
        profileComplete: true,
        consents: consents || initial?.consents || null,
        updatedAt: serverTimestamp(),
        createdAt: initial?.createdAt || serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
      await setDoc(doc(db, 'parents', user.uid), {
        uid: user.uid,
        name: displayName,
        username: uname,
        usernameLower: uname,
        email: profile.email,
        phone: profile.phone,
        photoURL: photoURL || '',
        avatarId: '',
        gender: profile.gender,
        birthday: profile.birthday,
        age: profile.age,
        location: profile.location,
        active: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (consents) await persistUserConsents(user.uid, consents);
      onDone(profile);
    } catch {
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
    <View style={styles.page}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('profile.setupTitle')}</Text>

          <View style={styles.photoBlock}>
            <Portrait photoURL={photoURL} gender={gender} size={88} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => photo(false)} disabled={photoBusy}>
                <Text style={styles.link}>{photoBusy ? t('common.loading') : t('profile.upload')}</Text>
              </TouchableOpacity>
              {photoURL ? (
                <TouchableOpacity onPress={() => setPhotoURL('')} disabled={photoBusy}>
                  <Text style={styles.link}>{t('common.delete')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primary, (!valid || saving || photoBusy) && styles.primaryOff]}
            onPress={save}
            disabled={!valid || saving || photoBusy}
          >
            <Text style={styles.primaryTxt}>
              {saving ? t('common.loading') : t('common.continue')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title={t('profile.photo')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    ...Platform.select({
      web: { boxShadow: '0 16px 48px rgba(15, 23, 42, 0.18)' },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.16,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      },
    }),
  },
  cardCompact: { maxHeight: '96%' },
  scroll: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.ink,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  photoBlock: { alignItems: 'center', marginTop: 22, marginBottom: 8 },
  portrait: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#eef2f6' },
  photoActions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  link: { fontSize: 14, fontWeight: '500', color: colors.brand },
  primary: {
    marginTop: 18,
    backgroundColor: colors.brand,
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.45 },
  primaryTxt: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
