import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from './AppContext';
import {
  MODULE_INTRO_SEEN_PREFIX,
  getModuleIntro,
  introStorageKey,
  localizeIntro,
} from '../utils/moduleIntros';
import { shouldAutoWelcome } from '../utils/helpLayout';
import { useI18n } from '../i18n';

const WELCOME_SEEN_PREFIX = 'weekplan.help.welcome.v1';
const AUTO_DELAY_MS = 640;

function seenStoreKey(uid) {
  return `${MODULE_INTRO_SEEN_PREFIX}.${uid || 'anon'}`;
}

function welcomeStoreKey(uid) {
  return `${WELCOME_SEEN_PREFIX}.${uid || 'anon'}`;
}

async function readJson(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

const HelpContext = createContext(null);

export function HelpProvider({ children }) {
  const { uid } = useApp();
  const { lang } = useI18n();
  const [scope, setScope] = useState('family');
  const [moduleId, setModuleId] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState(null);
  const [ready, setReady] = useState(false);
  const [moduleSeenMap, setModuleSeenMap] = useState({});
  const [welcomeMap, setWelcomeMap] = useState({});
  const [targets, setTargets] = useState({});
  const [targetsVersion, setTargetsVersion] = useState(0);
  const [scene, setScene] = useState('hub');
  const [tourIndex, setTourIndex] = useState(0);
  const autoShownRef = useRef(false);
  const moduleRef = useRef({ scope: 'family', moduleId: null, enabled: true });
  const advanceRef = useRef({});
  const retreatRef = useRef(null);

  useEffect(() => {
    moduleRef.current = { scope, moduleId, enabled };
  }, [scope, moduleId, enabled]);

  useEffect(() => {
    let alive = true;
    autoShownRef.current = false;
    setMode(null);
    setTourIndex(0);
    setScene('hub');
    setReady(false);
    if (!uid) {
      setModuleSeenMap({});
      setWelcomeMap({});
      setReady(true);
      return undefined;
    }
    (async () => {
      const [seen, welcome] = await Promise.all([
        readJson(seenStoreKey(uid)),
        readJson(welcomeStoreKey(uid)),
      ]);
      if (!alive) return;
      setModuleSeenMap(seen);
      setWelcomeMap(welcome);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [uid]);

  const registerModule = useCallback((nextScope, nextId, nextEnabled = true) => {
    setScope(nextScope || 'family');
    setModuleId(nextId || null);
    setEnabled(!!nextEnabled);
    return () => {
      const cur = moduleRef.current;
      if (cur.scope === (nextScope || 'family') && cur.moduleId === (nextId || null)) {
        setModuleId(null);
      }
    };
  }, []);

  const registerTarget = useCallback((id, rect) => {
    if (!id || !rect) return;
    setTargets((prev) => {
      const prevRect = prev[id];
      if (
        prevRect
        && Math.abs(prevRect.x - rect.x) < 2
        && Math.abs(prevRect.y - rect.y) < 2
        && Math.abs(prevRect.w - rect.w) < 2
        && Math.abs(prevRect.h - rect.h) < 2
      ) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const registerAdvance = useCallback((id, fn) => {
    if (!id) return;
    if (typeof fn === 'function') advanceRef.current[id] = fn;
    else delete advanceRef.current[id];
  }, []);

  const unregisterTarget = useCallback((id) => {
    if (id) delete advanceRef.current[id];
    setTargets((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const runTargetAdvance = useCallback((id) => {
    const fn = id ? advanceRef.current[id] : null;
    if (typeof fn !== 'function') return false;
    fn();
    return true;
  }, []);

  const setHelpScene = useCallback((next) => {
    setScene(next === 'inner' ? 'inner' : 'hub');
  }, []);

  const registerRetreat = useCallback((fn) => {
    retreatRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  const runRetreat = useCallback(() => {
    const fn = retreatRef.current;
    if (typeof fn !== 'function') return false;
    fn();
    return true;
  }, []);

  const requestRemeasure = useCallback(() => {
    setTargetsVersion((n) => n + 1);
  }, []);

  const entry = moduleId ? getModuleIntro(scope, moduleId) : null;
  const copy = useMemo(() => localizeIntro(entry, lang), [entry, lang]);
  const hasHelp = !!copy;
  const introKey = introStorageKey(scope, moduleId);
  const moduleSeen = !!(introKey && moduleSeenMap[introKey]);
  const welcomeSeen = !!(scope && welcomeMap[scope]);

  const persistModuleSeen = useCallback(async () => {
    if (!uid || !introKey) return;
    const stamp = Date.now();
    setModuleSeenMap((prev) => (prev[introKey] ? prev : { ...prev, [introKey]: stamp }));
    const map = await readJson(seenStoreKey(uid));
    if (map[introKey]) return;
    map[introKey] = stamp;
    await writeJson(seenStoreKey(uid), map);
  }, [uid, introKey]);

  const persistWelcomeSeen = useCallback(async () => {
    if (!uid || !scope) return;
    const stamp = Date.now();
    setWelcomeMap((prev) => (prev[scope] ? prev : { ...prev, [scope]: stamp }));
    const map = await readJson(welcomeStoreKey(uid));
    if (map[scope]) return;
    map[scope] = stamp;
    await writeJson(welcomeStoreKey(uid), map);
  }, [uid, scope]);

  const openWelcome = useCallback(() => {
    requestRemeasure();
    setTourIndex(0);
    setMode('welcome');
  }, [requestRemeasure]);

  const openModuleHelp = useCallback(() => {
    if (!copy) {
      // Module registered but no dedicated tour yet — still offer the welcome tips.
      requestRemeasure();
      setTourIndex(0);
      setMode('welcome');
      return;
    }
    requestRemeasure();
    setTourIndex(0);
    setMode('moduleCard');
  }, [copy, requestRemeasure]);

  const startModuleTour = useCallback(() => {
    if (!copy) return;
    requestRemeasure();
    setTourIndex(0);
    setMode('module');
  }, [copy, requestRemeasure]);

  const dismiss = useCallback((opts = {}) => {
    const current = mode;
    setMode(null);
    setTourIndex(0);
    if (current === 'welcome' || opts.welcome) persistWelcomeSeen();
    if (current === 'module' || current === 'moduleCard' || opts.module) persistModuleSeen();
  }, [mode, persistWelcomeSeen, persistModuleSeen]);

  useEffect(() => {
    if (!ready || !uid || !enabled || !moduleId || autoShownRef.current) return undefined;
    if (!shouldAutoWelcome(welcomeMap, moduleSeenMap, scope)) return undefined;
    const timer = setTimeout(() => {
      autoShownRef.current = true;
      requestRemeasure();
      setMode('welcome');
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, enabled, moduleId, scope, welcomeMap, moduleSeenMap, requestRemeasure]);

  const value = useMemo(() => ({
    scope,
    moduleId,
    mode,
    hasHelp,
    copy,
    moduleSeen,
    welcomeSeen,
    targets,
    targetsVersion,
    scene,
    tourIndex,
    setTourIndex,
    registerModule,
    registerTarget,
    registerAdvance,
    unregisterTarget,
    runTargetAdvance,
    setHelpScene,
    registerRetreat,
    runRetreat,
    requestRemeasure,
    openWelcome,
    openModuleHelp,
    startModuleTour,
    dismiss,
  }), [
    scope, moduleId, mode, hasHelp, copy, moduleSeen, welcomeSeen, targets, targetsVersion,
    scene, tourIndex,
    registerModule, registerTarget, registerAdvance, unregisterTarget, runTargetAdvance,
    setHelpScene, registerRetreat, runRetreat, requestRemeasure,
    openWelcome, openModuleHelp, startModuleTour, dismiss,
  ]);

  return (
    <HelpContext.Provider value={value}>
      {children}
    </HelpContext.Provider>
  );
}

const FALLBACK = {
  scope: 'family',
  moduleId: null,
  mode: null,
  hasHelp: false,
  copy: null,
  moduleSeen: true,
  welcomeSeen: true,
  targets: {},
  targetsVersion: 0,
  scene: 'hub',
  tourIndex: 0,
  setTourIndex: () => {},
  registerModule: () => () => {},
  registerTarget: () => {},
  registerAdvance: () => {},
  unregisterTarget: () => {},
  runTargetAdvance: () => false,
  setHelpScene: () => {},
  registerRetreat: () => {},
  runRetreat: () => false,
  requestRemeasure: () => {},
  openWelcome: () => {},
  openModuleHelp: () => {},
  startModuleTour: () => {},
  dismiss: () => {},
};

export function useHelp() {
  return useContext(HelpContext) || FALLBACK;
}
