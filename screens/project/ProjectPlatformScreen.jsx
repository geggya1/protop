import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isSuperAdmin, updateGroup, updateGroupCompany } from '../../src/utils/groups';
import { searchBrregCompanies, selectBrregHitForStoredOrg } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { mergeCompanyProfile } from '../../src/project/companyLogo';
import { companyAddressLabel, companyAddressParts } from '../../src/mileage/flow';
import { companyContextLabel } from '../../src/project/companyOffer';
import CompanyLogoSettings from '../../components/CompanyLogoSettings';
import CompanyStructureSettings from '../../components/project/CompanyStructureSettings';
import CompanyAccessSettings, { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import CompanyModuleSettings from '../../components/project/CompanyModuleSettings';
import ModuleActivationSettings from '../../components/ModuleActivationSettings';
import CompanyPrivacySettings from '../../components/company/CompanyPrivacySettings';
import CompanyClosure from '../../components/company/CompanyClosure';
import { saveEmployee } from '../../src/employees/storage';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useCompanyModules } from '../../src/access/useCompanyModules';
import { UnlessShellTitle } from '../../src/ui/ShellTitles';

function initialCompanyPage(startPage) {
  if (startPage === 'tilgang') return 'tilgang';
  if (startPage === 'moduler') return 'moduler';
  return 'innstillinger';
}

