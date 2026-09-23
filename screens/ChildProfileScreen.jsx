// src/screens/ChildProfileScreen.jsx
import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  Switch,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { db, storage } from '../firebase';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Feather } from '@expo/vector-icons';
import TopNavBar from '../components/TopNavBar';
import BirthdayPicker from '../components/BirthdayPicker';
import { calculateAge, isValidBirthday, toIsoDate } from '../src/utils/age';
import { setMemberPassword } from '../src/utils/setMemberPassword';

// Web-only cropper
let Cropper = null;
if (Platform.OS === 'web') {
  try { Cropper = require('react-easy-crop').default; } catch {}
}

export default function ChildProfileScreen({ route, navigation }) {
  const child = route?.params?.child || {};
  const childDocId = child?.uid || child?.id;

  // Hide stack header – use TopNavBar instead
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const [name, setName] = useState(child.name || '');
  const [birthday, setBirthday] = useState(toIsoDate(child.birthday) || '');
  const [photoUrl, setPhotoUrl] = useState(child.photoUrl || child.photoURL || '');
  const [isActive, setIsActive] = useState(child.active !== false);
  const [username] = useState(child.username || '');
  const [password, setPassword] = useState(child.password || '');
  const [editingPassword, setEditingPassword] = useState(false);

  const [busy, setBusy] = useState(false);

  // Crop (web)
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    setName(child.name || '');
    setBirthday(toIsoDate(child.birthday) || '');
    setPhotoUrl(child.photoUrl || child.photoURL || '');
    setIsActive(child.active !== false);
    setPassword(child.password || '');
  }, [child?.name, child?.birthday, child?.photoUrl, child?.photoURL, child?.active, child?.password]);

  const onCropComplete = useCallback((_, croppedPixels) => setCroppedAreaPixels(croppedPixels), []);

  // ---- Image pick + upload ----
  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Tillatelse kreves', 'Du må gi tilgang til bildegalleriet.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 0.92,
      });
      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      if (Platform.OS === 'web' && Cropper) {
        setSelectedImageUri(uri);
        setCropVisible(true);
      } else {
        await uploadImageUri(uri);
      }
    } catch (e) {
      console.error('pickImage error:', e);
      Alert.alert('Feil', 'Kunne ikke åpne bildegalleri.');
    }
  };

  const uploadImageUri = async (uri) => {
    try {
      setBusy(true);
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const path = `child_avatars/${childDocId}-${Date.now()}.jpg`;
      const sref = ref(storage, path);
      await uploadBytes(sref, blob);
      const url = await getDownloadURL(sref);
      await afterUpload(url);
      Alert.alert('Profilbilde oppdatert!');
    } catch (err) {
      console.error('Feil ved bildeopplasting (native/web-no-crop):', err);
      Alert.alert('Feil', 'Kunne ikke lagre bilde.');
    } finally {
      setBusy(false);
    }
  };

  // Web helpers
  const createImage = (url) =>
    new Promise((resolve, reject) => {
      try {
        const img = document.createElement('img');
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.setAttribute('crossOrigin', 'anonymous');
        img.src = url;
      } catch (e) { reject(e); }
    });

  const getCroppedImage = async (imageSrc, cropPixels) => {
    const img = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
      0, 0, cropPixels.width, cropPixels.height
    );
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Kunne ikke lage bilde-blob')),
        'image/jpeg',
        0.92
      );
    });
  };

  const uploadCroppedImage = async () => {
    try {
      setBusy(true);
      if (!croppedAreaPixels || !selectedImageUri) throw new Error('Crop mangler');
      const blob = await getCroppedImage(selectedImageUri, croppedAreaPixels);
      const path = `child_avatars/${childDocId}-${Date.now()}.jpg`;
      const storageRefObj = ref(storage, path);
      await uploadBytes(storageRefObj, blob);
      const url = await getDownloadURL(storageRefObj);
      await afterUpload(url);
      setCropVisible(false);
      setSelectedImageUri(null);
      Alert.alert('Profilbilde oppdatert!');
    } catch (err) {
      console.error('Feil ved bildeopplasting (web/crop):', err);
      Alert.alert('Feil', 'Kunne ikke lagre bilde.');
    } finally {
      setBusy(false);
    }
  };

  const afterUpload = async (url) => {
    setPhotoUrl(url);
    if (child.familyId && childDocId) {
      await updateDoc(doc(db, 'families', child.familyId, 'children', childDocId), {
        photoUrl: url,
        photoURL: url,
        updatedAt: new Date(),
      });
    }
  };

  // ---- Save / Delete ----
  const handleSave = async () => {
    if (!child?.familyId || !childDocId) {
      Alert.alert('Feil', 'Mangler referanse til barn i databasen.');
      return;
    }
    if (!name.trim() || !isValidBirthday(birthday)) {
      Alert.alert('Feil', 'Navn og fødselsdato må være korrekt utfylt.');
      return;
    }
    try {
      const age = calculateAge(birthday);
      const nextPassword = password.trim();
      if (nextPassword && nextPassword.length < 6) {
        Alert.alert('Feil', 'Passordet må ha minst 6 tegn.');
        return;
      }
      setBusy(true);
      await updateDoc(doc(db, 'families', child.familyId, 'children', childDocId), {
        name: name.trim(),
        birthday,
        age,
        photoUrl: photoUrl || null,
        active: isActive,
        password: deleteField(),
        updatedAt: new Date(),
      });
      await Promise.all([
        updateDoc(doc(db, 'children', childDocId), {
          name: name.trim(), birthday, age, photoUrl: photoUrl || null, active: isActive,
          password: deleteField(), updatedAt: new Date(),
        }).catch(() => {}),
        updateDoc(doc(db, 'users', childDocId), { displayName: name.trim(), birthday, age, updatedAt: new Date() }).catch(() => {}),
      ]);
      if (nextPassword) {
        await setMemberPassword({
          uid: childDocId,
          password: nextPassword,
          familyId: child.familyId,
        });
      }
      setEditingPassword(false);
      Alert.alert('Oppdatert', 'Informasjonen er lagret.');
      navigation.goBack();
    } catch (error) {
      console.error('Feil ved lagring:', error);
      Alert.alert('Feil', 'Klarte ikke å lagre endringer.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!child?.familyId || !childDocId) return;
    const confirm =
      Platform.OS === 'web'
        ? window.confirm('Barnet vil skjules helt fra oversikten og betraktes som slettet. Fortsette?')
        : await new Promise((resolve) => {
            Alert.alert('Slett barnet', 'Barnet vil fjernes helt fra oversikten.', [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Slett', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });

    if (!confirm) return;

    try {
      setBusy(true);
      await updateDoc(doc(db, 'families', child.familyId, 'children', childDocId), {
        active: false,
        deleted: true,
        updatedAt: new Date(),
      });
      Alert.alert('Slettet', 'Barnet er skjult fra oversikten.');
      navigation.goBack();
    } catch (err) {
      console.error('Feil ved sletting:', err);
      Alert.alert('Feil', 'Kunne ikke slette barnet.');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    if (child?.familyId) {
      navigation.navigate('FamilyDashboard', { familyId: child.familyId });
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('FamilyOverview');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f6fbff' }}>
      <TopNavBar title="Barn" showBack onBack={handleBack} />

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Barnets profil</Text>

        <TouchableOpacity onPress={pickImage} disabled={busy}>
          <Image
            source={photoUrl ? { uri: photoUrl } : require('../assets/avatar-child.png')}
            style={styles.avatar}
          />
          <Text style={styles.link}>{busy ? 'Laster opp...' : 'Endre profilbilde'}</Text>
        </TouchableOpacity>

        <Text style={styles.ageLabel}>Alder: {calculateAge(birthday) ?? '—'} år</Text>
        <Text style={styles.infoRow}>
          Brukernavn: <Text style={{ fontWeight: 'bold' }}>{username}</Text>
        </Text>

        <TextInput style={styles.input} placeholder="Navn" value={name} onChangeText={setName} editable={!busy} />

        <BirthdayPicker value={birthday} onChange={setBirthday} defaultAge={8} />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Bruker aktiv:</Text>
          <Switch value={isActive} onValueChange={setIsActive} disabled={busy} />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🎓 Her er barnets innloggingsdetaljer. Disse brukes når barnet skal logge inn selvstendig:
          </Text>

          <Text style={styles.loginText}>
            Brukernavn: <Text style={{ fontWeight: 'bold' }}>{username || 'Mangler brukernavn'}</Text>
          </Text>

          {!editingPassword ? (
            <View style={styles.passwordRow}>
              <Text style={styles.loginText}>
                Passord: <Text style={{ fontWeight: 'bold' }}>{password}</Text>
              </Text>
              <TouchableOpacity onPress={() => setEditingPassword(true)} disabled={busy}>
                <Feather name="edit-2" size={18} color="#007AFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Nytt passord"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                editable={!busy}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setEditingPassword(false)} disabled={busy}>
                  <Text style={{ color: '#ff3b30' }}>❌ Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={busy}>
                  <Text style={{ color: '#007AFF' }}>✔ Lagre</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={{ marginBottom: 12 }}>
          <TouchableOpacity onPress={handleSave} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Lagre endringer</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 8 }}>
          <TouchableOpacity onPress={handleDelete} disabled={busy} style={[styles.dangerBtn, busy && { opacity: 0.6 }]}>
            <Text style={styles.dangerBtnText}>❌ Slett bruker</Text>
          </TouchableOpacity>
        </View>

        {/* WEB: Cropper-modal */}
        {Platform.OS === 'web' && Cropper && cropVisible && (
          <Modal visible={cropVisible} animationType="slide" onRequestClose={() => setCropVisible(false)}>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <View style={{ flex: 1 }}>
                <Cropper
                  image={selectedImageUri}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </View>
              <View style={styles.cropButtons}>
                <TouchableOpacity onPress={() => setCropVisible(false)} style={styles.cropCancelBtn}>
                  <Text style={styles.cancel}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={uploadCroppedImage} style={styles.cropSaveBtn}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.save}>Bruk bilde</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 24, backgroundColor: '#f6fbff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 25, textAlign: 'center', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 112,
    height: 112,
    alignSelf: 'center',
    borderRadius: 56,
    marginBottom: 10,
    backgroundColor: '#e2e8f0',
  },
  link: { textAlign: 'center', color: '#0b74d1', marginBottom: 15, fontWeight: '600' },
  ageLabel: { textAlign: 'center', fontSize: 16, marginBottom: 20, color: '#334155' },
  infoRow: { fontSize: 16, textAlign: 'center', marginBottom: 8, color: '#334155' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  switchLabel: { fontSize: 16, color: '#0f172a' },
  infoBox: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoText: { fontSize: 14, marginBottom: 10, color: '#334155' },
  loginText: { fontSize: 16, color: '#0f172a' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

  primaryBtn: {
    backgroundColor: '#0b74d1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  dangerBtn: {
    backgroundColor: '#ee3a3a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  cropButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#000',
  },
  cropCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#1f2937',
  },
  cropSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#0b74d1',
  },
  cancel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  save: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
