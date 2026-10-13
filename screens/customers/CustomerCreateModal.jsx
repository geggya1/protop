import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import {
  applyCustomerKind,
  customerDraftFromBrreg,
  identityFieldsForKind,
  nextCustomerNumber,
  normalizeOrgnr,
  upsertCustomer,
  withCustomerNumbers,
} from '../../src/anbud/customers';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import OwnerPicker from '../anbud/OwnerPicker';

const EMPTY = {
  name: '',
  kind: 'org',
  orgnr: '',
  personnummer: '',
  address: '',
  place: '',
  postalCode: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
  ownerUid: '',
  ownerName: '',
};

const FORM_FIELDS = [
  ['name', 'Navn'],
  ['orgnr', 'Organisasjonsnummer'],
  ['personnummer', 'Personnummer'],
  ['address', 'Adresse'],
  ['postalCode', 'Postnummer'],
  ['place', 'Sted'],
  ['contactName', 'Kontaktperson'],
  ['email', 'E-post'],
  ['phone', 'Telefon'],
  ['notes', 'Notat'],
];

function fillFromBrreg(current, hit) {
  const draft = customerDraftFromBrreg(hit);
  if (!draft) return current;
  const take = (key) => current[key] || draft[key] || '';
  return applyCustomerKind({
    ...current,
    name: draft.name || current.name,
    orgnr: draft.orgnr || current.orgnr,
    address: take('address'),
    postalCode: take('postalCode'),
    place: take('place'),
    email: take('email'),
    phone: take('phone'),
    notes: current.notes || draft.notes,
  }, 'org');
}

