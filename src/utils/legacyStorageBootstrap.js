/**
 * Importeres først i index.js, før noe annet leser lagringen. Innstillinger lagret
 * før ProTop flyttes til nye nøkkelnavn, så ingen mister oppsett eller valg.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateLegacyAsyncStorage, migrateLegacyStorageKeys } from './legacyNames.js';

if (Platform.OS === 'web') {
  try { migrateLegacyStorageKeys(globalThis.localStorage); } catch { /* blokkert lagring */ }
  try { migrateLegacyStorageKeys(globalThis.sessionStorage); } catch { /* blokkert lagring */ }
} else {
  migrateLegacyAsyncStorage(AsyncStorage);
}
