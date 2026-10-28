import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { searchBrregEnheter } from '../../src/utils/boligmappaApis';
import { companyFromBrreg } from '../../src/project/company';
import { dismissCompanyOffer } from '../../src/project/companyOffer';
import { manualCompany } from '../../src/project/companyRegistry';
import { companyChoice, registerCompany, requestCompanyAccess } from '../../src/project/companyJoinFlow';
import { dpaAcceptanceRecord } from '../../src/privacy/companyPrivacy';
import { logConsent } from '../../src/utils/consents';
import CheckBox from '../../components/CheckBox';
import LegalDocumentModal from '../../components/LegalDocumentModal';

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
  // Databehandleravtalen godtas på vegne av bedriften før den opprettes.
  const [dpaOk, setDpaOk] = useState(false);
  const [dpaError, setDpaError] = useState(false);
  const [legalDoc, setLegalDoc] = useState('');

  async function search() {
    setError('');
    setJoinTarget(null);
    setSearching(true);
    try {
      const res = await searchBrregEnheter(queryText, { size: 8 });
      setHits(res.results || []);
      if (!res.results?.length) setError('Ingen treff i Brønnøysund. Du kan registrere bedriften manuelt under.');
    } catch {
      // Nettverksfeil kommer som rå engelsk tekst («Failed to fetch»), så vis vår egen (ANSATT-04).
      setError('Fikk ikke kontakt med Brønnøysundregistrene. Sjekk nettet og prøv igjen, eller registrer bedriften manuelt under.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function chooseHit(hit) {
    const nextCompany = companyFromBrreg(hit);
    if (!nextCompany || busy) return;
    setBusy(true);
    setError('');
    try {
      const decision = await companyChoice(nextCompany);
      if (decision.kind === 'member') {
        await selectFamily?.(decision.id, { id: decision.id, name: decision.name, type: 'organization' });
        nav.navigate('Home');
        return;
      }
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
    if (!dpaOk) {
      setDpaError(true);
      throw new Error('Godta vilkårene og databehandleravtalen for å opprette bedriften.');
    }
    const user = auth.currentUser;
    const acceptance = dpaAcceptanceRecord({
      uid: uid || user?.uid,
      name: userProfile?.displayName || userProfile?.name || user?.displayName || user?.email || '',
    });
    const { id, patch } = await registerCompany(
      { ...nextCompany, dpaAcceptance: { ...acceptance, acceptedAt: serverTimestamp() } },
      { profile: userProfile },
    );
    logConsent({
      kind: 'dpa', familyId: id, version: acceptance.version, clientAt: acceptance.acceptedAtClient,
    });
    const company = { ...patch.company, dpaAcceptance: acceptance };
    await selectFamily?.(id, { id, name: patch.company.navn, type: 'organization', ...patch, company });
    dismissCompanyOffer(uid || auth.currentUser?.uid);
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
      const res = await requestCompanyAccess({
        companyId: joinTarget.companyId,
        companyName: joinTarget.companyName,
        name: userProfile?.displayName || userProfile?.name || user.displayName || '',
      });
      dismissCompanyOffer(uid || user.uid);
      setSent(res);
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
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel="Tilbake">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={[styles.kicker, { color: colors.muted }]}>Gratis</Text>
        <Text style={[styles.title, { color: colors.ink }]}>Opprett bedrift</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Søk i Brønnøysund på navn eller organisasjonsnummer, og velg firmaet. Finnes det fra før, kan du be om å bli lagt til. Finnes det ikke i registeret, registrerer du det manuelt.
        </Text>
        <View style={[styles.legalBox, { borderColor: dpaError && !dpaOk ? colors.danger : colors.line, backgroundColor: colors.card }]}>
          <CheckBox
            checked={dpaOk}
            onPress={() => { setDpaOk(!dpaOk); setDpaError(false); }}
            label="Jeg godtar vilkårene og databehandleravtalen på vegne av bedriften"
          />
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => setLegalDoc('all')} accessibilityRole="link">
              <Text style={[styles.legalLink, { color: colors.brand }]}>Les vilkårene</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLegalDoc('dpa')} accessibilityRole="link">
              <Text style={[styles.legalLink, { color: colors.brand }]}>Les databehandleravtalen</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.legalHint, { color: dpaError && !dpaOk ? colors.danger : colors.muted }]}>
            Du bekrefter at du har fullmakt til å inngå avtalen for bedriften. Versjon, tidspunkt og hvem som godtok, lagres på bedriften.
          </Text>
        </View>
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

      <LegalDocumentModal visible={!!legalDoc} doc={legalDoc || 'all'} onClose={() => setLegalDoc('')} />

      <Modal visible={!!joinTarget} transparent animationType="fade" onRequestClose={() => setJoinTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setJoinTarget(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.title, { color: colors.ink, fontSize: 20 }]}>{joinTarget?.companyName} finnes allerede</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Organisasjonsnummeret er registrert i ProTop. Vil du be om å bli med? Bedriftens administratorer får varsel og kan invitere deg. Du må godta invitasjonen før du kommer inn.
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
              Administratorene i {sent?.companyName} har fått beskjed. Når de inviterer deg, får du en bedriftsinvitasjon som du godtar eller avslår.
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
  legalBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legalLink: { fontSize: 14 },
  legalHint: { fontSize: 13, lineHeight: 18 },
});
