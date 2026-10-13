import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

/** Åpne avrop på Doffin. Samme valg under 4. Avtale og under Kontrakt / avtale. */
export const AVROP_PATH = [
  'avrop',
  'Avrop',
  'Avrop som er publisert åpent på Doffin. Interesse og tilbud melder bedriften selv i portalen, med sitt eget brukernavn.',
];

/** Veier under avtale: behandle utkast, registrere inngått avtale, eller avrop. */
export default function AgreementPathSwitch({ colors, value, onChange, options }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map(([id, title, body]) => {
        const on = value === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flexGrow: 1,
              flexBasis: 240,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 4,
              borderColor: on ? colors.brand : colors.line,
              backgroundColor: on ? colors.brandSoft : colors.card,
            }}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 15 }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{body}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
