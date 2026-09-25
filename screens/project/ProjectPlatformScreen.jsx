import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { updateGroup } from '../../src/utils/groups';
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { companyContextLabel } from '../../src/project/companyOffer';
import AnbudScreen from '../anbud/AnbudScreen';

const PAGES = [
  ['oversikt', 'Framside'],
  ['anbud', 'Anbud'],
  ['innstillinger', 'Innstillinger'],
];

function Field({ label, value, onChangeText, placeholder, colors, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType || 'default'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

export default function ProjectPlatformScreen() {
  const colors = useColors();
  const nav = useNavigation();
  const { family, familyId, applyFamilyPatch, requestShellTab } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const contextLabel = companyContextLabel(family);
  const [page, setPage] = useState('oversikt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(company?.telefon || '');
  const [email, setEmail] = useState(company?.epostadresse || '');

  useEffect(() => {
    setPhone(company?.telefon || '');
    setEmail(company?.epostadresse || '');
  }, [company?.organisasjonsnummer, company?.telefon, company?.epostadresse]);

  const projects = useMemo(() => (Array.isArray(family?.projects) ? family.projects : []), [family?.projects]);
  const tenders = useMemo(() => (Array.isArray(family?.tenders) ? family.tenders : []), [family?.tenders]);

  async function savePatch(id, patch) {
    await updateGroup(id, patch);
    applyFamilyPatch?.(id, patch);
  }

  async function saveSettings() {
    if (!familyId || !company || busy) return;
    setBusy(true);
    setError('');
    try {
      await savePatch(familyId, {
        company: { ...company, telefon: phone.trim(), epostadresse: email.trim() },
      });
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
        <Text style={[styles.title, { color: colors.ink }]}>Prosjekt</Text>
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
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '700' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (page === 'anbud') {
    return (
      <View style={styles.fill}>
        <View style={styles.head}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Du er i</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{contextLabel || company.navn}</Text>
          {chips}
        </View>
        <AnbudScreen
          company={{
            id: familyId,
            name: company.navn,
            orgnr: company.organisasjonsnummer || '',
            cpvCodes: family?.cpvCodes || [],
            cpvSource: family?.cpvSource || '',
            anbudInbox: family?.anbudInbox || [],
            anbudInquiries: family?.anbudInquiries || [],
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={[styles.kicker, { color: colors.muted }]}>Du er i</Text>
      <Text style={[styles.title, { color: colors.ink }]}>{contextLabel || company.navn}</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        {company.organisasjonsnummer}
        {company.organisasjonsform ? ` · ${company.organisasjonsform}` : ''}
      </Text>
      {chips}
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {page === 'oversikt' ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Row icon="business-outline" label="Adresse" value={company.addressLabel || 'Ikke registrert'} colors={colors} />
          <Row icon="pricetag-outline" label="Næring" value={[company.naeringskode, company.naeringsbeskrivelse].filter(Boolean).join(' · ') || '—'} colors={colors} />
          <Row icon="documents-outline" label="Anbud" value={String(tenders.length)} colors={colors} />
          <Row icon="construct-outline" label="Prosjekt" value={String(projects.length)} colors={colors} />
        </View>
      ) : null}

      {page === 'innstillinger' ? (
        <View>
          <Field label="Telefon" value={phone} onChangeText={setPhone} placeholder="Telefon til bedriften" colors={colors} keyboardType="phone-pad" />
          <Field label="E-post" value={email} onChangeText={setEmail} placeholder="E-post" colors={colors} keyboardType="email-address" />
          <TouchableOpacity onPress={saveSettings} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
            <Text style={styles.btnText}>{busy ? 'Lagrer…' : 'Lagre innstillinger'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={refreshFromBrreg} style={[styles.btn, styles.btnGap, { backgroundColor: colors.sunken }]} disabled={busy}>
            <Text style={[styles.btnText, { color: colors.ink }]}>Hent på nytt fra Brønnøysund</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity onPress={() => requestShellTab?.('projects')} style={[styles.btn, { backgroundColor: colors.sunken }]}>
        <Text style={[styles.btnText, { color: colors.ink }]}>Åpne Prosjekt</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => nav.navigate('GroupSettings')} style={[styles.btn, { backgroundColor: colors.sunken }]}>
        <Text style={[styles.btnText, { color: colors.ink }]}>Medlemmer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ icon, label, value, colors }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  body: { padding: 16, paddingBottom: 48, gap: 10 },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  title: { fontSize: 26, fontWeight: '900' },
  lead: { fontSize: 15, lineHeight: 21 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnGap: { marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800' },
  error: { fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardMeta: { fontSize: 13 },
  pick: { marginTop: 6, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
});
