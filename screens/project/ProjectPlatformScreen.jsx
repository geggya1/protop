import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isSuperAdmin, updateGroup } from '../../src/utils/groups';
import { CPV_CODES } from '../../src/anbud/catalog';
import { normalizeCpvCode } from '../../src/anbud/model';
import { searchBrregCompanies, selectBrregHitForStoredOrg } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { mergeCompanyProfile } from '../../src/project/companyLogo';
import { companyAddressLabel, companyAddressParts } from '../../src/mileage/flow';
import { companyContextLabel } from '../../src/project/companyOffer';
import CompanyLogoSettings from '../../components/CompanyLogoSettings';
import CompanyStructureSettings from '../../components/project/CompanyStructureSettings';
import CompanyAccessSettings, { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { saveEmployee } from '../../src/employees/storage';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';

function initialCompanyPage(startPage) {
  if (startPage === 'tilgang') return 'tilgang';
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
  const { family, familyId, families, applyFamilyPatch, requestShellTab, uid, userProfile, selectFamily } = useApp();
  const access = useCompanyAccess();
  const company = family?.company?.navn ? family.company : null;
  const owner = isSuperAdmin(family, uid);
  const canEdit = (owner && !access.previewLocks('companyProfile')) || (access.ready && access.can('companyProfile', 'write'));
  const canOpenSettings = (owner && !access.previewLocks('companyProfile')) || (access.ready && access.can('companyProfile', 'read'));
  const contextLabel = companyContextLabel(family);
  const [page, setPage] = useState(initialCompanyPage(startPage));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(company?.telefon || '');
  const [email, setEmail] = useState(company?.epostadresse || '');
  const [gate, setGate] = useState('');
  const [postal, setPostal] = useState('');
  const [place, setPlace] = useState('');
  const [cpvQuery, setCpvQuery] = useState('');
  const [customCpv, setCustomCpv] = useState('');
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [ownTrades, setOwnTrades] = useState([]);
  const [tradeDraft, setTradeDraft] = useState('');

  const savedCpvKey = (family?.cpvCodes || []).map((row) => row.code).filter(Boolean).join(',');
  const savedTradesKey = (company?.egneNaeringskoder || []).join('|');
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
    setSelectedCpv(new Set(savedCpvKey ? savedCpvKey.split(',') : []));
    setOwnTrades(savedTradesKey ? savedTradesKey.split('|') : []);
  }, [company?.organisasjonsnummer, company?.telefon, company?.epostadresse, savedCpvKey, savedTradesKey, addressKey]);

  async function savePatch(id, patch) {
    await updateGroup(id, patch);
    applyFamilyPatch?.(id, patch);
  }

  async function saveSettings() {
    if (!familyId || !company || busy) return;
    setBusy(true);
    setError('');
    try {
      const cpvCodes = [...selectedCpv].map((code) => {
        const known = CPV_CODES.find((row) => row.code === code);
        return { code, label: known?.label || `CPV ${code}`, source: 'bedrift' };
      });
      const nextCompany = {
        ...company,
        telefon: phone.trim(),
        epostadresse: email.trim(),
        egneNaeringskoder: ownTrades,
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
      await savePatch(familyId, {
        cpvCodes,
        cpvSource: cpvCodes.length ? 'bedrift' : '',
        company: nextCompany,
      });
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

  const visibleCpv = CPV_CODES.filter((row) => {
    const q = cpvQuery.trim().toLowerCase();
    if (!q) return true;
    return `${row.code} ${row.label}`.toLowerCase().includes(q);
  });

  function toggleCpv(code) {
    setSelectedCpv((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function addTrade() {
    const value = tradeDraft.trim();
    if (!value || ownTrades.includes(value)) return;
    setOwnTrades((current) => [...current, value]);
    setTradeDraft('');
  }

  return (
    <View nativeID="company-page" id="company-page" dataSet={{ companyPage: '1' }} style={styles.fill}>
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      {startPage === 'tilgang' ? null : (
        <TouchableOpacity onPress={() => requestShellTab?.('selskap')} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '400' }}>Tilbake til virksomhetsprofil</Text>
        </TouchableOpacity>
      )}
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {page === 'tilgang' ? (
        !access.ready && !owner ? (
          <Text style={[styles.lead, { color: colors.muted }]}>Henter tilgang…</Text>
        ) : canOpenSettings ? (
          <CompanyAccessSettings
            company={company}
            employees={access.employees}
            canEdit={canEdit}
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
          />
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
            icon="key-outline"
            title="Tilgang og rettigheter"
            hint="Hvem som ser og endrer bedriftsmoduler"
            colors={colors}
          >
            <TouchableOpacity
              onPress={() => requestShellTab?.('selskap', 'tilgang')}
              accessibilityRole="button"
              accessibilityLabel="Tilgang og rettigheter"
              style={[styles.btn, { backgroundColor: colors.sunken }]}
            >
              <Text style={[styles.btnText, { color: colors.ink }]}>Åpne tilgangsstyring</Text>
            </TouchableOpacity>
          </SettingsSection>

          <SettingsSection
            icon="pricetags-outline"
            title="Virksomhetskoder og fagområder"
            hint="CPV-koder og egne næringskoder"
            colors={colors}
          >
            <Text style={[styles.label, { color: colors.muted }]}>Søk i CPV</Text>
            <TextInput
              value={cpvQuery}
              onChangeText={setCpvQuery}
              editable={canEdit}
              placeholder="Kode eller fag, f.eks. elektro"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <View style={styles.chips}>
              {visibleCpv.map((row) => {
                const on = selectedCpv.has(row.code);
                return (
                  <TouchableOpacity
                    key={row.code}
                    disabled={!canEdit}
                    onPress={() => toggleCpv(row.code)}
                    style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.bg }]}
                  >
                    <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '400' }}>{`${row.code.slice(0, 4)} ${row.label}`}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Field label="Egen CPV-kode" value={customCpv} onChangeText={setCustomCpv} editable={canEdit} placeholder="8 siffer, f.eks. 45233120" colors={colors} />
            {canEdit ? (
              <TouchableOpacity
                onPress={() => {
                  const code = normalizeCpvCode(customCpv);
                  if (!code) return;
                  setSelectedCpv((current) => new Set(current).add(code));
                  setCustomCpv('');
                }}
                style={[styles.btn, { backgroundColor: colors.sunken }]}
              >
                <Text style={[styles.btnText, { color: colors.ink }]}>Legg til kode</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.label, { color: colors.muted }]}>Egne næringskoder</Text>
            {ownTrades.map((row) => (
              <View key={row} style={styles.tradeRow}>
                <Text style={{ color: colors.ink, fontWeight: '400', flex: 1 }}>{row}</Text>
                {canEdit ? (
                  <TouchableOpacity onPress={() => setOwnTrades((current) => current.filter((item) => item !== row))}>
                    <Text style={{ color: colors.muted, fontWeight: '400' }}>Fjern</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {canEdit ? (
              <Field label="Ny næringskode" value={tradeDraft} onChangeText={setTradeDraft} placeholder="Kode eller beskrivelse" colors={colors} />
            ) : null}
            {canEdit ? (
              <TouchableOpacity onPress={addTrade} style={[styles.btn, { backgroundColor: colors.sunken }]}>
                <Text style={[styles.btnText, { color: colors.ink }]}>Legg til næringskode</Text>
              </TouchableOpacity>
            ) : null}
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
  column: { alignSelf: 'flex-start', width: '100%', maxWidth: 760, gap: 10 },
  settingsHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
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
