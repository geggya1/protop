import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyProjectState, normalizeProjectState } from './engine.js';

const KEY = 'protop.projectPlatform.v1';

/** Modulminne — unngår ny AsyncStorage-parse ved hvert skjermbesøk. */
let memory = null;
let inflight = null;

export function peekProjectState() {
  return memory;
}

/** Synkroniser minne uten å vente på disk (brukes ved lokale mutasjoner). */
export function putProjectState(state) {
  memory = normalizeProjectState(state);
  return memory;
}

export async function loadProjectState({ force = false } = {}) {
  if (!force && memory) return memory;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        memory = emptyProjectState();
        return memory;
      }
      memory = normalizeProjectState(JSON.parse(raw));
      return memory;
    } catch {
      memory = emptyProjectState();
      return memory;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function saveProjectState(state) {
  const next = putProjectState(state);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Test/hjelper: tøm minne mellom tester. */
export function clearProjectStateMemory() {
  memory = null;
  inflight = null;
}
