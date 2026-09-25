import React, { useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { createGroup, updateGroup } from '../../src/utils/groups';
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { dismissCompanyOffer } from '../../src/project/companyOffer';

export default function CreateCompanyScreen() {
  const colors = useColors();
  const nav = useNavigation();
  const { family, familyId, selectFamily, applyFamilyPatch, userProfile, uid } = useApp();
  const onOrganization = isOrganizationType(family?.type);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        const patch = { company: nextCompany, name: nextCompany.navn };
        await updateGroup(familyId, patch);
        applyFamilyPatch?.(familyId, patch);
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
      dismissCompanyOffer(uid || user.uid);
      nav.navigate('Home');
    } catch (e) {
      setError(e?.message || 'Kunne ikke opprette bedriften.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={[styles.kicker, { color: colors.muted }]}>Gratis</Text>
        <Text style={[styles.title, { color: colors.ink }]}>Opprett bedrift</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Søk i Brønnøysundregistrene på navn eller organisasjonsnummer. Bedriften opprettes fra enheten du velger. Det koster ingenting.
        </Text>
        <Text style={[styles.label, { color: colors.muted }]}>Søk</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Navn eller organisasjonsnummer"
          placeholderTextColor={colors.placeholder}
          onSubmitEditing={search}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '900' },
  lead: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '800' },
  error: { fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardMeta: { fontSize: 13 },
  pick: { marginTop: 6, fontWeight: '800' },
});
