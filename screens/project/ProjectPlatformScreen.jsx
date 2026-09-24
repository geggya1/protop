import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { createGroup, updateGroup } from '../../src/utils/groups';
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import {
  PROJECT_PHASES,
  TENDER_STATUSES,
  companyFromBrreg,
  createProjectRecord,
  createTenderRecord,
} from '../../src/project/company';

const PAGES = [
  ['oversikt', 'Oversikt'],
  ['innstillinger', 'Innstillinger'],
  ['anbud', 'Anbud'],
  ['prosjekt', 'Prosjekt'],
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
  const { family, familyId, selectFamily, applyFamilyPatch, userProfile } = useApp();
  const company = family?.company?.organisasjonsnummer ? family.company : null;
  const onOrganization = isOrganizationType(family?.type);
  const [page, setPage] = useState('oversikt');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectForm, setProjectForm] = useState({ name: '', number: '', place: '', client: '', phase: 'planlegging' });
  const [tenderForm, setTenderForm] = useState({ title: '', client: '', deadline: '', amount: '', status: 'utkast' });
  const [phone, setPhone] = useState(company?.telefon || '');
  const [email, setEmail] = useState(company?.epostadresse || '');

  const projects = useMemo(() => (Array.isArray(family?.projects) ? family.projects : []), [family?.projects]);
  const tenders = useMemo(() => (Array.isArray(family?.tenders) ? family.tenders : []), [family?.tenders]);

  async function search() {
    setError('');
    setSearching(true);
    try {
      const res = await searchBrregEnheter(query, { size: 8 });
      setHits(res.results || []);
      if (!res.results?.length) setError('Ingen treff i Brønnøysundregistrene.');
    } catch (e) {
      setError(e?.message || 'Søket mot Brønnøysund feilet.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function savePatch(id, patch) {
    await updateGroup(id, patch);
    applyFamilyPatch?.(id, patch);
  }

  async function createFromHit(hit) {
    const nextCompany = companyFromBrreg(hit);
    if (!nextCompany || busy) return;
    const user = auth.currentUser;
    if (!user) {
      setError('Du må være innlogget.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (onOrganization && familyId) {
        await savePatch(familyId, { company: nextCompany, name: nextCompany.navn });
      } else {
        const id = await createGroup({
          name: nextCompany.navn,
          type: 'organization',
          language: 'nb',
          user,
          profile: userProfile,
        });
        const patch = { company: nextCompany, projects: [], tenders: [] };
        await updateGroup(id, patch);
        await selectFamily?.(id, {
          id,
          name: nextCompany.navn,
          type: 'organization',
          ...patch,
        });
      }
      setHits([]);
      setQuery('');
      setPhone(nextCompany.telefon || '');
      setEmail(nextCompany.epostadresse || '');
      setPage('oversikt');
    } catch (e) {
      setError(e?.message || 'Kunne ikke opprette bedriften.');
    } finally {
      setBusy(false);
    }
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
    if (!company || busy) return;
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

  async function addProject() {
    const made = createProjectRecord(projectForm);
    if (!made.ok) {
      setError(made.error);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await savePatch(familyId, { projects: [made.record, ...projects] });
      setProjectForm({ name: '', number: '', place: '', client: '', phase: 'planlegging' });
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre prosjektet.');
    } finally {
      setBusy(false);
    }
  }

  async function addTender() {
    const made = createTenderRecord(tenderForm);
    if (!made.ok) {
      setError(made.error);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await savePatch(familyId, { tenders: [made.record, ...tenders] });
      setTenderForm({ title: '', client: '', deadline: '', amount: '', status: 'utkast' });
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre anbudet.');
    } finally {
      setBusy(false);
    }
  }

  if (!company) {
    return (
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.ink }]}>Opprett bedrift</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Søk i Brønnøysundregistrene på navn eller organisasjonsnummer. Bedriften opprettes fra enheten du velger.
        </Text>
        <Field label="Søk" value={query} onChangeText={setQuery} placeholder="Navn eller organisasjonsnummer" colors={colors} />
        <TouchableOpacity onPress={search} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Søk i Brønnøysund</Text>}
        </TouchableOpacity>
        {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
        {hits.map((hit) => (
          <TouchableOpacity
            key={hit.organisasjonsnummer}
            style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => createFromHit(hit)}
            disabled={busy}
          >
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{hit.navn}</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {hit.organisasjonsnummerFormatted || hit.organisasjonsnummer}
              {hit.organisasjonsform ? ` · ${hit.organisasjonsform}` : ''}
            </Text>
            {!!hit.addressLabel && <Text style={[styles.cardMeta, { color: colors.muted }]}>{hit.addressLabel}</Text>}
            <Text style={[styles.pick, { color: colors.brand }]}>Bruk denne bedriften</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={[styles.kicker, { color: colors.muted }]}>Bedrift</Text>
      <Text style={[styles.title, { color: colors.ink }]}>{company.navn}</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        {company.organisasjonsnummer}
        {company.organisasjonsform ? ` · ${company.organisasjonsform}` : ''}
      </Text>
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

      {page === 'anbud' ? (
        <View>
          {tenders.map((item) => (
            <View key={item.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[styles.cardMeta, { color: colors.muted }]}>
                {[item.client, item.deadline, item.status, item.amount].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
          <Field label="Anbud" value={tenderForm.title} onChangeText={(v) => setTenderForm((f) => ({ ...f, title: v }))} placeholder="Navn på anbudet" colors={colors} />
          <Field label="Oppdragsgiver" value={tenderForm.client} onChangeText={(v) => setTenderForm((f) => ({ ...f, client: v }))} placeholder="Kunde" colors={colors} />
          <Field label="Frist" value={tenderForm.deadline} onChangeText={(v) => setTenderForm((f) => ({ ...f, deadline: v }))} placeholder="ÅÅÅÅ-MM-DD" colors={colors} />
          <Field label="Sum" value={tenderForm.amount} onChangeText={(v) => setTenderForm((f) => ({ ...f, amount: v }))} placeholder="Beløp" colors={colors} keyboardType="numeric" />
          <View style={styles.chips}>
            {TENDER_STATUSES.map((status) => (
              <TouchableOpacity key={status} onPress={() => setTenderForm((f) => ({ ...f, status }))} style={[styles.chip, { borderColor: tenderForm.status === status ? colors.brand : colors.line, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.ink }}>{status}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={addTender} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
            <Text style={styles.btnText}>Legg til anbud</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {page === 'prosjekt' ? (
        <View>
          {projects.map((item) => (
            <View key={item.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>{item.number} · {item.name}</Text>
              <Text style={[styles.cardMeta, { color: colors.muted }]}>
                {[item.client, item.place, item.phase].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
          <Field label="Prosjektnavn" value={projectForm.name} onChangeText={(v) => setProjectForm((f) => ({ ...f, name: v }))} placeholder="Navn" colors={colors} />
          <Field label="Prosjektnummer" value={projectForm.number} onChangeText={(v) => setProjectForm((f) => ({ ...f, number: v }))} placeholder="P-100" colors={colors} />
          <Field label="Kunde" value={projectForm.client} onChangeText={(v) => setProjectForm((f) => ({ ...f, client: v }))} placeholder="Oppdragsgiver" colors={colors} />
          <Field label="Sted" value={projectForm.place} onChangeText={(v) => setProjectForm((f) => ({ ...f, place: v }))} placeholder="Sted" colors={colors} />
          <View style={styles.chips}>
            {PROJECT_PHASES.map((phase) => (
              <TouchableOpacity key={phase} onPress={() => setProjectForm((f) => ({ ...f, phase }))} style={[styles.chip, { borderColor: projectForm.phase === phase ? colors.brand : colors.line, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.ink }}>{phase}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={addProject} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
            <Text style={styles.btnText}>Opprett prosjekt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
