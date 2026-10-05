import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { companyLogoOf, normalizeCompanyLogo } from '../src/project/companyLogo';
import { pickImage } from '../src/utils/media';
import WebImageCropperModal from './WebImageCropperModal';

const ASPECTS = [
  { id: 'wide', label: 'Bred', value: 3 },
  { id: 'standard', label: 'Standard', value: 16 / 9 },
  { id: 'square', label: 'Kvadrat', value: 1 },
];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese logoen.'));
    reader.readAsDataURL(blob);
  });
}

async function measureBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height };
  }
  return { width: 0, height: 0 };
}

async function logoFromNative(uri) {
  const ImageManipulator = await import('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 720 } }],
    { compress: 0.86, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return normalizeCompanyLogo({
    dataUrl: `data:image/jpeg;base64,${result.base64 || ''}`,
    width: result.width,
    height: result.height,
    updatedAt: new Date().toISOString(),
  });
}

export default function CompanyLogoSettings({ company, canEdit, colors, busy, onSave }) {
  const logo = companyLogoOf(company);
  const [cropUri, setCropUri] = useState('');
  const [aspect, setAspect] = useState(ASPECTS[0].value);
  const [localError, setLocalError] = useState('');
  const [working, setWorking] = useState(false);
  const locked = !canEdit || busy || working;

  async function store(next) {
    if (!next) {
      setLocalError('Logoen ble for stor eller kunne ikke leses. Beskjær den tettere.');
      return;
    }
    setLocalError('');
    setWorking(true);
    try {
      await onSave(next);
    } catch (err) {
      setLocalError(err?.message || 'Kunne ikke lagre logoen.');
    } finally {
      setWorking(false);
    }
  }

  async function choose() {
    if (locked) return;
    setLocalError('');
    try {
      const picked = await pickImage({
        edit: Platform.OS !== 'web',
        aspect: [3, 1],
      });
      if (!picked?.uri) return;
      if (Platform.OS === 'web') {
        setCropUri(picked.uri);
        return;
      }
      const next = await logoFromNative(picked.uri);
      await store(next);
    } catch (err) {
      const denied = err?.message === 'library-denied' || err?.message === 'camera-denied';
      setLocalError(denied ? 'Gi tilgang til bilder for å laste opp logo.' : (err?.message || 'Kunne ikke åpne bildet.'));
    }
  }

  async function confirmCrop(blob) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      const size = await measureBlob(blob);
      const next = normalizeCompanyLogo({
        dataUrl,
        width: size.width,
        height: size.height,
        updatedAt: new Date().toISOString(),
      });
      setCropUri('');
      await store(next);
    } catch (err) {
      setCropUri('');
      setLocalError(err?.message || 'Kunne ikke beskjære logoen.');
    }
  }

  async function remove() {
    if (locked) return;
    setLocalError('');
    setWorking(true);
    try {
      await onSave(null);
    } catch (err) {
      setLocalError(err?.message || 'Kunne ikke fjerne logoen.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: colors.muted }]}>Bedriftens logo</Text>
      <Text style={[styles.help, { color: colors.muted }]}>
        Last opp og beskjær logoen som skal brukes på bedriftssiden og i dokumenter dere lager.
        ProTop-logoen i appen endres ikke.
      </Text>
      {logo ? (
        <View style={[styles.plate, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Image
            source={{ uri: logo.dataUrl }}
            style={styles.preview}
            resizeMode="contain"
            accessibilityLabel="Bedriftens logo"
          />
        </View>
      ) : (
        <Text style={[styles.help, { color: colors.ink }]}>Ingen logo er lastet opp.</Text>
      )}
      {canEdit ? (
        <View style={styles.row}>
          <TouchableOpacity
            onPress={choose}
            disabled={locked}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand, opacity: locked ? 0.55 : 1 }]}
          >
            <Text style={styles.btnText}>{working ? 'Lagrer…' : (logo ? 'Bytt logo' : 'Last opp logo')}</Text>
          </TouchableOpacity>
          {logo ? (
            <TouchableOpacity
              onPress={remove}
              disabled={locked}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.sunken, opacity: locked ? 0.55 : 1 }]}
            >
              <Text style={[styles.btnText, { color: colors.ink }]}>Fjern logo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!!localError && <Text style={{ color: colors.danger }}>{localError}</Text>}
      <WebImageCropperModal
        visible={!!cropUri}
        imageUri={cropUri}
        aspect={aspect}
        aspects={ASPECTS}
        onAspect={setAspect}
        title="Beskjær logo"
        output={{ type: 'image/jpeg', quality: 0.88, maxEdge: 720, background: '#ffffff' }}
        onCancel={() => setCropUri('')}
        onConfirm={confirmCrop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { fontSize: 12, fontWeight: '400' },
  help: { fontSize: 14, lineHeight: 20 },
  plate: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  preview: { width: 180, height: 64 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { color: '#fff', fontWeight: '400' },
});