export default function CustomerCreateModal({
  visible,
  onClose,
  onSaved,
  colors,
  companyId,
  customers = [],
  people = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [clash, setClash] = useState(null);
  const lookupRef = useRef('');
  const loadedRef = useRef(null);
  const identity = identityFieldsForKind(form.kind);
  const upcomingNumber = nextCustomerNumber(withCustomerNumbers(customers));
  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);

  useEffect(() => {
    if (!visible) return undefined;
    lookupRef.current = '';
    setForm(EMPTY);
    setHits([]);
    setError('');
    setNote('');
    setClash(null);
    setBusy(false);
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || form.kind !== 'org') {
      setHits([]);
      return undefined;
    }
    const q = orgnrDigits.length === 9 ? orgnrDigits : form.name.trim();
    if (q.length < 2) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchBrregCompanies(q, { size: 8 });
        if (!live) return;
        setHits(res.results || []);
        const exact = (res.results || []).find((row) => row.organisasjonsnummer === orgnrDigits);
        if (exact && lookupRef.current !== orgnrDigits) {
          lookupRef.current = orgnrDigits;
          setForm((current) => fillFromBrreg(current, exact));
          setNote('Feltene er fylt fra Brønnøysund. Kontroller og lagre.');
        }
      } catch (cause) {
        if (live) setHits([]);
        if (live && orgnrDigits.length === 9) {
          setError(cause?.message || 'Søket mot Brønnøysund feilet.');
        }
      } finally {
        if (live) setSearching(false);
      }
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, form.kind, form.name, orgnrDigits]);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
    setError('');
    setClash(null);
  }

  function setKind(kind) {
    lookupRef.current = '';
    setHits([]);
    setForm((current) => applyCustomerKind(current, kind));
  }

  function chooseHit(hit) {
    lookupRef.current = hit.organisasjonsnummer || '';
    setForm((current) => fillFromBrreg(current, hit));
    setHits([]);
    setNote('Feltene er fylt fra Brønnøysund. Kontroller og lagre.');
  }

  function useExisting() {
    if (!clash) return;
    onSaved?.(clash, loadedRef.current);
  }

  async function save() {
    if (busy) return;
    if (!companyId) {
      setError('Kunne ikke lagre kunden.');
      return;
    }
    setBusy(true);
    setError('');
    setClash(null);
    try {
      const loaded = await loadAnbudState(companyId);
      loadedRef.current = loaded;
      const result = upsertCustomer(loaded, form);
      if (!result.ok) {
        setError(result.error || 'Kunne ikke lagre kunden.');
        setClash(result.customer || null);
        return;
      }
      const saved = await saveAnbudState(result.state, companyId);
      onSaved?.(result.customer, saved);
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lagre kunden.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Lukk" />
        <View
          nativeID="customer-create-modal"
          accessibilityRole="dialog"
          accessibilityLabel="Ny kunde"
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Ny kunde</Text>
            <TouchableOpacity
              nativeID="customer-create-close"
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
            >
              <Text style={{ color: colors.brand }}>Lukk</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ color: colors.ink }}>{`Kundenummer ${upcomingNumber}`}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Nummeret følger rekkefølgen. En ny kunde får automatisk neste ledige.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setKind('org')} accessibilityRole="button">
                <Text style={{ color: form.kind === 'org' ? colors.brand : colors.ink, fontWeight: form.kind === 'org' ? '600' : '400' }}>Virksomhet</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setKind('person')} accessibilityRole="button">
                <Text style={{ color: form.kind === 'person' ? colors.brand : colors.ink, fontWeight: form.kind === 'person' ? '600' : '400' }}>Privatkunde</Text>
              </TouchableOpacity>
            </View>
            {form.kind === 'org' ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Skriv ni siffer i org.nr, eller firmanavn, så hentes navn og adresse fra Brønnøysund.
              </Text>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Privatkunder registreres med personnummer. Organisasjonsnummer brukes ikke.
              </Text>
            )}
            {FORM_FIELDS.filter(([key]) => {
              if (key === 'orgnr') return identity.orgnr;
              if (key === 'personnummer') return identity.personnummer;
              return true;
            }).map(([key, label]) => (
              <View key={key} style={{ gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
                <TextInput
                  nativeID={`customer-create-${key}`}
                  value={form[key]}
                  onChangeText={(value) => patch({ [key]: value })}
                  placeholder={key === 'orgnr' ? 'Ni siffer' : key === 'name' ? 'Firmanavn eller person' : ''}
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize={key === 'email' ? 'none' : 'sentences'}
                  keyboardType={key === 'orgnr' || key === 'personnummer' || key === 'postalCode' || key === 'phone' ? 'number-pad' : 'default'}
                  multiline={key === 'notes'}
                  style={[inputStyle, key === 'notes' && { minHeight: 72 }]}
                />
              </View>
            ))}
            {form.kind === 'org' && (searching || hits.length) ? (
              <View style={{ gap: 8 }}>
                <View style={styles.row}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Brønnøysund</Text>
                  {searching ? <ActivityIndicator size="small" color={colors.brand} /> : null}
                </View>
                {hits.slice(0, 6).map((hit) => (
                  <TouchableOpacity
                    key={hit.organisasjonsnummer || hit.navn}
                    onPress={() => chooseHit(hit)}
                    accessibilityRole="button"
                    style={[styles.hit, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>{hit.navn}</Text>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      {[hit.organisasjonsnummerFormatted || hit.organisasjonsnummer, hit.organisasjonsform, hit.addressLabel].filter(Boolean).join(' · ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <OwnerPicker
              colors={colors}
              people={people}
              value={form.ownerUid}
              label="Ansvarlig for kunden"
              onChange={(person) => patch({
                ownerUid: person ? (person.uid || person.id) : '',
                ownerName: person ? person.name : '',
              })}
            />
            {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
            {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
            {clash ? (
              <TouchableOpacity onPress={useExisting} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.brand }]}>
                <Text style={{ color: colors.brand, fontWeight: '600' }}>{`Velg ${clash.name}`}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <TouchableOpacity onPress={onClose} disabled={busy} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              nativeID="customer-create-save"
              onPress={save}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.save, { backgroundColor: colors.brand, opacity: busy ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre kunde</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 39, 68, 0.55)' },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: Platform.OS === 'web' ? '90vh' : '92%',
    borderWidth: 1,
    borderRadius: 12,
    paddingTop: 16,
    zIndex: 1,
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)' } : {}),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  form: { gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  hit: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 120, alignItems: 'center' },
});
