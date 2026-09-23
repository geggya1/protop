import React from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../src/i18n';
import { legalDocument } from '../src/i18n/legal';
import { colors, radius } from '../src/theme';

export default function LegalDocumentModal({ visible, onClose }) {
  const { t, lang } = useI18n();
  const sections = legalDocument(lang);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('legal.docTitle')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {sections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.h}>{t(section.key)}</Text>
              {section.paragraphs.map((p) => (
                <Text key={p} style={styles.p}>{p}</Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line,
    backgroundColor: colors.card,
  },
  title: { fontWeight: '900', fontSize: 18, color: colors.ink, flex: 1 },
  closeBtn: {
    backgroundColor: colors.brandSoft, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
  },
  closeTxt: { fontWeight: '800', color: colors.brand },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  section: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 8 },
  h: { fontWeight: '900', fontSize: 17, color: colors.brand },
  p: { fontSize: 14, lineHeight: 21, color: colors.ink },
});
