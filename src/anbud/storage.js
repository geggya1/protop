import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyAnbudState, normalizeAnbudState } from './model.js';

const KEY = 'protop.anbud.v1';

export async function loadAnbudState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyAnbudState();
    return normalizeAnbudState(JSON.parse(raw));
  } catch {
    return emptyAnbudState();
  }
}

export async function saveAnbudState(state) {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}
