import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { storedCompanyProfile } from '../../src/project/companyPublic';
import { companyLogoOf } from '../../src/project/companyLogo';

const LINKS = [
  { id: 'selskap', icon: 'briefcase-outline', title: 'Selskap', text: 'Regnskap, omsetning og alle offentlige opplysninger om bedriften.' },
  { id: 'kunder', icon: 'people-outline', title: 'Kunder', text: 'Bla i kundene og se økonomien knyttet til hver kunde.' },
  { id: 'avtaler', icon: 'ribbon-outline', title: 'Avtaler', text: 'Velg en avtale for økonomi og indeksregulering som hører til den.' },
];

export default function EconomyWelcome({ stored, onOpen }) {
  const colors = useColors();
  const profile = storedCompanyProfile(stored);
  const logo = companyLogoOf(stored);
  const name = profile?.navn || stored?.navn || 'Bedrift';

  return (
    <View nativeID="economy-welcome" id="economy-welcome" style={styles.page}>
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi</Text>
          <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.hello, { color: colors.ink }]}>
            {name}
          </Text>
          <Text style={[styles.lead, { color: colors.muted }]}>
            Velkommen. Velg selskap, kunde eller avtale. Indeksregulering ligger under den avtalen den gjelder.
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

      <View style={styles.links}>
        {LINKS.map((link) => (
          <TouchableOpacity
            key={link.id}
            nativeID={`economy-open-${link.id}`}
            onPress={() => onOpen?.(link.id)}
            accessibilityRole="button"
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name={link.icon} size={22} color={colors.brand} />
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{link.title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{link.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  page: { gap: 18 },
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
  links: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6, ...webShadow },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
});
