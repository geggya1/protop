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
 * `footer` pins the block under the sign-in action, as the last thing on the card.
 * `remembered`: denne versjonen er allerede godtatt på enheten. Da vises en bekreftelse
 * i stedet for avkrysningen, så første trykk på «Logg inn» ikke gir feil.
 */
export default function SignInLegalConsent({ accepted, onAcceptedChange, showError, footer = false, remembered = false }) {
  const { t } = useI18n();
  const [docOpen, setDocOpen] = useState(false);

  if (remembered && accepted) {
    return (
      <View style={[styles.remembered, footer && styles.wrapFooter]} nativeID="signin-consent-remembered">
        <Text style={styles.rememberedTxt}>
          {'✓ '}
          {t('legal.acceptedOnDevice')}
          {' '}
          <Text style={styles.inlineLink} onPress={() => setDocOpen(true)} accessibilityRole="link">
            {t('legal.openDoc')}
          </Text>
        </Text>
        <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, footer && styles.wrapFooter]}>
      <TouchableOpacity
        style={[styles.linkBtn, footer && styles.linkBtnFooter]}
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
  wrapFooter: {
    marginTop: 8,
    marginBottom: 0,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.brandSoft,
  },
  linkBtnFooter: { alignSelf: 'stretch' },
  linkTxt: { fontWeight: '400', fontSize: 15, color: colors.brandInk },
  linkHint: { marginTop: 2, color: colors.muted, fontWeight: '400', fontSize: 13 },
  check: { minHeight: 40, alignItems: 'flex-start' },
  hint: { color: colors.warnInk, fontWeight: '400', fontSize: 13 },
  remembered: { marginBottom: 16 },
  rememberedTxt: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  inlineLink: { color: colors.brandInk, textDecorationLine: 'underline' },
});
