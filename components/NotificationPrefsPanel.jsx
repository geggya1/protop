import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import {
  channelEnabled,
  groupedNotificationTypes,
  hasOwnEmail,
  isRecommended,
  normalizePrefs,
  notificationsEnabled,
  recommendedPrefs,
  withChannel,
  withEnabled,
} from '../src/notifications/prefs';
import {
  beginNotificationPermissionFromGesture,
  completePushSubscription,
  enablePushFromUserGesture,
  getPushStatus,
  pushSupported,
  sendTestPush,
} from '../src/utils/push';

function Check({ id, checked, disabled, onPress, label }) {
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.check, disabled && styles.checkDisabled]}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.brand : colors.muted} />
    </Pressable>
  );
}

/**
 * Brukerens egne varselvalg: push og e-post per varseltype, med anbefalte standarder.
 * Alle varsler vises uansett i bjellen. Lagres i users/{uid}.notificationPrefs (versjon 2).
 */
export default function NotificationPrefsPanel() {
  const { uid, userProfile } = useApp();
  const stored = userProfile?.notificationPrefs;
  const [prefs, setPrefs] = useState(() => normalizePrefs(stored));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [device, setDevice] = useState(null);
  const [deviceBusy, setDeviceBusy] = useState(false);

  useEffect(() => {
    if (!saving) setPrefs(normalizePrefs(stored));
  }, [stored, saving]);

  const refreshDevice = useCallback(async () => {
    if (!pushSupported()) {
      setDevice({ supported: false });
      return;
    }
    try {
      setDevice(await getPushStatus());
    } catch {
      setDevice({ supported: false });
    }
  }, []);

  useEffect(() => {
    refreshDevice();
  }, [refreshDevice]);

  const save = useCallback(async (next) => {
    if (!uid) return;
    const before = prefs;
    setPrefs(next);
    setSaving(true);
    setNote('');
    try {
      // updateDoc erstatter hele notificationPrefs, så gamle innskrevne verdier forsvinner.
      await updateDoc(doc(db, 'users', uid), { notificationPrefs: next });
      setNote('Lagret.');
    } catch {
      setPrefs(before);
      setNote('Kunne ikke lagre. Prøv igjen.');
    } finally {
      setSaving(false);
    }
  }, [uid, prefs]);

  const enabled = notificationsEnabled(prefs);

  // Tillatelsen må spørres om i samme trykk (iPhone), før noe await.
  const enableDevicePush = () => {
    if (!uid || deviceBusy) return;
    const permission = Platform.OS === 'web' ? beginNotificationPermissionFromGesture() : null;
    setDeviceBusy(true);
    setNote('');
    (async () => {
      try {
        const result = permission
          ? await completePushSubscription(uid, await permission)
          : await enablePushFromUserGesture(uid);
        if (result?.ok) {
          await sendTestPush(uid).catch(() => {});
          setNote('Push er slått på for denne enheten. Du får et testvarsel om litt.');
        } else if (result?.reason === 'ios-tab') {
          setNote('På iPhone: legg ProTop til hjemskjermen, åpne den derfra og prøv igjen.');
        } else if (result?.reason === 'denied') {
          setNote('Varsler er blokkert for ProTop i nettleseren eller telefonen. Tillat dem i innstillingene der.');
        } else {
          setNote('Kunne ikke slå på push for denne enheten.');
        }
      } finally {
        setDeviceBusy(false);
        refreshDevice();
      }
    })();
  };

  const sendTest = async () => {
    if (!uid || deviceBusy) return;
    setDeviceBusy(true);
    try {
      await sendTestPush(uid);
      setNote('Testvarsel sendt til enhetene der push er slått på.');
    } catch {
      setNote('Kunne ikke sende testvarsel.');
    } finally {
      setDeviceBusy(false);
    }
  };

  const deviceOn = device?.supported && device?.permission === 'granted' && device?.subscribed;

  return (
    <View nativeID="notification-prefs" style={styles.stack}>
      <Text style={styles.lead}>
        Alle varsler vises alltid i bjellen øverst ved profilbildet. Her velger du om du i tillegg vil få dem som push på telefonen eller PC-en, eller som e-post.
      </Text>

      <View style={styles.card}>
        <Pressable
          nativeID="notif-enabled"
          onPress={() => save(withEnabled(prefs, !enabled))}
          disabled={saving}
          accessibilityRole="checkbox"
          aria-checked={enabled}
          style={styles.masterRow}
        >
          <Ionicons name={enabled ? 'checkbox' : 'square-outline'} size={24} color={enabled ? colors.brand : colors.muted} />
          <View style={styles.grow}>
            <Text style={styles.masterLabel}>Send push og e-post for varsler</Text>
            <Text style={styles.muted}>
              {enabled ? 'Etter valgene under.' : 'Av: varslene vises bare i bjellen.'}
            </Text>
          </View>
        </Pressable>

        {device ? (
          <View style={styles.deviceRow}>
            <Ionicons name={deviceOn ? 'phone-portrait' : 'phone-portrait-outline'} size={18} color={deviceOn ? colors.brand : colors.muted} />
            <Text style={[styles.grow, styles.muted]}>
              {!device.supported
                ? 'Denne nettleseren kan ikke få push.'
                : (deviceOn ? 'Push er slått på for denne enheten.' : 'Push er ikke slått på for denne enheten.')}
            </Text>
            {device.supported && !deviceOn ? (
              <TouchableOpacity nativeID="notif-device-enable" onPress={enableDevicePush} disabled={deviceBusy} style={styles.smallBtn}>
                <Text style={styles.smallBtnTxt}>{deviceBusy ? '…' : 'Slå på'}</Text>
              </TouchableOpacity>
            ) : null}
            {deviceOn ? (
              <TouchableOpacity nativeID="notif-test" onPress={sendTest} disabled={deviceBusy} style={styles.smallBtn}>
                <Text style={styles.smallBtnTxt}>{deviceBusy ? '…' : 'Send testvarsel'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, !enabled && styles.cardOff]}>
        <View style={styles.headRow}>
          <Text style={[styles.grow, styles.headTxt]}>Varsel</Text>
          <Text style={styles.colHead}>Push</Text>
          <Text style={styles.colHead}>E-post</Text>
        </View>
        {groupedNotificationTypes().map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={styles.groupTitle}>{group.label}</Text>
            {group.types.map((type) => {
              const push = channelEnabled({ ...prefs, enabled: true }, type.id, 'push');
              const email = channelEnabled({ ...prefs, enabled: true }, type.id, 'email');
              return (
                <View key={type.id} style={styles.row}>
                  <View style={styles.grow}>
                    <Text style={styles.label}>{type.label}</Text>
                    {isRecommended(type.id) ? <Text style={styles.badge}>Anbefalt</Text> : null}
                  </View>
                  <View style={styles.cell}>
                    <Check
                      id={`notif-${type.id}-push`}
                      checked={push}
                      disabled={!enabled || saving}
                      label={`${type.label}: push`}
                      onPress={() => save(withChannel(prefs, type.id, 'push', !push))}
                    />
                  </View>
                  <View style={styles.cell}>
                    {hasOwnEmail(type.id) ? (
                      <Text style={styles.always}>Sendes alltid</Text>
                    ) : (
                      <Check
                        id={`notif-${type.id}-email`}
                        checked={email}
                        disabled={!enabled || saving}
                        label={`${type.label}: e-post`}
                        onPress={() => save(withChannel(prefs, type.id, 'email', !email))}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity nativeID="notif-reset" onPress={() => save(recommendedPrefs(prefs))} disabled={saving}>
          <Text style={styles.link}>Tilbake til anbefalte valg</Text>
        </TouchableOpacity>
        {saving ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        {note ? <Text nativeID="notif-note" style={styles.muted}>{note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: radius.md || 12, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 },
  cardOff: { opacity: 0.55 },
  masterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  masterLabel: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  smallBtn: { borderWidth: 1, borderColor: colors.brand, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnTxt: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  headTxt: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  colHead: { width: 64, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '600' },
  group: { gap: 2, paddingTop: 6 },
  groupTitle: { color: colors.ink, fontWeight: '700', fontSize: 14, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  grow: { flex: 1, minWidth: 0 },
  label: { color: colors.ink, fontSize: 14 },
  badge: { alignSelf: 'flex-start', color: colors.brand, fontSize: 11, fontWeight: '600', marginTop: 2 },
  cell: { width: 64, alignItems: 'center' },
  check: { padding: 2 },
  checkDisabled: { opacity: 0.5 },
  always: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  link: { color: colors.brand, fontSize: 14 },
});
