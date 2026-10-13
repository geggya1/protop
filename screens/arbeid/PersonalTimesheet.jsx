import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import {
  companyTimesheetLabel,
  personalTimesheetCompanies,
} from '../../src/arbeid/personalTimesheet';
import ArbeidScreen from './ArbeidScreen';

/**
 * Timeliste under Personlig: samme føring som under Arbeid, låst til innlogget bruker.
 */
export default function PersonalTimesheet() {
  const colors = useColors();
  const { families, family } = useApp();
  const companies = useMemo(
    () => personalTimesheetCompanies(families, family),
    [families, family],
  );
  const [pickedId, setPickedId] = useState('');
  const company = companies.find((row) => row.id === pickedId) || companies[0] || null;

  if (!company) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]} nativeID="personal-timeliste-empty">
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>Timeliste</Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480, lineHeight: 20 }}>
          Timelisten åpnes for deg når du er knyttet til en bedrift.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} nativeID="personal-timeliste">
      {companies.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.companies}
          nativeID="personal-timeliste-companies"
        >
          {companies.map((row) => {
            const on = row.id === company.id;
            return (
              <Pressable
                key={row.id}
                onPress={() => setPickedId(row.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={companyTimesheetLabel(row)}
                style={[
                  styles.company,
                  {
                    borderColor: on ? colors.brand : colors.line,
                    backgroundColor: on ? `${colors.brand}18` : colors.card,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '700' : '500', fontSize: 13 }}>
                  {companyTimesheetLabel(row)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <ArbeidScreen
        key={company.id}
        personal
        companyId={company.id}
        companyFamily={company}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  empty: { flex: 1, padding: 16 },
  companies: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  company: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
