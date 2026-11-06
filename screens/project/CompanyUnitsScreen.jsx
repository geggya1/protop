import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isSuperAdmin } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useBreakpoints } from '../../src/theme';
import { ShellPageHeroContext } from '../../components/ShellHeader';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useShellPageHero } from '../../src/hooks/useShellPageHero';
import CompanyGroupChart, { GroupYearButton } from '../../components/project/CompanyGroupChart';
import { normalizeGroupChartSettings } from '../../src/project/groupChart';
import { digitsOrgnr } from '../../src/project/companyRegistry';
import { findOwnedOrganization, underenheterOf } from '../../src/project/companyUnits';
import { aliasFamilyIds } from '../../src/utils/platformSwitch';

function GearButton({ colors, onPress }) {
  return (
    <Pressable
      nativeID="company-units-gear"
      accessibilityRole="button"
      accessibilityLabel="Innstillinger for tilknyttede selskaper"
      onPress={onPress}
      style={[styles.gear, { borderColor: colors.line, backgroundColor: colors.card }]}
    >
      <Ionicons name="settings-outline" size={18} color={colors.ink} />
    </Pressable>
  );
}

function HeadingActions({ yearControl, colors, onPress }) {
  return (
    <View style={styles.headingActions}>
      {yearControl}
      {onPress ? <GearButton colors={colors} onPress={onPress} /> : null}
    </View>
  );
}

function PageHeading({ name, colors, onPress, yearControl, wide }) {
  const actions = (
    <HeadingActions yearControl={yearControl} colors={colors} onPress={onPress} />
  );
  return (
    <View nativeID="company-units-heading" style={styles.heading}>
      <View style={styles.headingRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.muted }]} numberOfLines={1}>
            {name ? `Bedrift · ${name}` : 'Bedrift'}
          </Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Underenheter</Text>
        </View>
        {wide ? actions : null}
      </View>
      {wide ? null : actions}
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {`Se konsernstruktur, eierandeler og nøkkeltall for ${name || 'selskapet'} og tilknyttede selskaper.`}
      </Text>
    </View>
  );
}

export default function CompanyUnitsScreen() {
  const colors = useColors();
  const { isDesktop } = useBreakpoints();
  const heroCtx = useContext(ShellPageHeroContext);
  const hosted = useModuleHeroHosted();
  const inChrome = !isDesktop && !!heroCtx?.claim && !hosted;
  const {
    family, familyId, families, requestShellTab, uid, selectFamily,
  } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const access = useCompanyAccess();
  // Tannhjulet (Bedriftsinnstillinger → Tilknyttede selskaper) er bare for Admin på underenheter.
  const canEdit = (isSuperAdmin(family, uid) && !access.previewLocks('units')) || (access.ready && access.canAdmin('units'));
  const settings = useMemo(() => normalizeGroupChartSettings(company?.groupChart), [company?.groupChart]);
  const [year, setYear] = useState(null);
  const [yearOpen, setYearOpen] = useState(false);
  const [years, setYears] = useState([]);
  useEffect(() => {
    setYear(null);
    setYearOpen(false);
  }, [familyId]);

  const onYears = useCallback((next) => {
    setYears(Array.isArray(next) ? next : []);
  }, []);

  const openSettings = useCallback(() => requestShellTab?.('selskap', 'tilknyttede'), [requestShellTab]);

  const yearControl = (
    <GroupYearButton
      years={years}
      year={year}
      open={yearOpen}
      colors={colors}
      onToggle={() => setYearOpen((open) => !open)}
      onSelect={(value) => {
        setYear(value);
        setYearOpen(false);
      }}
    />
  );

  const heading = useMemo(() => (
    <PageHeading
      name={company?.navn || ''}
      colors={colors}
      onPress={canEdit ? openSettings : null}
      wide={isDesktop}
      yearControl={yearControl}
    />
  ), [company?.navn, colors, openSettings, canEdit, years, year, yearOpen, isDesktop]);
  useShellPageHero(inChrome ? heading : null, { active: inChrome });

  const hidden = useMemo(
    () => new Set(aliasFamilyIds({ id: familyId, name: company?.navn, company }, families || [])),
    [familyId, company, families],
  );
  const companyIdFor = useCallback((orgnr) => {
    const unit = underenheterOf(company?.subUnits).find((row) => row.organisasjonsnummer === digitsOrgnr(orgnr));
    if (unit?.companyId && unit.companyId !== familyId && !hidden.has(unit.companyId)) return unit.companyId;
    const owned = findOwnedOrganization(families, orgnr);
    if (owned?.id && owned.id !== familyId && !hidden.has(owned.id)) return owned.id;
    return '';
  }, [company?.subUnits, familyId, hidden, families]);

  if (!company) {
    return (
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Underenheter hører til et selskap. Åpne selskapet først.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      nativeID="company-units-page"
      id="company-units-page"
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {hosted ? (
        <View nativeID="company-units-heading" style={styles.headingRow}>
          <View style={{ flex: 1 }} />
          <HeadingActions
            yearControl={yearControl}
            colors={colors}
            onPress={canEdit ? openSettings : null}
          />
        </View>
      ) : (inChrome ? null : heading)}
      <CompanyGroupChart
        company={company}
        settings={settings}
        colors={colors}
        year={year}
        onYearChange={setYear}
        onYears={onYears}
        companyIdFor={companyIdFor}
        onOpenCompany={(id) => {
          selectFamily?.(id);
          requestShellTab?.('selskap');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Treet holder seg smalt; selskapsdetaljene fyller resten av bredden (CompanyGroupChart).
  inner: { padding: 16, paddingBottom: 48, gap: 14, width: '100%', alignSelf: 'flex-start' },
  heading: { gap: 6, marginBottom: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingActions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8, zIndex: 5 },
  kicker: { fontSize: 13, fontWeight: '500' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
