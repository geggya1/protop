import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';

export default function LanguageMenu({ compact }) {
  const { t, langs, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const current = langs.find((l) => l.id === lang) || langs[0];

  const pick = async (id) => {
    await setLang(id);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.btn, compact && styles.btnCompact]}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.changeLang')}
      >
        <Text style={styles.globe}>🌐</Text>
        {!compact ? <Text style={styles.btnTxt}>{current.flag} {current.name}</Text> : null}
        <Text style={styles.chev}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.sheetTitle}>{t('lang.title')}</Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {langs.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  onPress={() => pick(l.id)}
                  style={[styles.row, lang === l.id && styles.rowOn]}
                >
                  <Text style={styles.flag}>{l.flag}</Text>
                  <Text style={[styles.name, lang === l.id && styles.nameOn]}>{l.name}</Text>
                  {lang === l.id ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 40,
  },
  btnCompact: { paddingHorizontal: 10 },
  globe: { fontSize: 16 },
  btnTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  chev: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'web' ? 72 : 56,
    paddingRight: 16,
    paddingLeft: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    maxHeight: '70%',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 16px 40px rgba(15,23,42,0.18)' }
      : { elevation: 8 }),
  },
  sheetTitle: { fontWeight: '400', fontSize: 18, color: colors.ink, marginBottom: 12 },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  rowOn: { backgroundColor: colors.brandSoft },
  flag: { fontSize: 24 },
  name: { flex: 1, fontWeight: '400', fontSize: 16, color: colors.ink },
  nameOn: { color: colors.brand, fontWeight: '400' },
  check: { color: colors.brand, fontWeight: '400', fontSize: 18 },
});
