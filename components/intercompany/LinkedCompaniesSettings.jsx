import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { isSuperAdmin, updateGroupCompany } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import CompanyStructureSettings from '../project/CompanyStructureSettings';
import IntercompanyPanel from './IntercompanyPanel';
import { OWNERSHIP_LEVELS, normalizeGroupChartSettings } from '../../src/project/groupChart';
import { underenheterOf } from '../../src/project/companyUnits';
import { aliasFamilyIds } from '../../src/utils/platformSwitch';
import { isSameCompany } from '../../src/intercompany/model';

/**
 * Bedriftsinnstillinger → Tilknyttede selskaper. Avtaler med andre selskaper, koblinger i
 * ProTop og visningen av konsernkartet. Underenheter-siden viser bare kartet.
 */
export default function LinkedCompaniesSettings({ colors }) {
  const {
    family, familyId, families, applyFamilyPatch, requestShellTab, uid, userProfile, selectFamily,
  } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const access = useCompanyAccess();
  const canEdit = (isSuperAdmin(family, uid) && !access.previewLocks('units')) || (access.ready && access.canAdmin('units'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(() => normalizeGroupChartSettings(company?.groupChart));
  const settingsKey = `${company?.groupChart?.minOwnership ?? ''}:${company?.groupChart?.showUnits ?? ''}`;

  useEffect(() => {
    setSettings(normalizeGroupChartSettings(company?.groupChart));
  }, [settingsKey, familyId]);

  // Selskaper koblet med den gamle koblingen (uten godkjenning). Panelet tilbyr å bekrefte dem.
  // Selskapet selv (samme org.nr., eller underenhet og hovedenhet med samme navn) er aldri med.
  const legacyLinks = useMemo(() => {
    const hidden = new Set(aliasFamilyIds({ id: familyId, name: company?.navn, company }, families || []));
    const own = { ...(family || {}), id: familyId };
    const ownName = String(company?.navn || family?.name || '').trim().toLocaleLowerCase('nb');
    const known = (id) => (families || []).find((row) => row?.id === id) || null;
    const rows = [];
    if (family?.parentCompanyId && !family?.parentLinkId && !hidden.has(family.parentCompanyId)) {
      const name = family.parentCompanyName || 'Morselskap';
      const other = known(family.parentCompanyId);
      const self = other
        ? isSameCompany(own, other)
        : !!ownName && String(name).trim().toLocaleLowerCase('nb') === ownName;
      if (!self) rows.push({ ...(other || {}), companyId: family.parentCompanyId, name, role: 'parent' });
    }
    for (const unit of underenheterOf(company?.subUnits)) {
      if (!unit.companyId || hidden.has(unit.companyId)) continue;
      const other = known(unit.companyId) || { orgnr: unit.organisasjonsnummer, name: unit.name };
      if (isSameCompany(own, other)) continue;
      rows.push({ ...other, companyId: unit.companyId, name: unit.name, role: 'child' });
    }
    return rows;
  }, [family, familyId, company, families]);

  if (!company) {
    return (
      <Text style={[styles.hint, { color: colors.muted }]}>
        Tilknyttede selskaper hører til et selskap. Åpne selskapet først.
      </Text>
    );
  }

  async function saveCompany(next) {
    if (!familyId) return;
    // Felt for felt, så en eldre kopi ikke stiller tilgangsmatrisen tilbake.
    await updateGroupCompany(familyId, company, next);
    applyFamilyPatch?.(familyId, { company: next });
  }

  async function saveView(next) {
    const prefs = normalizeGroupChartSettings(next);
    setSettings(prefs);
    if (!canEdit) return;
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

  const openCompany = (id) => {
    selectFamily?.(id);
    requestShellTab?.('selskap');
  };

  return (
    <View nativeID="linked-companies-settings" style={styles.wrap}>
      {!!error && <Text style={{ color: colors.danger, fontWeight: '400' }}>{error}</Text>}

      <Text style={[styles.section, { color: colors.ink }]}>Avtaler</Text>
      <IntercompanyPanel
        familyId={familyId}
        family={family}
        colors={colors}
        canEdit={canEdit}
        actorName={userProfile?.name || ''}
        legacy={legacyLinks}
      />

      {canEdit ? (
        <>
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
            onOpenCompany={openCompany}
          />

          <Text style={[styles.section, { color: colors.ink }]}>Visning av konsernet</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Hvilke eierandeler Underenheter viser. Terskelen gjelder eierandeler i Aksjonærregisteret.
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
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%', maxWidth: 920 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 6 },
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
