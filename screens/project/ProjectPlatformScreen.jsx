import React, { useEffect, useMemo, useState } from 'react';
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
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { companyContextLabel } from '../../src/project/companyOffer';
import CompanyLanding from './CompanyLanding';

const PAGES = [
  ['oversikt', 'Forside'],
];

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

export default function ProjectPlatformScreen() {
  const colors = useColors();
  const nav = useNavigation();
  const { family, familyId, applyFamilyPatch, requestShellTab, members, uid } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const canEdit = isSuperAdmin(family, uid);
  const contextLabel = companyContextLabel(family);
  const [page, setPage] = useState('oversikt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(company?.telefon || '');
  const [email, setEmail] = useState(company?.epostadresse || '');
  const [cpvQuery, setCpvQuery] = useState('');
  const [customCpv, setCustomCpv] = useState('');
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [ownTrades, setOwnTrades] = useState([]);
  const [tradeDraft, setTradeDraft] = useState('');

  const savedCpvKey = (family?.cpvCodes || []).map((row) => row.code).filter(Boolean).join(',');
  const savedTradesKey = (company?.egneNaeringskoder || []).join('|');
  useEffect(() => {
    setPhone(company?.telefon || '');
    setEmail(company?.epostadresse || '');
    setSelectedCpv(new Set(savedCpvKey ? savedCpvKey.split(',') : []));
    setOwnTrades(savedTradesKey ? savedTradesKey.split('|') : []);
  }, [company?.organisasjonsnummer, company?.telefon, company?.epostadresse, savedCpvKey, savedTradesKey]);

  const projects = useMemo(() => (Array.isArray(family?.projects) ? family.projects : []), [family?.projects]);

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
      await savePatch(familyId, {
        cpvCodes,
        cpvSource: cpvCodes.length ? 'bedrift' : '',
        company: {
          ...company,
          telefon: phone.trim(),
          epostadresse: email.trim(),
          egneNaeringskoder: ownTrades,
        },
      });
      setPage('oversikt');
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
      const res = await searchBrregEnheter(company.organisasjonsnummer, { size: 1 });
      const hit = res.results?.[0];
      const next = companyFromBrreg(hit);
      if (!next) {
        setError('Fant ikke organisasjonsnummeret i Brønnøysund.');
        return;
      }
      next.telefon = phone.trim() || company.telefon || '';
      next.epostadresse = email.trim() || next.epostadresse;
      next.egneNaeringskoder = company.egneNaeringskoder || [];
      await savePatch(familyId, { company: next, name: next.navn });
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
        <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>Prosjekt</Text>
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

  const chips = (
    <View style={styles.chips}>
      {PAGES.map(([id, label]) => {
        const on = page === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => { setPage(id); setError(''); }}
            style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '400' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

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
      {page === 'innstillinger' ? (
        <>
          <Text style={[styles.kicker, { color: colors.muted }]}>Du er i</Text>
          <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>{contextLabel || company.navn}</Text>
          <Text style={[styles.lead, { color: colors.muted }]}>
            {company.organisasjonsnummer}
            {company.organisasjonsform ? ` · ${company.organisasjonsform}` : ''}
          </Text>
        </>
      ) : null}
      {chips}
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {page === 'oversikt' ? (
        <CompanyLanding
          stored={company}
          projects={projects}
          members={members || []}
          cpvCodes={family?.cpvCodes || []}
          onProjects={() => requestShellTab?.('projects')}
          onSettings={() => setPage('innstillinger')}
          canEdit={canEdit}
        />
      ) : null}

      {page === 'innstillinger' ? (
        <View style={styles.column}>
          <View style={styles.settingsHead}>
            <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>Innstillinger</Text>
            <TouchableOpacity onPress={() => setPage('oversikt')} accessibilityLabel="Lukk innstillinger">
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.lead, { color: colors.muted }]}>
            Egne CPV-koder og næringskoder brukes i anbudsvarsling, i tillegg til det som er offentlig kjent.
            {canEdit ? '' : ' Bare superadministrator kan endre dette.'}
          </Text>
          <Field label="Telefon" value={phone} onChangeText={setPhone} editable={canEdit} placeholder="Telefon til bedriften" colors={colors} keyboardType="phone-pad" />
          <Field label="E-post" value={email} onChangeText={setEmail} editable={canEdit} placeholder="E-post" colors={colors} keyboardType="email-address" />
          <Text style={[styles.label, { color: colors.muted }]}>Søk i CPV</Text>
          <TextInput
            value={cpvQuery}
            onChangeText={setCpvQuery}
            editable={canEdit}
            placeholder="Kode eller fag, f.eks. elektro"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <View style={styles.chips}>
            {visibleCpv.map((row) => {
              const on = selectedCpv.has(row.code);
              return (
                <TouchableOpacity
                  key={row.code}
                  disabled={!canEdit}
                  onPress={() => toggleCpv(row.code)}
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
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
          <Text style={[styles.lead, { color: colors.muted }]}>
            Offentlige koder fra Enhetsregisteret vises på forsiden. Her legger du til koder bedriften selv vil varsles på.
          </Text>
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
          {canEdit ? (
            <TouchableOpacity onPress={saveSettings} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Lagrer…' : 'Lagre innstillinger'}</Text>
            </TouchableOpacity>
          ) : null}
          {canEdit ? (
            <TouchableOpacity onPress={refreshFromBrreg} style={[styles.btn, { backgroundColor: colors.sunken }]} disabled={busy}>
              <Text style={[styles.btnText, { color: colors.ink }]}>Hent på nytt fra Brønnøysund</Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
  settingsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4 },
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
});
