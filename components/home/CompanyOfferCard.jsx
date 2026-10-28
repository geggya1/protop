import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import {
  companyOfferHiddenKey,
  dismissCompanyOffer,
  shouldOfferCompany,
} from '../../src/project/companyOffer';
import CompanyJoinModal from '../CompanyJoinModal';

/**
 * Tilbudet om bedrift som kort øverst på Hjem, med en gang etter innlogging.
 * Erstatter modalen som kom etter to minutter. «Ikke nå» skjuler kortet på denne enheten;
 * «Opprett bedrift» ligger fortsatt i profilmenyen.
 */
export default function CompanyOfferCard({ style }) {
  const nav = useNavigation();
  const colors = useColors();
  const { uid, families, familiesReady, isChild } = useApp();
  const [hidden, setHidden] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    let live = true;
    if (!uid) {
      setHidden(null);
      return undefined;
    }
    AsyncStorage.getItem(companyOfferHiddenKey(uid))
      .then((value) => { if (live) setHidden(value === '1'); })
      .catch(() => { if (live) setHidden(false); });
    return () => { live = false; };
  }, [uid]);

  const offer = familiesReady && hidden === false && shouldOfferCompany({ uid, families, isChild });

  const hide = () => {
    dismissCompanyOffer(uid);
    setHidden(true);
    AsyncStorage.setItem(companyOfferHiddenKey(uid), '1').catch(() => {});
  };

  return (
    <>
      <CompanyJoinModal visible={joinOpen} onClose={() => setJoinOpen(false)} />
      {offer ? (
        <View
          nativeID="company-offer-card"
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}
        >
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="business-outline" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">Jobber du i en bedrift?</Text>
              <Text style={[styles.lead, { color: colors.muted }]}>
                Timer, prosjekter, kunder og faktura ligger i bedriften. Be om innpass i bedriften din,
                eller opprett en ny. Det er gratis.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => nav.navigate('CreateCompany')}
              accessibilityRole="button"
              nativeID="company-offer-create"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.btnPrimaryTxt}>Opprett bedrift</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setJoinOpen(true)}
              accessibilityRole="button"
              nativeID="company-offer-join"
              style={[styles.btn, styles.btnGhost, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Ionicons name="key-outline" size={15} color={colors.ink} />
              <Text style={[styles.btnGhostTxt, { color: colors.ink }]}>Be om innpass</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={hide} accessibilityRole="button" style={styles.skip}>
              <Text style={[styles.skipTxt, { color: colors.muted }]}>Ikke nå</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  lead: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  btnGhost: { borderWidth: 1 },
  btnPrimaryTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnGhostTxt: { fontSize: 15, fontWeight: '500' },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  skipTxt: { fontSize: 14 },
});
