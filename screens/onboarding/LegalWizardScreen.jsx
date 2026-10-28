import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../../src/i18n';
import { acceptedConsentRecord, emptyConsents, saveLocalConsents } from '../../src/utils/consents';
import { LEGAL_VERSION } from '../../src/i18n/langs';
import Wizard from '../../components/Wizard';
import CheckBox from '../../components/CheckBox';
import LegalDocumentModal from '../../components/LegalDocumentModal';
import { colors, radius } from '../../src/theme';

export default function LegalWizardScreen({ navigation, onDone, existing, nextLabel }) {
  const { t, lang } = useI18n();
  const [ok, setOk] = useState(false);
  const [opened, setOpened] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  const finish = async () => {
    if (!ok) return;
    const nextConsents = acceptedConsentRecord(lang, existing || emptyConsents());
    await saveLocalConsents(nextConsents);
    onDone(nextConsents);
  };

  return (
    <>
      <Wizard
        title={t('legal.title')}
        subtitle={t('legal.introShort')}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        onNext={finish}
        nextDisabled={!ok}
        nextLabel={nextLabel || t('legal.continueCreate')}
      >
        <TouchableOpacity style={styles.linkBtn} onPress={() => { setDocOpen(true); setOpened(true); }}>
          <Text style={styles.linkTxt}>📄 {t('legal.openDoc')}</Text>
          <Text style={styles.linkHint}>{t('legal.openDocHint')}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Versjon {LEGAL_VERSION}</Text>
        {opened ? (
          <Text style={styles.openedOk}>{t('legal.docOpened')}</Text>
        ) : null}

        <CheckBox checked={ok} onPress={() => setOk(!ok)} label={t('legal.agreeRead')} />
        {!ok ? <Text style={styles.hint}>{t('legal.mustAgree')}</Text> : null}
      </Wizard>

      <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  linkBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card, borderRadius: radius.md, padding: 16,
    borderWidth: 2, borderColor: colors.brandSoft,
  },
  linkTxt: { fontWeight: '400', fontSize: 17, color: colors.brandInk },
  linkHint: { marginTop: 6, color: colors.muted, fontWeight: '400', fontSize: 14 },
  version: { color: colors.muted, fontSize: 13 },
  openedOk: { color: colors.successInk, fontWeight: '400' },
  hint: { color: colors.warnInk, fontWeight: '400' },
});
