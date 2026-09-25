import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import { COMPANY_OFFER_DELAY_MS, dismissCompanyOffer, shouldOfferCompany } from '../src/project/companyOffer';

/** Forslag rett etter innlogging: be om innpass eller opprett bedrift. Gratis. */
export default function CompanyOfferModal() {
  const nav = useNavigation();
  const { uid, families, familiesReady, isChild } = useApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!familiesReady) return undefined;
    if (!shouldOfferCompany({ uid, families, isChild })) {
      setOpen(false);
      return undefined;
    }
    const timer = setTimeout(() => setOpen(true), COMPANY_OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [uid, families, familiesReady, isChild]);

  const close = () => {
    dismissCompanyOffer(uid);
    setOpen(false);
  };

  const go = (screen, params) => {
    close();
    nav.navigate(screen, params);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.kicker}>Gratis</Text>
          <Text style={styles.title}>Jobbe i en bedrift?</Text>
          <Text style={styles.lead}>
            Be om innpass i en eksisterende bedrift, eller opprett en ny. Dette er gratis. Du kan også fortsette i arbeidsområdet ditt.
          </Text>
          <TouchableOpacity style={styles.row} onPress={() => go('GroupJoin', { platformType: 'organization' })}>
            <View style={[styles.icon, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="key-outline" size={22} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Be om innpass</Text>
              <Text style={styles.rowSub}>Kode fra en administrator i bedriften</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => go('CreateCompany')}>
            <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="business-outline" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Opprett ny bedrift</Text>
              <Text style={styles.rowSub}>Søk opp virksomheten i Brønnøysund</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skip} onPress={close} accessibilityRole="button">
            <Text style={styles.skipTxt}>Fortsett uten bedrift</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 39, 68, 0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.brand, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', color: colors.ink, marginTop: 4 },
  lead: { marginTop: 8, marginBottom: 8, color: colors.muted, fontWeight: '600', fontSize: 15, lineHeight: 21 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  rowSub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.muted },
  skip: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  skipTxt: { color: colors.muted, fontWeight: '800', fontSize: 15 },
});
