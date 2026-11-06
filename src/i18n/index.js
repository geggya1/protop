import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACTIVE_LANGS, LANGS, LANG_IDS, LANG_KEY, LEGAL_VERSION, CONSENT_KEY, activeLanguage,
} from './langs';
// Ferdigbygde ordbøker for de aktive språkene (npm run gen:i18n). Hele tabellen med ni språk
// (strings.js) lastes ikke i appen.
import { DICTS } from './dicts.generated';
import { deviceLanguageId } from './deviceLang';

function getPath(obj, path) {
  return path.split('.').reduce((acc, p) => (acc == null ? acc : acc[p]), obj);
}

function lookup(lang, key) {
  return getPath(DICTS[lang] || {}, key) || getPath(DICTS.en || {}, key) || key;
}

function format(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => {
    const k = a || b;
    return vars[k] != null ? String(vars[k]) : _;
  });
}

const Ctx = createContext(null);

export function I18nProvider({ children, userLanguage }) {
  const [lang, setLangState] = useState(() => deviceLanguageId());
  const [langPicked, setLangPicked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const failSafe = setTimeout(() => {
      if (!alive) return;
      // AsyncStorage can hang on some web/PWA profiles after security hardening.
      setLangPicked((prev) => prev || true);
      setReady(true);
    }, 4000);
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY);
        if (alive && stored && LANG_IDS.includes(stored)) {
          // Et tidligere valg av f.eks. polsk vises nå på engelsk (skallet er låst til nb/en).
          setLangState(activeLanguage(stored));
          setLangPicked(true);
        } else if (alive) {
          setLangState(deviceLanguageId());
        }
      } catch {}
      // No stored choice: follow the device language (English for unknown tags).
      // Don't block the user on a mandatory language step.
      if (alive) {
        clearTimeout(failSafe);
        setLangPicked((prev) => prev || true);
        setReady(true);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(failSafe);
    };
  }, []);

  useEffect(() => {
    if (userLanguage && LANG_IDS.includes(userLanguage)) {
      setLangState(activeLanguage(userLanguage));
      setLangPicked(true);
    }
  }, [userLanguage]);

  const setLang = useCallback(async (id) => {
    const next = activeLanguage(LANG_IDS.includes(id) ? id : 'en');
    setLangState(next);
    setLangPicked(true);
    try { await AsyncStorage.setItem(LANG_KEY, next); } catch {}
  }, []);

  // Skjermlesere på web leser siden på valgt språk (WCAG 3.1.1). Standard i index.html er nb.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.lang = lang || 'nb';
  }, [lang]);

  const t = useCallback((key, vars) => format(lookup(lang, key), vars), [lang]);

  const value = useMemo(
    // Velgerne viser bare språkene skallet kan vises på nå.
    () => ({ lang, setLang, t, ready, langPicked, langs: ACTIVE_LANGS, legalVersion: LEGAL_VERSION, consentKey: CONSENT_KEY }),
    [lang, setLang, t, ready, langPicked]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export { LANGS, LANG_IDS, LEGAL_VERSION, LANG_KEY, CONSENT_KEY };
