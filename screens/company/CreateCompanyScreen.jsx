import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { createGroup, updateGroup } from '../../src/utils/groups';
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { dismissCompanyOffer } from '../../src/project/companyOffer';
import { fetchCompanyCpv } from '../../src/anbud/doffinClient';
import {
  buildJoinRequest,
  companyRegistrationDecision,
  digitsOrgnr,
  manualCompany,
  organizationByOrgnr,
} from '../../src/project/companyRegistry';

export default function CreateCompanyScreen() {
  const colors = useColors();
  const nav = useNavigation();
  const { selectFamily, userProfile, uid } = useApp();
  const [queryText, setQueryText] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [joinTarget, setJoinTarget] = useState(null);
  const [sent, setSent] = useState(null);

  async function search() {
    setError('');
    setJoinTarget(null);
    setSearching(true);
    try {
      const res = await searchBrregEnheter(queryText, { size: 8 });
      setHits(res.results || []);
      if (!res.results?.length) setError('Ingen treff i Brønnøysund. Du kan registrere bedriften manuelt under.');
    } catch (e) {
      setError(e?.message || 'Søket mot Brønnøysund feilet.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function existingOrganization(orgnr) {
    const id = digitsOrgnr(orgnr);
    if (id.length !== 9) return null;
    const snap = await getDocs(query(collection(db, 'families'), where('orgnr', '==', id)));
    const groups = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
    return organizationByOrgnr(groups, id);
  }

  async function chooseHit(hit) {
    const nextCompany = companyFromBrreg(hit);
    if (!nextCompany || busy) return;
    setBusy(true);
    setError('');
    try {
      const existing = await existingOrganization(nextCompany.organisasjonsnummer);
      const decision = companyRegistrationDecision(existing);
      if (decision.kind === 'join') {
        setJoinTarget({ ...decision, company: nextCompany });
        return;
      }
      await registerNew(nextCompany);
    } catch (e) {
      setError(e?.message || 'Kunne ikke kontrollere bedriften.');
    } finally {
      setBusy(false);
    }
  }

  async function registerNew(nextCompany) {
    const user = auth.currentUser;
    if (!user) throw new Error('Du må være innlogget.');
    const id = await createGroup({
      name: nextCompany.navn,
      type: 'organization',
      language: 'nb',
      user,
      profile: userProfile,
    });
    const patch = {
      company: nextCompany,
      orgnr: digitsOrgnr(nextCompany.organisasjonsnummer),
      projects: [],
      tenders: [],
      cpvCodes: [],
      cpvSource: '',
    };
    if (patch.orgnr) {
      try {
        const data = await fetchCompanyCpv(patch.orgnr);
        patch.cpvCodes = data.cpvCodes || [];
        patch.cpvSource = patch.cpvCodes.length ? 'doffin' : '';
        if (data.company?.name) patch.company = { ...nextCompany, navn: data.company.name };
      } catch {
        patch.cpvSource = '';
      }
    }
    await updateGroup(id, patch);
    await selectFamily?.(id, { id, name: patch.company.navn, type: 'organization', ...patch });
    dismissCompanyOffer(uid || user.uid);
    nav.navigate('Home');
  }

  async function registerManual() {
    const made = manualCompany({ name: manualName, address: manualAddress });
    if (!made.ok) {
      setError(made.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await registerNew(made.company);
    } catch (e) {
      setError(e?.message || 'Kunne ikke registrere bedriften.');
    } finally {
      setBusy(false);
    }
  }

  async function sendJoinRequest() {
    const user = auth.currentUser;
    if (!joinTarget?.companyId || !user || busy) return;
    setBusy(true);
    setError('');
    try {
      const at = new Date().toISOString();
      const request = buildJoinRequest({
        uid: user.uid,
        name: userProfile?.displayName || userProfile?.name || user.displayName || '',
        email: user.email || '',
        at,
      });
      await setDoc(doc(db, 'families', joinTarget.companyId, 'joinRequests', user.uid), request);
      dismissCompanyOffer(uid || user.uid);
      setSent({ ...request, companyName: joinTarget.companyName });
      setJoinTarget(null);
    } catch (e) {
      setError(e?.message || 'Kunne ikke sende forespørselen.');
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
          Søk i Brønnøysund på navn eller organisasjonsnummer, og velg firmaet. Finnes det fra før, kan du be om å bli lagt til. Finnes det ikke i registeret, registrerer du det manuelt.
        </Text>
        <Text style={[styles.label, { color: colors.muted }]}>Søk i Brønnøysund</Text>
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Navn eller organisasjonsnummer"
          placeholderTextColor={colors.placeholder}
          onSubmitEditing={search}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <TouchableOpacity onPress={search} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Søk</Text>}
        </TouchableOpacity>
        {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
        {hits.map((hit) => (
          <TouchableOpacity
            key={hit.organisasjonsnummer}
            style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => chooseHit(hit)}
            disabled={busy}
          >
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{hit.navn}</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {hit.organisasjonsnummerFormatted || hit.organisasjonsnummer}
              {hit.organisasjonsform ? ` · ${hit.organisasjonsform}` : ''}
            </Text>
            {!!hit.addressLabel && <Text style={[styles.cardMeta, { color: colors.muted }]}>{hit.addressLabel}</Text>}
            <Text style={[styles.pick, { color: colors.brand }]}>Velg denne bedriften</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.title, { color: colors.ink, fontSize: 20 }]}>Ikke i Brønnøysund</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Registrer navn og adresse hvis du kjenner den. Bedriften blir liggende på profilen din.
        </Text>
        <TextInput
          value={manualName}
          onChangeText={setManualName}
          placeholder="Bedriftsnavn"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <TextInput
          value={manualAddress}
          onChangeText={setManualAddress}
          placeholder="Adresse, hvis kjent"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <TouchableOpacity onPress={registerManual} style={[styles.btn, { backgroundColor: colors.sunken }]} disabled={busy}>
          <Text style={[styles.btnText, { color: colors.ink }]}>Registrer manuelt</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!joinTarget} transparent animationType="fade" onRequestClose={() => setJoinTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setJoinTarget(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.title, { color: colors.ink, fontSize: 20 }]}>{joinTarget?.companyName} finnes allerede</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Organisasjonsnummeret er registrert i ProTop. Vil du sende en forespørsel om å bli lagt til? Den går til bedriftens superadministrator.
            </Text>
            <TouchableOpacity onPress={sendJoinRequest} style={[styles.btn, { backgroundColor: colors.brand }]} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Sender…' : 'Send forespørsel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinTarget(null)} style={styles.skip}>
              <Text style={{ color: colors.muted, fontWeight: '400' }}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!sent} transparent animationType="fade" onRequestClose={() => { setSent(null); nav.goBack(); }}>
        <Pressable style={styles.backdrop} onPress={() => { setSent(null); nav.goBack(); }}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.kicker, { color: colors.brand }]}>Sendt</Text>
            <Text style={[styles.title, { color: colors.ink, fontSize: 22 }]}>Forespørselen er sendt</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              {sent?.companyName} har fått spørsmål om deltakelse. Du ser bare kort status til bedriften svarer.
            </Text>
            <Text style={{ color: colors.ink, fontWeight: '400' }}>Status: Sendt</Text>
            <Text style={{ color: colors.muted }}>{sent?.createdAt ? new Date(sent.createdAt).toLocaleString('nb-NO') : ''}</Text>
            <TouchableOpacity onPress={() => { setSent(null); nav.goBack(); }} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={styles.btnText}>Lukk</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 420, width: '100%', alignSelf: 'flex-start' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '400' },
  lead: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: {
    alignSelf: 'flex-start', borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '400' },
  error: { fontWeight: '400' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '400' },
  cardMeta: { fontSize: 13 },
  pick: { marginTop: 6, fontWeight: '400' },
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 39, 68, 0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  skip: { alignItems: 'center', paddingVertical: 10 },
});
