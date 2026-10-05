import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState, postEntry } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import IndeksreguleringPanel from '../project/IndeksreguleringPanel';

const PAGES = [
  ['indeks', 'Indeksregulering'],
];

export default function EconomyScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [page, setPage] = useState('indeks');
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadProjectState().then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (ready) saveProjectState(state).catch(() => {});
  }, [state, ready]);

  const project = state.projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert') || null;

  function book(entry) {
    const booked = postEntry(state, entry);
    if (booked.ok) setState(booked.state);
    return booked;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }, wide && styles.wide]}>
      <ScrollView horizontal={!wide} style={wide ? styles.navWide : styles.nav} contentContainerStyle={styles.navContent}>
        {PAGES.map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setPage(id)} accessibilityRole="button">
            <Text style={[styles.navItem, { color: page === id ? colors.brand : colors.muted }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        {page === 'indeks' ? (
          <IndeksreguleringPanel project={project} onBook={project ? book : null} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wide: { flexDirection: 'row' },
  nav: { maxHeight: 48, flexGrow: 0 },
  navWide: { width: 180, flexGrow: 0 },
  navContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 14, alignItems: 'flex-start' },
  navItem: { fontWeight: '400', fontSize: 15 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 48, maxWidth: 980, width: '100%', alignSelf: 'flex-start' },
});
