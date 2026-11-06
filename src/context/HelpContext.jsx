import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from './AppContext';
import { MODULE_INTRO_SEEN_PREFIX, introStorageKey } from '../utils/moduleIntroKeys';
import { shouldAutoWelcome } from '../utils/helpLayout';
import { resolvePageKey } from '../help/protopPageKeys';
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

// Hjelpetekstene (moduleIntros + hjelpekatalogen, ca. 300 KB) lastes når hjelpen trengs:
// når den åpnes, eller i ledig tid etter oppstart så den åpner uten venting.
let introsPromise = null;
function loadIntros() {
  if (!introsPromise) {
    introsPromise = import('../utils/moduleIntros').catch((err) => {
      introsPromise = null;
      throw err;
    });
  }
  return introsPromise;
}
const INTROS_IDLE_DELAY_MS = 4000;

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
  const [intros, setIntros] = useState(null);
  // Målene (HelpTarget) registreres hele tiden, men publiseres bare mens hjelpen er åpen.
  // Før ga hver layout en ny kontekstverdi og nye renders av hele skjermer.
  const targetsRef = useRef({});
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
  const pendingOpenRef = useRef(null);
  const modeRef = useRef(null);
  modeRef.current = mode;
  const publishRef = useRef(0);

  const ensureIntros = useCallback(() => {
    if (intros) return Promise.resolve(intros);
    return loadIntros().then((mod) => {
      setIntros((cur) => cur || mod);
      return mod;
    });
  }, [intros]);

  useEffect(() => {
    if (intros) return undefined;
    const t = setTimeout(() => { ensureIntros().catch(() => {}); }, INTROS_IDLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [intros, ensureIntros]);

  const publishTargets = useCallback(() => {
    if (publishRef.current) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    publishRef.current = raf(() => {
      publishRef.current = 0;
      setTargets({ ...targetsRef.current });
    }) || 1;
  }, []);

  useEffect(() => {
    if (mode) setTargets({ ...targetsRef.current });
  }, [mode]);

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
    const prevRect = targetsRef.current[id];
    if (
      prevRect
      && Math.abs(prevRect.x - rect.x) < 2
      && Math.abs(prevRect.y - rect.y) < 2
      && Math.abs(prevRect.w - rect.w) < 2
      && Math.abs(prevRect.h - rect.h) < 2
    ) {
      return;
    }
    targetsRef.current = { ...targetsRef.current, [id]: rect };
    if (modeRef.current) publishTargets();
  }, [publishTargets]);

  const registerAdvance = useCallback((id, fn) => {
    if (!id) return;
    if (typeof fn === 'function') advanceRef.current[id] = fn;
    else delete advanceRef.current[id];
  }, []);

  const unregisterTarget = useCallback((id) => {
    if (id) delete advanceRef.current[id];
    if (!targetsRef.current[id]) return;
    const next = { ...targetsRef.current };
    delete next[id];
    targetsRef.current = next;
    if (modeRef.current) publishTargets();
  }, [publishTargets]);

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

  const entry = moduleId && intros ? intros.getModuleIntro(scope, moduleId) : null;
  const liveCopy = useMemo(() => (intros ? intros.localizeIntro(entry, lang) : null), [intros, entry, lang]);
  // En startet rundtur holder på sin side, også når et steg åpner en annen
  // (f.eks. en ansatt fra HR-tabellen) — så går turen videre der.
  const [tourCopy, setTourCopy] = useState(null);
  useEffect(() => {
    if (mode !== 'module') setTourCopy(null);
  }, [mode]);
  const copy = mode === 'module' && tourCopy ? tourCopy : liveCopy;
  const liveCopyRef = useRef(liveCopy);
  liveCopyRef.current = liveCopy;
  // Før tekstene er lastet: ProTop-sidene finnes i den lette nøkkellisten.
  const hasHelp = intros ? !!copy : !!(moduleId && (scope || 'family') === 'family' && resolvePageKey(moduleId));
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
    ensureIntros().catch(() => {});
    requestRemeasure();
    setTourIndex(0);
    setMode('welcome');
  }, [requestRemeasure]);

  const openModuleHelp = useCallback(() => {
    if (!intros) {
      pendingOpenRef.current = 'moduleHelp';
      ensureIntros().catch(() => { pendingOpenRef.current = null; });
      return;
    }
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
  }, [intros, ensureIntros, copy, requestRemeasure]);

  const startModuleTour = useCallback(() => {
    if (!liveCopy) {
      if (!intros) {
        pendingOpenRef.current = 'moduleTour';
        ensureIntros().catch(() => { pendingOpenRef.current = null; });
      }
      return;
    }
    requestRemeasure();
    setTourCopy(liveCopy);
    setTourIndex(0);
    setMode('module');
  }, [liveCopy, intros, ensureIntros, requestRemeasure]);

  /**
   * Rundtur for en bestemt side (fra assistenten eller hjelpesenteret).
   * Siden åpnes av den som kaller; rundturen starter når siden er registrert.
   * `fromIndex` starter på et bestemt steg (f.eks. Importer-steget).
   */
  const startPageTour = useCallback((pageId, fromIndex = 0) => {
    const wanted = resolvePageKey(pageId);
    if (!wanted) return;
    ensureIntros().catch(() => {});
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
  }, [liveCopy, ensureIntros, requestRemeasure]);

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
    ensureIntros().catch(() => {});
    requestRemeasure();
    setProcessId(id);
    setTourIndex(Math.max(0, Number(fromIndex) || 0));
    setMode('process');
  }, [ensureIntros, requestRemeasure]);

  // Hjelp som ble åpnet før tekstene var lastet, åpnes når de kommer.
  useEffect(() => {
    if (!intros || !pendingOpenRef.current) return;
    const what = pendingOpenRef.current;
    pendingOpenRef.current = null;
    if (what === 'moduleHelp') openModuleHelp();
    else if (what === 'moduleTour') startModuleTour();
  }, [intros, openModuleHelp, startModuleTour]);

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
      ensureIntros().catch(() => {});
      requestRemeasure();
      setMode('welcome');
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, enabled, moduleId, scope, welcomeMap, moduleSeenMap, requestRemeasure, ensureIntros, mode]);

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
