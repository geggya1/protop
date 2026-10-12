import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function NextStep({ colors, onOpenReview }) {
  return (
    <View style={{ gap: 6, marginTop: 8 }}>
      <Text style={{ color: colors.ink }}>
        Merket aktuell. Neste steg er å vurdere om dere skal gi tilbud, og hvem som skal arbeide med det.
      </Text>
      <TouchableOpacity
        onPress={onOpenReview}
        accessibilityRole="button"
        accessibilityLabel="Gå til vurdering av aktuelle"
      >
        <Text style={{ color: colors.brand, fontWeight: '600' }}>Gå til 2. Vurdering av aktuelle</Text>
      </TouchableOpacity>
    </View>
  );
}
