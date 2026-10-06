import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import {
  applyCustomerKind,
  companyFollowUpPeople,
  customerDraftFromBrreg,
  filterCustomers,
  formatOrgnr,
  identityFieldsForKind,
  importCustomers,
  maskPersonnummer,
  normalizeOrgnr,
  ownerLabel,
  upsertCustomer,
} from '../../src/anbud/customers';
import { CUSTOMER_IMPORT_ACCEPT } from '../../src/anbud/customerImport';
import { readCustomerImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { formatNok } from '../../src/anbud/model';
import { formatNumberId } from '../../src/anbud/numbering';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';
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

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

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

export default function CustomersScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, requestShellTab, shellIntent, clearShellIntent, members } = useApp();
  const [state, setState] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const lookupRef = useRef('');

  useEffect(() => {
    loadAnbudState(familyId).then(setState);
  }, [familyId]);

  useEffect(() => {
    if (shellIntent?.type === 'openCustomer' && shellIntent.customerId) {
      setSelectedId(shellIntent.customerId);
      setView('detail');
      clearShellIntent?.();
    }
  }, [shellIntent, clearShellIntent]);

  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);

  useEffect(() => {
    if (view !== 'edit' || form.kind !== 'org') {
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
  }, [view, form.kind, form.name, orgnrDigits]);

  const customers = state?.customers || [];
  const contracts = state?.contracts || [];
  const followPeople = companyFollowUpPeople(members);
  const visible = useMemo(() => filterCustomers(customers, query), [customers, query]);
  const selected = customers.find((row) => row.id === selectedId) || null;
  const related = selected
    ? contracts.filter((row) => row.customerId === selected.id || (!row.customerId && row.buyer && row.buyer.toLowerCase() === selected.name.toLowerCase()))
    : [];
  const identity = identityFieldsForKind(form.kind);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
    setError('');
  }

  function setKind(kind) {
    lookupRef.current = '';
    setHits([]);
    setForm((current) => applyCustomerKind(current, kind));
  }

  async function save() {
    const loaded = await loadAnbudState(familyId);
    const result = upsertCustomer(loaded, {
      ...form,
      id: view === 'edit' && selected ? selected.id : form.id,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = await saveAnbudState(result.state, familyId);
    setState(saved);
    setSelectedId(result.customer.id);
    setView('detail');
    setNote('Kunden er lagret.');
    setError('');
  }

  function startNew() {
    lookupRef.current = '';
    setHits([]);
    setForm(EMPTY);
    setSelectedId('');
    setView('edit');
    setNote('');
    setError('');
  }

  function startEdit(customer) {
    lookupRef.current = normalizeOrgnr(customer.orgnr);
    setHits([]);
    setForm({
      ...EMPTY,
      ...customer,
      id: customer.id,
    });
    setSelectedId(customer.id);
    setView('edit');
  }

  function chooseHit(hit) {
    lookupRef.current = hit.organisasjonsnummer || '';
    setForm((current) => fillFromBrreg(current, hit));
    setHits([]);
    setNote('Feltene er fylt fra Brønnøysund. Kontroller og lagre.');
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: CUSTOMER_IMPORT_ACCEPT });
    if (!file) return;
    setImporting(true);
    try {
      const bytes = await bytesFromFile(file);
      const interpreted = await readCustomerImport(bytes, file.name, {
        familyId,
        ask: (payload) => askImportInterpret(payload),
      });
      const rows = interpreted.rows;
      const loaded = await loadAnbudState(familyId);
      const result = importCustomers(loaded, rows);
      if (!result.created.length && !result.skipped.length) {
        setError(result.error || 'Fant ingen kunder i filen.');
        return;
      }
      const saved = await saveAnbudState(result.state, familyId);
      setState(saved);
      const parts = [];
      if (result.created.length) parts.push(`${result.created.length} nye`);
      if (result.skipped.length) parts.push(`${result.skipped.length} fantes fra før`);
      if (result.errors.length) parts.push(`${result.errors.length} uten navn hoppet over`);
      const understood = interpreted.engine && interpreted.engine !== 'lokal'
        ? (interpreted.engine.includes('ocr') ? ' Dokumentet er lest med OCR og AI.' : ' Ukjente kolonner er tolket med AI.')
        : '';
      setNote(`Importert: ${parts.join(', ')}.${understood}`);
      setView('list');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese kundelisten.'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.ink }]}>
        {view === 'detail' && selected ? selected.name : 'Kunder'}
      </Text>
      {view === 'list' ? (
        <Text style={{ color: colors.muted }}>
          Hurtig registrering med org.nr og Brønnøysund. Privatkunder bruker personnummer, ikke organisasjonsnummer.
        </Text>
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      {view === 'list' ? (
        <>
          <View style={styles.row}>
            <TouchableOpacity onPress={startNew} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Ny kunde</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={importFile}
              disabled={importing}
              accessibilityRole="button"
              style={[styles.save, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>{importing ? 'Tolker filen…' : 'Importer fil'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            CSV, Excel, PDF eller bilde. Kjente kolonner leses direkte. Ukjente kolonner og skannede lister tolkes med OCR og AI.
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i navn, org.nr, kontakt"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          {!customers.length ? (
            <Text style={{ color: colors.muted }}>Ingen kunder er registrert ennå.</Text>
          ) : null}
          {visible.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => { setSelectedId(row.id); setView('detail'); }}
              accessibilityRole="button"
              style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
              <Text style={{ color: colors.muted }}>
                {[
                  row.kind === 'person' ? 'Privatkunde' : 'Virksomhet',
                  row.kind === 'person' ? maskPersonnummer(row.personnummer) : formatOrgnr(row.orgnr),
                  row.contactName,
                  ownerLabel(row, followPeople),
                  row.place,
                ].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {view === 'edit' ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{form.id ? 'Endre kunde' : 'Ny kunde'}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setKind('org')} accessibilityRole="button">
              <Text style={{ color: form.kind === 'org' ? colors.brand : colors.ink }}>Virksomhet</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKind('person')} accessibilityRole="button">
              <Text style={{ color: form.kind === 'person' ? colors.brand : colors.ink }}>Privatkunde</Text>
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
                value={form[key]}
                onChangeText={(value) => patch({ [key]: value })}
                placeholder={key === 'orgnr' ? 'Ni siffer eller søk på navn over' : ''}
                placeholderTextColor={colors.placeholder}
                keyboardType={key === 'orgnr' || key === 'personnummer' || key === 'postalCode' || key === 'phone' ? 'number-pad' : 'default'}
                multiline={key === 'notes'}
                style={[styles.input, key === 'notes' && { minHeight: 80 }, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
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
            people={followPeople}
            value={form.ownerUid}
            onChange={(person) => patch({
              ownerUid: person ? (person.uid || person.id) : '',
              ownerName: person ? person.name : '',
            })}
          />
          <View style={styles.row}>
            <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Lagre kunde</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView(selected ? 'detail' : 'list')} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {view === 'detail' && selected ? (
        <View style={{ gap: 12 }}>
          <TouchableOpacity onPress={() => setView('list')} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Til kundelisten</Text>
          </TouchableOpacity>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Kundeforhold</Text>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '600' }}>{selected.name}</Text>
            <Text style={{ color: colors.ink }}>{selected.kind === 'person' ? 'Privatkunde' : 'Virksomhet'}</Text>
            {selected.kind !== 'person' && selected.orgnr ? <Text style={{ color: colors.ink }}>Org.nr {formatOrgnr(selected.orgnr)}</Text> : null}
            {selected.kind === 'person' && selected.personnummer ? <Text style={{ color: colors.ink }}>Personnummer {maskPersonnummer(selected.personnummer)}</Text> : null}
            {selected.address ? <Text style={{ color: colors.ink }}>{selected.address}</Text> : null}
            {selected.place ? <Text style={{ color: colors.ink }}>{[selected.postalCode, selected.place].filter(Boolean).join(' ')}</Text> : null}
            {selected.contactName ? <Text style={{ color: colors.ink }}>Kontakt {selected.contactName}</Text> : null}
            {selected.email ? <Text style={{ color: colors.ink }}>{selected.email}</Text> : null}
            {selected.phone ? <Text style={{ color: colors.ink }}>{selected.phone}</Text> : null}
            {ownerLabel(selected, followPeople) ? (
              <Text style={{ color: colors.ink }}>Ansvarlig {ownerLabel(selected, followPeople)}</Text>
            ) : (
              <Text style={{ color: colors.muted }}>Ingen ansvarlig er tildelt.</Text>
            )}
            <OwnerPicker
              colors={colors}
              people={followPeople}
              value={selected.ownerUid}
              onChange={async (person) => {
                const loaded = await loadAnbudState(familyId);
                const result = upsertCustomer(loaded, {
                  ...selected,
                  ownerUid: person ? (person.uid || person.id) : '',
                  ownerName: person ? person.name : '',
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                const saved = await saveAnbudState(result.state, familyId);
                setState(saved);
                setNote(person ? `Ansvarlig: ${person.name}.` : 'Ansvarlig er fjernet.');
              }}
            />
            {selected.notes ? <Text style={{ color: colors.muted }}>{selected.notes}</Text> : null}
            <TouchableOpacity onPress={() => startEdit(selected)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Endre kunde</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Avtaler</Text>
            {related.length ? related.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => requestShellTab?.('kontrakt', null, { type: 'openContract', contractId: row.id })}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.ink }}>{kindLabel(row.kind) || 'Avtale'} · {row.title}</Text>
                <Text style={{ color: colors.muted }}>
                  {[formatNumberId(row.systemId) && `System ${formatNumberId(row.systemId)}`, formatNumberId(row.oppdragId) && `Oppdrag ${formatNumberId(row.oppdragId)}`].filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {[row.start, row.end].filter(Boolean).join(' – ') || 'Uten periode'}
                  {row.value ? ` · ${formatNok(row.value)}` : ''}
                </Text>
              </TouchableOpacity>
            )) : <Text style={{ color: colors.muted }}>Ingen avtaler er knyttet til kunden ennå.</Text>}
            <TouchableOpacity
              onPress={() => requestShellTab?.('kontrakt', null, { type: 'composeAgreement', customerId: selected.id })}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand }}>Registrer avtale</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  title: { fontSize: 22, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  hit: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, backgroundColor: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
});
