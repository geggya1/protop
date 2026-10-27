import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadPowerOfficeStatus, syncPowerOfficeInvoices } from '../../src/economy/powerOfficeClient.js';
import { envTag, syncCountsText, syncLabel } from '../../src/economy/powerOfficeView.js';

/** Synk automatisk når fakturalisten åpnes, men ikke oftere enn dette. */
const AUTO_SYNC_MS = 5 * 60 * 1000;

/**
 * Én linje i fakturalisten når bedriften er koblet til PowerOffice: status og «Synk nå».
 * Innstillingene ligger under Økonomi → Innstillinger → Regnskapssystem.
 * Uten tilkobling vises ingenting.
 */
export default function PowerOfficeSyncLine({ familyId, colors, status, onStatus }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const autoSynced = useRef(false);

  async function sync({ quiet = false } = {}) {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await syncPowerOfficeInvoices(familyId);
      const next = await loadPowerOfficeStatus(familyId).catch(() => null);
      if (next) onStatus?.(next);
      if (!quiet) setMessage(`Synket: ${syncCountsText(result?.counts)}.`);
    } catch (cause) {
      setFailed(true);
      setMessage(cause?.message || 'Synk med PowerOffice feilet.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!status?.connected || autoSynced.current) return;
    const last = new Date(status.lastSyncAt || 0).getTime();
    if (Date.now() - last <= AUTO_SYNC_MS) return;
    autoSynced.current = true;
    void sync({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  if (!status?.connected) return null;
  const tag = envTag(status.env);
  return (
    <View nativeID="poweroffice-sync-line" style={styles.row}>
      <Ionicons name="link-outline" size={16} color={colors.brand} />
      <Text style={{ color: colors.muted, flexShrink: 1 }}>
        PowerOffice: {status.clientName || 'koblet til'}
        {tag ? ` (${tag.toLowerCase()})` : ''} · {busy ? 'synker…' : syncLabel(status.lastSyncAt)}
      </Text>
      <TouchableOpacity onPress={() => sync()} disabled={busy} accessibilityRole="button">
        <Text style={{ color: colors.brand, fontWeight: '600', opacity: busy ? 0.6 : 1 }}>Synk nå</Text>
      </TouchableOpacity>
      {message ? (
        <Text style={{ color: failed ? (colors.danger || '#b42318') : colors.muted }}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