function SettingsSection({ icon, title, hint, colors, children }) {
  return (
    <View style={[styles.sectionCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name={icon} size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
          {hint ? <Text style={[styles.sectionHint, { color: colors.muted }]}>{hint}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, keyboardType, editable = true }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        editable={editable}
        keyboardType={keyboardType || 'default'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

export default function ProjectPlatformScreen({ startPage = '' }) {
  const colors = useColors();
  const nav = useNavigation();
  const { family, familyId, families, applyFamilyPatch, requestShellTab, uid, userProfile, selectFamily, shellIntent, clearShellIntent } = useApp();
  // Kom man hit fra en annen modul (f.eks. ISO-oppsettet), vises en vei tilbake dit.
  const [returnTo, setReturnTo] = useState(() => (shellIntent?.type === 'returnTo' && shellIntent.tab ? shellIntent : null));
  useEffect(() => {
    if (shellIntent?.type !== 'returnTo' || !shellIntent.tab) return;
    setReturnTo(shellIntent);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);
  const access = useCompanyAccess();
  const companyModules = useCompanyModules();
  const company = family?.company?.navn ? family.company : null;
  const owner = isSuperAdmin(family, uid);
  const canEdit = (owner && !access.previewLocks('companyProfile')) || (access.ready && access.canAdmin('companyProfile'));
  const canOpenSettings = (owner && !access.previewLocks('companyProfile')) || (access.ready && access.canView('companyProfile'));
  // Endre andres tilgang: Begrenset redigering på Tilgangsstyring (Øverste leder har det som standard).
  // Endre selve nivåene: Admin. Taket (ikke seg selv, ikke over eget nivå) ligger i accessCeiling.
  const canEditAccess = (owner && !access.previewLocks('accessControl'))
    || (access.ready && access.canEdit('accessControl'));
  const canEditAccessLevels = (owner && !access.previewLocks('accessControl'))
    || (access.ready && access.canAdmin('accessControl'));
  const accessActor = { uid: uid || '', grants: access.actorGrants || access.grants || {}, bypass: owner && !access.previewing };
  const canOpenAccess = (owner && !access.previewLocks('accessControl'))
    || (access.ready && access.canView('accessControl'));
  const contextLabel = companyContextLabel(family);
  const [page, setPage] = useState(initialCompanyPage(startPage));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(company?.telefon || '');
  const [email, setEmail] = useState(company?.epostadresse || '');
  const [gate, setGate] = useState('');
  const [postal, setPostal] = useState('');
  const [place, setPlace] = useState('');

  const addressKey = [
    company?.organisasjonsnummer,
    company?.kjoeradresse?.gate,
    company?.kjoeradresse?.postnummer,
    company?.kjoeradresse?.poststed,
    company?.addressLabel,
    company?.forretning?.label,
  ].join('|');
  useEffect(() => {
    setPage(initialCompanyPage(startPage));
  }, [startPage]);

  useEffect(() => {
    setPhone(company?.telefon || '');
    setEmail(company?.epostadresse || '');
    const parts = companyAddressParts(company);
    setGate(parts?.street || '');
    setPostal(parts?.postnummer || '');
    setPlace(parts?.poststed || '');
  }, [company?.organisasjonsnummer, company?.telefon, company?.epostadresse, addressKey]);

  // Selskapet lagres felt for felt, så en eldre kopi ikke stiller tilgangsmatrisen tilbake.
  async function savePatch(id, patch) {
    const { company: nextCompany, ...rest } = patch || {};
    if (nextCompany) await updateGroupCompany(id, company, nextCompany, rest);
    else await updateGroup(id, patch);
    applyFamilyPatch?.(id, patch);
  }

  async function saveSettings() {
    if (!familyId || !company || busy) return;
    setBusy(true);
    setError('');
    try {
      const nextCompany = {
        ...company,
        telefon: phone.trim(),
        epostadresse: email.trim(),
      };
      const street = gate.trim();
      if (street) {
        nextCompany.kjoeradresse = {
          gate: street,
          postnummer: postal.trim(),
          poststed: place.trim(),
        };
        nextCompany.addressLabel = companyAddressLabel({ kjoeradresse: nextCompany.kjoeradresse }) || street;
      } else {
        delete nextCompany.kjoeradresse;
      }
      await savePatch(familyId, { company: nextCompany });
      requestShellTab?.('selskap');
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre innstillingene.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshFromBrreg() {
    if (!company?.organisasjonsnummer || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await searchBrregCompanies(company.organisasjonsnummer, { size: 5 });
      const hit = selectBrregHitForStoredOrg(res.results, company.organisasjonsnummer);
      const next = companyFromBrreg(hit);
      if (!next) {
        setError('Fant ikke organisasjonsnummeret i Brønnøysund.');
        return;
      }
      const merged = mergeCompanyProfile({
        ...next,
        telefon: phone.trim() || company.telefon || '',
        epostadresse: email.trim() || next.epostadresse,
      }, company);
      await savePatch(familyId, { company: merged, name: merged.navn });
      setEmail(next.epostadresse || '');
    } catch (e) {
      setError(e?.message || 'Kunne ikke hente fra Brønnøysund.');
    } finally {
      setBusy(false);
    }
  }

  if (!company) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Prosjekt og anbud hører til en bedrift. Du er ikke i en bedrift nå.
          Be om innpass eller opprett bedrift fra organisasjonssiden. Det er gratis.
        </Text>
        <TouchableOpacity
          onPress={() => nav.navigate('FamilyOverview')}
          style={[styles.btn, { backgroundColor: colors.brand }]}
        >
          <Text style={styles.btnText}>Gå til organisasjon</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View nativeID="company-page" id="company-page" dataSet={{ companyPage: '1' }} style={styles.fill}>
    <ScrollView
      contentContainerStyle={[styles.body, page === 'tilgang' || page === 'moduler' ? styles.bodyAccess : null]}
      keyboardShouldPersistTaps="handled"
    >
      {returnTo ? (
        <TouchableOpacity onPress={() => requestShellTab?.(returnTo.tab, returnTo.subView || null, returnTo.intent || null)} accessibilityRole="button" nativeID="company-return-to">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>‹ {returnTo.label || 'Tilbake'}</Text>
        </TouchableOpacity>
      ) : null}
      {page === 'tilgang' || page === 'moduler' ? (
        <TouchableOpacity onPress={() => requestShellTab?.('selskap', 'innstillinger')} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '400' }}>Tilbake til selskapsinnstillinger</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => requestShellTab?.('selskap')} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '400' }}>Tilbake til virksomhetsprofil</Text>
        </TouchableOpacity>
      )}
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {page === 'tilgang' ? (
        !access.ready && !owner ? (
          <Text style={[styles.lead, { color: colors.muted }]}>Henter tilgang…</Text>
        ) : canOpenAccess ? (
          <>
            <UnlessShellTitle title="Tilgangsstyring">
              <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>
                Tilgangsstyring
              </Text>
            </UnlessShellTitle>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Rettigheter for hvem som ser og endrer bedriftsmoduler, undersider og innstillinger.
            </Text>
            <CompanyAccessSettings
              company={company}
              employees={access.employees}
              canEdit={canEditAccess}
              canEditLevels={canEditAccessLevels}
              actor={accessActor}
              colors={colors}
              busy={busy}
              onSavePolicy={async (accessPolicy) => {
                await savePatch(familyId, { company: { ...company, accessPolicy } });
              }}
              onSaveEmployee={(employee) => saveEmployee(familyId, employee)}
              onOpenEmployee={(employee) => requestShellTab?.('ansatte', null, {
                type: 'openEmployee',
                employeeId: employee?.id,
              })}
              focusEmployeeId={returnTo?.focusEmployeeId || ''}
            />
          </>
        ) : (
          <CompanyAccessDenied colors={colors} />
        )
      ) : null}

      {page === 'moduler' ? (
        !access.ready && !owner ? (
          <Text style={[styles.lead, { color: colors.muted }]}>Henter tilgang…</Text>
        ) : companyModules.canView ? (
          <>
            <UnlessShellTitle title="Modulinnstillinger">
              <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>
                Modulinnstillinger
              </Text>
            </UnlessShellTitle>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Velg hvilke moduler bedriften abonnerer på. Dette gjelder over tilgangsstyringen: en modul som er av, er av for alle. Ansatte ser den i menyen, men kan ikke åpne den.
            </Text>
            <CompanyModuleSettings
              company={company}
              canEdit={companyModules.canManage}
              colors={colors}
              busy={busy}
              onSave={async (modules) => {
                setBusy(true);
                try {
                  await savePatch(familyId, { company: { ...company, modules } });
                } finally {
                  setBusy(false);
                }
              }}
            />
            {/* Samme valg som Konto → Aktiverte moduler, her sammen med bedriftens moduler (UX-17). */}
            <SettingsSection
              icon="apps-outline"
              title="Aktiverte moduler"
              hint="Kalender, E-post, Oppgaver, Notat og Chat står alltid i menyen. En som er slått av, viser velkomsten neste gang den åpnes. Lagres med en gang."
              colors={colors}
            >
              <ModuleActivationSettings showCategories={false} />
            </SettingsSection>
          </>
        ) : (
          <CompanyAccessDenied colors={colors} />
        )
      ) : null}

      {page === 'innstillinger' ? (
        !access.ready && !owner ? (
          <Text style={[styles.lead, { color: colors.muted }]}>Henter tilgang…</Text>
        ) : !canOpenSettings ? (
          <CompanyAccessDenied colors={colors} />
        ) : (
        <View style={styles.column}>
          <View style={styles.settingsHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: colors.muted }]}>Administrasjon</Text>
              <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>
                Selskapsinnstillinger
              </Text>
              <Text style={[styles.lead, { color: colors.muted }]}>
                {[contextLabel || company.navn, company.organisasjonsnummer].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => requestShellTab?.('selskap')} accessibilityLabel="Lukk innstillinger">
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          {!canEdit ? (
            <Text style={[styles.lead, { color: colors.muted }]}>
              Bare administrator kan endre bedriftsprofil og grunninnstillinger.
            </Text>
          ) : null}

          <SettingsSection
            icon="image-outline"
            title="Bedriftsprofil og grunnopplysninger"
            hint="Logo, kontakt og registrerte virksomhetsopplysninger"
            colors={colors}
          >
            <CompanyLogoSettings
              company={company}
              canEdit={canEdit}
              colors={colors}
              busy={busy}
              onSave={async (logo) => {
                const next = { ...company };
                if (logo) next.logo = logo;
                else delete next.logo;
                await savePatch(familyId, { company: next });
              }}
            />
            <Field label="Telefon" value={phone} onChangeText={setPhone} editable={canEdit} placeholder="Telefon til bedriften" colors={colors} keyboardType="phone-pad" />
            <Field label="E-post" value={email} onChangeText={setEmail} editable={canEdit} placeholder="E-post" colors={colors} keyboardType="email-address" />
            {canEdit ? (
              <TouchableOpacity onPress={refreshFromBrreg} style={[styles.btn, { backgroundColor: colors.sunken }]} disabled={busy}>
                <Text style={[styles.btnText, { color: colors.ink }]}>Hent på nytt fra Brønnøysund</Text>
              </TouchableOpacity>
            ) : null}
          </SettingsSection>

          <SettingsSection
            icon="git-network-outline"
            title="Konsern, selskaper og underenheter"
            hint="Tilknyttede selskaper, underenheter og avdelinger"
            colors={colors}
          >
            <CompanyStructureSettings
              company={company}
              familyId={familyId}
              families={families || []}
              canEdit={canEdit}
              colors={colors}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              userProfile={userProfile}
              onSaved={async (next) => {
                await savePatch(familyId, { company: next });
              }}
              onOpenCompany={(id) => {
                selectFamily?.(id);
                requestShellTab?.('selskap');
              }}
            />
            <TouchableOpacity
              onPress={() => requestShellTab?.('selskap', 'underenheter')}
              accessibilityRole="button"
              accessibilityLabel="Underenheter"
              style={[styles.btn, { backgroundColor: colors.sunken }]}
            >
              <Text style={[styles.btnText, { color: colors.ink }]}>Administrer underenheter og avdelinger</Text>
            </TouchableOpacity>
          </SettingsSection>

          <SettingsSection
            icon="car-outline"
            title="Kjøreadresse"
            hint="Oppmøteadresse som brukes i kjøreboken"
            colors={colors}
          >
            <Text style={[styles.lead, { color: colors.muted }]}>
              Gate og nummer brukes i kjøreboken og kommer opp som søketreff. Etasje tas ikke med, for det er ikke en kartadresse.
            </Text>
            {company.addressLabel && company.addressLabel !== companyAddressLabel({ kjoeradresse: { gate, postnummer: postal, poststed: place } }) ? (
              <Text style={[styles.lead, { color: colors.muted }]}>
                {`Registeret har «${company.addressLabel}».`}
              </Text>
            ) : null}
            <Field label="Gate og nummer" value={gate} onChangeText={setGate} editable={canEdit} placeholder="Svanholmen 7" colors={colors} />
            <Field label="Postnummer" value={postal} onChangeText={setPostal} editable={canEdit} placeholder="4313" colors={colors} keyboardType="number-pad" />
            <Field label="Poststed" value={place} onChangeText={setPlace} editable={canEdit} placeholder="Sandnes" colors={colors} />
          </SettingsSection>

          <SettingsSection
            icon="shield-checkmark-outline"
            title="Personvern"
            hint="Databehandleravtale, brukslogg og AI"
            colors={colors}
          >
            <CompanyPrivacySettings
              family={family}
              familyId={familyId}
              company={company}
              uid={uid}
              userName={userProfile?.displayName || userProfile?.name || ''}
              colors={colors}
              onSaveCompany={(next) => savePatch(familyId, { company: next })}
              canEdit={canEdit}
            />
          </SettingsSection>

          <SettingsSection
            icon="archive-outline"
            title="Avslutt bedriften"
            hint="Eksport av alle data, og sletting etter 90 dager"
            colors={colors}
          >
            <CompanyClosure family={family} familyId={familyId} uid={uid} colors={colors} />
          </SettingsSection>

          {canEdit ? (
            <TouchableOpacity onPress={saveSettings} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Lagrer…' : 'Lagre innstillinger'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        )
      ) : null}

    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  body: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 1180, width: '100%', alignSelf: 'flex-start' },
  bodyAccess: { maxWidth: '100%', alignSelf: 'stretch', flexGrow: 1 },
  column: { alignSelf: 'flex-start', width: '100%', maxWidth: 760, gap: 10 },
  settingsHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  kicker: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '600' },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '400' },
  btn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { color: '#fff', fontWeight: '400' },
  error: { fontWeight: '400' },
  card: { alignSelf: 'flex-start', width: 420, maxWidth: '100%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '400' },
  cardMeta: { fontSize: 13 },
  pick: { marginTop: 6, fontWeight: '400' },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  sectionHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  sectionBody: { gap: 10 },
});
