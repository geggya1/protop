import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyProjectState, normalizeProjectState } from './engine.js';

const KEY = 'protop.projectPlatform.v1';

export async function loadProjectState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyProjectState();
    return normalizeProjectState(JSON.parse(raw));
  } catch {
    return emptyProjectState();
  }
}

export async function saveProjectState(state) {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}
