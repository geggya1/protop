import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollSheet from '../../components/ScrollSheet';

function matches(projects, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('nb-NO');
  const rows = Array.isArray(projects) ? projects : [];
  if (!needle) return rows.slice(0, 12);
  return rows.filter((project) => {
    const hay = `${project.name || ''} ${project.number || ''} ${project.place || ''}`.toLocaleLowerCase('nb-NO');
    return hay.includes(needle);
  });
}

export default function AgreementProjectField({
  colors,
  projects = [],
  projectId = '',
  onSelect,
  suggested = false,
}) {
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const selected = projects.find((row) => row.id === projectId) || null;
  const shown = useMemo(() => matches(projects, query).slice(0, 12), [projects, query]);
  const total = useMemo(() => matches(projects, query).length, [projects, query]);

  function closeSheet() {
    setSheet(false);
    setQuery('');
  }

  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        nativeID="agreement-project-open"
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Prosjekt ${selected.name}` : 'Koble til prosjekt'}
        style={[styles.trigger, {
          borderColor: suggested ? '#d4a017' : colors.line,
          backgroundColor: suggested ? '#fff4cc' : colors.bg,
        }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: suggested ? '#8a5a00' : colors.muted, fontSize: 13 }}>
            {suggested ? 'Koble til prosjekt · forslag' : 'Koble til prosjekt'}
          </Text>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            {selected ? selected.name : 'Søk eller bla blant prosjekter'}
          </Text>
          {selected?.place ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>{selected.place}</Text>
          ) : null}
        </View>
        <Text style={{ color: colors.brand }}>{selected ? 'Endre' : 'Velg'}</Text>
      </TouchableOpacity>
      {selected ? (
        <TouchableOpacity
          onPress={() => onSelect?.(null)}
          accessibilityRole="button"
          accessibilityLabel="Fjern prosjektkobling"
        >
          <Text style={{ color: colors.brand }}>Ingen prosjektkobling</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollSheet visible={sheet} title="Prosjekt" onClose={closeSheet} placement="center">
        <View style={{ gap: 8 }}>
          <TextInput
            nativeID="agreement-project-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på prosjektnavn eller sted"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TouchableOpacity
            onPress={() => { onSelect?.(null); closeSheet(); }}
            accessibilityRole="button"
            style={[styles.result, { borderColor: colors.line, borderWidth: 1, borderRadius: 10 }]}
          >
            <Text style={{ color: projectId ? colors.muted : colors.brand, fontWeight: '600' }}>Ingen prosjektkobling</Text>
          </TouchableOpacity>
          {shown.length ? (
            <View nativeID="agreement-project-results" style={[styles.results, { borderColor: colors.line, backgroundColor: colors.card }]}>
              {shown.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  onPress={() => {
                    onSelect?.(project);
                    closeSheet();
                  }}
                  accessibilityRole="button"
                  style={[styles.result, { borderBottomColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink }}>{project.name}</Text>
                  {project.place || project.number ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      {[project.number, project.place].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              {total > shown.length ? (
                <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>
                  {`Viser ${shown.length} av ${total}. Skriv mer for å snevre inn.`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>
              {projects.length ? 'Ingen prosjekt treffer søket.' : 'Ingen prosjekter er opprettet ennå.'}
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
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
