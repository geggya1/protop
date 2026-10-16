import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollSheet from '../../components/ScrollSheet';
import { personOwnsId } from '../../src/anbud/customers';

const BROWSE_LIMIT = 40;

function listedPeople(people, query) {
  const rows = Array.isArray(people) ? people : [];
  const needle = String(query || '').trim().toLocaleLowerCase('nb-NO');
  if (!needle) return rows;
  return rows.filter((person) => String(person.name || '').toLocaleLowerCase('nb-NO').includes(needle));
}

export default function AgreementPersonField({
  colors,
  people = [],
  ownerUid = '',
  onSelect,
  label = 'Ansvarlig',
  placeholder = 'Søk eller bla blant aktive ansatte',
  suggested = false,
}) {
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const selected = people.find((person) => personOwnsId(person, ownerUid)) || null;
  const listed = useMemo(() => listedPeople(people, query), [people, query]);
  const shown = listed.filter((_, index) => index < BROWSE_LIMIT);
  const total = listed.length;

  function closeSheet() {
    setSheet(false);
    setQuery('');
  }

  return (
    <View style={{ gap: 8, flexBasis: '100%' }}>
      <TouchableOpacity
        nativeID="agreement-person-open"
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label} ${selected.name}` : placeholder}
        style={[styles.trigger, {
          borderColor: suggested ? '#d4a017' : colors.line,
          backgroundColor: suggested ? '#fff4cc' : colors.bg,
        }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: suggested ? '#8a5a00' : colors.muted, fontSize: 13 }}>
            {suggested ? `${label} · forslag` : label}
          </Text>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected ? selected.name : placeholder}</Text>
        </View>
        <Text style={{ color: colors.brand }}>{selected ? 'Endre' : 'Søk'}</Text>
      </TouchableOpacity>
      {selected ? (
        <TouchableOpacity
          onPress={() => onSelect?.(null)}
          accessibilityRole="button"
          accessibilityLabel={`Fjern ${label.toLowerCase()}`}
        >
          <Text style={{ color: colors.brand }}>{`Fjern ${label.toLowerCase()}`}</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollSheet visible={sheet} title={label} onClose={closeSheet} placement="center">
        <View style={{ gap: 8 }}>
          <TextInput
            nativeID="agreement-person-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på navn"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          {shown.length ? (
            <View nativeID="agreement-person-results" style={[styles.results, { borderColor: colors.line, backgroundColor: colors.card }]}>
              {shown.map((person) => (
                <TouchableOpacity
                  key={person.uid || person.id}
                  onPress={() => {
                    onSelect?.(person);
                    closeSheet();
                  }}
                  accessibilityRole="button"
                  style={[styles.result, { borderBottomColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink }}>{person.name}</Text>
                </TouchableOpacity>
              ))}
              {total > shown.length ? (
                <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>
                  {`Viser ${shown.length} av ${total} aktive. Skriv for å snevre inn.`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>
              {query.trim() ? 'Ingen aktive ansatte treffer søket.' : 'Ingen aktive ansatte å velge blant.'}
            </Text>
          )}
        </View>
      </ScrollSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 },
  trigger: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
