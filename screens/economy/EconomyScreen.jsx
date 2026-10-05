import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState, postEntry } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import IndeksreguleringPanel from '../project/IndeksreguleringPanel';

export default function EconomyScreen() {
  const colors = useColors();
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
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      <IndeksreguleringPanel project={project} onBook={project ? book : null} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 980, width: '100%', alignSelf: 'flex-start' },
});
