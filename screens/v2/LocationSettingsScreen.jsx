import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius, space } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import BrandToggle from '../../components/BrandToggle';
import {
  effectiveLocationSharing,
  childCanControlLocationSharing,
  setUserLocationSharing,
  clearLiveLocation,
} from '../../src/utils/familyLocation';

export default function LocationSettingsScreen() {
  const nav = useNavigation();
  const {
    uid, familyId, userProfile, meChild, meParent, isChild, isActingAsChild, activeChild,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const childRecord = isActingAsChild ? activeChild : meChild;
  const asChild = isChild || isActingAsChild;
  const childControlled = childCanControlLocationSharing(childRecord);
  const enabled = useMemo(() => effectiveLocationSharing({
    userProfile,
    childRecord: asChild ? childRecord : null,
    parentRecord: asChild ? null : meParent,
  }), [userProfile, asChild, childRecord, meParent]);

  const canToggle = asChild ? childControlled : true;
  const parentEnabledForChild = childRecord?.locationSharingEnabled === true;

  const onToggle = useCallback(async (next) => {
    if (!uid || busy || !canToggle) return;
    setBusy(true);
    setError('');
    try {
      await setUserLocationSharing(uid, next);
      if (!next && familyId) {
        clearLiveLocation(familyId, uid).catch(() => {});
      }
    } catch {
      setError('Klarte ikke lagre innstillingen. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  }, [uid, busy, canToggle, familyId]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CompactBackLink onPress={() => nav.goBack()} label="Tilbake" />

        <Text style={styles.title}>Posisjonsdeling</Text>
        <Text style={styles.sub}>
          {asChild
            ? 'Når foresatte har slått dette på, kan familien se omtrent hvor du er i Familieposisjon.'
            : 'Når dette er på, kan familiemedlemmer se omtrent hvor du er i Familieposisjon-modulen.'}
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.iconCircle}>
              <Ionicons name="navigate" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {asChild ? 'Min posisjon' : 'Del min posisjon'}
              </Text>
              <Text style={styles.rowHint}>
                Oppdateres ca. hvert 5. minutt mens appen er åpen — sparsomt for å begrense databruk.
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <BrandToggle
                value={enabled}
                onValueChange={onToggle}
                disabled={!canToggle}
              />
            )}
          </View>
        </View>

        {asChild && !canToggle ? (
          <View style={styles.noteBox}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.brand} />
            <Text style={styles.noteTxt}>
              {parentEnabledForChild
                ? 'Foresatte har slått på posisjonsdeling for deg. Du kan ikke endre dette selv.'
                : 'Kun foresatte kan slå på posisjonsdeling for deg. Be en foresatt under barnets innstillinger.'}
            </Text>
          </View>
        ) : null}

        {asChild && canToggle ? (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.noteTxt}>
              Foresatte har gitt deg lov til å styre delingen selv. Du kan slå den av når du vil.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#059669" />
          <Text style={styles.infoTxt}>
            Posisjonen deles kun med medlemmer i familien din. Den lagres midlertidig og vises
            ikke etter 30 minutter uten oppdatering.
            {Platform.OS === 'web' ? ' På web må du tillate posisjon i nettleseren.' : ''}
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: 40 },
  title: {
    fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 6, letterSpacing: -0.3,
  },
  sub: {
    color: colors.muted, fontWeight: '500', fontSize: 14, lineHeight: 20, marginBottom: 18,
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontWeight: '700', fontSize: 16, color: colors.ink },
  rowHint: {
    color: colors.muted, fontSize: 13, marginTop: 4, fontWeight: '500', lineHeight: 18,
  },
  error: { color: colors.danger, marginTop: 12, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row', gap: 10, marginTop: 16, padding: 14,
    backgroundColor: '#ecfdf5', borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#a7f3d0',
  },
  infoTxt: { flex: 1, color: '#065f46', fontWeight: '500', fontSize: 13, lineHeight: 19 },
  noteBox: {
    flexDirection: 'row', gap: 10, marginTop: 12, padding: 14,
    backgroundColor: colors.brandSoft, borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#bfdbfe',
  },
  noteTxt: { flex: 1, color: colors.ink, fontWeight: '500', fontSize: 13, lineHeight: 19 },
});
