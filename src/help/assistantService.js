/**
 * Klientsiden av ProTop-assistenten.
 * Sikre treff i hjelpebiblioteket besvares lokalt med en gang. Uklare eller
 * sammensatte spørsmål går til aiSupportChat (Gemini) med de mest relevante
 * sidene som kunnskap — og svaret får samme kilder og «Vis meg»-knapper.
 * Uten nett eller funksjon faller vi tilbake til det lokale svaret.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import {
  answerQuestion,
  knowledgeForServer,
  transcriptText,
} from './assistantEngine';
import { getProtopPage } from './protopPages';
import { shouldAskServer } from './assistantPolicy';

const STORE_PREFIX = 'protop.assistant.v1';
const MAX_STORED = 60;
const SERVER_TIMEOUT_MS = 14000;
function storeKey(uid) {
  return `${STORE_PREFIX}.${uid || 'anon'}`;
}

export async function loadConversation(uid) {
  try {
    const raw = await AsyncStorage.getItem(storeKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveConversation(uid, messages) {
  try {
    const slim = (messages || []).slice(-MAX_STORED).map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text || '',
      steps: m.steps || [],
      sources: m.sources || [],
      actions: m.actions || [],
      followUps: m.followUps || [],
      intent: m.intent || null,
      engine: m.engine || null,
      feedback: m.feedback || null,
      at: m.at || Date.now(),
    }));
    await AsyncStorage.setItem(storeKey(uid), JSON.stringify(slim));
  } catch { /* lagring er en bonus */ }
}

export async function clearConversation(uid) {
  try { await AsyncStorage.removeItem(storeKey(uid)); } catch { /* ignore */ }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('assistant-timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Svar på et spørsmål. Returnerer alltid et svar (lokalt som reserve).
 * `history` = tidligere meldinger i samtalen [{ role, text }].
 */
export async function askAssistant({
  question,
  history = [],
  lang = 'nb',
  pageKey = null,
  company = true,
  familyId = null,
  device = 'phone',
  unresolved = 0,
  allowServer = true,
  access = null,
} = {}) {
  const local = answerQuestion(question, { lang, pageKey, company, unresolved, access });
  if (!allowServer || !shouldAskServer(local, question)) {
    return { ...local, engine: 'local' };
  }
  const page = pageKey ? getProtopPage(pageKey) : null;
  try {
    const fn = httpsCallable(functions, 'aiSupportChat');
    const res = await withTimeout(fn({
      message: String(question || '').slice(0, 2000),
      persona: 'protop-assistant',
      audience: 'parent',
      device,
      lang,
      familyId,
      userQueryCount: unresolved,
      page: page ? {
        key: page.key,
        label: page.label?.[lang] || page.label?.nb || '',
        path: page.path?.[lang] || page.path?.nb || '',
      } : null,
      knowledge: knowledgeForServer(question, { lang, pageKey, limit: 6, access }),
      // Brukerens nivå: AI-en skal ikke gi steg brukeren ikke har tilgang til.
      access: access?.active ? { level: String(access.level || '').slice(0, 60) } : null,
      history: (history || [])
        .filter((m) => m && m.text && (m.role === 'user' || m.role === 'assistant'))
        .slice(-10)
        .map((m) => ({ role: m.role, text: String(m.text).slice(0, 600) })),
    }), SERVER_TIMEOUT_MS);
    const data = res?.data || null;
    const reply = String(data?.reply || '').trim();
    if (!reply || data?.engine === 'local') {
      // Serveren hadde ingen AI-nøkkel — vårt eget bibliotek svarer bedre.
      return { ...local, engine: 'local' };
    }
    const strongLocal = local.confidence >= 0.25 && local.sources.length;
    return {
      ...local,
      intent: local.intent === 'unknown' ? 'ai' : local.intent,
      text: reply,
      // AI-teksten har egne steg; lokale steg vises ikke dobbelt.
      steps: [],
      sources: strongLocal ? local.sources : [],
      actions: strongLocal ? local.actions : (data?.suggestSupport ? [{ type: 'support', label: lang === 'en' ? 'Contact support' : 'Kontakt support' }] : []),
      engine: data?.engine || 'ai',
    };
  } catch {
    return { ...local, engine: 'local', offline: true };
  }
}

export { transcriptText, shouldAskServer };
