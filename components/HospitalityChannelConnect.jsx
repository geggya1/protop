/**
 * Kanal-tilkobling — Sign in påkrevd for automeldinger inn til Airbnb/Booking.
 * iCal = kun kalender (kan ikke levere meldinger til plattform-innboks).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { Mute } from './ui';
import { detectChannelFromIcalUrl, CHANNELS } from '../src/utils/hospitalityLogic';
import { buildChannelViews, setupProgress } from '../src/utils/hospitalitySetup';
import {
  HOSP_OAUTH_PROVIDERS,
  connectAirbnbOAuth,
  connectBookingProperty,
  connectIcalUrl,
  syncHospitalityChannel,
  syncAllHospitality,
  disconnectHospitalityChannel,
  saveHospitalityPartnerCredentials,
} from '../src/utils/hospitalityIntegrations';

const PROVIDER_BY_ID = Object.fromEntries(HOSP_OAUTH_PROVIDERS.map((p) => [p.id, p]));

function ChannelRow({
  id, label, color, icon, view, isBusy, onPrimary, onSync, onDisconnect,
  bookingPropertyId, onBookingPropertyIdChange, onOpenExtranet,
  airbnbClientId, airbnbClientSecret, onAirbnbClientIdChange, onAirbnbClientSecretChange,
}) {
  const messagingReady = !!view?.messagingReady;
  const calendarOnly = view?.mode === 'ical' && !messagingReady;
  const mode = view?.mode;
  const needsAirbnbKeys = id === 'airbnb' && !messagingReady && !view?.configured;

  const subtitle = messagingReady
    ? (view.accountName
      ? `${view.accountName} · automeldinger til innboks`
      : view.propertyId
        ? `Property ID ${view.propertyId} · automeldinger til innboks`
        : 'Sign in OK · automeldinger til innboks')
    : needsAirbnbKeys
      ? 'Partner API-nøkler mangler — lim inn Client ID + Secret under'
      : calendarOnly
        ? 'Kun kalender (iCal) — Logg inn for automeldinger'
        : PROVIDER_BY_ID[id]?.blurb;

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={[styles.icon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <Text style={styles.rowTitle}>{label}</Text>
            <View style={[
              styles.dot,
              messagingReady ? styles.dotOk : styles.dotWarn,
            ]}
            />
          </View>
          <Text style={styles.rowSub} numberOfLines={2}>{subtitle}</Text>
          {calendarOnly ? (
            <Text style={styles.rowWarn}>iCal kan ikke sende meldinger til {label}</Text>
          ) : null}
          {view?.lastError ? <Text style={styles.rowErr}>{view.lastError}</Text> : null}
        </View>
        <View style={styles.rowActions}>
          {messagingReady ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                onPress={onSync}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`Synk ${label}`}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.brand} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                onPress={onDisconnect}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`Koble fra ${label}`}
              >
                <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: color },
                pressed && styles.pressed,
                isBusy && styles.primaryBtnDisabled,
              ]}
              onPress={onPrimary}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={id === 'airbnb' ? `Logg inn med ${label}` : `Koble ${label}`}
            >
              {isBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnTxt} numberOfLines={1}>
                  {needsAirbnbKeys ? 'Lagre + logg inn' : (calendarOnly ? 'Logg inn' : (id === 'airbnb' ? 'Logg inn' : 'Koble'))}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {needsAirbnbKeys ? (
        <View style={styles.expand}>
          <Text style={styles.hint}>
            Fra Airbnb Partner-portalen: Client ID + Secret. Redirect URI:
            {' '}
            https://www.protop.no/oauth/airbnb
          </Text>
          <TextInput
            style={styles.inlineInput}
            value={airbnbClientId}
            onChangeText={onAirbnbClientIdChange}
            placeholder="Airbnb Client ID"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <TextInput
            style={styles.inlineInput}
            value={airbnbClientSecret}
            onChangeText={onAirbnbClientSecretChange}
            placeholder="Airbnb Client Secret"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            secureTextEntry
          />
        </View>
      ) : null}

      {!messagingReady && id === 'booking' && (
        <View style={styles.expand}>
          <TouchableOpacity onPress={onOpenExtranet}>
            <Text style={styles.link}>1. Extranet → velg ProTop som leverandør</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.inlineInput}
            value={bookingPropertyId}
            onChangeText={onBookingPropertyIdChange}
            placeholder="2. Lim inn Property ID her, deretter Koble"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            autoComplete="off"
          />
          {!String(bookingPropertyId || '').trim() ? (
            <Text style={styles.rowWarn}>Property ID må fylles inn før «Koble» gjør noe.</Text>
          ) : null}
        </View>
      )}

      {calendarOnly && mode === 'ical' ? (
        <Text style={styles.hint}>Kalender synkes. Trykk «Logg inn» for å aktivere automeldinger.</Text>
      ) : null}
    </View>
  );
}

export default function HospitalityChannelConnect({
  familyId,
  channels = [],
  properties = [],
  setup = null,
  onRefresh,
  compact = false,
}) {
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');
  const [bookingPropertyId, setBookingPropertyId] = useState('');
  const [airbnbClientId, setAirbnbClientId] = useState('');
  const [airbnbClientSecret, setAirbnbClientSecret] = useState('');
  const [icalPaste, setIcalPaste] = useState('');
  const [showIcal, setShowIcal] = useState(false);

  const views = useMemo(() => buildChannelViews(channels, setup), [channels, setup]);
  const progress = useMemo(
    () => setupProgress(views, (properties?.length || setup?.propertyCount || 0) > 0),
    [views, properties, setup],
  );

  const defaultPropertyId = properties[0]?.id || null;
  const messagingMissing = !views.airbnb?.messagingReady || !views.booking?.messagingReady;

  const showUserError = useCallback((title, message) => {
    const text = message || 'Noe gikk galt.';
    setActionOk('');
    setActionError(title ? `${title}: ${text}` : text);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(title ? `${title}\n\n${text}` : text);
      }
      return;
    }
    Alert.alert(title || 'Feil', text);
  }, []);

  const showUserOk = useCallback((title, message) => {
    const text = message || 'OK';
    setActionError('');
    setActionOk(title ? `${title}: ${text}` : text);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(title ? `${title}\n\n${text}` : text);
      }
      return;
    }
    Alert.alert(title || 'OK', text);
  }, []);

  const wrap = useCallback(async (key, fn) => {
    setBusy(key);
    setActionError('');
    setActionOk('');
    try {
      await fn();
      await onRefresh?.();
    } catch (e) {
      if (e?.code === 'cancelled' || e?.message === 'cancelled') return;
      if (e?.code === 'not_configured') {
        showUserError(
          'Airbnb Partner API',
          'Lim inn Client ID + Secret under Airbnb (fra Partner-portalen), trykk «Lagre + logg inn». Redirect URI: https://www.protop.no/oauth/airbnb',
        );
        return;
      }
      const raw = e?.message || 'Noe gikk galt.';
      const friendly = /INTERNAL|internal/i.test(raw)
        ? 'Serverfeil i hospitality-funksjonen. Prøv igjen om litt (deploy kan være underveis).'
        : raw;
      showUserError('Feil', friendly);
    } finally {
      setBusy('');
    }
  }, [onRefresh, showUserError]);

  const runAirbnb = useCallback(async () => {
    if (!familyId) throw new Error('Velg en familie først.');
    const needsKeys = !views.airbnb?.configured;
    const id = airbnbClientId.trim();
    const secret = airbnbClientSecret.trim();
    if (needsKeys) {
      if (!id || !secret) {
        throw new Error('Lim inn Airbnb Client ID og Client Secret under Airbnb-raden først.');
      }
      await saveHospitalityPartnerCredentials(familyId, {
        provider: 'airbnb',
        clientId: id,
        clientSecret: secret,
      });
      setAirbnbClientSecret('');
      showUserOk('Airbnb', 'Partner-nøkler lagret. Åpner innlogging…');
    }
    setActionOk('Åpner Airbnb-innlogging…');
    await connectAirbnbOAuth({
      familyId,
      propertyId: defaultPropertyId,
      setup,
      clientId: id || setup?.channels?.airbnb?.clientId || undefined,
    });
  }, [
    familyId, defaultPropertyId, setup, views.airbnb?.configured,
    airbnbClientId, airbnbClientSecret, showUserOk,
  ]);

  const runBooking = useCallback(async () => {
    if (!familyId) throw new Error('Velg en familie først.');
    const propId = bookingPropertyId.trim();
    if (!propId) {
      throw new Error('Oppgi Property ID i feltet under (trinn 2) etter at ProTop er valgt i Extranet.');
    }
    await connectBookingProperty(familyId, { propertyId: propId });
    setBookingPropertyId('');
    showUserOk('Booking.com', `Property ID ${propId} er lagret. Automeldinger kan nå gå til Booking-innboks.`);
  }, [familyId, bookingPropertyId, showUserOk]);

  const runIcal = useCallback(async () => {
    const url = icalPaste.trim();
    if (!url) throw new Error('Lim inn en kalender-URL.');
    const res = await connectIcalUrl(familyId, { icalUrl: url, propertyId: defaultPropertyId });
    setIcalPaste('');
    const note = res?.note || 'iCal synker kun kalender. Logg inn med Sign in for automeldinger til innboks.';
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`Kalender koblet\n\n${note}`);
    } else {
      Alert.alert('Kalender koblet', note);
    }
  }, [familyId, icalPaste, defaultPropertyId]);

  const runSyncAll = useCallback(() => wrap('sync-all', async () => {
    await syncAllHospitality(familyId);
  }), [familyId, wrap]);

  const openExtranet = useCallback(() => {
    const url = PROVIDER_BY_ID.booking?.extranetUrl;
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url);
    }
  }, []);

  return (
    <View style={styles.wrap}>
      {!compact ? (
        <>
          <View style={styles.callout}>
            <Ionicons name="chatbubbles-outline" size={18} color={colors.brand} />
            <Text style={styles.calloutTxt}>
              Automeldinger til Airbnb/Booking-innboks krever Sign in. iCal synker kun kalender.
            </Text>
          </View>
          <View style={styles.progressHead}>
            <Text style={styles.progressTitle}>
              {progress.connected}/{progress.total} Sign in-klare
            </Text>
            <Text style={styles.progressPct}>{progress.pct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress.pct}%` }]} />
          </View>
        </>
      ) : messagingMissing ? (
        <View style={styles.calloutCompact}>
          <Text style={styles.calloutTxt}>
            Logg inn for å sende automeldinger inn til Airbnb / Booking.com
          </Text>
        </View>
      ) : null}

      {actionError ? (
        <Text style={styles.actionErr}>{actionError}</Text>
      ) : null}
      {actionOk ? (
        <Text style={styles.actionOk}>{actionOk}</Text>
      ) : null}
      {busy ? (
        <Text style={styles.actionBusy}>Jobber ({busy})…</Text>
      ) : null}

      {HOSP_OAUTH_PROVIDERS.map((p) => (
        <ChannelRow
          key={p.id}
          id={p.id}
          label={p.label}
          color={p.color}
          icon={p.iconIon}
          view={views[p.id]}
          isBusy={busy === p.id}
          onPrimary={() => wrap(p.id, p.id === 'airbnb' ? runAirbnb : runBooking)}
          onSync={() => wrap(`sync-${p.id}`, () => syncHospitalityChannel(familyId, p.id))}
          onDisconnect={() => {
            const confirmDisconnect = () => wrap(`disc-${p.id}`, () => disconnectHospitalityChannel(familyId, p.id));
            if (Platform.OS === 'web') {
              if (typeof window !== 'undefined' && window.confirm(`Fjerne ${p.label}?`)) {
                confirmDisconnect();
              }
              return;
            }
            Alert.alert('Koble fra', `Fjerne ${p.label}?`, [
              { text: 'Avbryt', style: 'cancel' },
              {
                text: 'Koble fra',
                style: 'destructive',
                onPress: confirmDisconnect,
              },
            ]);
          }}
          bookingPropertyId={bookingPropertyId}
          onBookingPropertyIdChange={(v) => {
            setBookingPropertyId(v);
            if (actionError) setActionError('');
            if (actionOk) setActionOk('');
          }}
          airbnbClientId={airbnbClientId}
          airbnbClientSecret={airbnbClientSecret}
          onAirbnbClientIdChange={(v) => {
            setAirbnbClientId(v);
            if (actionError) setActionError('');
          }}
          onAirbnbClientSecretChange={(v) => {
            setAirbnbClientSecret(v);
            if (actionError) setActionError('');
          }}
          onOpenExtranet={openExtranet}
        />
      ))}

      {!compact ? (
        <>
          <TouchableOpacity
            style={[styles.syncAllBtn, !!busy && styles.syncAllBtnDisabled]}
            onPress={runSyncAll}
            disabled={!!busy}
          >
            {busy === 'sync-all' ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <>
                <Ionicons name="sync-outline" size={18} color={colors.brand} />
                <Text style={styles.syncAllTxt}>Synk kanaler + kjør automeldinger</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowIcal((v) => !v)}>
            <Text style={styles.icalToggle}>
              {showIcal ? 'Skjul kalender-reserve (iCal)' : 'Kun kalender? Bruk iCal-reserve'}
            </Text>
          </TouchableOpacity>

          {showIcal ? (
            <View style={styles.universalIcal}>
              <Text style={styles.universalLabel}>
                iCal = kun kalender — ikke automeldinger til innboks
              </Text>
              <TextInput
                style={styles.universalInput}
                value={icalPaste}
                onChangeText={setIcalPaste}
                placeholder="https://www.airbnb.com/calendar/ical/…"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {icalPaste.trim() ? (
                <TouchableOpacity
                  style={styles.universalBtn}
                  onPress={() => wrap('ical', runIcal)}
                  disabled={!!busy}
                >
                  {busy === 'ical' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.universalBtnTxt}>
                      Koble kalender (
                      {detectChannelFromIcalUrl(icalPaste) === CHANNELS.booking ? 'Booking.com' : 'Airbnb'}
                      )
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Mute>Sign in synker bookinger og sender automeldinger direkte til gjestens Airbnb-/Booking-innboks.</Mute>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  callout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: radius.md,
    backgroundColor: colors.brandSoft || '#dbeafe',
  },
  calloutCompact: {
    padding: 10, borderRadius: radius.md,
    backgroundColor: '#ffedd5',
  },
  calloutTxt: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.text || '#0f172a', lineHeight: 18 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontWeight: '400', fontSize: 15, color: colors.text || '#0f172a' },
  progressPct: { fontWeight: '400', color: colors.brand, fontSize: 14 },
  progressBar: {
    height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 3 },
  actionErr: {
    color: '#b91c1c',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  actionOk: {
    color: '#166534',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  actionBusy: {
    color: colors.brand,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: colors.card,
    gap: 8,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontWeight: '400', fontSize: 15, color: colors.text || '#0f172a' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: '#15803d' },
  dotWarn: { backgroundColor: '#b45309' },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowWarn: { fontSize: 11, color: '#9a3412', fontWeight: '400', marginTop: 2 },
  rowErr: { fontSize: 11, color: '#b91c1c', marginTop: 2 },
  hint: { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    alignSelf: 'flex-start', padding: 6 },
  primaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md,
    minWidth: 72, alignItems: 'center',
    cursor: 'pointer',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  pressed: { opacity: 0.85 },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
  expand: { gap: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  inlineInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.text || '#0f172a',
  },
  link: { color: colors.brand, fontWeight: '400', fontSize: 13, textDecorationLine: 'underline' },
  icalToggle: { color: colors.muted, fontWeight: '400', fontSize: 13, textDecorationLine: 'underline' },
  universalIcal: { gap: 8, marginTop: 4 },
  universalLabel: { fontSize: 12, fontWeight: '400', color: '#9a3412' },
  universalInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text || '#0f172a',
  },
  universalBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#64748b', borderRadius: radius.md,
    paddingVertical: 11, alignItems: 'center',
  },
  universalBtnTxt: { color: '#fff', fontWeight: '400' },
  syncAllBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.brandSoft || '#dbeafe',
  },
  syncAllBtnDisabled: { opacity: 0.6 },
  syncAllTxt: { color: colors.brand, fontWeight: '400', fontSize: 14 },
});
