import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollSheet from '../../components/ScrollSheet';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, SUGGESTION_MARK } from '../../src/anbud/agreementSuggestions';
import { customerDraftFromBrreg, formatOrgnr, rankCustomerMatches } from '../../src/anbud/customers';
import { searchBrregCompanies } from '../../src/utils/boligmappaApis';
import CustomerCreateModal from '../customers/CustomerCreateModal';

function meta(item) {
  return [
    item.customerNumber ? `Kundenr ${item.customerNumber}` : '',
    item.kind === 'person' ? 'Privatkunde' : (formatOrgnr(item.orgnr) || 'Virksomhet'),
    item.place || '',
  ].filter(Boolean).join(' · ');
}

export default function AgreementCustomerField({
  colors,
  customers = [],
  customerId = '',
  companyId,
  people = [],
  onSelect,
  onSavedState,
  onBrregDraft,
  label = 'Kunde',
  suggested = false,
  attention = false,
  proposal = '',
}) {
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState('org');
  const [createDraft, setCreateDraft] = useState(null);
  const [brregHits, setBrregHits] = useState([]);
  const [brregSearching, setBrregSearching] = useState(false);
  const selected = customers.find((row) => row.id === customerId) || null;
  const matches = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];
    return rankCustomerMatches(customers, needle);
  }, [customers, query]);
  const shown = matches.slice(0, 8);

  useEffect(() => {
    const needle = query.trim();
    if (!sheet || needle.length < 2) {
      setBrregHits([]);
      setBrregSearching(false);
      return undefined;
    }
    let live = true;
    setBrregSearching(true);
    const timer = setTimeout(() => {
      searchBrregCompanies(needle, { size: 6 }).then((res) => {
        if (!live) return;
        setBrregHits(res.results || []);
      }).catch(() => {
        if (live) setBrregHits([]);
      }).finally(() => {
        if (live) setBrregSearching(false);
      });
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, sheet]);

  function closeSheet() {
    setSheet(false);
    setQuery('');
    setBrregHits([]);
  }

  function pickBrreg(hit) {
    const draft = customerDraftFromBrreg(hit);
    if (!draft) return;
    const existing = customers.find((row) => formatOrgnr(row.orgnr) === formatOrgnr(draft.orgnr));
    if (existing) {
      onSelect?.(existing);
      onBrregDraft?.(draft, existing);
      closeSheet();
      return;
    }
    // Uten onBrregDraft: åpne opprettelse med Brreg-data i stedet for å nullstille valget.
    if (!onBrregDraft) {
      closeSheet();
      setCreateKind('org');
      setCreateDraft(draft);
      setCreateOpen(true);
      return;
    }
    onBrregDraft(draft, null);
    closeSheet();
  }

  function openCreate(kind) {
    closeSheet();
    setCreateKind(kind);
    setCreateDraft(null);
    setCreateOpen(true);
  }

  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        nativeID="agreement-customer-open"
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Kunde ${selected.name}` : 'Søk opp kunde'}
        style={[styles.trigger, {
          borderColor: suggested || attention ? FOCUS_FIELD_BORDER : colors.line,
          backgroundColor: suggested || attention ? FOCUS_FIELD_BG : colors.bg,
        }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: suggested ? '#8a5a00' : colors.muted, fontSize: 13 }}>{label}</Text>
          {suggested ? <Text style={styles.mark}>{SUGGESTION_MARK}</Text> : null}
          <Text style={{ color: colors.ink }}>{selected ? selected.name : (proposal || 'Søk i kunder eller Brønnøysund')}</Text>
          {selected ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {[meta(selected), selected.email].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.brand }}>{selected ? 'Endre' : 'Søk'}</Text>
      </TouchableOpacity>
      {selected ? (
        <TouchableOpacity
          onPress={() => onSelect?.(null)}
          accessibilityRole="button"
          accessibilityLabel="Fjern valgt kunde"
        >
          <Text style={{ color: colors.brand }}>Fjern kunde</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollSheet visible={sheet} title="Kunde" onClose={closeSheet} placement="center">
        <View style={{ gap: 8 }}>
          <TextInput
            nativeID="agreement-customer-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på navn, org.nr eller kundenummer"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              nativeID="agreement-customer-new"
              onPress={() => openCreate('org')}
              accessibilityRole="button"
              style={[styles.create, { borderColor: colors.brand }]}
            >
              <Text style={{ color: colors.brand }}>Ny kunde</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openCreate('person')}
              accessibilityRole="button"
              style={[styles.create, { borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>Privatkunde</Text>
            </TouchableOpacity>
          </View>
          {query.trim() ? (
            <>
              {shown.length ? (
                <View nativeID="agreement-customer-results" style={[styles.results, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingTop: 8 }}>I kunderegisteret</Text>
                  {shown.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        onSelect?.(item);
                        closeSheet();
                      }}
                      accessibilityRole="button"
                      style={[styles.result, { borderBottomColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink }}>{item.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>{meta(item)}</Text>
                    </TouchableOpacity>
                  ))}
                  {matches.length > shown.length ? (
                    <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>
                      {`Viser ${shown.length} av ${matches.length}. Skriv mer for å snevre inn.`}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ color: colors.muted }}>Ingen treff i kunderegisteret.</Text>
              )}
              {brregSearching ? <Text style={{ color: colors.muted }}>Søker i Brønnøysund…</Text> : null}
              {brregHits.length ? (
                <View style={[styles.results, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingTop: 8 }}>Brønnøysundregistrene</Text>
                  {brregHits.map((hit) => (
                    <TouchableOpacity
                      key={hit.organisasjonsnummer}
                      onPress={() => pickBrreg(hit)}
                      accessibilityRole="button"
                      style={[styles.result, { borderBottomColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink }}>{hit.navn}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>
                        {[formatOrgnr(hit.organisasjonsnummer), hit.forretningsadresse?.poststed || hit.postadresse?.poststed || ''].filter(Boolean).join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Søk blant eksisterende kunder, eller i Brønnøysund. Privatkunde registreres via knappen over. Systemet sjekker om kunden finnes før opprettelse.
            </Text>
          )}
        </View>
      </ScrollSheet>
      <CustomerCreateModal
        visible={createOpen}
        colors={colors}
        companyId={companyId}
        customers={customers}
        people={people}
        initialKind={createKind}
        initialDraft={createDraft}
        onClose={() => { setCreateOpen(false); setCreateDraft(null); }}
        onSaved={(customer, saved) => {
          if (saved) onSavedState?.(saved);
          if (customer) onSelect?.(customer);
          setQuery('');
          setCreateDraft(null);
          setCreateOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  create: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', flexGrow: 1 },
  trigger: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  mark: {
    alignSelf: 'flex-start',
    color: '#8a5a00',
    fontSize: 11,
    fontWeight: '700',
  },
});
