import React, { useEffect, useState } from 'react';
import {
  Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { LEGAL_VERSION } from '../src/i18n/langs';
import { colors, radius, useLayout } from '../src/theme';
import {
  acceptLegalConsents, loadLocalConsents, needsLegalUpdate, persistUserConsents,
} from '../src/utils/consents';
import LegalDocumentModal from './LegalDocumentModal';

// «Senere» gjelder bare til appen lastes på nytt.
let dismissedVersion = '';

/**
 * Nye vilkår eller ny personvernerklæring: innloggede brukere bes om å godta,
 * men appen stenges ikke. Brukeren må åpne dokumentet før «Jeg godtar».
 */
export default function LegalUpdateNotice() {
  const {
    uid, userProfile, userProfileReady, isChild,
  } = useApp();
  const { lang } = useI18n();
  const { isDesktop } = useLayout();
  const [local, setLocal] = useState(null);
  const [opened, setOpened] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(dismissedVersion === LEGAL_VERSION);

  useEffect(() => {
    let alive = true;
    loadLocalConsents().then((c) => { if (alive) setLocal(c); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  // Vent på kontoen, så den som har godtatt på en annen enhet, ikke ser kortet et øyeblikk.
  if (!uid || isChild || hidden || !local || !userProfileReady) return null;
  if (!needsLegalUpdate(userProfile?.consents, local)) return null;

  const accept = async () => {
    if (!opened || busy) return;
    setBusy(true);
    try {
      const next = await acceptLegalConsents(lang);
      setLocal(next);
      await persistUserConsents(uid, next).catch(() => {});
      setHidden(true);
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    dismissedVersion = LEGAL_VERSION;
    setHidden(true);
  };

  return (
    <>
      <View
        style={[styles.card, isDesktop ? styles.cardDesk : styles.cardPhone]}
        accessibilityRole={Platform.OS === 'web' ? 'region' : undefined}
        accessibilityLabel="Oppdaterte vilkår"
        nativeID="legal-update-notice"
      >
        <Text style={styles.title}>Nye vilkår og ny personvernerklæring</Text>
        <Text style={styles.body}>
          ProTop er nå beskrevet som tjeneste for bedrifter, med roller, underleverandører, AI og brukslogg.
          Les og godta versjon {LEGAL_VERSION}.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => { setDocOpen(true); setOpened(true); }}
            style={styles.ghost}
            accessibilityRole="button"
          >
            <Text style={styles.ghostTxt}>Les</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={accept}
            disabled={!opened || busy}
            style={[styles.cta, (!opened || busy) && styles.ctaOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !opened || busy }}
          >
            <Text style={styles.ctaTxt}>{busy ? 'Lagrer…' : 'Jeg godtar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={later} style={styles.later} accessibilityRole="button">
            <Text style={styles.laterTxt}>Senere</Text>
          </TouchableOpacity>
        </View>
        {!opened ? <Text style={styles.hint}>Trykk «Les» først.</Text> : null}
      </View>
      <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 50,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardPhone: { left: 12, right: 12, bottom: 96 },
  cardDesk: { right: 20, bottom: 20, width: 420 },
  title: { fontSize: 15, fontWeight: '600', color: colors.ink },
  body: { fontSize: 13, lineHeight: 19, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ghost: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
  },
  ghostTxt: { color: colors.ink, fontSize: 13 },
  cta: { backgroundColor: colors.brandInk, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  ctaOff: { opacity: 0.5 },
  ctaTxt: { color: colors.onBrand, fontSize: 13 },
  later: { paddingVertical: 8, paddingHorizontal: 6 },
  laterTxt: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12 },
});
