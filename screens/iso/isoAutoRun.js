/**
 * Automatikken i ISO uten at noen må åpne ISO (ISO-02): kvalitetsplaner for nye prosjekter,
 * påminnelser, årshjul (også passerte måneder som mangler), forfalte frister og eskalering.
 * CI deployer ikke planlagte jobber, så dette kjøres når en med ISO-rettigheter åpner
 * bedriftsskallet (IsoAutomation.jsx) og når ISO åpnes. Én gang per dag og bruker på enheten.
 * Nøklene er idempotente: flere brukere som kjører samme dag, gir ingen duplikater.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayKey } from '../../src/iso/core';
import { autoQualityPlans, autoTaskEffects } from '../../src/iso/integrations';
import { createRecord } from '../../src/iso/registers';
import { loadIsoTasks } from '../../src/iso/storage';
import { runIsoEffects } from './isoEffects';

const DAY_KEY = 'protop.iso.auto.v1';
const RAN = new Set();

function dayKey(companyId, uid) {
  return `${DAY_KEY}.${String(companyId || '').trim()}.${String(uid || '').slice(0, 128)}`;
}

/** Har automatikken gått i dag (på denne enheten)? */
export async function ranToday(companyId, uid) {
  const key = dayKey(companyId, uid);
  if (RAN.has(`${key}:${todayKey()}`)) return true;
  try {
    return (await AsyncStorage.getItem(key)) === todayKey();
  } catch {
    return false;
  }
}

export async function markRanToday(companyId, uid) {
  const key = dayKey(companyId, uid);
  RAN.add(`${key}:${todayKey()}`);
  try { await AsyncStorage.setItem(key, todayKey()); } catch { /* bare en optimalisering */ }
}

/**
 * Kjører automatikken på en lastet ISO-tilstand. saveRecord(result, effects) lagrer en ny kvalitetsplan
 * (createOnly) og gir { ok }. runEffects(effects) utfører oppgavene; standard er runIsoEffects.
 * Svar: { plans, tasks, notes }.
 */
export async function runIsoAutomation({
  companyId, actor, state, people = [], projects = [], contracts = [], equipment = [], saveRecord, runEffects = null, now = new Date(),
}) {
  const notes = [];
  let plans = 0;
  let existing = state.records?.kvalitetsplan || [];
  for (const row of autoQualityPlans(state, projects, { contracts })) {
    const res = createRecord('kvalitetsplan', row.draft, { actor, existing, now });
    if (!res.ok || !saveRecord) continue;
    const record = { ...res.record, id: row.id };
    const effects = row.notifyUid ? [{ type: 'createTask', key: `iso_${row.id}_gjennomga`, title: `Gå gjennom kvalitetsplan: ${row.draft.projectName}`, assigneeUid: row.notifyUid, dueDays: 7, description: 'Kvalitetsplanen er laget automatisk fra prosjektet og kontrakten. Kontroller og godkjenn den i ISO → Prosjektkvalitet.' }] : [];
    const saved = await saveRecord({ ...res, record }, effects);
    if (saved?.ok) {
      plans += 1;
      existing = [...existing, record];
    }
  }
  if (plans) notes.push(plans === 1 ? 'Ett nytt prosjekt har fått kvalitetsplan automatisk' : `${plans} nye prosjekter har fått kvalitetsplan automatisk`);
  // Status fra Oppgaver: et vedtak som er ferdig der, skal ikke gi påminnelse om forfalt vedtak.
  const tasks = await loadIsoTasks(companyId);
  const effects = autoTaskEffects(state, { people, tasks, equipment, now });
  const run = runEffects || ((list) => runIsoEffects(companyId, list, { actor, system: state.system }));
  const n = effects.length ? await run(effects) : 0;
  if (n) notes.push(`${n} påminnelser og eskaleringer ligger som oppgaver i Oppgaver`);
  return { plans, tasks: n, notes };
}
