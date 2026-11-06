import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import InvoicedStatement from '../../components/economy/InvoicedStatement';
import { EconomyTile } from '../../components/economy/EconomyGrid';
import { useAccountHistory } from '../../components/project/useAccountHistory';
import { mergeAccountYears } from '../../src/project/accountSeries';
import { fetchPublicCompany, storedCompanyProfile } from '../../src/project/companyPublic';
import { companyLogoOf } from '../../src/project/companyLogo';
import { radius } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const AccountHistoryCard = lazyScreen(() => import('../../components/project/AccountHistoryCard'), { name: 'AccountHistoryCard', silent: true });

export default function EconomyWelcome({ stored, familyId }) {
  const colors = useColors();
  const [live, setLive] = useState(null);
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

  const { years: history, loading: historyLoading } = useAccountHistory(orgnr);

  const accountView = useMemo(
    () => mergeAccountYears(live?.accounts, history || []),
    [live?.accounts, history],
  );

  return (
    <View nativeID="economy-welcome" id="economy-welcome" style={styles.page}>
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.hello, { color: colors.ink }]}>
            {name}
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

      <InvoicedStatement familyId={familyId}>
        {accountView ? (
          <EconomyTile label="Regnskap og nøkkeltall">
            <View nativeID="economy-accounts" id="economy-accounts" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <AccountHistoryCard
                accounts={accountView}
                founded={profile?.stiftelsesdato}
                loading={historyLoading}
                colors={colors}
              />
            </View>
          </EconomyTile>
        ) : null}
      </InvoicedStatement>
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  page: { gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  hello: { fontSize: 28, fontWeight: '600', letterSpacing: -0.4, marginTop: 2 },
  logoPlate: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    alignSelf: 'flex-start', marginLeft: 'auto', minWidth: 88, minHeight: 64,
    alignItems: 'center', justifyContent: 'center',
  },
  companyLogo: { width: 148, height: 56 },
  card: { flexGrow: 1, borderWidth: 1, borderRadius: radius.sheet, padding: 14, gap: 8, ...webShadow },
});
