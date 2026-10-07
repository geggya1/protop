import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import AccountHistoryCard from '../../components/project/AccountHistoryCard';
import { mergeAccountYears } from '../../src/project/accountSeries';
import {
  accountHistoryEndpoint,
  fetchPublicCompany,
  nbDate,
  storedCompanyProfile,
} from '../../src/project/companyPublic';
import { companyLogoOf } from '../../src/project/companyLogo';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export default function EconomyWelcome({ stored }) {
  const colors = useColors();
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const profile = live?.company || storedCompanyProfile(stored);
  const logo = companyLogoOf(stored);
  const orgnr = stored?.organisasjonsnummer || '';
  const name = profile?.navn || stored?.navn || 'Bedrift';

  useEffect(() => {
    if (String(orgnr).replace(/\D/g, '').length !== 9) return undefined;
    let alive = true;
    fetchPublicCompany(orgnr)
      .then((data) => {
        if (alive && data.ok) setLive(data);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [orgnr]);

  useEffect(() => {
    const id = String(orgnr || '').replace(/\D/g, '');
    if (id.length !== 9) return undefined;
    let alive = true;
    setHistoryLoading(true);
    fetch(accountHistoryEndpoint(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'account-history', orgnr: id }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive) return;
        setHistory(Array.isArray(data?.years) ? data.years : []);
      })
      .catch(() => {
        if (alive) setHistory([]);
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => { alive = false; };
  }, [orgnr]);

  const accountView = useMemo(
    () => mergeAccountYears(live?.accounts, history || []),
    [live?.accounts, history],
  );

  return (
    <View nativeID="economy-welcome" id="economy-welcome" style={styles.page}>
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi</Text>
          <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.hello, { color: colors.ink }]}>
            {name}
          </Text>
          <Text style={[styles.lead, { color: colors.muted }]}>
            Velkommen. Her ligger bedriftens nøkkeltall.
          </Text>
        </View>
        {logo?.dataUrl ? (
          <View style={[styles.logoPlate, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Image
              source={{ uri: logo.dataUrl }}
              style={styles.companyLogo}
              resizeMode="contain"
              accessibilityLabel={`Logo for ${name}`}
            />
          </View>
        ) : (
          <View style={[styles.logoPlate, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Ionicons name="business-outline" size={36} color={colors.brand} accessibilityLabel="Bedrift" />
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Om bedriften</Text>
        <Text style={[styles.body, { color: colors.ink }]}>
          {[profile?.organisasjonsnummer, profile?.organisasjonsform].filter(Boolean).join(' · ') || 'Bedriften er ikke koblet mot Enhetsregisteret ennå.'}
        </Text>
        {profile?.formaal?.length ? (
          <Text style={[styles.body, { color: colors.ink }]}>{profile.formaal.join(' ')}</Text>
        ) : null}
        <View style={styles.factGrid}>
          <Fact label="Stiftet" value={nbDate(profile?.stiftelsesdato)} colors={colors} />
          <Fact label="Ansatte" value={profile?.ansatte != null ? String(profile.ansatte) : ''} colors={colors} />
          <Fact label="Siste årsregnskap" value={profile?.sisteRegnskap} colors={colors} />
          <Fact label="Telefon" value={profile?.telefon || stored?.telefon} colors={colors} />
          <Fact label="E-post" value={profile?.epostadresse || stored?.epostadresse} colors={colors} />
          <Fact label="Hjemmeside" value={profile?.hjemmeside} colors={colors} />
        </View>
      </View>

      {accountView ? (
        <View nativeID="economy-accounts" id="economy-accounts" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <AccountHistoryCard
            accounts={accountView}
            founded={profile?.stiftelsesdato}
            loading={historyLoading}
            colors={colors}
          />
        </View>
      ) : null}
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  page: { gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  kicker: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  hello: { fontSize: 28, fontWeight: '600', letterSpacing: -0.4, marginTop: 2 },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 8 },
  logoPlate: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    alignSelf: 'flex-start', marginLeft: 'auto', minWidth: 88, minHeight: 64,
    alignItems: 'center', justifyContent: 'center',
  },
  companyLogo: { width: 148, height: 56 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, ...webShadow },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
  factLabel: { fontSize: 12 },
  factValue: { fontSize: 14, lineHeight: 19 },
});
