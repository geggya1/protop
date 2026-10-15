import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isSuperAdmin, updateGroup } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useLayout } from '../../src/theme';
import { ShellPageHeroContext } from '../../components/ShellHeader';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useShellPageHero } from '../../src/hooks/useShellPageHero';
import CompanyStructureSettings from '../../components/project/CompanyStructureSettings';
import CompanyGroupChart, { GroupYearButton } from '../../components/project/CompanyGroupChart';
import {
  OWNERSHIP_LEVELS,
  normalizeGroupChartSettings,
} from '../../src/project/groupChart';
import { digitsOrgnr } from '../../src/project/companyRegistry';
import { findOwnedOrganization, underenheterOf } from '../../src/project/companyUnits';
import { aliasFamilyIds } from '../../src/utils/platformSwitch';

function GearButton({ open, colors, onPress }) {
  return (
    <Pressable
      nativeID="company-units-gear"
      accessibilityRole="button"
      accessibilityLabel="Innstillinger for underenheter"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.gear, {
        borderColor: open ? colors.brand : colors.line,
        backgroundColor: open ? colors.brandSoft : colors.card,
      }]}
    >
      <Ionicons name="settings-outline" size={18} color={open ? colors.brand : colors.ink} />
    </Pressable>
  );
}

function HeadingActions({ yearControl, open, colors, onPress }) {
  return (
    <View style={styles.headingActions}>
      {yearControl}
      <GearButton open={open} colors={colors} onPress={onPress} />
    </View>
  );
}

function PageHeading({ name, colors, open, onPress, yearControl, wide }) {
  const actions = (
    <HeadingActions yearControl={yearControl} open={open} colors={colors} onPress={onPress} />
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
  const { isDesktop } = useLayout();
  const heroCtx = useContext(ShellPageHeroContext);
  const hosted = useModuleHeroHosted();
  const inChrome = !isDesktop && !!heroCtx?.claim && !hosted;
  const {
    family, familyId, families, applyFamilyPatch, requestShellTab, uid, userProfile, selectFamily,
  } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const access = useCompanyAccess();
  const canEdit = (isSuperAdmin(family, uid) && !access.previewLocks('units')) || (access.ready && access.can('units', 'write'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => normalizeGroupChartSettings(company?.groupChart));
  const [year, setYear] = useState(null);
  const [yearOpen, setYearOpen] = useState(false);
  const [years, setYears] = useState([]);
  const scrollRef = useRef(null);
  const settingsKey = `${company?.groupChart?.minOwnership ?? ''}:${company?.groupChart?.showUnits ?? ''}`;

  useEffect(() => {
    setSettings(normalizeGroupChartSettings(company?.groupChart));
  }, [settingsKey, familyId]);

  useEffect(() => {
    setSettingsOpen(false);
    setYear(null);
    setYearOpen(false);
  }, [familyId]);

  const onYears = useCallback((next) => {
    setYears(Array.isArray(next) ? next : []);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (!open) scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      return !open;
    });
  }, []);

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
      open={settingsOpen}
      onPress={toggleSettings}
      wide={isDesktop}
      yearControl={yearControl}
    />
  ), [company?.navn, colors, settingsOpen, toggleSettings, years, year, yearOpen, isDesktop]);
  useShellPageHero(inChrome ? heading : null, { active: inChrome });

  async function saveCompany(next) {
    if (!familyId) return;
    const patch = { company: next };
    await updateGroup(familyId, patch);
    applyFamilyPatch?.(familyId, patch);
  }

  async function saveView(next) {
    const prefs = normalizeGroupChartSettings(next);
    setSettings(prefs);
    if (!canEdit || !company) return;
    setBusy(true);
    setError('');
    try {
      await saveCompany({ ...company, groupChart: prefs });
    } catch (err) {
      setSettings(normalizeGroupChartSettings(company.groupChart));
      setError(err?.message || 'Kunne ikke lagre visningen.');
    } finally {
      setBusy(false);
    }
  }

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
      ref={scrollRef}
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
            open={settingsOpen}
            colors={colors}
            onPress={toggleSettings}
          />
        </View>
      ) : (inChrome ? null : heading)}
      {!!error && <Text style={{ color: colors.danger, fontWeight: '400' }}>{error}</Text>}
      {settingsOpen ? (
        <View nativeID="company-units-settings" style={styles.settings}>
          <Text style={[styles.section, { color: colors.ink }]}>Visning</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Terskelen gjelder eierandeler i Aksjonærregisteret.
          </Text>
          <View style={styles.choices}>
            {OWNERSHIP_LEVELS.map((level) => {
              const active = settings.minOwnership === level.id;
              return (
                <Pressable
                  key={level.id}
                  nativeID={`group-ownership-${level.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={busy}
                  onPress={() => saveView({ ...settings, minOwnership: level.id })}
                  style={[styles.choice, {
                    borderColor: active ? colors.brand : colors.line,
                    backgroundColor: active ? colors.brandSoft : colors.card,
                  }]}
                >
                  <Text style={{ color: active ? colors.brand : colors.ink, fontWeight: '600', fontSize: 13 }}>{level.label}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{level.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          {!canEdit ? (
            <Text style={[styles.hint, { color: colors.muted }]}>Visningen gjelder denne økten.</Text>
          ) : null}

          <Text style={[styles.section, { color: colors.ink }]}>Knytt selskaper i ProTop</Text>
          <CompanyStructureSettings
            company={{ ...company, groupChart: settings }}
            familyId={familyId}
            families={families || []}
            canEdit={canEdit}
            colors={colors}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            userProfile={userProfile}
            onSaved={saveCompany}
            onOpenCompany={(id) => {
              selectFamily?.(id);
              requestShellTab?.('selskap');
            }}
          />
        </View>
      ) : null}
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
  inner: { padding: 16, paddingBottom: 48, gap: 14, maxWidth: 920, width: '100%', alignSelf: 'flex-start' },
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
  settings: { gap: 10 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexGrow: 1,
    flexBasis: 140,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
});
