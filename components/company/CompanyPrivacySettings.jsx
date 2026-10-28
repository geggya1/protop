import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { serverTimestamp } from 'firebase/firestore';
import LegalDocumentModal from '../LegalDocumentModal';
import { DPA_VERSION } from '../../src/i18n/langs';
import {
  canAcceptDpa, dpaAccepted, dpaAcceptedLabel, dpaAcceptanceRecord,
} from '../../src/privacy/companyPrivacy';
import { logConsent } from '../../src/utils/consents';

/**
 * Selskapsinnstillinger → Personvern: databehandleravtalen.
 * `onSaveCompany(next)` lagrer selskapet felt for felt.
 */
export default function CompanyPrivacySettings({
  family, familyId, company, uid, userName = '', colors, onSaveCompany,
}) {
  const [docOpen, setDocOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accepted = dpaAccepted(company);
  const label = dpaAcceptedLabel(company);
  const mayAccept = canAcceptDpa(family, uid);

  async function accept() {
    if (!mayAccept || busy || !opened) return;
    setBusy(true);
    setError('');
    try {
      const acceptance = dpaAcceptanceRecord({ uid, name: userName });
      await onSaveCompany({ ...company, dpaAcceptance: { ...acceptance, acceptedAt: serverTimestamp() } });
      logConsent({
        kind: 'dpa', familyId, version: acceptance.version, clientAt: acceptance.acceptedAtClient,
      });
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre aksepten.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap} nativeID="company-dpa">
      <Text style={[styles.title, { color: colors.ink }]}>Databehandleravtale</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Bedriften er behandlingsansvarlig for opplysninger om ansatte, kunder og søkere i ProTop. ProTop er databehandler etter avtalen.
      </Text>
      <Text style={[styles.status, { color: accepted ? colors.success || colors.ink : colors.danger || colors.ink }]}>
        {accepted ? label : (label ? `${label}. Ny versjon ${DPA_VERSION} er ikke godtatt.` : `Versjon ${DPA_VERSION} er ikke godtatt for bedriften.`)}
      </Text>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => { setDocOpen(true); setOpened(true); }}
          style={[styles.btn, { backgroundColor: colors.sunken }]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.ink }}>Les databehandleravtalen</Text>
        </TouchableOpacity>
        {!accepted && mayAccept ? (
          <TouchableOpacity
            onPress={accept}
            disabled={busy || !opened}
            style={[styles.btn, { backgroundColor: colors.brand }, (busy || !opened) && styles.off]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !opened }}
          >
            <Text style={{ color: '#fff' }}>{busy ? 'Lagrer…' : 'Godta på vegne av bedriften'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!accepted && mayAccept && !opened ? (
        <Text style={[styles.lead, { color: colors.muted }]}>Les avtalen før du godtar.</Text>
      ) : null}
      {!accepted && !mayAccept ? (
        <Text style={[styles.lead, { color: colors.muted }]}>Eier eller administrator må godta avtalen.</Text>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <LegalDocumentModal visible={docOpen} doc="dpa" onClose={() => setDocOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  lead: { fontSize: 14, lineHeight: 20 },
  status: { fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    alignSelf: 'flex-start', borderRadius: 12, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8,
  },
  off: { opacity: 0.5 },
});
