import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius, space, type } from '../../src/ui/tokens';

/**
 * Advarsel i timelisten til den som fører timene, når lagrede timer går over
 * arbeidstidsgrensene (aml. kap. 10). Timene er lagret; dette sperrer ingenting.
 * alerts: fra notifyWorkingTimeBreaches ({ id, text }).
 */
export default function WorkingTimeSaveWarning({ colors, alerts = [], onClose }) {
  if (!alerts.length) return null;
  return (
    <View
      nativeID="timesheet-working-time-warning"
      accessibilityRole="alert"
      style={[styles.box, { borderColor: colors.danger }]}
    >
      <Text style={[type.bodyStrong, { color: colors.danger }]}>
        Timene er lagret, men går over arbeidstidsgrensene
      </Text>
      {alerts.map((row) => (
        <Text key={row.id} style={[type.body, { color: colors.ink }]}>{row.text}</Text>
      ))}
      <Text style={[type.caption, { color: colors.muted }]}>Øverste leder og administrator har fått varsel.</Text>
      {onClose ? (
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Text style={[type.body, { color: colors.brand }]}>Lukk</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, marginBottom: space.xs, gap: space.xxs },
});
