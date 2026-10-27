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
import { resolvePageKey } from '../help/protopPages';
import { currentRouteName } from '../navigation/navRef';
import { useI18n } from '../i18n';

const WELCOME_SEEN_PREFIX = 'protop.help.welcome.v1';
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
  const [processId, setProcessId] = useState(null);
  const autoShownRef = useRef(false);
  const moduleRef = useRef({ scope: 'family', moduleId: null, enabled: true });
  const advanceRef = useRef({});
  const retreatRef = useRef(null);
  const pendingPageTourRef = useRef(null);

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
  const liveCopy = useMemo(() => localizeIntro(entry, lang), [entry, lang]);
  // En startet rundtur holder på sin side, også når et steg åpner en annen
  // (f.eks. en ansatt fra HR-tabellen) — så går turen videre der.
  const [tourCopy, setTourCopy] = useState(null);
  useEffect(() => {
    if (mode !== 'module') setTourCopy(null);
  }, [mode]);
  const copy = mode === 'module' && tourCopy ? tourCopy : liveCopy;
  const liveCopyRef = useRef(liveCopy);
  liveCopyRef.current = liveCopy;
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
    if (!liveCopy) return;
    requestRemeasure();
    setTourCopy(liveCopy);
    setTourIndex(0);
    setMode('module');
  }, [liveCopy, requestRemeasure]);

  /**
   * Rundtur for en bestemt side (fra assistenten eller hjelpesenteret).
   * Siden åpnes av den som kaller; rundturen starter når siden er registrert.
   * `fromIndex` starter på et bestemt steg (f.eks. Importer-steget).
   */
  const startPageTour = useCallback((pageId, fromIndex = 0) => {
    const wanted = resolvePageKey(pageId);
    if (!wanted) return;
    const start = (steps) => Math.min(Math.max(0, Number(fromIndex) || 0), Math.max(0, (steps?.length || 1) - 1));
    if (liveCopy?.pageKey === wanted) {
      pendingPageTourRef.current = null;
      requestRemeasure();
      setTourCopy(liveCopy);
      setTourIndex(start(liveCopy.steps));
      setMode('module');
      return;
    }
    pendingPageTourRef.current = { key: wanted, at: Date.now(), start };
  }, [liveCopy, requestRemeasure]);

  useEffect(() => {
    const pending = pendingPageTourRef.current;
    if (!pending || !liveCopy?.pageKey) return undefined;
    if (Date.now() - pending.at > 15000) {
      pendingPageTourRef.current = null;
      return undefined;
    }
    if (liveCopy.pageKey !== pending.key) return undefined;
    pendingPageTourRef.current = null;
    // La siden tegne ferdig før knappene måles.
    const timer = setTimeout(() => {
      requestRemeasure();
      setTourCopy(liveCopyRef.current);
      setTourIndex(pending.start(liveCopyRef.current?.steps));
      setMode('module');
    }, 500);
    return () => clearTimeout(timer);
  }, [liveCopy?.pageKey, requestRemeasure]);

  /** Arbeidsflyt på tvers av sider (src/help/protopProcesses.js). */
  const startProcessTour = useCallback((id, fromIndex = 0) => {
    if (!id) return;
    requestRemeasure();
    setProcessId(id);
    setTourIndex(Math.max(0, Number(fromIndex) || 0));
    setMode('process');
  }, [requestRemeasure]);

  const dismiss = useCallback((opts = {}) => {
    const current = mode;
    setMode(null);
    setTourIndex(0);
    setProcessId(null);
    if (opts.skipPersist) return;
    if (current === 'welcome' || opts.welcome) persistWelcomeSeen();
    if (current === 'module' || current === 'moduleCard' || opts.module) persistModuleSeen();
  }, [mode, persistWelcomeSeen, persistModuleSeen]);

  useEffect(() => {
    if (!ready || !uid || !enabled || !moduleId || autoShownRef.current || mode) return undefined;
    if (pendingPageTourRef.current) return undefined;
    if (currentRouteName() === 'ProfileSetup') return undefined;
    if (!shouldAutoWelcome(welcomeMap, moduleSeenMap, scope)) return undefined;
    const timer = setTimeout(() => {
      autoShownRef.current = true;
      requestRemeasure();
      setMode('welcome');
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, enabled, moduleId, scope, welcomeMap, moduleSeenMap, requestRemeasure, mode]);

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
    processId,
    pageKey: liveCopy?.pageKey || null,
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
    startProcessTour,
    startPageTour,
    dismiss,
  }), [
    scope, moduleId, mode, hasHelp, copy, moduleSeen, welcomeSeen, targets, targetsVersion,
    scene, tourIndex, processId,
    registerModule, registerTarget, registerAdvance, unregisterTarget, runTargetAdvance,
    setHelpScene, registerRetreat, runRetreat, requestRemeasure,
    openWelcome, openModuleHelp, startModuleTour, startProcessTour, startPageTour, dismiss,
  ]);

  // Test-boten (scripts/help-bot) leser hjelpetilstanden. Finnes bare i emulator-bygg.
  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || typeof window === 'undefined') return;
    window.__protopHelp = {
      pageKey: liveCopy?.pageKey || null,
      tourPageKey: copy?.pageKey || null,
      moduleId,
      mode,
      processId,
      tourIndex,
      scene,
    };
  }, [liveCopy?.pageKey, copy?.pageKey, moduleId, mode, processId, tourIndex, scene]);

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
  processId: null,
  pageKey: null,
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
  startProcessTour: () => {},
  startPageTour: () => {},
  dismiss: () => {},
};

export function useHelp() {
  return useContext(HelpContext) || FALLBACK;
}
