import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGS, LANG_IDS, LANG_KEY, LEGAL_VERSION, CONSENT_KEY } from './langs';
import { TABLE } from './strings';
import { deviceLanguageId } from './deviceLang';

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else {
      cur[p] = cur[p] || {};
      cur = cur[p];
    }
  });
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, p) => (acc == null ? acc : acc[p]), obj);
}

function isLeaf(v) {
  return v && typeof v === 'object' && LANG_IDS.some((id) => id in v);
}

function buildDicts(table) {
  const out = Object.fromEntries(LANG_IDS.map((id) => [id, {}]));
  const walk = (node, prefix) => {
    Object.entries(node).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (isLeaf(v)) {
        LANG_IDS.forEach((id) => setPath(out[id], key, v[id] || v.en || v.nb || key));
      } else if (v && typeof v === 'object') walk(v, key);
    });
  };
  walk(table, '');
  return out;
}

const DICTS = buildDicts(TABLE);

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
          setLangState(stored);
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
      setLangState(userLanguage);
      setLangPicked(true);
    }
  }, [userLanguage]);

  const setLang = useCallback(async (id) => {
    const next = LANG_IDS.includes(id) ? id : 'en';
    setLangState(next);
    setLangPicked(true);
    try { await AsyncStorage.setItem(LANG_KEY, next); } catch {}
  }, []);

  const t = useCallback((key, vars) => format(lookup(lang, key), vars), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, ready, langPicked, langs: LANGS, legalVersion: LEGAL_VERSION, consentKey: CONSENT_KEY }),
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
