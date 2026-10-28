import React, { useEffect, useState } from 'react';
import {
  Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { colors, radius, useLayout } from '../src/theme';
import {
  STORAGE_NOTICE_TEXT, markStorageNoticeSeen, storageNoticeSeen,
} from '../src/privacy/storageNotice';
import LegalDocumentModal from './LegalDocumentModal';

function webStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Diskré informasjon om lokal lagring første gang ProTop åpnes i en nettleser. */
export default function StorageNotice() {
  const { isDesktop } = useLayout();
  const [visible, setVisible] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setVisible(!storageNoticeSeen(webStorage()));
  }, []);

  if (!visible && !docOpen) return null;

  const close = () => {
    markStorageNoticeSeen(webStorage());
    setVisible(false);
  };

  return (
    <>
      {visible ? (
        <View
          style={[styles.card, isDesktop ? styles.cardDesk : styles.cardPhone]}
          accessibilityRole={Platform.OS === 'web' ? 'region' : undefined}
          accessibilityLabel="Lagring i nettleseren"
          nativeID="storage-notice"
        >
          <Text style={styles.body}>{STORAGE_NOTICE_TEXT}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={close} style={styles.cta} accessibilityRole="button">
              <Text style={styles.ctaTxt}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { close(); setDocOpen(true); }}
              style={styles.more}
              accessibilityRole="button"
            >
              <Text style={styles.moreTxt}>Les personvernerklæringen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 60,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  // Mobil: øverst, så kortet ikke dekker fanelinjen eller kortet om nye vilkår nederst.
  cardPhone: { left: 12, right: 12, top: 12 },
  cardDesk: { left: 20, bottom: 20, width: 380 },
  body: { fontSize: 13, lineHeight: 19, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cta: { backgroundColor: colors.brandInk, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 },
  ctaTxt: { color: colors.onBrand, fontSize: 13 },
  more: { paddingVertical: 6 },
  moreTxt: { color: colors.brandInk, fontSize: 13 },
});
