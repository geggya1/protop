/**
 * Sending av hurtigmeldinger (RUH fra telefonen) og den lokale køen når nettet er borte.
 * Meldingen lagres med fast id. Feiler sendingen fordi det ikke er nett, legges den i køen
 * (AsyncStorage, per bruker og selskap) og sendes neste gang appen har kontakt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  buildQuickFinding, isOfflineError, queueAdd, queueFailed, queueItem, queueRemove,
} from '../../src/iso/quickReport';
import { newFindingEffects } from '../../src/iso/integrations';
import { appendAudit, loadIsoSystem, saveQuickFinding } from '../../src/iso/storage';
import { uploadImage } from '../../src/utils/media';
import { renumberEffects, runIsoEffects, safeEffects } from './isoEffects';

const QUEUE_KEY = 'protop.iso.quickQueue.v1';
/** Anonym melding: navn og bruker-id lagres ikke på saken, i historikken eller i oppgavene. */
export const ANONYMOUS = { uid: '', name: 'Anonym melder' };

const SYSTEMS = new Map();
const listeners = new Set();

function queueKey(companyId, uid) {
  return `${QUEUE_KEY}.${String(companyId || '').trim()}.${String(uid || 'anon').slice(0, 128)}`;
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function readQueue(companyId, uid) {
  try {
    const raw = await AsyncStorage.getItem(queueKey(companyId, uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeQueue(companyId, uid, list) {
  try {
    if (list.length) await AsyncStorage.setItem(queueKey(companyId, uid), JSON.stringify(list));
    else await AsyncStorage.removeItem(queueKey(companyId, uid));
  } catch { /* full lagring: meldingen står fortsatt i minnet til den sendes */ }
  listeners.forEach((fn) => { try { fn(companyId, uid, list.length); } catch { /* ignorer */ } });
}

/** Oppsettet (roller og standarder) uten resten av ISO. Null uten tilgang; meldingen kan sendes likevel. */
export async function quickSystem(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  if (SYSTEMS.has(id)) return SYSTEMS.get(id);
  const system = await loadIsoSystem(id).catch(() => null);
  if (system) SYSTEMS.set(id, system);
  return system;
}

function browserOffline() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function uploadPhotos(companyId, item) {
  const out = [];
  let failed = 0;
  for (const [i, photo] of (item.input.photos || []).entries()) {
    const path = `families/${companyId}/iso/findings/${item.id}/${Date.parse(item.queuedAt) || Date.now()}-${i + 1}.jpg`;
    try {
      const url = await uploadImage(path, { uri: photo.uri });
      if (url) out.push({ label: photo.name || `Foto ${i + 1}`, url, path, kind: 'foto', at: new Date().toISOString() });
    } catch (err) {
      if (browserOffline() || isOfflineError(err)) {
        const offline = new Error('Ingen nett: bildet kan ikke lastes opp nå.');
        offline.code = 'iso/offline';
        throw offline;
      }
      failed += 1;
    }
  }
  return { attachments: out, failed };
}

/** Sender én melding: bilder, saken (med nummer fra telleren), revisjonsspor, oppgave til behandler og varsler. */
export async function sendQueued(companyId, item) {
  if (browserOffline()) {
    const err = new Error('Ingen nett.');
    err.code = 'iso/offline';
    throw err;
  }
  const system = await quickSystem(companyId);
  const anonymous = !!item.input.anonymous;
  const actor = anonymous ? ANONYMOUS : item.actor;
  const { attachments, failed } = await uploadPhotos(companyId, item);
  const built = buildQuickFinding({ ...item.input, attachments }, { actor, system, id: item.id, now: new Date(item.queuedAt || Date.now()) });
  if (!built.ok) throw new Error(built.error);
  const saved = await saveQuickFinding(companyId, built.finding);
  if (saved?.duplicate) return { finding: saved, duplicate: true, photoFailed: failed };
  const finding = { ...built.finding, number: saved?.number || built.finding.number };
  const effects = renumberEffects(newFindingEffects(finding, system), built.finding.number, finding.number);
  // Revisjonssporet skrives i eget navn; en anonym melding får bare historikken på saken.
  if (!anonymous) await appendAudit(companyId, built.events, { restricted: !!finding.restricted });
  await runIsoEffects(companyId, safeEffects(effects, finding), { actor: anonymous ? null : actor, system });
  return { finding, photoFailed: failed, assigneeName: finding.assigneeName || '' };
}

/**
 * Send nå, eller legg i køen uten nett. Svar: { sent: finding } | { queued: true, count } | { error }.
 * input: { type, text, projectId, projectName, serious, anonymous, photos: [{ uri, name }] }
 */
export async function submitQuick(companyId, input, { actor }) {
  const item = queueItem(input, { actor });
  const precheck = buildQuickFinding({ ...input, attachments: (input.photos || []).map(() => ({ url: 'lokal' })) }, { actor, id: item.id });
  if (!precheck.ok) return { error: precheck.error };
  try {
    const res = await sendQueued(companyId, item);
    return { sent: res.finding, photoFailed: res.photoFailed, assigneeName: res.assigneeName };
  } catch (err) {
    if (!isOfflineError(err)) return { error: err?.message || 'Kunne ikke sende meldingen.' };
    const list = queueAdd(await readQueue(companyId, actor?.uid), item);
    await writeQueue(companyId, actor?.uid, list);
    return { queued: true, count: list.length, id: item.id };
  }
}

/** Sender det som ligger i køen. Stopper ved første nettfeil. Svar: antall sendt og antall igjen. */
export async function flushQueue(companyId, uid) {
  let list = await readQueue(companyId, uid);
  if (!list.length || browserOffline()) return { sent: [], left: list.length };
  const sent = [];
  for (const item of [...list]) {
    try {
      const res = await sendQueued(companyId, item);
      sent.push(res.finding);
      list = queueRemove(list, item.id);
    } catch (err) {
      if (isOfflineError(err)) break;
      list = queueFailed(list, item.id, err?.message || String(err));
    }
  }
  await writeQueue(companyId, uid, list);
  return { sent, left: list.length };
}
