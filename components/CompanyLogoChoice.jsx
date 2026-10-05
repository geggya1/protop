import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CompanyLogoChoice({
  value,
  onChange,
  logo,
  colors,
  subject = 'dette',
  disabled = false,
}) {
  const on = !!value;
  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.ask, { color: colors.ink }]}>Vil du bruke bedriftens logo i {subject}?</Text>
      <Text style={[styles.help, { color: colors.muted }]}>
        Logoen hentes fra bedriftsinnstillingene. ProTop-logoen i appen beholdes.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => onChange(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
        >
          <Text style={{ color: on ? colors.brand : colors.ink }}>Ja</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChange(false)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: !on }}
          style={[styles.choice, { borderColor: !on ? colors.brand : colors.line, backgroundColor: !on ? colors.brandSoft : colors.card }]}
        >
          <Text style={{ color: !on ? colors.brand : colors.ink }}>Nei</Text>
        </TouchableOpacity>
      </View>
      {on && logo?.dataUrl ? (
        <Image
          source={{ uri: logo.dataUrl }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Bedriftens logo"
        />
      ) : null}
      {on && !logo?.dataUrl ? (
        <Text style={[styles.help, { color: colors.muted }]}>
          Bedriften har ikke lastet opp logo ennå. Det gjøres under innstillinger på bedriftssiden.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  ask: { fontSize: 15, fontWeight: '600' },
  help: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  logo: { width: 160, height: 52, alignSelf: 'flex-start' },
});
