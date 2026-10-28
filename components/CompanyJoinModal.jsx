import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import { searchBrregEnheter } from '../src/utils/boligmappaApis';
import { companyFromBrreg } from '../src/project/company';
import { dismissCompanyOffer } from '../src/project/companyOffer';
import { companyChoice, registerCompany, requestCompanyAccess } from '../src/project/companyJoinFlow';

const SEARCH_DELAY_MS = 350;

/**
 * Be om innpass: søk opp bedriften i Brønnøysund og velg den.
 * Finnes den i ProTop, ber personen om tilgang. Finnes den ikke, kan personen opprette den.
 */
export default function CompanyJoinModal({ visible, onClose }) {
  const nav = useNavigation();
  const { selectFamily, userProfile, uid } = useApp();
  const [queryText, setQueryText] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [checkingId, setCheckingId] = useState('');
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const searchRef = useRef(0);

  useEffect(() => {
    if (visible) return;
    setQueryText('');
    setHits([]);
    setSearchError('');
    setCheckingId('');
    setPicked(null);
    setBusy(false);
    setError('');
    setSent(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const q = queryText.trim();
    const run = searchRef.current + 1;
    searchRef.current = run;
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      setSearchError('');
      return undefined;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchBrregEnheter(q, { size: 8, signal: controller?.signal });
        if (searchRef.current !== run) return;
        setHits(res.results || []);
        setSearchError(res.results?.length ? '' : 'Ingen treff i Brønnøysund.');
      } catch (e) {
        if (searchRef.current !== run || e?.name === 'AbortError') return;
        setHits([]);
        setSearchError(e?.message || 'Søket mot Brønnøysund feilet.');
      } finally {
        if (searchRef.current === run) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [queryText, visible]);

  const close = () => {
    if (busy) return;
    onClose?.();
  };

  async function chooseHit(hit) {
    const company = companyFromBrreg(hit);
    if (!company || checkingId || busy) return;
    setCheckingId(hit.organisasjonsnummer);
    setError('');
    try {
      const decision = await companyChoice(company);
      setPicked({
        ...decision,
        company,
        orgnrLabel: hit.organisasjonsnummerFormatted || company.organisasjonsnummer || '',
      });
    } catch (e) {
      setError(e?.message || 'Kunne ikke kontrollere bedriften.');
    } finally {
      setCheckingId('');
    }
  }

  async function openMember() {
    if (!picked?.id) return;
    await selectFamily?.(picked.id, { id: picked.id, name: picked.name, type: 'organization' });
    onClose?.();
    nav.navigate('Home');
  }

  async function askForAccess() {
    const user = auth.currentUser;
    if (!picked?.companyId || !user || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await requestCompanyAccess({
        companyId: picked.companyId,
        companyName: picked.companyName,
        name: userProfile?.displayName || userProfile?.name || user.displayName || '',
      });
      dismissCompanyOffer(uid || user.uid);
      setSent(res);
    } catch (e) {
      setError(e?.message || 'Kunne ikke sende forespørselen.');
    } finally {
      setBusy(false);
    }
  }

  async function createCompany() {
    if (!picked?.company || busy) return;
    setBusy(true);
    setError('');
    try {
      const { id, patch } = await registerCompany(picked.company, { profile: userProfile });
      await selectFamily?.(id, { id, name: patch.company.navn, type: 'organization', ...patch });
      dismissCompanyOffer(uid || auth.currentUser?.uid);
      setBusy(false);
      onClose?.();
      nav.navigate('Home');
    } catch (e) {
      setError(e?.message || 'Kunne ikke opprette bedriften.');
      setBusy(false);
    }
  }

  const useCode = () => {
    onClose?.();
    nav.navigate('GroupJoin', { platformType: 'organization' });
  };

  const pickedName = picked?.companyName || picked?.name || picked?.company?.navn || '';
  const pickedOrgnr = picked?.orgnrLabel || '';

  let body;
  if (sent) {
    body = (
      <>
        <Text style={styles.kicker}>Sendt</Text>
        <Text style={styles.title}>Forespørselen er sendt</Text>
        <Text style={styles.lead}>
          Administratorene i {sent.companyName} har fått beskjed. Når de inviterer deg, får du en bedriftsinvitasjon som du godtar eller avslår.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={close} accessibilityRole="button">
          <Text style={styles.primaryTxt}>Lukk</Text>
        </TouchableOpacity>
      </>
    );
  } else if (picked) {
    const member = picked.kind === 'member';
    const join = picked.kind === 'join';
    body = (
      <>
        <TouchableOpacity style={styles.backRow} onPress={() => { setPicked(null); setError(''); }} disabled={busy}>
          <Ionicons name="chevron-back" size={16} color={colors.brand} />
          <Text style={styles.backTxt}>Velg en annen bedrift</Text>
        </TouchableOpacity>
        <View style={styles.pickedCard}>
          <Text style={styles.pickedName}>{pickedName}</Text>
          {pickedOrgnr ? <Text style={styles.meta}>Org.nr. {pickedOrgnr}</Text> : null}
          <View style={[styles.badge, (member || join) ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeTxt, (member || join) ? styles.badgeOnTxt : styles.badgeOffTxt]}>
              {(member || join) ? 'Finnes i ProTop' : 'Ikke i ProTop ennå'}
            </Text>
          </View>
        </View>
        {member ? (
          <>
            <Text style={styles.lead}>Du er allerede med i bedriften.</Text>
            <TouchableOpacity style={styles.primary} onPress={openMember} accessibilityRole="button">
              <Text style={styles.primaryTxt}>Åpne bedriften</Text>
            </TouchableOpacity>
          </>
        ) : join ? (
          <>
            <Text style={styles.lead}>
              Bedriften bruker ProTop. Be om tilgang, så får administratorene beskjed og kan invitere deg. Du godtar invitasjonen før du kommer inn.
            </Text>
            <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={askForAccess} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Be om tilgang</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.lead}>
              Bedriften er ikke registrert i ProTop. Du kan opprette den nå og blir administrator. Det er gratis.
            </Text>
            <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={createCompany} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>Opprett bedriften</Text>}
            </TouchableOpacity>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.title}>Be om innpass</Text>
        <Text style={styles.lead}>
          Søk opp bedriften i Brønnøysundregistrene. Finnes den i ProTop, ber du om tilgang. Finnes den ikke, kan du opprette den.
        </Text>
        <View style={styles.searchBox}>
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Firmanavn eller organisasjonsnummer"
            placeholderTextColor={colors.placeholder}
            autoFocus
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Søk i Brønnøysund"
            testID="company-join-search"
          />
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} pointerEvents="none" />
          {searching ? <ActivityIndicator size="small" color={colors.brand} style={styles.searchSpin} /> : null}
        </View>
        {searchError ? <Text style={styles.meta}>{searchError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView style={styles.hits} keyboardShouldPersistTaps="handled">
          {hits.map((hit) => (
            <TouchableOpacity
              key={hit.organisasjonsnummer}
              style={styles.hit}
              onPress={() => chooseHit(hit)}
              disabled={!!checkingId}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.hitName} numberOfLines={1}>{hit.navn}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {hit.organisasjonsnummerFormatted || hit.organisasjonsnummer}
                  {hit.organisasjonsform ? ` · ${hit.organisasjonsform}` : ''}
                  {hit.addressLabel ? ` · ${hit.addressLabel}` : ''}
                </Text>
              </View>
              {checkingId === hit.organisasjonsnummer
                ? <ActivityIndicator size="small" color={colors.brand} />
                : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.codeLink} onPress={useCode} accessibilityRole="button">
          <Text style={styles.codeLinkTxt}>Har du fått en kode fra administrator? Skriv inn kode</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onStartShouldSetResponder={() => true}>
          <TouchableOpacity style={styles.closeBtn} onPress={close} accessibilityLabel="Lukk" accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.muted} />
          </TouchableOpacity>
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 39, 68, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 10,
  },
  closeBtn: { position: 'absolute', top: 10, right: 10, padding: 6, zIndex: 1 },
  kicker: { fontSize: 12, fontWeight: '400', letterSpacing: 0.6, color: colors.brand, textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink, paddingRight: 28 },
  lead: { color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  error: { color: colors.danger, fontWeight: '400', fontSize: 13 },
  searchBox: { justifyContent: 'center' },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 38,
    paddingRight: 38,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  searchIcon: { position: 'absolute', left: 12 },
  searchSpin: { position: 'absolute', right: 12 },
  hits: { maxHeight: 340 },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hitName: { fontSize: 15, fontWeight: '400', color: colors.ink },
  codeLink: { alignSelf: 'flex-start', paddingVertical: 6 },
  codeLinkTxt: { color: colors.brandInk, fontWeight: '400', fontSize: 13 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  backTxt: { color: colors.brandInk, fontWeight: '400', fontSize: 13 },
  pickedCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  pickedName: { fontSize: 17, fontWeight: '400', color: colors.ink, paddingRight: 24 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  badgeOn: { backgroundColor: colors.brandSoft },
  badgeOff: { backgroundColor: colors.sunken },
  badgeTxt: { fontSize: 12, fontWeight: '400' },
  badgeOnTxt: { color: colors.brandInk },
  badgeOffTxt: { color: colors.muted },
  primary: {
    backgroundColor: colors.brandInk,
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  primaryTxt: { color: colors.onBrand, fontWeight: '400', fontSize: 15 },
  disabled: { opacity: 0.6 },
});
