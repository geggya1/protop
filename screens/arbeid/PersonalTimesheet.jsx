import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import {
  companyTimesheetLabel,
  personalTimesheetCompanies,
} from '../../src/arbeid/personalTimesheet';
import { companyWorkspaces } from '../../src/utils/platformSwitch';
import { watchEmployees } from '../../src/employees/storage';
import ArbeidScreen from './ArbeidScreen';

/**
 * Timeliste under Personlig: samme føring som under Arbeid, låst til innlogget bruker.
 * Selskapsvalg er bare bedrifter der du er ansatt / har rett til egne timer.
 */
export default function PersonalTimesheet() {
  const colors = useColors();
  const { families, family, user } = useApp();
  const candidates = useMemo(() => companyWorkspaces(families), [families]);
  const candidateKey = candidates.map((row) => row.id).join('|');
  const [employeesByCompanyId, setEmployeesByCompanyId] = useState({});
  const [loadedIds, setLoadedIds] = useState({});

  useEffect(() => {
    setEmployeesByCompanyId({});
    setLoadedIds({});
    if (!candidates.length) return undefined;
    const stops = candidates.map((company) => watchEmployees(
      company.id,
      (rows) => {
        setEmployeesByCompanyId((prev) => (
          prev[company.id] === rows ? prev : { ...prev, [company.id]: rows }
        ));
        setLoadedIds((prev) => (prev[company.id] ? prev : { ...prev, [company.id]: true }));
      },
      () => {
        setEmployeesByCompanyId((prev) => ({ ...prev, [company.id]: [] }));
        setLoadedIds((prev) => (prev[company.id] ? prev : { ...prev, [company.id]: true }));
      },
    ));
    return () => stops.forEach((stop) => stop());
  }, [candidateKey]);

  const loading = candidates.length > 0
    && candidates.some((row) => !loadedIds[row.id]);

  const actor = useMemo(() => ({
    uid: user?.uid || '',
    emails: user?.email ? [user.email] : [],
    name: user?.displayName || '',
  }), [user?.uid, user?.email, user?.displayName]);

  const companies = useMemo(
    () => personalTimesheetCompanies(families, family, {
      ...actor,
      employeesByCompanyId,
    }),
    [families, family, actor, employeesByCompanyId],
  );

  const [pickedId, setPickedId] = useState('');
  const company = companies.find((row) => row.id === pickedId) || companies[0] || null;

  useEffect(() => {
    if (!pickedId) return;
    if (!companies.some((row) => row.id === pickedId)) setPickedId('');
  }, [companies, pickedId]);

  if (loading && !company) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]} nativeID="personal-timeliste-loading">
        <Text style={{ color: colors.muted }}>Laster timeliste…</Text>
      </View>
    );
  }

  if (!company) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]} nativeID="personal-timeliste-empty">
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>Timeliste</Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480, lineHeight: 20 }}>
          Timelisten åpnes for deg når du er knyttet til en bedrift med rett til å føre egne timer.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} nativeID="personal-timeliste">
      {companies.length > 1 ? (
        <View style={styles.companiesBar} nativeID="personal-timeliste-companies">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.companiesScroll}
          >
            <View
              style={[
                styles.segmentTrack,
                { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' },
              ]}
              accessibilityRole="tablist"
              accessibilityLabel="Velg bedrift for timeliste"
            >
              {companies.map((row) => {
                const on = row.id === company.id;
                const label = companyTimesheetLabel(row);
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => setPickedId(row.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    style={[
                      styles.segment,
                      on && styles.segmentActive,
                      on && { backgroundColor: colors.card },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.segmentLabel,
                        { color: on ? colors.ink : colors.muted },
                        on && styles.segmentLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
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
  wrap: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  empty: { flex: 1, padding: 16 },
  companiesBar: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  companiesScroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  segmentTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
    maxWidth: '100%',
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  segmentActive: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  segmentLabelActive: {
    fontWeight: '600',
  },
});
