import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../src/i18n';
import CheckBox from './CheckBox';
import LegalDocumentModal from './LegalDocumentModal';
import { colors, radius } from '../src/theme';
import { acceptLegalConsents } from '../src/utils/consents';

/**
 * Privacy and terms on the sign-in card (Google / Microsoft / Apple / email).
 * Replaces the standalone «Før vi starter» screen.
 */
export default function SignInLegalConsent({ accepted, onAcceptedChange, showError }) {
  const { t } = useI18n();
  const [docOpen, setDocOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => setDocOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.linkTxt}>{t('legal.openDoc')}</Text>
        <Text style={styles.linkHint}>{t('legal.openDocHint')}</Text>
      </TouchableOpacity>
      <CheckBox
        checked={accepted}
        onPress={() => onAcceptedChange(!accepted)}
        label={t('legal.agreeRead')}
        style={styles.check}
      />
      {showError && !accepted ? (
        <Text style={styles.hint}>{t('legal.mustAgree')}</Text>
      ) : null}
      <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
    </View>
  );
}

export async function persistSignInConsent(lang) {
  return acceptLegalConsents(lang);
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, gap: 10 },
  linkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.brandSoft,
  },
  linkTxt: { fontWeight: '400', fontSize: 15, color: colors.brand },
  linkHint: { marginTop: 2, color: colors.muted, fontWeight: '400', fontSize: 13 },
  check: { minHeight: 40, alignItems: 'flex-start' },
  hint: { color: colors.warn, fontWeight: '400', fontSize: 13 },
});
