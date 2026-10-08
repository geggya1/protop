import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { ISO_STANDARDS } from '../../src/project/catalog';
import {
  addAudit,
  emptyProjectState,
  selectProject,
} from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';

function Field({ label, value, onChangeText, colors }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

export default function IsoScreen() {
  const colors = useColors();
  const { familyId } = useApp();
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [standard, setStandard] = useState('ISO 9001');
  const [findings, setFindings] = useState('');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state, familyId).catch(() => setError('Kunne ikke lagre lokalt.'));
  }, [state, ready, familyId]);

  const project = state.projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert') || null;
  const activeProjects = state.projects.filter((item) => item.status !== 'arkivert');
  const audits = project
    ? state.audits.filter((row) => row.projectId === project.id)
    : [];

  function run(result) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setState(result.state);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Text style={[styles.h2, { color: colors.ink }]}>Prosedyrer</Text>
      {state.procedures.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>{row.id} {row.title}</Text>
          <Text style={{ color: colors.muted }}>{row.iso}</Text>
          <Text style={{ color: colors.ink }}>{row.body}</Text>
        </View>
      ))}

      <Text style={[styles.h2, { color: colors.ink }]}>Revisjon</Text>
      {activeProjects.length ? (
        <View style={styles.rowWrap}>
          {activeProjects.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => run(selectProject(state, item.id))}
              accessibilityRole="button"
              style={[
                styles.chip,
                {
                  borderColor: project?.id === item.id ? colors.brand : colors.line,
                  backgroundColor: project?.id === item.id ? colors.brandSoft : colors.card,
                },
              ]}
            >
              <Text style={{ color: colors.ink }}>{item.number} {item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Opprett et prosjekt under Prosjekt for å knytte revisjoner til et oppdrag.</Text>
      )}

      {project ? (
        <>
          <View style={styles.rowWrap}>
            {ISO_STANDARDS.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setStandard(item)}
                accessibilityRole="button"
                style={[
                  styles.chip,
                  {
                    borderColor: standard === item ? colors.brand : colors.line,
                    backgroundColor: standard === item ? colors.brandSoft : colors.card,
                  },
                ]}
              >
                <Text style={{ color: colors.ink }}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="Funn" value={findings} onChangeText={setFindings} colors={colors} />
          <TouchableOpacity
            onPress={() => {
              run(addAudit(state, { standard, findings }));
              setFindings('');
            }}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Registrer revisjon</Text>
          </TouchableOpacity>
          {audits.map((row) => (
            <Text key={row.id} style={{ color: colors.ink }}>{row.standard}: {row.findings}</Text>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'flex-start' },
  title: { fontSize: 22, fontWeight: '400' },
  h2: { fontSize: 16, fontWeight: '400', marginTop: 8 },
  field: { gap: 4 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  btn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
});
