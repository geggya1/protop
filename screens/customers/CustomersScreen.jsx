import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { filterCustomers, formatOrgnr, maskPersonnummer, upsertCustomer } from '../../src/anbud/customers';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { formatNok } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';

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
};

export default function CustomersScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const [state, setState] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

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

  const customers = state?.customers || [];
  const contracts = state?.contracts || [];
  const visible = useMemo(() => filterCustomers(customers, query), [customers, query]);
  const selected = customers.find((row) => row.id === selectedId) || null;
  const related = selected
    ? contracts.filter((row) => row.customerId === selected.id || (!row.customerId && row.buyer && row.buyer.toLowerCase() === selected.name.toLowerCase()))
    : [];

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
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
    setForm(EMPTY);
    setSelectedId('');
    setView('edit');
    setNote('');
    setError('');
  }

  function startEdit(customer) {
    setForm({
      ...EMPTY,
      ...customer,
      id: customer.id,
    });
    setSelectedId(customer.id);
    setView('edit');
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <Text style={[styles.title, { color: colors.ink }]}>
        {view === 'detail' && selected ? selected.name : 'Kunder'}
      </Text>
      {view === 'list' ? (
        <Text style={{ color: colors.muted }}>
          Kunderegister for bedriften. Nye avtaler kan foreslå å opprette kunden når org.nr eller personnummer ikke finnes fra før.
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
          </View>
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
                {[row.kind === 'person' ? 'Privatkunde' : 'Virksomhet', formatOrgnr(row.orgnr), row.contactName, row.place].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {view === 'edit' ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{form.id ? 'Endre kunde' : 'Ny kunde'}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => patch({ kind: 'org' })} accessibilityRole="button">
              <Text style={{ color: form.kind === 'org' ? colors.brand : colors.ink }}>Virksomhet</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => patch({ kind: 'person' })} accessibilityRole="button">
              <Text style={{ color: form.kind === 'person' ? colors.brand : colors.ink }}>Privatkunde</Text>
            </TouchableOpacity>
          </View>
          {[
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
          ].map(([key, label]) => (
            <View key={key} style={{ gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
              <TextInput
                value={form[key]}
                onChangeText={(value) => patch({ [key]: value })}
                placeholder=""
                placeholderTextColor={colors.placeholder}
                multiline={key === 'notes'}
                style={[styles.input, key === 'notes' && { minHeight: 80 }, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ))}
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
            {selected.orgnr ? <Text style={{ color: colors.ink }}>Org.nr {formatOrgnr(selected.orgnr)}</Text> : null}
            {selected.personnummer ? <Text style={{ color: colors.ink }}>Personnummer {maskPersonnummer(selected.personnummer)}</Text> : null}
            {selected.address ? <Text style={{ color: colors.ink }}>{selected.address}</Text> : null}
            {selected.place ? <Text style={{ color: colors.ink }}>{[selected.postalCode, selected.place].filter(Boolean).join(' ')}</Text> : null}
            {selected.contactName ? <Text style={{ color: colors.ink }}>Kontakt {selected.contactName}</Text> : null}
            {selected.email ? <Text style={{ color: colors.ink }}>{selected.email}</Text> : null}
            {selected.phone ? <Text style={{ color: colors.ink }}>{selected.phone}</Text> : null}
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
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, backgroundColor: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
});
