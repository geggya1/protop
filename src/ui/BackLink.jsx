import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { radius, space, touch, type } from './tokens';
import { backLinkA11y, backLinkText } from './backLinkText';

export { backLinkText };

/**
 * Tilbakelenke fra en detaljside til listen den hører til (UX-20).
 * Heter alltid «‹ {Listenavn}» («‹ Prosjekter», «‹ Fakturaer»), med lenkerolle og 44 px trykkflate.
 * Detaljsider med adresse lukkes via useShellDetail, så nettleserens Tilbake og lenken gjør det samme.
 */
export default function BackLink({ label, onPress, nativeID, style }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      nativeID={nativeID}
      testID={nativeID}
      accessibilityRole="link"
      accessibilityLabel={backLinkA11y(label)}
      style={({ hovered, pressed }) => [
        styles.link,
        { backgroundColor: hovered || pressed ? colors.sunken : 'transparent' },
        Platform.OS === 'web' ? styles.web : null,
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.brandInk }]} numberOfLines={1}>{backLinkText(label)}</Text>
    </Pressable>
  );
}

/**
 * Detaljlenken kunne ikke åpnes: id-en finnes ikke i bedriften, er slettet, eller du har ikke tilgang.
 * Samme melding uansett, så lenken ikke røper om noe finnes. Ingen data fra lenken vises.
 */
export function DetailMissing({ list, thing, onBack, nativeID = 'detail-missing' }) {
  const colors = useColors();
  const what = String(thing || 'siden');
  return (
    <View style={styles.missing} nativeID={nativeID}>
      <BackLink label={list} onPress={onBack} nativeID={`${nativeID}-back`} />
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} accessibilityRole="alert">
        <Ionicons name="lock-closed-outline" size={24} color={colors.muted} />
        <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
          {`Fant ikke ${what}`}
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          {`Lenken peker på ${what} som ikke finnes i denne bedriften, er slettet, eller som du ikke har tilgang til. Bytt bedrift hvis lenken gjelder en annen bedrift, eller be en administrator om tilgang.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: touch.min,
    paddingHorizontal: space.xs,
    marginLeft: -space.xs,
    borderRadius: radius.control,
  },
  web: { cursor: 'pointer' },
  text: { ...type.bodyStrong },
  missing: { gap: space.sm, padding: space.md, width: '100%', maxWidth: 720 },
  card: {
    alignItems: 'center',
    gap: space.xs,
    padding: space.lg,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  title: { ...type.title, textAlign: 'center' },
  body: { ...type.body, textAlign: 'center' },
});
