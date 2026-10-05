import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function OwnerPicker({
  colors,
  people = [],
  value = '',
  onChange,
  label = 'Ansvarlig for oppfølging',
}) {
  if (!people.length) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.muted }}>Ingen personer er registrert i bedriften ennå.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Én person i bedriften har ansvaret for kunden.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => onChange(null)} accessibilityRole="button">
          <Text style={{ color: value ? colors.muted : colors.brand }}>Ikke tildelt</Text>
        </TouchableOpacity>
        {people.map((person) => {
          const id = person.uid || person.id;
          const selected = value === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => onChange(person)}
              accessibilityRole="button"
              style={[styles.chip, selected && { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.bg }]}
            >
              <Text style={{ color: selected ? colors.brand : colors.ink }}>{person.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
