import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

let Cropper = null;
if (Platform.OS === 'web') {
  try { Cropper = require('react-easy-crop').default; } catch {}
}

function createCroppedBlobWeb(imageSrc, areaPixels) {
  return new Promise((resolve, reject) => {
    try {
      const img = document.createElement('img');
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = areaPixels.width;
          canvas.height = areaPixels.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(
            img,
            areaPixels.x, areaPixels.y, areaPixels.width, areaPixels.height,
            0, 0, areaPixels.width, areaPixels.height
          );
          canvas.toBlob(
            (blob) => {
              if (!blob) reject(new Error('Kunne ikke lage bilde-blob'));
              else resolve(blob);
            },
            'image/jpeg',
            0.92
          );
        } catch (e) { reject(e); }
      };
      img.onerror = (e) => reject(e?.message || e || new Error('Bilde kunne ikke lastes'));
      img.crossOrigin = 'anonymous';
      img.src = imageSrc;
    } catch (e) {
      reject(e);
    }
  });
}

export default function WebImageCropperModal({
  visible,
  imageUri,
  aspect = 1,
  onCancel,
  onConfirm,
  title = 'Crop',
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const canCrop = !!Cropper && !!imageUri && !!croppedAreaPixels;

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const confirm = useCallback(async () => {
    if (!imageUri || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await createCroppedBlobWeb(imageUri, croppedAreaPixels);
      await onConfirm?.(blob);
    } finally {
      setBusy(false);
    }
  }, [croppedAreaPixels, imageUri, onConfirm]);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [imageUri]);

  if (!visible || Platform.OS !== 'web') return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <View style={styles.cropArea}>
            {Cropper ? (
              <Cropper
                image={imageUri}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <Text style={{ fontWeight: '400', color: '#0f172a' }}>Crop støttes ikke her</Text>
                <Text style={{ marginTop: 8, color: '#334155', textAlign: 'center' }}>Prøv å bruke avatarvalg i stedet.</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={[styles.btn, styles.cancelBtn]} disabled={busy}>
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              style={[styles.btn, styles.okBtn, (!canCrop || busy) && { opacity: 0.6 }]}
              disabled={!canCrop || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.okTxt}>Bruk bilde</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  card: { width: '100%', maxWidth: 900, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontWeight: '400', fontSize: 16, color: '#0f172a' },
  closeBtn: {
    alignSelf: 'flex-start', padding: 8, borderRadius: 999, backgroundColor: '#f8fafc' },
  cropArea: { height: 440, backgroundColor: '#000' },
  actions: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0', justifyContent: 'flex-end' },
  btn: {
    alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, minWidth: 140, alignItems: 'center' },
  cancelBtn: {
    alignSelf: 'flex-start', backgroundColor: '#e2e8f0' },
  cancelTxt: { color: '#0f172a', fontWeight: '400' },
  okBtn: {
    alignSelf: 'flex-start', backgroundColor: '#0b74d1' },
  okTxt: { color: '#fff', fontWeight: '400' },
});

